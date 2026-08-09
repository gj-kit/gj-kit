/**
 * Text — 설계 문서 §5.1 (신규).
 *
 * typography 토큰의 직접 소비자. 전신엔 텍스트 프리미티브가 없어 앱이
 * `text-[13px] font-bold` 류를 수백 곳에 복제했다. RN Text를 가리는 이름은
 * 업계 관행(Paper/Tamagui) — 필요 시 `import { Text as RNText }`.
 */
import type { ReactElement } from 'react';
import { Text as RNText } from 'react-native';
import type { StyleProp, TextProps as RNTextProps, TextStyle } from 'react-native';
import type { ColorKey, TextRole, Theme } from '../theme/tokens';
import { nativeWindProps } from './internal';
import { useTheme } from './provider';

// RN Text의 aria `role` prop을 가린다 — 접근성 롤은 accessibilityRole로 지정.
export interface TextProps extends Omit<RNTextProps, 'style' | 'role'> {
  /** 기본 'body' — fontSize/lineHeight/fontWeight/fontFamily 전부 토큰이 결정. */
  role?: TextRole | undefined;
  /** 닫힌 유니언 — 오타는 컴파일 에러, raw 색은 style 탈출구로(§0). 기본 'text'. */
  color?: ColorKey | undefined;
  style?: StyleProp<TextStyle> | undefined;
  className?: string | undefined;
  unstyled?: never;
}

/** (내부) role → 토큰 텍스트 스타일. Text 밖(Button 라벨 등)에서도 재사용. */
export function roleTextStyle(theme: Theme, role: TextRole): TextStyle {
  const spec = theme.typography[role];
  return {
    fontSize: spec.fontSize,
    lineHeight: spec.lineHeight,
    fontWeight: spec.fontWeight,
    ...(theme.typography.fontFamily !== undefined
      ? { fontFamily: theme.typography.fontFamily }
      : {}),
  };
}

export function Text({
  role = 'body',
  color = 'text',
  style,
  className,
  children,
  ...rest
}: TextProps): ReactElement {
  const theme = useTheme();
  return (
    <RNText
      {...rest}
      {...nativeWindProps(className)}
      style={[roleTextStyle(theme, role), { color: theme.colors[color] }, style]}
    >
      {children}
    </RNText>
  );
}
