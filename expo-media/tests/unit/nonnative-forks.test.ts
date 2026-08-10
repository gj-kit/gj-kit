// 설계 문서 §8.5 — 비네이티브 포크(`browser` + `node` 조건)의 **동작 규약**.
//
// ⚠ `.web.`은 "브라우저 전용"이 아니라 **"비네이티브"**다(§8.4-7). 같은 산출물이 클라이언트
//   번들과 SSR·프리렌더 양쪽에 매핑되므로, 이 포크는 `document`가 없는 런타임(= 이 유닛이
//   도는 node 환경)에서도 **조립되고 예측 가능하게 실패**해야 한다.
//
// 규약이 갈리는 두 갈래를 각각 고정한다:
//   · 열거·권한 조회 → 빈 결과 / 거부. UI가 "이 플랫폼에선 사용 불가"를 그려야 하므로 throw는 과잉.
//   · 자산 해석·저장 → `MediaError('platform-unsupported')`. 전신은 plain Error라 **code로 분기할
//     수 없었다** — 그 개선이 여기서 검증된다.
//
// ⚠ peer 0인 파일들이므로 유닛에서 그대로 import된다(expo 모킹 0 — §10.1).

import { describe, expect, it } from 'vitest';
import { mediaErrorCode } from '../../src/core/errors';
import { expoDeviceLibrary } from '../../src/device/web';
import { expoDeviceSave } from '../../src/save/web';

describe('"./device" 비네이티브 포크', () => {
  const adapter = expoDeviceLibrary();

  it('권한 조회·요청은 거부를 그대로 보고한다 (throw하지 않는다)', async () => {
    const denied = { granted: false, canAskAgain: false, limited: false };
    expect(await adapter.getPermission()).toEqual(denied);
    expect(await adapter.requestPermission()).toEqual(denied);
  });

  it('열거는 빈 페이지·빈 배열이다 — SSR과 클라이언트가 같은 값을 만들어 하이드레이션이 일치한다', async () => {
    const page = await adapter.listAssets({ pageSize: 60, kinds: ['image'] });
    expect(page).toEqual({ assets: [], hasNextPage: false, totalCount: 0 });
    // `endCursor` 키를 넣지 않는다 — 두 포크가 같은 객체를 만들어야 한다.
    expect(page).not.toHaveProperty('endCursor');
    expect(await adapter.listAlbums()).toEqual([]);
  });

  it('자산 해석은 platform-unsupported — code로 분기할 수 있다', async () => {
    const error = await adapter
      .getAssetInfo('A1', { downloadFromNetwork: false })
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('platform-unsupported');
  });
});

describe('"./save" 비네이티브 포크', () => {
  it('권한 요청을 건너뛴다 — 브라우저에는 요청할 권한이 없다', () => {
    expect(expoDeviceSave().skipPermissionRequest).toBe(true);
  });

  it('document가 없는 런타임(SSR·node)에서는 저장 가능 여부를 false로 보고한다', async () => {
    expect(await expoDeviceSave().requestWritePermission()).toEqual({
      granted: false,
      canAskAgain: false,
      limited: false,
    });
  });

  it('그 런타임에서 실제로 저장하면 platform-unsupported다', async () => {
    // ⚠ `save-permission-denied`가 아니어야 한다 — 그 코드는 실제 원인(플랫폼 미지원)을 가린다.
    const error = await expoDeviceSave()
      .saveToLibrary('file:///cache/media-1.jpg')
      .catch((thrown: unknown) => thrown);
    expect(mediaErrorCode(error)).toBe('platform-unsupported');
  });

  it('네이티브 포크와 같은 인자 형태를 받는다 (isExpoGo는 여기서 의미가 없다)', () => {
    expect(expoDeviceSave({ isExpoGo: true }).skipPermissionRequest).toBe(true);
  });
});
