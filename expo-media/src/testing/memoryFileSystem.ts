// 설계 문서 §5.6 `"./testing"` · §10.1 — 인메모리 `FileSystemAdapter`.
//
// **실제 바이트를 들고 있는 페이크다.** stat이 진짜 길이를 돌려주고, copy가 진짜로 복사하며,
// `readBase64`가 요청한 `[position, position+length)` 창을 **정확히** 잘라 base64로 준다.
// 그래서 이 어댑터 하나 위에서 다음이 전부 진짜로 검증된다:
//   · §7 하드닝 9 — 창 분할 해시가 `node:crypto` 값과 일치하는가(창 경계가 틀리면 값이 달라진다)
//   · §7 하드닝 2 — iOS `ph://`/`file://` 후보별 copy 호출 유무(`calls.copy`가 직접 증거)
//   · §7 하드닝 1 — 로컬 전송이 바이트를 JS 힙으로 읽지 않는가(`calls.readBase64` 0건이 직접 증거)
//   · §7 하드닝 7 — 스테이징 사본이 실제로 지워졌는가(`list()`가 직접 증거)
//
// throw 스텁이었다면 위 넷 중 어느 것도 검증되지 않는다. 페이크의 충실도가 곧 테스트의 강도다.
//
// ⚠ peer 0 · DOM 0 — `src/testing/bytes.ts` 머리말 참조.

import type {
  ChunkRange,
  DurableFileStoreAdapter,
  FileDownloadAdapter,
  FileStat,
  FileSystemAdapter,
} from '../core/adapters';
import { bytesToBase64, fakeBytes } from './bytes';

/**
 * 페이크가 기록하는 호출 이력.
 *
 * ⚠ **인자를 통째로 기록한다** — 호출 횟수만 세면 "무엇을 가지고 불렀는가"를 잃는다.
 * 하드닝 2의 후보 순회 검증은 `copy.from`이 어느 후보였는지를 봐야 성립하고,
 * 하드닝 9의 창 분할 검증은 `readBase64.range`가 3의 배수인지를 봐야 성립한다.
 */
export type FakeCallLog = {
  readonly stat: readonly string[];
  readonly copy: readonly { readonly from: string; readonly to: string }[];
  readonly remove: readonly string[];
  readonly ensureDirectory: readonly string[];
  readonly readBase64: readonly { readonly uri: string; readonly range: ChunkRange }[];
  readonly download: readonly { readonly url: string; readonly to: string }[];
};

type MutableCallLog = {
  readonly stat: string[];
  readonly copy: { readonly from: string; readonly to: string }[];
  readonly remove: string[];
  readonly ensureDirectory: string[];
  readonly readBase64: { readonly uri: string; readonly range: ChunkRange }[];
  readonly download: { readonly url: string; readonly to: string }[];
};

export type MemoryFileSystemOptions = {
  /** 초기 파일 — uri → 바이트. 값은 복사되므로 이후 호출자가 고쳐도 페이크는 흔들리지 않는다. */
  readonly files?: Readonly<Record<string, Uint8Array>> | undefined;
  /**
   * 앱 소유 캐시 디렉토리(끝에 '/'). 기본 `'file:///cache/'`.
   * ⚠ **`null`을 줄 수 있다** — "쓸 수 있는 디렉토리가 하나도 없는 기기"가 실제 분기이기 때문이다:
   *   `StagingCache.uriFor`가 `null`을 반환하는 경로(§5.3)와 `createMediaSaver`가 plain Error를
   *   던지는 경로(§5.4-⑥)는 이 값이 없어야만 도달한다.
   */
  readonly cacheDirectory?: string | null | undefined;
  /** App-owned durable root. Default `'file:///documents/'`; null exercises unavailable storage. */
  readonly rootDirectory?: string | null | undefined;
  /** 디렉토리로 취급할 uri. 끝이 '/'인 uri는 지정하지 않아도 디렉토리다. */
  readonly directories?: readonly string[] | undefined;
  /**
   * `download`의 응답을 결정한다. 기본은 `{ status: 200 }` + 8바이트 더미.
   * ⚠ 3xx·4xx를 돌려주는 수단이 없으면 §7.1의 "다운로드 status **2xx 범위** 검증 + 실패 시
   *   임시 파일 정리"를 검증할 방법이 없다. 그래서 상태코드가 주입구다.
   */
  readonly download?:
    | ((input: { readonly url: string; readonly to: string }) => {
        readonly status: number;
        readonly bytes?: Uint8Array | undefined;
      })
    | undefined;
};

