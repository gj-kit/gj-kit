import type { ReactElement, ReactNode } from 'react';
import { Text as RNText, View } from 'react-native';
import type { TextStyle, ViewStyle } from 'react-native';
import { createThemes } from '@gj-kit/expo-ui';
import type { IconRenderProps, UiIcons } from '@gj-kit/expo-ui';

export const SITE_URL = 'https://gj-kit-expo-ui.expo.app';
export const NPM_URL = 'https://www.npmjs.com/package/@gj-kit/expo-ui';
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
      textSubtle: '#8B90A3',
      tabActive: '#121320',
      tabInactive: '#8B90A3',
      line: '#E4E5ED',
      primary: '#635BFF',
      primaryStrong: '#4A3FE0',
      primarySoft: '#EDEBFF',
      onPrimary: '#FFFFFF',
      danger: '#E24C68',
      dangerStrong: '#C83452',
      dangerSoft: '#FFF0F4',
      onDanger: '#FFFFFF',
      warning: '#FFD66B',
      warningStrong: '#A96700',
      onWarning: '#262314',
      success: '#178B68',
      info: '#262938',
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
      textSubtle: '#777C91',
      tabActive: '#FFFFFF',
      tabInactive: '#777C91',
      line: '#2A2D3D',
      primary: '#8B82FF',
      primaryStrong: '#A59EFF',
      primarySoft: '#292548',
      onPrimary: '#FFFFFF',
      danger: '#FF7892',
      dangerStrong: '#FF607E',
      dangerSoft: '#3A1F2A',
      onDanger: '#FFFFFF',
      warning: '#E7C45E',
      warningStrong: '#FFD66B',
      onWarning: '#17140A',
      success: '#52C69E',
      info: '#F5F5FA',
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
  search: (props) => <Glyph {...props}>⌕</Glyph>,
  empty: (props) => <Glyph {...props}>◇</Glyph>,
  error: (props) => <Glyph {...props}>!</Glyph>,
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
  return {
    elevation: 6,
    shadowColor: color,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: strength,
    shadowRadius: 32,
  };
}
