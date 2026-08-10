// 설계 문서 §5.4-④ — 기기 자산 → 피커 자산 재조립(순수, I/O 0).
//
// 전신 `devicePhotoLibrary.ts:360-369`의 객체 리터럴을 공개 헬퍼로 승격한 것이다.
// 전신에서 이 조합은 `resolveDeviceAssetForUpload` 안에 갇혀 있었고, 3자 소비자가 같은
// 형태를 만들려면 `as ImagePicker.ImagePickerAsset` 캐스트와 뒷문 프로퍼티
// `__photoKitVerifiedSizeBytes`를 흉내 내야 했다. 공개하면 캐스트도 뒷문도 사라진다(§5.7.2-⑨).

import type { DeviceAsset, ResolvedDeviceAsset, ResolvedPickedAsset } from '../adapters';

/**
 * `DeviceAsset`의 정체성(id·filename·치수)과 resolve 결과(바이트 위치·실측 크기·EXIF)를 합쳐
 * 피커 업로드 경로가 받는 형태를 만든다.
 *
 * ⚠ **`exif: resolved.exif ?? undefined` — null → undefined 정규화가 필수다.**
 * EOP(`exactOptionalPropertyTypes`) 하에서 `ResolvedDeviceAsset.exif`는
 * `Readonly<Record<string, unknown>> | null`이고 `PickedAsset.exif`는
 * `?: Readonly<Record<string, unknown>> | undefined`라 **null을 그대로 대입하면 TS2322**다
 * (설계 문서 §5.4-④의 실측 확인). 전신은 `exif: null`을 그대로 흘렸다.
 *
 * ⚠ **`reportedSizeBytes`는 채우지 않는다.** 기기 경로에서 크기의 진실은 `verifiedSizeBytes`
 * (= 실제로 스트리밍될 캐시 사본을 stat한 값)뿐이다. 자칭 크기를 여기서 끼워 넣으면
 * §7 하드닝 3이 세운 신뢰도 서열(verified > file-system stat > reported)이 무너지고,
 * Android 재인코딩 자산에서 서버가 업로드를 거절하던 그 사고가 그대로 재발한다.
 *
 * ⚠ **`assetId`를 반드시 채운다.** 소비자의 dedup 1차 키이기 때문이다(§3.3-⑥):
 * `assetId`가 없으면 dedup이 스테이징 사본 uri로 폴백하는데, 그 uri는 resolve마다 재생성되므로
 * 같은 사진을 두 번 선택해도 dedup이 통과해버린다.
 */
export function toPickedAsset(
  asset: DeviceAsset,
  resolved: ResolvedDeviceAsset,
): ResolvedPickedAsset {
  return {
    uri: resolved.uri,
    assetId: asset.id,
    fileName: asset.filename,
    width: asset.width,
    height: asset.height,
    verifiedSizeBytes: resolved.verifiedSizeBytes,
    exif: resolved.exif ?? undefined,
    staged: resolved.staged,
  };
}

/**
 * 촬영 시각(ms 에폭) → ISO 문자열. 전신 `deviceAssetCapturedAt`(devicePhotoLibrary.ts:372-378).
 *
 * peer 0인 순수 함수이므로 `"./device"`가 아니라 `"./core"`에 둔다(§5.7.5).
 * ⚠ `creationTime`이 0이면 null이다 — 전신의 falsy 판정을 그대로 보존한다. 에폭 0(1970-01-01)은
 *   기기가 시각을 모른다는 뜻이지 실제 촬영 시각이 아니며, 이것을 ISO로 흘리면 서버의
 *   타임라인 정렬이 1970년으로 끌려간다.
 */
export function deviceAssetCapturedAt(asset: {
  readonly creationTime?: number | undefined;
}): string | null {
  if (!asset.creationTime) return null;
  const date = new Date(asset.creationTime);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
