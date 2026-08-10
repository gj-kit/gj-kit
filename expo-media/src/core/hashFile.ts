// 설계 문서 §5.3 · §7 하드닝 9 · §9 — 로컬 파일의 스트리밍 SHA-256.
//
// 전신(`packages/photo-kit/src/hashFile.ts`) 파일 주석의 설계 이유를 그대로 계승한다:
//   "파일을 직접 해시할 수 있는 crypto가 없으므로 파일을 base64 창으로 흘려 읽어 증분 SHA-256에
//    먹인다. 15MB 파일을 통째로 base64 문자열로 올리는 대신 **피크 메모리를 유한하게** 유지한다."
//
// 전신과 달라진 두 가지:
//   · 파일 I/O가 `FileSystemAdapter` 주입이다 — 그래서 이 모듈이 코어에 있고, 페이크 어댑터만으로
//     전 경로가 유닛 검증된다.
//   · base64 디코딩이 순수 구현이다 — 코어는 DOM 무관이어야 하므로 `atob` 전역을 참조할 수 없다(§2.4).

import type { ChunkRange, FileSystemAdapter, HashAdapter } from './adapters';
import { MediaError } from './errors';
// ⚠ `createFileHasher`의 인자에는 문구 주입구가 없다(§5.3의 확정 시그니처). 따라서 내장 기본값을
// 쓴다 — §4의 우선순위 "개별 옵션 > 팩토리 strings > 내장 기본값"의 마지막 단계다.
// 이 에러는 `hashSafely()`가 삼키므로(해시 실패는 업로드를 막지 않는다 — §7.1) 사용자에게 도달하지
// 않는다. `strings.` 접근 형태는 §10.3 `string-guard`가 요구하는 계약이기도 하다.
import { enMediaStrings as strings } from './strings';
import { createSha256 } from './sha256';

/** 증분 해시 심볼의 공개 주소는 §5.3이 이 모듈로 적었다. 선언은 `sha256.ts` 하나뿐이다. */
export { createSha256, sha256Hex } from './sha256';
export type { Sha256Hasher } from './sha256';

/**
 * 읽기 창 크기(바이트).
 *
 * ⚠ **반드시 3의 배수여야 한다**(§7 하드닝 9). 3바이트가 base64 4문자에 대응하므로, 3의 배수가
 * 아니면 창 경계에 패딩(`=`)이 끼어 디코딩된 바이트열이 원본과 어긋난다 — **해시가 조용히 틀린다**.
 * 서버와 클라이언트의 dedup 키가 달라질 뿐 어떤 예외도 나지 않으므로 붙잡을 방법이 없다.
 * `hardening-guard`가 `HASH_CHUNK_BYTES % 3 === 0`을 정적으로 못 박는다.
 */
export const HASH_CHUNK_BYTES = 3 * 256 * 1024; // 768KB

/**
 * `size` 바이트 파일을 순차 `[position, length)` 창으로 나눈다. 순수 함수.
 *
 * ⚠ **`chunkBytes` 인자를 공개하지 않는다**(§6.1-⑩). 전신 `hashFile.ts:18`은 기본 인자로 이것을
 * 열어 두었고, "3의 배수"라는 제약은 타입으로 표현할 수 없으므로 그 인자가 곧 하드닝 9의
 * 회귀 통로였다. 실제로 전신 테스트가 `computeChunkRanges(100, 1000)`처럼 3의 배수가 아닌 값을
 * 넘기고 있었다.
 */
export function computeChunkRanges(size: number): readonly ChunkRange[] {
  if (size <= 0) return [];
  const ranges: ChunkRange[] = [];
  for (let position = 0; position < size; position += HASH_CHUNK_BYTES) {
    ranges.push({
      position,
      length: Math.min(HASH_CHUNK_BYTES, size - position),
    });
  }
  return ranges;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 문자 코드 → 6비트 값. 알파벳 밖(패딩 `=`·개행)은 -1이며 전신과 동일하게 건너뛴다. */
const BASE64_VALUES = ((): Int16Array => {
  const table = new Int16Array(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

/**
 * base64 → 바이트. 전신은 `atob` + 순수 폴백 2단이었으나, 코어는 DOM 전역을 참조할 수 없으므로
 * 순수 경로 하나만 남긴다(§2.4). 중간 문자열을 만들지 않고 바로 바이트를 채워 창당 할당을 1회로
 * 줄인다 — 15MB = 20창이므로 이 차이가 곧 피크 메모리다.
 */
function base64ToBytes(base64: string): Uint8Array {
  // 4문자 → 3바이트. 올림해서 잡고 마지막에 실제 길이로 자른다.
  const bytes = new Uint8Array(((base64.length + 3) >> 2) * 3);
  let length = 0;
  let buffer = 0;
  let bits = 0;
  for (let index = 0; index < base64.length; index += 1) {
    const code = base64.charCodeAt(index);
    const value = code < 128 ? BASE64_VALUES[code]! : -1;
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[length] = (buffer >> bits) & 0xff;
      length += 1;
    }
  }
  return bytes.subarray(0, length);
}

/**
 * `FileSystemAdapter` 위에 base64 창 스트리밍 해시를 조립한다. 기본 `HashAdapter` 구현이다.
 *
 * 해시는 **원본 바이트**에 대해 계산되므로 같은 기기 사진이면 실행 간에도 값이 안정적이다
 * (전신 주석 보존) — 그것이 dedup 키로 쓸 수 있는 이유다.
 */
export function createFileHasher(input: { readonly files: FileSystemAdapter }): HashAdapter {
  const { files } = input;
  return {
    async hashLocalFile(uri) {
      const stat = await files.stat(uri);
      // 판별 유니언 덕에 전신의 `!info.exists || info.isDirectory` 2중 검사가 한 번으로 좁혀진다.
      if (stat.kind !== 'file') {
        throw new MediaError('device-not-found', strings.fileNotFound);
      }
      const hasher = createSha256();
      for (const range of computeChunkRanges(stat.sizeBytes)) {
        hasher.update(base64ToBytes(await files.readBase64(uri, range)));
      }
      return hasher.hex();
    },

    async hashBinary(source) {
      // 바이너리는 이미 메모리에 있는 값이므로 창 분할이 의미가 없다(웹 드롭·포스터 경로).
      const hasher = createSha256();
      hasher.update(new Uint8Array(await source.arrayBuffer()));
      return hasher.hex();
    },
  };
}
