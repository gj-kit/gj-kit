// 설계 문서 §5.4-④ · §7.1 — 권한 합성 게이트 / 열거 계약.
//
// ⚠ 정책이 어댑터에 있으면 3자 어댑터마다 규칙이 갈리고, 갈린 규칙은 타입도 가드도 잡지 못한다.
//   그래서 페이크 어댑터는 **정책을 하나도 갖지 않는다** — `calls.requestPermission` 횟수가
//   "언제 요청하는가"를 코어가 소유한다는 직접 증거가 되고, 뒤섞인 앨범 순서가
//   "필터·정렬을 코어가 한다"의 직접 증거가 된다.

import { describe, expect, it } from 'vitest';
import type { DeviceAsset, DeviceLibraryAdapter, MediaPermission } from '../../src/core/adapters';
import { MediaError, mediaErrorCode } from '../../src/core/errors';
import { createDeviceLibrary } from '../../src/core/device/deviceLibrary';
import { createStagingCache } from '../../src/core/staging';
import type { FakeDeviceLibraryOptions } from '../../src/testing';
import {
  createFakeDeviceLibrary,
  createMemoryFileSystem,
  fakePlatform,
  signedUrlErrorMessage,
} from '../../src/testing';

const asset = (id: string, mediaType: DeviceAsset['mediaType'] = 'image'): DeviceAsset => ({
  id,
  filename: `${id}.jpg`,
  uri: `ph://${id}`,
  width: 100,
  height: 100,
  mediaType,
});

function setup(options?: {
  readonly library?: FakeDeviceLibraryOptions;
  readonly adapter?: (fake: DeviceLibraryAdapter) => DeviceLibraryAdapter;
}) {
  const files = createMemoryFileSystem();
  const fake = createFakeDeviceLibrary(options?.library);
  const adapter = options?.adapter ? options.adapter(fake) : fake;
  const device = createDeviceLibrary({
    adapter,
    files,
    staging: createStagingCache({ namespace: 'gj-media', files }),
    platform: fakePlatform('ios'),
  });
  return { adapter, fake, device };
}

describe('ensurePermission — 3단 규칙(§5.4-④(c))', () => {
  it('이미 허용이면 요청하지 않는다', async () => {
    const granted: MediaPermission = { granted: true, canAskAgain: true, limited: false };
    const { fake, device } = setup({ library: { permission: granted } });

    expect(await device.ensurePermission()).toEqual(granted);
    expect(fake.calls.getPermission).toBe(1);
    expect(fake.calls.requestPermission).toBe(0);
  });

  it('거부 + 다시 물어볼 수 있으면 정확히 1회 요청하고 그 결과를 반환한다', async () => {
    const { fake, device } = setup({
      library: {
        permission: { granted: false, canAskAgain: true, limited: false },
        requestedPermission: { granted: true, canAskAgain: false, limited: false },
      },
    });

    expect(await device.ensurePermission()).toEqual({
      granted: true,
      canAskAgain: false,
      limited: false,
    });
    expect(fake.calls.requestPermission).toBe(1);
  });

  it('거부 + 다시 물어볼 수 없으면 요청 0회 — iOS UI 데드록 차단', async () => {
    const denied: MediaPermission = { granted: false, canAskAgain: false, limited: false };
    const { fake, device } = setup({ library: { permission: denied } });

    // ⚠ 이 상태의 재요청은 아무 일도 일어나지 않는 no-op이고, 호출자는 응답을 기다리며 멈춘다.
    expect(await device.ensurePermission()).toEqual(denied);
    expect(fake.calls.requestPermission).toBe(0);
  });

  it('limited(선택된 사진)는 그대로 통과한다 — 매핑은 어댑터 몫이다', async () => {
    const limited: MediaPermission = { granted: true, canAskAgain: false, limited: true };
    const { device } = setup({ library: { permission: limited } });
    expect(await device.ensurePermission()).toEqual(limited);
  });

  it('getPermission은 순수 조회다 — 요청하지 않는다', async () => {
    const { fake, device } = setup({
      library: { permission: { granted: false, canAskAgain: true, limited: false } },
    });
    await device.getPermission();
    expect(fake.calls.requestPermission).toBe(0);
  });
});

