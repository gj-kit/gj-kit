// 설계 문서 §5.3 · §7 하드닝 7 — 스테이징 사본과 그 정리.
//
// ⚠ 이 파일이 지키는 것 둘:
//   ① **누락 시 업로드한 모든 사진의 원본 사본이 앱 컨테이너에 영구 축적된다** — cleanup이 실제로
//      파일을 지우는가.
//   ② **남의 파일을 지우지 않는가.** 전신은 `uri.includes(PREFIX)` 한 줄이었고, 그 술어는
//      우리가 만들지 않은 경로까지 삭제 대상에 넣었다. 3조건 판정의 거짓 통과 경로 셋을
//      각각 별도 케이스로 둔다 — 하나로 뭉치면 어느 조건이 죽었는지 알 수 없다.

import { describe, expect, it } from 'vitest';
import type { FileSystemAdapter } from '../../src/core/adapters';
import { createStagingCache } from '../../src/core/staging';
import { mediaErrorCode } from '../../src/core/errors';
import { createMemoryFileSystem, fakeBytes } from '../../src/testing';

const asset = { id: 'A1B2/L0/001', filename: 'IMG_0001.HEIC' } as const;

describe('네임스페이스 검증 — 부팅 시 즉사', () => {
  it.each(['', '-', 'a', 'A'.repeat(10), 'has space', 'has_underscore', 'x'.repeat(32)])(
    '%o 는 config-invalid',
    (namespace) => {
      const files = createMemoryFileSystem();
      const error = (() => {
        try {
          createStagingCache({ namespace, files });
          return null;
        } catch (thrown: unknown) {
          return thrown;
        }
      })();
      expect(mediaErrorCode(error)).toBe('config-invalid');
    },
  );

  it.each(['ab', 'gj-media', 'a0-9', 'x'.repeat(31)])('%o 는 통과한다', (namespace) => {
    const files = createMemoryFileSystem();
    expect(createStagingCache({ namespace, files }).prefix).toBe(`${namespace}-upload-`);
  });
});

describe('uriFor', () => {
  it('자산 id의 슬래시를 새니타이즈하고 확장자를 소문자로 정규화한다', () => {
    const files = createMemoryFileSystem();
    const staging = createStagingCache({ namespace: 'gj-media', files });
    expect(staging.uriFor(asset)).toBe('file:///cache/gj-media-upload-A1B2-L0-001.heic');
  });

  it('확장자가 없으면 jpg로 폴백한다', () => {
    const files = createMemoryFileSystem();
    const staging = createStagingCache({ namespace: 'gj-media', files });
    expect(staging.uriFor({ id: 'x', filename: 'no-extension' })).toBe(
      'file:///cache/gj-media-upload-x.jpg',
    );
  });

  it('쓸 수 있는 캐시 디렉토리가 없으면 null — 실제 기기 분기다', () => {
    const files = createMemoryFileSystem({ cacheDirectory: null });
    const staging = createStagingCache({ namespace: 'gj-media', files });
    expect(staging.uriFor(asset)).toBeNull();
  });
});

describe('owns — 3조건 전부가 필요하다', () => {
  const files = createMemoryFileSystem();
  const staging = createStagingCache({ namespace: 'gj-media', files });

  it('우리가 만든 사본만 참이다', () => {
    expect(staging.owns('file:///cache/gj-media-upload-x.jpg')).toBe(true);
  });

  it('(i) 캐시 디렉토리 밖 — 남의 디렉토리에 같은 이름이 있어도 거짓', () => {
    expect(staging.owns('file:///other/dir/gj-media-upload-x.jpg')).toBe(false);
  });

  it('(ii) prefix 부분일치 — 경로 중간에 낀 것은 우연이다(전신 includes() 술어의 거짓 통과)', () => {
    expect(staging.owns('file:///cache/photo-gj-media-upload-x.jpg')).toBe(false);
  });

  it('(iii) 하위 경로 — 우리는 하위 디렉토리를 만든 적이 없다', () => {
    expect(staging.owns('file:///cache/gj-media-upload-sub/x.jpg')).toBe(false);
  });

  it('다른 네임스페이스의 사본은 우리 것이 아니다', () => {
    expect(staging.owns('file:///cache/other-upload-x.jpg')).toBe(false);
  });

  it('null·undefined·빈 문자열은 거짓', () => {
    expect(staging.owns(null)).toBe(false);
    expect(staging.owns(undefined)).toBe(false);
    expect(staging.owns('')).toBe(false);
  });

  it('캐시 디렉토리가 없는 기기에서는 무엇도 우리 것이 아니다', () => {
    const noCache = createMemoryFileSystem({ cacheDirectory: null });
    const cache = createStagingCache({ namespace: 'gj-media', files: noCache });
    expect(cache.owns('file:///cache/gj-media-upload-x.jpg')).toBe(false);
  });
});

describe('cleanup', () => {
  it('우리 사본은 실제로 지워진다', async () => {
    const staged = 'file:///cache/gj-media-upload-x.jpg';
    const files = createMemoryFileSystem({ files: { [staged]: fakeBytes(8) } });
    const staging = createStagingCache({ namespace: 'gj-media', files });

    await staging.cleanup(staged);

    expect(files.calls.remove).toEqual([staged]);
    expect(files.list()).toEqual([]);
  });

  it.each([
    'file:///other/dir/gj-media-upload-x.jpg',
    'file:///cache/photo-gj-media-upload-x.jpg',
    'file:///cache/gj-media-upload-sub/x.jpg',
    'file:///cache/other-upload-x.jpg',
  ])('%s 는 no-op — files.remove를 부르지 않는다', async (uri) => {
    const files = createMemoryFileSystem({ files: { [uri]: fakeBytes(8) } });
    const staging = createStagingCache({ namespace: 'gj-media', files });

    await staging.cleanup(uri);

    expect(files.calls.remove).toEqual([]);
    expect(files.list()).toEqual([uri]);
  });

  it('null·undefined는 조용히 no-op', async () => {
    const files = createMemoryFileSystem();
    const staging = createStagingCache({ namespace: 'gj-media', files });
    await staging.cleanup(null);
    await staging.cleanup(undefined);
    expect(files.calls.remove).toEqual([]);
  });

  it('삭제 실패를 삼킨다 — 누수의 대가는 디스크 공간뿐이고, 그것으로 업로드 결과를 뒤집지 않는다', async () => {
    const memory = createMemoryFileSystem();
    const explodingRemove: FileSystemAdapter = {
      cacheDirectory: () => memory.cacheDirectory(),
      stat: (uri) => memory.stat(uri),
      copy: (input) => memory.copy(input),
      remove: () => Promise.reject(new Error('remove exploded')),
      readBase64: (uri, range) => memory.readBase64(uri, range),
    };
    const staging = createStagingCache({ namespace: 'gj-media', files: explodingRemove });
    await expect(staging.cleanup('file:///cache/gj-media-upload-x.jpg')).resolves.toBeUndefined();
  });
});
