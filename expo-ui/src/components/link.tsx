/**
 * Link — 문서/화면 이동을 버튼 액션과 구분하는 텍스트 프리미티브.
 *
 * href 분기는 웹에서 실제 <a>를 렌더하고 네이티브에서는 Linking을 사용한다.
 * 라우터가 소유하는 onPress 분기는 link 역할과 Enter 전용 키보드 동작을 제공한다.
 */
import type { ReactElement } from 'react';
import { Linking, Platform, Text as RNText } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import { useTheme } from './provider';
import { roleTextStyle } from './text';

export type LinkVariant = 'primary' | 'muted' | 'danger';
export type LinkTarget = '_self' | '_blank';

type LinkBaseProps = {
  children: string;
  /** 기본 'primary'. */
  variant?: LinkVariant | undefined;
  /** 기본 true. */
  underline?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  style?: StyleProp<TextStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

export type DestinationLinkProps = LinkBaseProps & {
  href: string;
  target?: LinkTarget | undefined;
  rel?: string | undefined;
  /** 네이티브에서 Linking.openURL이 실패했을 때 호출한다. */
  onOpenError?: ((error: unknown) => void) | undefined;
  onPress?: never;
};

export type ActionLinkProps = LinkBaseProps & {
  onPress: () => void;
  href?: never;
  target?: never;
  rel?: never;
  onOpenError?: never;
};

export type LinkProps = DestinationLinkProps | ActionLinkProps;

type WebKeyboardEvent = {
  key?: string | undefined;
  preventDefault: () => void;
};

type WebLinkProps = {
  href?: string | undefined;
  hrefAttrs?: {
    target?: LinkTarget | undefined;
    rel?: string | undefined;
  } | undefined;
  onKeyDown?: ((event: WebKeyboardEvent) => void) | undefined;
};

const getStyles = themedStyles((theme: Theme) => ({
  link: {
    alignSelf: 'flex-start' as const,
    includeFontPadding: false,
    fontWeight: theme.typography.button.fontWeight,
  },
}));

function linkColor(theme: Theme, variant: LinkVariant): string {
  switch (variant) {
    case 'muted':
      return theme.colors.textMuted;
    case 'danger':
      return theme.colors.danger;
    default:
      return theme.colors.primary;
  }
}

/** _blank는 소비자가 rel을 지정해도 opener·referrer 격리를 항상 보존한다. */
function resolveRel(target: LinkTarget | undefined, rel: string | undefined): string | undefined {
  if (target !== '_blank') return rel;

  const values = (rel ?? '').split(/\s+/u).filter(Boolean);
  const normalized = new Set(values.map((value) => value.toLocaleLowerCase()));
  if (!normalized.has('noopener')) values.push('noopener');
  if (!normalized.has('noreferrer')) values.push('noreferrer');
  return values.join(' ');
}

export function Link(props: LinkProps): ReactElement {
  const {
    children,
    variant = 'primary',
    underline = true,
    accessibilityLabel,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const isDestination = 'href' in props && props.href !== undefined;
  const resolvedRel = isDestination ? resolveRel(props.target, props.rel) : undefined;

  const webProps: WebLinkProps =
    Platform.OS !== 'web'
      ? {}
      : isDestination
        ? {
            href: props.href,
            hrefAttrs: {
              ...(props.target !== undefined ? { target: props.target } : {}),
              ...(resolvedRel !== undefined ? { rel: resolvedRel } : {}),
            },
          }
        : {
            // RNW의 role=link div는 브라우저 기본 활성화가 없으므로 Enter만 연결한다.
            // Space는 버튼과 달리 링크를 활성화하지 않는다.
            onKeyDown: (event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              props.onPress();
            },
          };

  const handlePress =
    Platform.OS === 'web'
      ? isDestination
        ? undefined
        : props.onPress
      : isDestination
        ? () => {
            try {
              void Linking.openURL(props.href).catch((error: unknown) => {
                props.onOpenError?.(error);
              });
            } catch (error) {
              props.onOpenError?.(error);
            }
          }
        : props.onPress;

  return (
    <RNText
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel}
      onPress={handlePress}
      testID={testID}
      {...(webProps as unknown as Record<string, unknown>)}
      {...nativeWindProps(className)}
      style={[
        roleTextStyle(theme, 'body'),
        styles.link,
        {
          color: linkColor(theme, variant),
          textDecorationLine: underline ? 'underline' : 'none',
        },
        style,
      ]}
    >
      {children}
    </RNText>
  );
}
