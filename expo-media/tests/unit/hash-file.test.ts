// 설계 문서 §5.3 · §7 하드닝 9 — base64 창 스트리밍 해시.
//
// ⚠ 이 파일이 지키는 것: **3의 배수 창 정렬.** 3바이트가 base64 4문자에 대응하므로 창 길이가
//   3의 배수가 아니면 경계에 패딩이 끼어 디코딩 결과가 원본과 어긋난다 — 예외는 나지 않고
//   해시만 조용히 틀린다. 그래서 여기서는 "값이 node:crypto와 같은가"와 "요청한 창이 3의
//   배수였는가"를 **둘 다** 본다. 값만 보면 창 하나짜리 파일에서 통과해 버리고,
//   창만 보면 디코더 회귀를 놓친다.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HASH_CHUNK_BYTES,
  computeChunkRanges,
  createFileHasher,
} from '../../src/core/hashFile';
import { mediaErrorCode } from '../../src/core/errors';
import { createBinarySource, createMemoryFileSystem, fakeBytes } from '../../src/testing';

const nodeSha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

describe('HASH_CHUNK_BYTES', () => {
  it('3의 배수다 — 이 한 줄이 하드닝 9의 전제다', () => {
    expect(HASH_CHUNK_BYTES % 3).toBe(0);
    expect(HASH_CHUNK_BYTES).toBe(3 * 256 * 1024);
  });
});

describe('computeChunkRanges', () => {
  it('size 0·음수는 빈 배열 — 읽을 창이 없다', () => {
    expect(computeChunkRanges(0)).toEqual([]);
    expect(computeChunkRanges(-1)).toEqual([]);
  });

  it('창 하나에 들어가는 크기는 그 크기 그대로 1창', () => {
    expect(computeChunkRanges(1)).toEqual([{ position: 0, length: 1 }]);
    expect(computeChunkRanges(HASH_CHUNK_BYTES)).toEqual([
      { position: 0, length: HASH_CHUNK_BYTES },
    ]);
  });

  it('경계 +1 은 두 창으로 갈리고 꼬리만 짧다', () => {
    expect(computeChunkRanges(HASH_CHUNK_BYTES + 1)).toEqual([
      { position: 0, length: HASH_CHUNK_BYTES },
      { position: HASH_CHUNK_BYTES, length: 1 },
    ]);
  });

  it.each([1, 3, HASH_CHUNK_BYTES - 1, HASH_CHUNK_BYTES, HASH_CHUNK_BYTES + 7, 3_000_000])(
    'size=%i — position은 항상 3의 배수, 마지막을 뺀 length도 3의 배수, 합은 size',
    (size) => {
      const ranges = computeChunkRanges(size);
      expect(ranges.reduce((sum, range) => sum + range.length, 0)).toBe(size);
      for (const [index, range] of ranges.entries()) {
        expect(range.position % 3).toBe(0);
        // 마지막 창만 파일 끝에서 잘리므로 3의 배수가 아닐 수 있다 — 그 뒤에 이어 붙는
        // 창이 없으므로 패딩이 경계에 끼어들 자리도 없다.
        if (index < ranges.length - 1) expect(range.length % 3).toBe(0);
        expect(range.position).toBe(index * HASH_CHUNK_BYTES);
      }
    },
  );

  it('chunkBytes 인자를 받지 않는다 — 하드닝 9의 회귀 통로를 막은 결과(§6.1-⑩)', () => {
    expect(computeChunkRanges.length).toBe(1);
  });
});

describe('createFileHasher.hashLocalFile', () => {
  it.each([0, 1, 64, 1000, HASH_CHUNK_BYTES, HASH_CHUNK_BYTES + 7, 2 * HASH_CHUNK_BYTES + 13])(
    'size=%i — 창 분할 해시가 node:crypto와 같다',
    async (size) => {
      const bytes = fakeBytes(size);
      const files = createMemoryFileSystem({ files: { 'file:///a.jpg': bytes } });
      const hasher = createFileHasher({ files });
      expect(await hasher.hashLocalFile('file:///a.jpg')).toBe(nodeSha256(bytes));
    },
  );

  it('어댑터에 요청한 창이 3의 배수이고 연속적이다 — 페이크 fs 기록이 직접 증거', async () => {
    const bytes = fakeBytes(2 * HASH_CHUNK_BYTES + 5);
    const files = createMemoryFileSystem({ files: { 'file:///a.jpg': bytes } });
    await createFileHasher({ files }).hashLocalFile('file:///a.jpg');

    expect(files.calls.readBase64).toHaveLength(3);
    let expectedPosition = 0;
    for (const [index, call] of files.calls.readBase64.entries()) {
      expect(call.uri).toBe('file:///a.jpg');
      expect(call.range.position).toBe(expectedPosition);
      if (index < 2) expect(call.range.length % 3).toBe(0);
      expectedPosition += call.range.length;
    }
    expect(expectedPosition).toBe(bytes.length);
  });

  it('파일이 없으면 device-not-found', async () => {
    const files = createMemoryFileSystem();
    const error = await createFileHasher({ files })
      .hashLocalFile('file:///missing.jpg')
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('device-not-found');
    // stat에서 걸러졌으므로 바이트를 읽으려 시도조차 하지 않는다.
    expect(files.calls.readBase64).toHaveLength(0);
  });

  it('디렉토리도 device-not-found — 판별 유니언이 2중 검사를 한 번으로 좁힌 지점', async () => {
    const files = createMemoryFileSystem({ directories: ['file:///cache/dir'] });
    const error = await createFileHasher({ files })
      .hashLocalFile('file:///cache/dir')
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('device-not-found');
  });
});

describe('createFileHasher.hashBinary', () => {
  it('바이너리는 창 분할 없이 통째로 — 값은 node:crypto와 같다', async () => {
    const bytes = fakeBytes(5000);
    const files = createMemoryFileSystem();
    const source = createBinarySource(bytes, { name: 'a.jpg', type: 'image/jpeg' });
    expect(await createFileHasher({ files }).hashBinary(source)).toBe(nodeSha256(bytes));
    expect(files.calls.readBase64).toHaveLength(0);
  });
});
