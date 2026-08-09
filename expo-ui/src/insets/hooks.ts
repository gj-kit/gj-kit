/**
 * safe-area·키보드 훅 — 설계 문서 §7.
 *
 * react-native-safe-area-context(optional peer)는 이 모듈에만 존재한다.
 * "./insets"를 import하지 않는 앱은 peer 미설치여도 번들·타입 모두 무결하고,
 * peer 없이 import하면 번들 시점 resolve 실패로 조기 발각된다(런타임 마법 없음).
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nativeBottomInset, nativeBottomPadding } from './safeArea';

/** 하단 safe-area inset(web 0). StickyActionBar bottomInset·Toast bottomOffset 합성용. */
export function useBottomInset(): number {
  return nativeBottomInset(useSafeAreaInsets().bottom);
}

/**
 * 하단 앵커 서피스(바텀시트, 고정 바, 하단 버튼 행)의 paddingBottom.
 * 규칙은 하나: 디자인 여백 + 실제 하단 inset. inset 0 환경(웹, 3버튼 내비로
 * 창이 내비 위에서 끝나는 경우)에서는 자동으로 디자인 여백만 남는다.
 * 하단 앵커 서피스는 insets를 손으로 조합하지 말고 반드시 이 훅을 쓸 것.
 */
export function useBottomSheetPadding(designPadding: number): number {
  return nativeBottomPadding(designPadding, useSafeAreaInsets().bottom);
}

/**
 * 별도 네이티브 윈도우(`<Modal>`) 안 하단 앵커 시트가 키보드에 가려지는 높이.
 * 시트 컨테이너의 paddingBottom으로 그대로 적용한다.
 *
 * KeyboardAvoidingView는 여기서 못 쓴다 — Android 엣지투엣지(+
 * statusBarTranslucent) Modal 윈도우는 키보드가 열려도 리사이즈되지 않고,
 * KAV의 프레임 계산도 이 윈도우에서 어긋나 "height"/"padding" 어느 behavior로도
 * 시트가 들리지 않는다(memorylog2 앨범 기록 업로드 시트에서 재현·확정).
 * 그래서 키보드 이벤트를 직접 구독한다.
 *
 * Android 키보드 이벤트는 시스템 내비 inset 위에서 잰 IME 높이를 보고하는데
 * 엣지투엣지 Modal 윈도우는 내비 아래까지 내려가므로 insets.bottom을 더해야
 * 실제 가림 높이가 된다. iOS는 전체 가림 높이를 그대로 보고한다.
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