export interface MemoryFileSystem
  extends FileSystemAdapter,
    FileDownloadAdapter,
    DurableFileStoreAdapter {
  readonly calls: FakeCallLog;
  /** 현재 존재하는 파일 uri 전량(정렬됨). 스테이징 누수 검증의 직접 증거다(§7 하드닝 7). */
  list(): readonly string[];
  /** 파일 바이트를 그대로 읽는다. 없으면 `null`. 업로드된 바이트 대조에 쓴다. */
  read(uri: string): Uint8Array | null;
  /** 파일을 심는다. 테스트 도중 상태를 바꿔야 하는 경우(재시도 시나리오)를 위해 열어 둔다. */
  write(uri: string, bytes: Uint8Array): void;
}

const DEFAULT_CACHE_DIRECTORY = 'file:///cache/';
const DEFAULT_ROOT_DIRECTORY = 'file:///documents/';
const DEFAULT_DOWNLOAD_BYTES = 8;

function own(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy;
}

export function createMemoryFileSystem(options?: MemoryFileSystemOptions | undefined): MemoryFileSystem {
  const files = new Map<string, Uint8Array>();
  for (const [uri, bytes] of Object.entries(options?.files ?? {})) {
    files.set(uri, own(bytes));
  }
  const directories = new Set<string>(options?.directories ?? []);
  // `undefined`(미지정)와 `null`(디렉토리 없음)을 구분해야 한다 — 후자가 실제 분기다.
  const cacheDirectory =
    options?.cacheDirectory === undefined ? DEFAULT_CACHE_DIRECTORY : options.cacheDirectory;
  const rootDirectory =
    options?.rootDirectory === undefined ? DEFAULT_ROOT_DIRECTORY : options.rootDirectory;

  const calls: MutableCallLog = {
    stat: [], copy: [], remove: [], ensureDirectory: [], readBase64: [], download: [],
  };

  const isDirectory = (uri: string): boolean => directories.has(uri) || uri.endsWith('/');

  return {
    calls,

    list() {
      return [...files.keys()].sort();
    },

    read(uri) {
      const bytes = files.get(uri);
      return bytes === undefined ? null : own(bytes);
    },

    write(uri, bytes) {
      files.set(uri, own(bytes));
    },

    cacheDirectory() {
      return cacheDirectory;
    },

    rootDirectory() {
      return rootDirectory;
    },

    ensureDirectory(uri) {
      calls.ensureDirectory.push(uri);
      directories.add(uri);
      return Promise.resolve();
    },

    stat(uri): Promise<FileStat> {
      calls.stat.push(uri);
      const bytes = files.get(uri);
      // 0바이트 파일은 존재하는 파일이다 — truthy 검사로 축약하면 빈 포스터 경로
      // (§5.1 텔레메트리 `cancel`)의 분기가 통째로 사라진다.
      if (bytes !== undefined) return Promise.resolve({ kind: 'file', sizeBytes: bytes.length });
      if (isDirectory(uri)) return Promise.resolve({ kind: 'directory' });
      return Promise.resolve({ kind: 'missing' });
    },

    copy({ from, to }) {
      calls.copy.push({ from, to });
      const bytes = files.get(from);
      if (bytes === undefined) {
        // ⚠ 실패는 **throw**다. `normalizeUploadUri`의 규칙 ④("카피 실패는 다음 후보로 진행")를
        //   발화시키는 유일한 수단이므로, 조용히 no-op으로 넘기면 그 하드닝이 검증되지 않는다.
        return Promise.reject(new Error(`memory-fs: cannot copy missing file ${from}`));
      }
      files.set(to, own(bytes));
      return Promise.resolve();
    },

    remove(uri) {
      calls.remove.push(uri);
      // 멱등 삭제 — 없어도 throw하지 않는다(§3.3 계약).
      files.delete(uri);
      return Promise.resolve();
    },

    readBase64(uri, range: ChunkRange) {
      calls.readBase64.push({ uri, range });
      const bytes = files.get(uri);
      if (bytes === undefined) {
        return Promise.reject(new Error(`memory-fs: cannot read missing file ${uri}`));
      }
      // ⚠ 창을 **재정렬·병합·확장하지 않는다**(§3.3 `readBase64` 계약). 어댑터가 범위를
      //   손보면 하드닝 9가 무력화되므로, 페이크도 그 규율을 정확히 지켜야 검증이 성립한다.
      return Promise.resolve(bytesToBase64(bytes.subarray(range.position, range.position + range.length)));
    },

    download({ url, to }) {
      calls.download.push({ url, to });
      const response = options?.download?.({ url, to }) ?? { status: 200 };
      // ⚠ 실패 상태에서도 파일을 만든다. 실제 `downloadAsync`도 에러 본문을 파일로 남기며,
      //   코어가 그 임시 파일을 지우는지(§7.1)를 검증하려면 지울 대상이 존재해야 한다.
      files.set(to, own(response.bytes ?? fakeBytes(DEFAULT_DOWNLOAD_BYTES)));
      return Promise.resolve({ uri: to, status: response.status });
    },
  };
}
