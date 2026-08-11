import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Link } from 'expo-router';
import type { Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * expo-router의 `<Link asChild>`는 자식을 Radix `Slot`으로 감싸고, Slot은 style을
 * 객체 스프레드(`{...slotStyle, ...childStyle}`)로 병합한다. 그래서 React Native의
 * 함수형 style(`({ pressed }) => [...]`)을 넘기면 스프레드 결과가 `{}`가 되어
 * 배경·패딩·라운드·테두리가 **조용히 전부 사라진다**. 에러도 경고도 없다.
 *
 * 이 컴포넌트는 style을 항상 `StyleSheet.flatten`으로 평탄화한 객체로만 넘기고,
 * pressed 피드백은 내부 상태로 계산한다. 링크형 Pressable을 이 컴포넌트로만
 * 만들면 해당 조합 자체를 만들 수 없다.
 *
 * 회귀는 `pnpm --filter @gj-kit/expo-ui-docs check:links`가 CI에서 막는다.
 */
export function LinkPressable({
  accessibilityLabel,
  accessibilityRole = 'link',
  ariaCurrent,
  children,
  href,
  onPress,
  pressedStyle = defaultPressedStyle,
  style,
}: {
  readonly accessibilityLabel?: string | undefined;
  readonly accessibilityRole?: 'link' | 'button' | undefined;
  readonly ariaCurrent?: 'page' | undefined;
  readonly children: ReactNode;
  readonly href: Href;
  readonly onPress?: (() => void) | undefined;
  readonly pressedStyle?: StyleProp<ViewStyle> | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}): ReactElement {
  const [pressed, setPressed] = useState(false);
  const external = typeof href === 'string' && href.startsWith('http');

  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      asChild
    >
      <Pressable
        accessibilityRole={accessibilityRole}
        {...(accessibilityLabel ? { accessibilityLabel } : {})}
        {...(ariaCurrent ? { 'aria-current': ariaCurrent } : {})}
        {...(onPress ? { onPress } : {})}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        // 반드시 평탄화된 객체여야 한다. 배열/함수는 Slot에서 유실된다.
        style={StyleSheet.flatten([style, pressed ? pressedStyle : null])}
      >
        {children}
      </Pressable>
    </Link>
  );
}

const defaultPressedStyle: ViewStyle = { opacity: 0.72 };
