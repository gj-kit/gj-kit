// 설계 문서 §9 · §7 하드닝 9 — 순수 TS SHA-256의 정확성.
//
// ⚠ 이 파일이 지키는 것: **런타임 의존성 0을 얻는 대가로 해시가 틀리지 않았다는 증거.**
// 전신은 `js-sha256`(순수 JS)을 썼고 그것을 걷어낸 교체다. 교체가 안전하다는 주장은
// 두 가지 대조로만 성립한다:
//   ① **NIST 벡터**(FIPS 180-4 부록) — 명세가 정한 값. 구현 계보와 무관한 절대 기준이다.
//   ② **node:crypto 13종 크기** — `js-sha256`도 node crypto도 같은 FIPS 180-4를 구현하므로,
//      node crypto와 전 크기에서 일치하면 전신 `js-sha256`과도 같은 출력이다.
//      (js-sha256을 devDependency로 들이면 "런타임 의존성 0" 규율을 검증하려고 그 의존성을
//       다시 설치하는 자가당착이 된다 — 동치 오라클로 node crypto를 쓴다.)
//
// 경계값 선정 이유(§9): 55/56 = 패딩이 블록 하나를 더 먹는 경계, 63/64/65 = 블록 경계,
// 768KB±는 `HASH_CHUNK_BYTES` 창 경계다. 여기가 틀리면 **예외 없이 값만 조용히 달라진다**.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createSha256, sha256Hex } from '../../src/core/sha256';
import { fakeBytes } from '../../src/testing';

const ascii = (value: string): Uint8Array =>
  Uint8Array.from(value, (character) => character.charCodeAt(0));

const nodeSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** 창 크기를 바꿔 가며 먹여도 결과가 같아야 한다 — 청크 경계 독립성(§9 `update` ①②③). */
function hashInChunks(bytes: Uint8Array, chunkBytes: number): string {
  const hasher = createSha256();
  for (let position = 0; position < bytes.length; position += chunkBytes) {
    hasher.update(bytes.subarray(position, Math.min(position + chunkBytes, bytes.length)));
  }
  return hasher.hex();
}

describe('createSha256 — NIST 벡터', () => {
  it('빈 입력', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('"abc" (1블록 미만)', () => {
    expect(sha256Hex(ascii('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('56바이트 — 패딩이 블록 하나를 더 먹는 경계', () => {
    const message = 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq';
    expect(message.length).toBe(56);
    expect(sha256Hex(ascii(message))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('112바이트 — 멀티블록', () => {
    const message =
      'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu';
    expect(message.length).toBe(112);
    expect(sha256Hex(ascii(message))).toBe(
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    );
  });

  it("'a' 100만 개 — 멀티청크 증분 경로", () => {
    // ⚠ 단발이 아니라 **증분**으로 먹인다. 이 벡터가 잡는 것은 압축 함수가 아니라
    //   블록 경계를 가로지르는 상태 이월이다(15MB 파일 해시가 정확히 이 경로다).
    const hasher = createSha256();
    const chunk = ascii('a'.repeat(1000));
    for (let index = 0; index < 1000; index += 1) hasher.update(chunk);
    expect(hasher.hex()).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  });
});

describe('createSha256 — node:crypto 13종 크기 대조', () => {
  // §9가 지정한 13종. 768KB = HASH_CHUNK_BYTES(§7 하드닝 9).
  const SIZES = [
    0, 1, 55, 56, 63, 64, 65, 127, 128, 1000, 768 * 1024, 768 * 1024 + 7, 3 * 1024 * 1024 + 13,
  ] as const;

  it.each(SIZES)('size=%i — 단발', (size) => {
    const bytes = fakeBytes(size);
    expect(sha256Hex(bytes)).toBe(nodeSha256(bytes));
  });

  it.each(SIZES)('size=%i — 768KB 창 분할', (size) => {
    const bytes = fakeBytes(size);
    expect(hashInChunks(bytes, 768 * 1024)).toBe(nodeSha256(bytes));
  });

  it.each(SIZES)('size=%i — 블록에 정렬되지 않는 창(4093B) 분할', (size) => {
    // 4093은 64의 배수가 아니다 — 부분 블록 이월(`blockLength`) 경로를 강제로 태운다.
    const bytes = fakeBytes(size);
    expect(hashInChunks(bytes, 4093)).toBe(nodeSha256(bytes));
  });
});

describe('createSha256 — 종료 연산 규약', () => {
  it('hex()는 멱등이다', () => {
    const hasher = createSha256();
    hasher.update(ascii('abc'));
    const first = hasher.hex();
    expect(hasher.hex()).toBe(first);
  });

  it('hex() 이후의 update()는 무시된다 — 부분 갱신된 다이제스트를 돌려주지 않는다', () => {
    const hasher = createSha256();
    hasher.update(ascii('abc'));
    const digest = hasher.hex();
    hasher.update(ascii('ignored'));
    expect(hasher.hex()).toBe(digest);
    expect(digest).toBe(sha256Hex(ascii('abc')));
  });

  it('빈 update()를 여러 번 해도 빈 입력 다이제스트다', () => {
    const hasher = createSha256();
    hasher.update(new Uint8Array(0));
    hasher.update(new Uint8Array(0));
    expect(hasher.hex()).toBe(sha256Hex(new Uint8Array(0)));
  });
});
