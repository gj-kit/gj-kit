/**
 * Safe-area and keyboard hooks — design doc §7.
 *
 * react-native-safe-area-context (an optional peer) exists only in this module.
 * An app that never imports "./insets" keeps both its bundle and its types intact
 * without the peer installed, and importing it without the peer fails to resolve
 * at bundle time — caught early, with no runtime magic.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeBottomInset, nativeBottomPadding } from './safeArea';

/** The bottom safe-area inset (0 on the web). For composing StickyActionBar bottomInset and Toast bottomOffset. */
export function useBottomInset(): number {
  return nativeBottomInset(useSafeAreaInsets().bottom);
}

/**
 * The paddingBottom for a bottom-anchored surface: bottom sheets, fixed bars, and
 * bottom button rows. One rule: design padding plus the real bottom inset. Where
 * the inset is 0 (the web, or three-button navigation with the window stopping
 * above the bar) only the design padding remains, automatically. Always use this
 * hook for bottom-anchored surfaces instead of composing insets by hand.
 */
export function useBottomSheetPadding(designPadding: number): number {
  return nativeBottomPadding(designPadding, useSafeAreaInsets().bottom);
}

/**
 * How much of a bottom-anchored sheet inside a separate native window (`<Modal>`)
 * the keyboard covers. Apply it directly as the sheet container's paddingBottom.
 *
 * KeyboardAvoidingView cannot be used here. An Android edge-to-edge Modal window
 * (with statusBarTranslucent) does not resize when the keyboard opens, and KAV's
 * frame math is off inside that window as well, so neither the "height" nor the
 * "padding" behavior lifts the sheet (reproduced and confirmed in the memorylog2
 * album record upload sheet). Hence the direct subscription to keyboard events.
 *
 * Android keyboard events report the IME height measured above the system
 * navigation inset, but an edge-to-edge Modal window extends below the navigation
 * bar, so insets.bottom has to be added to get the real occlusion. iOS reports the
 * full occlusion as is.
 */
export function useModalKeyboardOverlap(): number {
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (keyboardHeight === 0) return 0;
  return Platform.OS === 'android' ? keyboardHeight + insets.bottom : keyboardHeight;
}
