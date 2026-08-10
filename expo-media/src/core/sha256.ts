// 설계 문서 §9 — SHA-256 무의존 전략.
//
// **순수 TS 증분 SHA-256(FIPS 180-4)을 코어에 내장한다.** 전신은 `js-sha256` 런타임 의존이었고,
// 그것은 CLAUDE.md의 "런타임 의존성 0"에 정면으로 걸린다.
//
// 대안 판정(§9):
//   · `js-sha256` 유지 → 기각(의존성 규율 위반).
//   · 네이티브 crypto 위임 → 기각. **증분 API가 없어** 15MB 파일을 통째로 메모리에 올려야 하고,
//     그것은 전신 `hashFile.ts:1-4` 주석이 명시한 설계 이유("peak memory bounded")를 훼손한다.
//   · 순수 TS 내장 + `HashAdapter` 교체 슬롯 → **채택**. 전신이 쓰던 `js-sha256`도 순수 JS이므로
//     "네이티브 → JS" 회귀가 아니라 "JS → JS" 교체다. 성능이 문제가 되는 호스트는 어댑터를 갈아끼운다.
//
// ⚠ 정확성은 주장이 아니라 대조로 증명한다 — 유닛이 NIST 벡터와 node crypto로 13종 크기를
// 단발·청크 분할 양쪽으로 검증한다(경계값 55/56 = 패딩 경계, 63/64/65 = 블록 경계).

/** FIPS 180-4 §4.2.2 — 처음 64개 소수의 세제곱근 소수부 상위 32비트. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 §5.3.3 — 처음 8개 소수의 제곱근 소수부 상위 32비트. */
const INITIAL_STATE = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const BLOCK_BYTES = 64;
/** 길이 필드(64비트 big-endian)가 들어갈 자리의 시작. 패딩은 여기까지만 채운다. */
const LENGTH_OFFSET = 56;

/**
 * 증분 해셔. `js-sha256`의 `sha256.create()`와 같은 형태라 전신 호출부가 그대로 옮겨진다.
 *
 * ⚠ `hex()`는 **종료 연산**이다(패딩을 상태에 써 넣는다). 두 번 이상 부르면 같은 값을 돌려주고,
 * 종료 후의 `update()`는 무시한다 — 부분적으로 갱신된 다이제스트를 돌려주는 것보다 낫다.
 */
export interface Sha256Hasher {
  update(bytes: Uint8Array): void;
  hex(): string;
}

export function createSha256(): Sha256Hasher {
  const state = new Uint32Array(INITIAL_STATE);
  const block = new Uint8Array(BLOCK_BYTES);
  // 메시지 스케줄. 인스턴스당 한 번만 할당해 블록마다 재사용한다(15MB = 24만 블록).
  const schedule = new Uint32Array(64);
  let blockLength = 0;
  let totalBytes = 0;
  let digest: string | null = null;

  // ⚠ 아래 인덱스 접근의 `!`는 `noUncheckedIndexedAccess` 때문이다. 인덱스는 전부 상수 범위
  // (0..63 / 0..7) 안이 자명하며, `?? 0` 폴백을 쓰면 내부 루프마다 분기가 하나씩 늘어난다 —
  // Hermes 실기 성능이 §12의 잔존 리스크로 남아 있는 이상 그 비용을 지불할 이유가 없다.
  const compress = (data: Uint8Array, offset: number): void => {
    for (let i = 0; i < 16; i += 1) {
      const j = offset + i * 4;
      schedule[i] =
        ((data[j]! << 24) | (data[j + 1]! << 16) | (data[j + 2]! << 8) | data[j + 3]!) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const x = schedule[i - 15]!;
      const y = schedule[i - 2]!;
      const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      schedule[i] = (schedule[i - 16]! + s0 + schedule[i - 7]! + s1) >>> 0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;

    for (let i = 0; i < 64; i += 1) {
      const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + K[i]! + schedule[i]!) >>> 0;
      const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  };

  return {
    update(bytes: Uint8Array): void {
      if (digest !== null) return;
      totalBytes += bytes.length;

      let offset = 0;
      // ① 직전 호출이 남긴 부분 블록을 먼저 채운다. 채워지지 않으면 그대로 돌아간다 —
      //    호출자가 어떤 크기로 잘라 주든 결과가 같아야 한다(청크 경계 독립성).
      if (blockLength > 0) {
        const take = Math.min(BLOCK_BYTES - blockLength, bytes.length);
        block.set(bytes.subarray(0, take), blockLength);
        blockLength += take;
        offset = take;
        if (blockLength === BLOCK_BYTES) {
          compress(block, 0);
          blockLength = 0;
        }
      }
      // ② 정렬된 구간은 입력 버퍼에서 직접 압축한다(복사 없음).
      while (offset + BLOCK_BYTES <= bytes.length) {
        compress(bytes, offset);
        offset += BLOCK_BYTES;
      }
      // ③ 꼬리는 다음 호출을 위해 남긴다.
      if (offset < bytes.length) {
        block.set(bytes.subarray(offset), 0);
        blockLength = bytes.length - offset;
      }
    },

    hex(): string {
      if (digest === null) {
        const bitLength = totalBytes * 8;
        block[blockLength] = 0x80;
        blockLength += 1;
        // 길이 필드가 들어갈 자리가 남지 않으면 블록 하나를 더 소비한다(FIPS 180-4 §5.1.1).
        if (blockLength > LENGTH_OFFSET) {
          block.fill(0, blockLength, BLOCK_BYTES);
          compress(block, 0);
          blockLength = 0;
        }
        block.fill(0, blockLength, LENGTH_OFFSET);

        // 64비트 big-endian 비트 길이. JS 정수는 2^53까지이므로 상위 워드를 나눗셈으로 얻는다
        // (파일 해시가 다루는 범위에서 2^53비트 = 1PB는 도달 불가능하다).
        const high = Math.floor(bitLength / 0x1_0000_0000);
        const low = bitLength >>> 0;
        block[LENGTH_OFFSET] = (high >>> 24) & 0xff;
        block[LENGTH_OFFSET + 1] = (high >>> 16) & 0xff;
        block[LENGTH_OFFSET + 2] = (high >>> 8) & 0xff;
        block[LENGTH_OFFSET + 3] = high & 0xff;
        block[LENGTH_OFFSET + 4] = (low >>> 24) & 0xff;
        block[LENGTH_OFFSET + 5] = (low >>> 16) & 0xff;
        block[LENGTH_OFFSET + 6] = (low >>> 8) & 0xff;
        block[LENGTH_OFFSET + 7] = low & 0xff;
        compress(block, 0);
        blockLength = 0;

        let out = '';
        for (let i = 0; i < 8; i += 1) {
          out += state[i]!.toString(16).padStart(8, '0');
        }
        digest = out;
      }
      return digest;
    },
  };
}

/** 단발 해시. 증분 경로와 **같은 구현**을 쓰므로 둘이 어긋날 수 없다. */
export function sha256Hex(bytes: Uint8Array): string {
  const hasher = createSha256();
  hasher.update(bytes);
  return hasher.hex();
}
