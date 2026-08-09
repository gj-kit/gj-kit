/**
 * (내부) 컴포넌트 공용 헬퍼 — 어떤 엔트리에서도 재export하지 않는다.
 */
import { Platform, StyleSheet } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SpacingKey, Theme, ElevationLevel } from '../theme/tokens';

/**
 * 전 컴포넌트 공통 꼬리 — 설계 문서 §5.
 * `unstyled?: never` — 전신의 이관 잔재 prop을 직접 지정·`{...props}` 스프레드
 * 경유까지 컴파일 에러로 차단한다(§0 C 채택). 'prop 부재' 방식은 스프레드를
 * 통과시킴이 실측됐다.
 */
export type CommonProps = {
  style?: StyleProp<ViewStyle> | undefined;
  /** 해석 없이 네이티브 요소에 전달 — NativeWind는 호스트 관심사(§5). */
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

export function mergeClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

/**
 * className을 타입 밖 prop으로 전달하는 브리지. NativeWind 호스트가 opt-in할 때만
 * 의미가 생긴다 — 전신에서 파일마다 3중 복제되던 헬퍼를 단일화(§0).
 */
export function nativeWindProps(className?: string | undefined): Record<string, unknown> {
  return className ? ({ className } as unknown as Record<string, unknown>) : {};
}

/**
 * 테마 파라미터화 스타일 팩토리 — 설계 문서 §3.5.
 * Theme은 깊은 동결로 정체성이 안정되므로 WeakMap 캐시가 성립한다.
 * 렌더마다 스타일 객체를 재생성하지 않으면서 토큰 관통을 달성한다.
 */
export function themedStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T,
): (theme: Theme) => T {
  const cache = new WeakMap<Theme, T>();
  return (theme) => {
    const cached = cache.get(theme);
    if (cached) return cached;
    const created = StyleSheet.create(factory(theme));
    cache.set(theme, created);
    return created;
  };
}

/** spacing prop 해석 — 토큰 키가 1급, 숫자는 Figma 실측 탈출구(§5.8). */
export function resolveSpacing(theme: Theme, value: SpacingKey | number): number {
  return typeof value === 'number' ? value : theme.spacing[value];
}

/** (내부) #RGB/#RRGGBB에 불투명도를 얹은 rgba. 비-hex 입력은 그대로 반환. */
function rgbaFromHex(color: string, opacity: number): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color);
  if (!match || match[1] === undefined) return color;
  const hex =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * ElevationLevel → 그림자 스타일. 그림자색은 colors.shadow에서만 온다(§3.2).
 * 웹은 boxShadow 방출 — RNW 0.21이 shadow* props를 deprecated 처리(테스트 실측).
 * RN 타입에 boxShadow가 없어 캐스팅으로 통과(§11: DOM lib 금지, 캐스팅 한정).
 */
export function elevationStyle(level: ElevationLevel, shadowColor: string): ViewStyle {
  if (Platform.OS === 'web') {
    return {
      boxShadow:
        level.shadowOpacity === 0
          ? 'none'
          : `0 ${level.shadowOffsetY}px ${level.shadowRadius}px ${rgbaFromHex(shadowColor, level.shadowOpacity)}`,
    } as unknown as ViewStyle;
  }
  return {
    shadowColor,
    shadowOpacity: level.shadowOpacity,
    shadowRadius: level.shadowRadius,
    shadowOffset: { width: 0, height: level.shadowOffsetY },
    elevation: level.elevation,
  };
}
