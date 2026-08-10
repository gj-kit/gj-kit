// 설계 문서 §5.3 · §7 하드닝 4 — duration 초/밀리초 정규화의 **단일 지점**.
//
// 전신 `uploader.ts:736-748`의 주석이 사고의 전부다:
//
//   "expo-image-picker documents duration in milliseconds and native delivers that,
//    but the web implementation passes HTMLVideoElement.duration — seconds —
//    straight through. Normalize here or a 20-minute web video is stored as 1200ms
//    and sails under any duration cap."
//
// 1200ms로 저장된 20분 영상은 **어떤 길이 상한도 통과한다** — 검증이 있는데도 통과하므로
// 조용히 깨지는 부류다(§6.1의 판단 기준).
//
// ⚠ 그래서 정규화는 여기 한 곳에만 있다. `PickedAsset.durationRaw`의 TSDoc(§3.3)이
//    "어댑터는 원시값 그대로 넘긴다"를 계약으로 못 박은 이유도 같다 —
//    어댑터가 미리 변환하면 여기서 한 번 더 곱해져 **이중 변환**이 된다.
//    (브랜드 타입으로 막자는 안은 §0.4 기각 6: `millis(초)`가 그대로 통과해 검출력이 0이다.)

import type { MediaPlatform } from '../adapters';

/**
 * 피커가 준 원시 duration을 밀리초로 정규화한다.
 *
 * - `os === 'web'` → 초 단위이므로 ×1000
 * - 그 외(ios·android) → 이미 밀리초이므로 그대로
 * - 0·음수·NaN·Infinity → `undefined` (전신 `asset.duration > 0` 게이트 보존)
 *
 * 반올림 규칙(`Math.round`)도 전신 그대로다 — 서버에 소수점 밀리초를 보내지 않는다.
 */
export function normalizeDurationMs(
  raw: number | undefined,
  os: MediaPlatform,
): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  return Math.round(os === 'web' ? raw * 1000 : raw);
}
