import type { ReactElement, ReactNode } from 'react';
import { Platform, Text as RNText, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { createThemes } from '@gj-kit/expo-ui';
import type { IconRenderProps, UiIcons } from '@gj-kit/expo-ui';

export const SITE_URL = 'https://gj-kit-expo-ui.expo.app';
export const NPM_URL = 'https://www.npmjs.com/package/@gj-kit/expo-ui';
export const LICENSE_URL = 'https://opensource.org/license/mit';
export const INSTALL_COMMAND = 'pnpm add @gj-kit/expo-ui';
export const FONT_FAMILY =
  'Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const MONO_FAMILY =
  '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace';

export const siteThemes = createThemes({
  shared: {
    radius: { sm: 12, md: 16, lg: 24 },
    typography: { fontFamily: FONT_FAMILY },
  },
  light: {
    colors: {
      background: '#F8F8FC',
      surface: '#FFFFFF',
      surfaceSubtle: '#F0EFFF',
      text: '#121320',
      textMuted: '#60657A',
      // 본문 배경 3종에서 작은 보조 텍스트와 비활성 탭이 모두 4.5:1 이상이다.
      textSubtle: '#626B80',
      tabActive: '#121320',
      tabInactive: '#626B80',
      line: '#E4E5ED',
      // 링크 텍스트와 onPrimary 조합을 함께 AA 대비로 유지한다.
      primary: '#5B53F2',
      primaryStrong: '#4A3FE0',
      primarySoft: '#EDEBFF',
      onPrimary: '#FFFFFF',
      danger: '#B4234D',
      dangerStrong: '#A31B42',
      dangerSoft: '#FFF0F4',
      onDanger: '#FFFFFF',
      warning: '#8A5200',
      warningStrong: '#8A5200',
      warningSoft: '#FFF7DA',
      onWarning: '#FFFFFF',
      success: '#0C7355',
      successStrong: '#0C7355',
      successSoft: '#E7F8F1',
      onSuccess: '#FFFFFF',
      info: '#4A3FE0',
      infoStrong: '#4A3FE0',
      infoSoft: '#EDEBFF',
      onInfo: '#FFFFFF',
      overlay: 'rgba(12, 14, 26, 0.58)',
      shadow: '#141528',
    },
  },
  dark: {
    colors: {
      background: '#0C0D14',
      surface: '#151722',
      surfaceSubtle: '#202234',
      text: '#F5F5FA',
      textMuted: '#A7ABBD',
      // 가장 밝은 surfaceSubtle에서도 보조 텍스트 대비가 4.5:1 이상이다.
      textSubtle: '#8B90A3',
      tabActive: '#FFFFFF',
      tabInactive: '#8B90A3',
      line: '#2A2D3D',
      primary: '#8B82FF',
      primaryStrong: '#A59EFF',
      primarySoft: '#292548',
      onPrimary: '#151722',
      // *Strong은 "더 강조"라는 뜻이지 "더 어둡다"가 아니다. 라이트 값을 그대로
      // 두면 다크 배경 위에서 1.98~2.37:1까지 떨어져 AA 4.5:1의 절반도 안 된다.
      // 아래 값은 대응 Soft 배경에서 7.6:1 이상이다.
      danger: '#FF9AAF',
      dangerStrong: '#FFB3C3',
      dangerSoft: '#3A1F2A',
      onDanger: '#3A1F2A',
      warning: '#FFD66B',
      warningStrong: '#FFE08F',
      warningSoft: '#373018',
      onWarning: '#373018',
      success: '#52C69E',
      successStrong: '#7BD9B8',
      successSoft: '#17372E',
      onSuccess: '#17372E',
      info: '#A59EFF',
      infoStrong: '#C3BDFF',
      infoSoft: '#292548',
      onInfo: '#292548',
      overlay: 'rgba(0, 0, 0, 0.72)',
      shadow: '#000000',
    },
  },
});

export function Glyph({
  children,
  color,
  size,
  style,
}: IconRenderProps & { children: ReactNode; style?: TextStyle }): ReactElement {
  return (
    <RNText
      style={[
        {
          color,
          fontFamily: FONT_FAMILY,
          fontSize: size,
          fontWeight: '800',
          lineHeight: size,
          textAlign: 'center',
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}

export const siteIcons: UiIcons = {
  check: (props) => <Glyph {...props}>✓</Glyph>,
  minus: (props) => <Glyph {...props}>−</Glyph>,
  chevronDown: (props) => <Glyph {...props}>⌄</Glyph>,
  search: (props) => <Glyph {...props}>⌕</Glyph>,
  empty: (props) => <Glyph {...props}>◇</Glyph>,
  error: (props) => <Glyph {...props}>!</Glyph>,
  close: (props) => <Glyph {...props}>×</Glyph>,
  toast: {
    error: (props) => <Glyph {...props}>!</Glyph>,
    success: (props) => <Glyph {...props}>✓</Glyph>,
    info: (props) => <Glyph {...props}>i</Glyph>,
    warning: (props) => <Glyph {...props}>!</Glyph>,
  },
};

export function BrandMark({ size = 34 }: { size?: number }): ReactElement {
  const radius = Math.round(size * 0.31);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        alignItems: 'center',
        backgroundColor: '#635BFF',
        borderRadius: radius,
        height: size,
        justifyContent: 'center',
        overflow: 'hidden',
        width: size,
      }}
    >
      <View
        style={{
          backgroundColor: '#9FF5D1',
          borderRadius: size,
          height: Math.round(size * 0.26),
          position: 'absolute',
          right: Math.round(size * 0.12),
          top: Math.round(size * 0.12),
          width: Math.round(size * 0.26),
        }}
      />
      <RNText
        style={{
          color: '#FFFFFF',
          fontFamily: FONT_FAMILY,
          fontSize: Math.round(size * 0.58),
          fontWeight: '800',
          left: -1,
          lineHeight: size,
        }}
      >
        g
      </RNText>
    </View>
  );
}

export function elevatedShadow(color: string, strength = 0.12): ViewStyle {
  if (Platform.OS === 'web') {
    const match = /^#([0-9a-fA-F]{6})$/.exec(color);
    const shadowColor = match?.[1] === undefined
      ? color
      : `rgba(${Number.parseInt(match[1].slice(0, 2), 16)}, ${Number.parseInt(match[1].slice(2, 4), 16)}, ${Number.parseInt(match[1].slice(4, 6), 16)}, ${strength})`;
    return { boxShadow: `0 16px 32px ${shadowColor}` } as unknown as ViewStyle;
  }
  return {
    elevation: 6,
    shadowColor: color,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: strength,
    shadowRadius: 32,
  };
}