describe('호스트 어댑터 실패 정규화', () => {
  it('권한 조회·요청의 raw 또는 forged MediaError를 device-library-failed로 봉인한다', async () => {
    const raw = signedUrlErrorMessage();
    const { device } = setup({
      adapter: (fake) => ({
        ...fake,
        getPermission: async () => {
          throw new MediaError('device-timeout', raw);
        },
      }),
    });

    const error = await device.getPermission().catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('device-library-failed');
    expect((error as Error).message).not.toContain('https://');
    expect((error as Error).message).not.toContain('X-Amz-Signature');
  });

  it('페이지·앨범의 malformed/throwing 결과를 public raw error로 내보내지 않는다', async () => {
    const raw = signedUrlErrorMessage();
    const { device } = setup({
      adapter: (fake) => ({
        ...fake,
        listAssets: async () =>
          ({
            get assets() {
              throw new Error(raw);
            },
            hasNextPage: false,
            totalCount: 0,
          }) as never,
        listAlbums: async () => {
          throw new MediaError('device-not-found', raw);
        },
      }),
    });

    const pageError = await device.fetchPage().catch((thrown: unknown) => thrown);
    const albumsError = await device.fetchAlbums().catch((thrown: unknown) => thrown);

    for (const error of [pageError, albumsError]) {
      expect(mediaErrorCode(error)).toBe('device-library-failed');
      expect((error as Error).message).not.toContain('https://');
      expect((error as Error).message).not.toContain('X-Amz-Signature');
    }
  });
});

describe('fetchAlbums — core가 count>0 필터 + count 내림차순을 수행한다', () => {
  it('뒤섞인 순서와 빈 앨범이 섞여 와도 결과가 같다', async () => {
    const { device } = setup({
      library: {
        albums: [
          { id: '1', title: 'Small', count: 2 },
          { id: '2', title: 'Empty', count: 0 },
          { id: '3', title: 'Large', count: 30 },
          { id: '4', title: 'Mid', count: 7 },
        ],
      },
    });

    expect(await device.fetchAlbums()).toEqual([
      { id: '3', title: 'Large', count: 30 },
      { id: '4', title: 'Mid', count: 7 },
      { id: '1', title: 'Small', count: 2 },
    ]);
  });

  it('어댑터가 준 배열을 변형하지 않는다 (복사본을 정렬한다)', async () => {
    const albums = [
      { id: '1', title: 'A', count: 1 },
      { id: '2', title: 'B', count: 9 },
    ];
    const { device } = setup({ library: { albums } });
    await device.fetchAlbums();
    expect(albums.map((album) => album.id)).toEqual(['1', '2']);
  });
});

describe('fetchPage — core는 재정렬하지 않는다(§5.4-④(d))', () => {
  it('어댑터 순서를 변형 없이 통과시킨다 — 커서와 표시 순서가 어긋나지 않게', async () => {
    const assets = [asset('c'), asset('a'), asset('b')];
    const { device } = setup({ library: { assets } });

    const page = await device.fetchPage();

    expect(page.assets.map((item) => item.id)).toEqual(['c', 'a', 'b']);
    expect(page.hasNextPage).toBe(false);
    expect(page.totalCount).toBe(3);
  });

  it('기본 pageSize 60 · kinds ["image"]가 어댑터에 그대로 간다', async () => {
    const { fake, device } = setup({ library: { assets: [asset('a')] } });
    await device.fetchPage();
    expect(fake.calls.listAssets).toEqual([
      { albumId: undefined, after: undefined, pageSize: 60, kinds: ['image'] },
    ]);
  });

  it('커서·앨범·종류를 그대로 위임한다', async () => {
    const { fake, device } = setup({
      library: {
        assets: [asset('a'), asset('b'), asset('v', 'video')],
        albumAssets: { alb: ['a', 'b', 'v'] },
      },
    });

    const first = await device.fetchPage({
      albumId: 'alb',
      pageSize: 2,
      kinds: ['image', 'video'],
    });
    expect(first.assets.map((item) => item.id)).toEqual(['a', 'b']);
    expect(first.hasNextPage).toBe(true);

    const second = await device.fetchPage({
      albumId: 'alb',
      after: first.endCursor,
      pageSize: 2,
      kinds: ['image', 'video'],
    });
    expect(second.assets.map((item) => item.id)).toEqual(['v']);
    expect(second.hasNextPage).toBe(false);
    expect(fake.calls.listAssets[1]?.after).toBe(first.endCursor);
  });

  it('그리드 열거는 자산별 getAssetInfo를 부르지 않는다 — 페이지당 20초의 원인', async () => {
    const { fake, device } = setup({ library: { assets: [asset('a'), asset('b')] } });
    await device.fetchPage();
    expect(fake.calls.getAssetInfo).toEqual([]);
  });
});
