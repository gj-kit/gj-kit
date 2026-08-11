/**
 * Link — the text primitive that separates document and screen navigation from a
 * button action.
 *
 * The href branch renders a real <a> on the web and uses Linking on native. The
 * router-owned onPress branch provides the link role and Enter-only keyboard
 * behavior.
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
  /** Defaults to 'primary'. */
  variant?: LinkVariant | undefined;
  /** Defaults to true. */
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
  /** Called when Linking.openURL fails on native. */
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

/** _blank always preserves opener and referrer isolation, even when the consumer specifies rel. */
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
