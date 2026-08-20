/** The dependency-free entry keeps platform-sensitive arithmetic explicit. */
import { describe, it } from 'vitest';
import {
  computeKeyboardRevealOffset,
  nativeBottomInset,
  nativeBottomPadding,
  resolveModalSafeAreaInsets,
} from '../../src/insets/pure';

describe('insets/pure type contract', () => {
  it('requires an explicit platform and exposes the existing arithmetic helpers', () => {
    void nativeBottomInset(24, 'android');
    void nativeBottomPadding(16, 24, 'ios');
    void resolveModalSafeAreaInsets({
      insets: { top: 0, right: 0, bottom: 16, left: 0 },
      platformOS: 'android',
      statusBarTranslucent: true,
      statusBarHeight: 24,
    });
    void computeKeyboardRevealOffset({
      currentOffset: 0,
      inputHeight: 40,
      inputTop: 600,
      keyboardInset: 300,
      reservedBottomHeight: 0,
      viewportHeight: 800,
    });

    // @ts-expect-error A dependency-free entry cannot infer Platform.OS.
    void nativeBottomInset(24);
    // @ts-expect-error The bottom-padding helper has the same explicit platform contract.
    void nativeBottomPadding(16, 24);
  });
});
