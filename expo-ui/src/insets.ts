/**
 * The "./insets" entry — keyboard and safe-area utilities (design doc §7).
 *
 * The hooks require react-native-safe-area-context (an optional peer). The pure
 * functions (nativeBottomInset/nativeBottomPadding/computeKeyboardRevealOffset)
 * work without it. No component in "." imports this entry — the coupling is
 * one-way, and consumers do the composing.
 */
export { nativeBottomInset, nativeBottomPadding } from './insets/safeArea';
export {
  computeKeyboardRevealOffset,
  resolveModalSafeAreaInsets,
} from './insets/pure';
export type {
  ModalSafeAreaInsets,
  ResolveModalSafeAreaInsetsInput,
} from './insets/pure';
export {
  useBottomInset,
  useBottomSheetPadding,
  useModalKeyboardOverlap,
  useModalSafeAreaInsets,
} from './insets/hooks';
export type { UseModalSafeAreaInsetsOptions } from './insets/hooks';
