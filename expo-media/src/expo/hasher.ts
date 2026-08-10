// 설계 문서 §3.3-④ · §9 — `HashAdapter`의 expo 기본 조립.
//
// 해시 알고리즘 자체는 코어에 있다(순수 TS 증분 SHA-256 — `js-sha256` 제거로 런타임 의존성 0).
// 이 파일이 하는 일은 **파일 I/O를 expo 어댑터로 꽂는 것뿐**이다: base64 창 스트리밍으로
// 피크 메모리를 유한하게 유지한다는 전신 설계(hashFile.ts:1-4)는 코어가 그대로 갖고 있고,
// 여기서는 그 창을 누가 읽어 오는가만 정해진다.
//
// ⚠ 창 크기(`HASH_CHUNK_BYTES`)와 3의 배수 규칙(§7 하드닝 9)은 **코어의 몫**이다.
//   어댑터가 범위를 손대면 해시가 조용히 틀린다 — `fileSystem.ts`의 `readBase64` 주석 참조.

import type { FileSystemAdapter, HashAdapter } from '../core/adapters';
import { createFileHasher } from '../core/hashFile';
import { createExpoFileSystem } from './fileSystem';

/**
 * expo 파일시스템 위의 기본 `HashAdapter`.
 *
 * `files`를 주면 그것을 쓴다 — 킷이 이미 만들어 둔 파일시스템 어댑터를 재사용하기 위한 구멍이다
 * (같은 킷 안에서 캐시 디렉토리 판정이 두 벌 생기지 않게). 생략하면 새로 만든다.
 */
export function createExpoHasher(
  input?: { readonly files?: FileSystemAdapter | undefined } | undefined,
): HashAdapter {
  return createFileHasher({ files: input?.files ?? createExpoFileSystem() });
}
