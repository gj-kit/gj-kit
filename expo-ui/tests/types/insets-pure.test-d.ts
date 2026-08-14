/** The dependency-free entry keeps platform-sensitive arithmetic explicit. */
import { describe, it } from 'vitest';
import {
  computeKeyboardRevealOffset,
  nativeBottomInset,
  nativeBottomPadding,
} from '../../src/insets/pure';

describe('insets/pure type contract', () => {
  it('requires an explicit platform and exposes the existing arithmetic helpers', () => {
    void nativeBottomInset(24, 'android');
    void nativeBottomPadding(16, 24, 'ios');
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
