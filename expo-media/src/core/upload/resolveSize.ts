// 설계 문서 §5.3(순수 모듈) · §7 하드닝 3 — 업로드 크기 결정 3분기.
//
// 전신 `uploader.ts:818-865`(`uploadPickerAssetNative`)의 사고 이력을 그대로 옮긴다:
//
//   "Trust the file that the upload task actually streams, not `asset.fileSize`.
//    With `quality < 1` the picker re-encodes the image into a temp file at `uri`,
//    but on Android `asset.fileSize` often still reports the original asset's size.
//    Using it would mismatch the bytes storage receives and the backend rejects
//    the upload."
//
// 즉 **스토리지가 실제로 받는 바이트**와 presign에 적은 `sizeBytes`가 어긋나는 순간
// 서버가 업로드를 거절한다. 그래서 크기는 "누가 그 값을 말했는가"에 따라 신뢰도가 다르고,
// 이 파일이 그 서열을 단 한 곳에 고정한다:
//
//   verified(어댑터가 실제 스트리밍될 파일을 stat) > file-system(코어가 지금 stat) > reported(피커 자칭)
//
// 전신은 이 서열이 세 함수에 흩어져 있었고(`uploadPickerAssetNative` 839-846 ·
// `uploadPickerMediaAsset` 763-777 · 뒷문 프로퍼티 `__photoKitVerifiedSizeBytes`),
// `info.exists && !info.isDirectory ? info.size : 0` 패턴이 5중복이었다.
// `FileStat` 판별 유니언(§3.3)과 이 함수가 그 둘을 함께 소멸시킨다.
//
// ⚠ 필드명이 곧 신뢰도다 — `verifiedSizeBytes`(실측) / `reportedSizeBytes`(자칭).
//    이름을 평평하게 만들면(`sizeBytes` 하나로) 하드닝 3이 다시 조용히 사라진다.

/** 크기를 어느 근거로 정했는지. 텔레메트리·디버그 로그의 `sizeSource`에 그대로 쓰인다. */
export type UploadSizeSource = 'verified' | 'file-system' | 'reported';

/**
 * 0·음수·NaN·Infinity는 "값이 없다"와 동일하게 다룬다.
 * 전신도 `typeof sizeBytes === "number" && sizeBytes > 0`(uploader.ts:115)과
 * `if (!sizeBytes)`(842-846) 조합으로 falsy를 전부 다음 후보로 넘겼다.
 */
function usableSize(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * 세 후보 중 가장 신뢰도 높은 것을 고른다. 전부 없으면 `null` —
 * 호출자가 `imageSizeUnknown`/`videoSizeUnknown` 문구로 실패시킨다(§6.1-⑮, 전신 유지).
 *
 * ⚠ 순서를 바꾸면 Android 재인코딩 자산이 다시 원본 크기로 presign된다.
 */
export function resolveUploadSize(input: {
  /** 어댑터가 "실제로 스트리밍될 파일"을 stat해 확인한 크기(§3.3 `PickedAsset.verifiedSizeBytes`). */
  readonly verifiedSizeBytes?: number | undefined;
  /** 코어가 `FileSystemAdapter.stat`으로 방금 읽은 크기. */
  readonly statSizeBytes?: number | undefined;
  /** ⚠ 피커 자칭(`asset.fileSize`). 최후 폴백이며 단독으로는 신뢰하지 않는다. */
  readonly reportedSizeBytes?: number | undefined;
}): { readonly sizeBytes: number; readonly source: UploadSizeSource } | null {
  const verified = usableSize(input.verifiedSizeBytes);
  if (verified !== undefined) return { sizeBytes: verified, source: 'verified' };

  const stat = usableSize(input.statSizeBytes);
  if (stat !== undefined) return { sizeBytes: stat, source: 'file-system' };

  const reported = usableSize(input.reportedSizeBytes);
  if (reported !== undefined) return { sizeBytes: reported, source: 'reported' };

  return null;
}
