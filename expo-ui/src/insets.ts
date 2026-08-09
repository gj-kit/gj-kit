/**
 * "./insets" 엔트리 — 키보드·safe-area 유틸 (설계 문서 §7).
 *
 * 훅은 react-native-safe-area-context(optional peer)를 요구한다. 순수 함수
 * (nativeBottomInset/nativeBottomPadding/computeKeyboardRevealOffset)는 peer 없이 동작.
 * "."의 어떤 컴포넌트도 이 엔트리를 import하지 않는다 — 결합은 단방향(소비자가 조합).
 */
export { nativeBottomInset, nativeBottomPadding } from './insets/safeArea';
export { computeKeyboardRevealOffset } from './insets/keyboardReveal';
export { useBottomInset, useBottomSheetPadding, useModalKeyboardOverlap } from './insets/hooks';
