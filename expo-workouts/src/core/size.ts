// Health Connect 레코드 크기 모델 (설계 §5.2 · f99 · f100).

/**
 * The largest route this library will write **on Android**. Health Connect's record ceiling is
 * exactly 1 000 000 bytes at `160 + 48·points + 2·chars + 24·(segments+laps)` (20 828 points OK /
 * 20 829 FAIL, and the optional point fields are FREE). 20 000 leaves ~40 KB of headroom for a
 * Mainline encoding change.
 *
 * ⚠ This guard does NOT run on iOS. HealthKit was measured storing and streaming a 36 000-point
 *   route with no leak and no ceiling. Discarding a user's 8-hour 1 Hz hike on iOS to mirror an
 *   Android parcel limit is not defensible. Portability-conscious apps call
 *   `estimateAndroidRecordBytes()` themselves.
 */
export const MAX_ANDROID_ROUTE_POINTS = 20_000;

/** 측정된 절대 상한(f99). 우리는 여기까지 가지 않는다 — 아래 `ANDROID_RECORD_BYTE_LIMIT`가 실효 한계다. */
export const ANDROID_RECORD_BYTE_CEILING = 1_000_000;

/** 우리가 쓰기 전에 거절하는 임계값. 상한의 96 % — Mainline 인코딩 변경을 위한 안전 마진이다. */
export const ANDROID_RECORD_BYTE_LIMIT = 960_000;

/**
 * Exact Health Connect record-size model, fitted with residual 0 over six failure samples:
 *   `bytes = 160 + 48·routePoints + 2·(title + notes + clientRecordId chars) + 24·(segments + laps)`
 *
 * The optional route fields are FREE — a 21 000-point route serialises to the byte-identical size
 * with and without altitude and accuracies.
 *
 * Pinned boundary (f99): a 13-char title + 13-char clientRecordId gives `bytes = 212 + 48·points`,
 * and 20 829 points is exactly 1 000 004 B — the first failing size.
 *
 * ⚠ One Mainline build's parcel encoding. A safety margin, not a contract.
 */
export function estimateAndroidRecordBytes(input: {
  readonly routePoints: number;
  readonly clientRecordIdLength: number;
  readonly titleLength?: number | undefined;
  readonly notesLength?: number | undefined;
  readonly segments?: number | undefined;
  readonly laps?: number | undefined;
}): number {
  const chars = input.clientRecordIdLength + (input.titleLength ?? 0) + (input.notesLength ?? 0);
  const rows = (input.segments ?? 0) + (input.laps ?? 0);
  return 160 + 48 * input.routePoints + 2 * chars + 24 * rows;
}
