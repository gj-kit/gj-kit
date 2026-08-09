/**
 * 하단 safe-area 순수 함수 — 설계 문서 §7. memorylog2 원명 보존(sed 이관).
 *
 * 하단 앵커 서피스의 규칙은 하나다: 디자인 여백 + 실제 하단 inset.
 * Android는 창이 실제로 확장된 만큼의 inset을 보고한다(제스처 내비 ~24dp,
 * 엣지투엣지 3버튼 ~48dp, 창이 내비 위에서 끝나면 0) — 합성 최소치를 얹지
 * 않는다. 과거의 48dp 폴백은 제스처 기기를 과패딩했고, 화면별 opt-out이
 * inset 자체를 떨어뜨리는 사고로 이어졌다(memorylog2 실측 확정 규칙).
 */
import { Platform } from 'react-native';

export function nativeBottomInset(bottomInset: number, platformOS: string = Platform.OS): number {
  if (platformOS === 'web') return 0;
  return Math.max(0, bottomInset);
}

export function nativeBottomPadding(
  basePadding: number,
  bottomInset: number,
  platformOS: string = Platform.OS,
): number {
  return basePadding + nativeBottomInset(bottomInset, platformOS);
}
