/**
 * Avatar / Divider / ListItem — the display and structure primitives.
 *
 * Color, spacing, typography, and control sizing flow only through theme tokens.
 * Image and interaction semantics are enforced by type unions so that no
 * meaningless accessibility element is ever emitted.
 */
import { useCallback, useEffect, useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Image, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import type {
  AccessibilityProps,
  ImageProps,
  ImageSourcePropType,
  ImageStyle,
  StyleProp,
  TextStyle,
} from 'react-native';
import type { ColorKey, SpacingKey, TextRole, Theme } from '../theme/tokens';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { mergeClassNames, nativeWindProps, resolveSpacing, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';
import { roleTextStyle } from './text';

// ─── Avatar ──────────────────────────────────────────────────────────────────────

export type AvatarSize = 'sm' | 'md' | 'lg';

/** The source, style, and accessibility props Avatar owns cannot be overridden from this slot. */
export type AvatarImageProps = Omit<
  ImageProps,
  | keyof AccessibilityProps
  | 'source'
  | 'src'
  | 'srcSet'
  | 'style'
  | 'alt'
  | 'height'
  | 'width'
>;

type AvatarBaseProps = Omit<CommonProps, 'unstyled'> & {
  /** The name is used to build initials when no image is given or the image fails to load. */
  name: string;
  source?: ImageSourcePropType | undefined;
  size?: AvatarSize | undefined;
  /** Builds initials from name when omitted. */
  fallback?: ReactNode | undefined;
  /** RN Image props apart from source, style, and accessibility. onError is merged with the internal fallback. */
  imageProps?: AvatarImageProps | undefined;
  imageStyle?: StyleProp<ImageStyle> | undefined;
  unstyled?: never;
};

type InformativeAvatar = {
  /** What the profile image conveys. Required unless it is decorative. */
  alt: string;
  decorative?: false | undefined;
};

type DecorativeAvatar = {
  decorative: true;
  alt?: never;
};

export type AvatarProps = AvatarBaseProps & (InformativeAvatar | DecorativeAvatar);

const getAvatarStyles = themedStyles((theme: Theme) => ({
  root: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    justifyContent: 'center' as const,
    overflow: 'hidden' as const,
  },
  image: {
    height: '100%' as const,
    width: '100%' as const,
  },
  fallback: {
    includeFontPadding: false,
    textAlign: 'center' as const,
  },
}));

function firstCharacter(value: string): string {
  return Array.from(value)[0] ?? '';
}

/** For a spaced name it takes the first and last initials, and for a single word the first two letters. Safe for Hangul too. */
export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) {
    return Array.from(parts[0] ?? '').slice(0, 2).join('').toLocaleUpperCase();
  }
  return `${firstCharacter(parts[0] ?? '')}${firstCharacter(parts[parts.length - 1] ?? '')}`.toLocaleUpperCase();
}

function avatarTextRole(size: AvatarSize): TextRole {
  return size === 'sm' ? 'label' : size === 'lg' ? 'title' : 'button';
}

export function Avatar(props: AvatarProps): ReactElement {
  const {
    name,
    source,
    size = 'md',
    fallback,
    imageProps,
    imageStyle,
    decorative = false,
    alt,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getAvatarStyles(theme);
  const [failedSource, setFailedSource] = useState<ImageSourcePropType | undefined>();

  // 같은 인스턴스는 실패 폴백을 유지하고, 소스가 바뀌면 재시도한다.
  useEffect(() => {
    setFailedSource(undefined);
  }, [source]);

  const dimension = theme.metrics.control[size];
  const showImage = source !== undefined && failedSource !== source;
  const fallbackContent = fallback ?? avatarInitials(name);
  const imagePropsOnError = imageProps?.onError;
  // RNW Image는 onError 함수 정체성이 바뀌면 로드를 재시작한다.
  // 폴백 상태 갱신이 중복 네트워크 요청으로 이어지지 않게 정체성을 고정한다.
  const imageErrorHandler: NonNullable<ImageProps['onError']> = useCallback(
    (event) => {
      setFailedSource(source);
      imagePropsOnError?.(event);
    },
    [imagePropsOnError, source],
  );

  return (
    <View
      testID={testID}
      accessible={!decorative}
      {...(!decorative
        ? { accessibilityRole: 'image' as const, accessibilityLabel: alt }
        : {
            'aria-hidden': true as const,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          })}
      {...nativeWindProps(className)}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.primarySoft,
          height: dimension,
          width: dimension,
        },
        style,
      ]}
    >
      {showImage ? (
        <Image
          {...imageProps}
          source={source}
          accessible={false}
          aria-hidden
          onError={imageErrorHandler}
          style={[styles.image, imageStyle]}
        />
      ) : typeof fallbackContent === 'string' || typeof fallbackContent === 'number' ? (
        <RNText
          style={[
            roleTextStyle(theme, avatarTextRole(size)),
            styles.fallback,
            { color: theme.colors.primaryStrong },
          ]}
        >
          {fallbackContent}
        </RNText>
      ) : (
        fallbackContent
      )}
    </View>
  );
}

// ─── Divider ────────────────────────────────────────────────────────────────────────

export type DividerOrientation = 'horizontal' | 'vertical';

export interface DividerProps extends Omit<CommonProps, 'unstyled'> {
  orientation?: DividerOrientation | undefined;
  /** Theme color roles only. Defaults to 'line'. */
  color?: ColorKey | undefined;
  /** Defaults to StyleSheet.hairlineWidth. */
  thickness?: number | undefined;
  /** The start and end margins along the line's axis. Token keys are first class, numbers are the escape hatch for measured values. */
  inset?: SpacingKey | number | undefined;
  /** The gap between the line and the adjacent content. Token keys are first class, numbers are the escape hatch for measured values. */
  spacing?: SpacingKey | number | undefined;
  /** Defaults to true. When false it emits separator semantics. */
  decorative?: boolean | undefined;
  unstyled?: never;
}

const getDividerStyles = themedStyles((_theme: Theme) => ({
  base: {
    alignSelf: 'stretch' as const,
    flexShrink: 0,
  },
}));

export function Divider({
  orientation = 'horizontal',
  color = 'line',
  thickness = StyleSheet.hairlineWidth,
  inset = 0,
  spacing = 0,
  decorative = true,
  style,
  className,
  testID,
}: DividerProps): ReactElement {
  const theme = useTheme();
  const styles = getDividerStyles(theme);
  const resolvedInset = resolveSpacing(theme, inset);
  const resolvedSpacing = resolveSpacing(theme, spacing);
  const semanticOrientationProps =
    !decorative && Platform.OS === 'web'
      ? ({ 'aria-orientation': orientation } as Record<string, unknown>)
      : {};

  return (
    <View
      testID={testID}
      {...(decorative
        ? { accessible: false, 'aria-hidden': true as const }
        : { accessible: true, role: 'separator' as const })}
      {...semanticOrientationProps}
      {...nativeWindProps(className)}
      style={[
        styles.base,
        { backgroundColor: theme.colors[color] },
        orientation === 'horizontal'
          ? {
              height: thickness,
              marginHorizontal: resolvedInset,
              marginVertical: resolvedSpacing,
            }
          : {
              marginHorizontal: resolvedSpacing,
              marginVertical: resolvedInset,
              width: thickness,
            },
        style,
      ]}
    />
  );
}

// ─── ListItem ─────────────────────────────────────────────────────────────────────────

export type ListItemSize = 'sm' | 'md' | 'lg';

type ListItemBaseProps = Omit<CommonProps, 'unstyled'> & {
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  size?: ListItemSize | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  descriptionStyle?: StyleProp<TextStyle> | undefined;
  unstyled?: never;
};

type InteractiveListItem = {
  onPress: () => void;
  disabled?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  accessibilityHint?: string | undefined;
};

type StaticListItem = {
  onPress?: never;
  disabled?: never;
  accessibilityLabel?: never;
  accessibilityHint?: never;
};

export type ListItemProps = ListItemBaseProps & (InteractiveListItem | StaticListItem);

const getListItemStyles = themedStyles((theme: Theme) => ({
  row: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
  },
  leading: {
    alignItems: 'center' as const,
    flexShrink: 0,
    justifyContent: 'center' as const,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    alignItems: 'center' as const,
    flexShrink: 0,
    justifyContent: 'center' as const,
  },
  title: {
    includeFontPadding: false,
  },
  description: {
    includeFontPadding: false,
    marginTop: theme.spacing.xs,
  },
}));

function listItemTextRole(size: ListItemSize): TextRole {
  return size === 'sm' ? 'label' : size === 'lg' ? 'title' : 'body';
}

function listItemVerticalPadding(theme: Theme, size: ListItemSize): number {
  return size === 'sm'
    ? theme.spacing.xs
    : size === 'lg'
      ? theme.spacing.md
      : theme.spacing.sm;
}

export function ListItem(props: ListItemProps): ReactElement {
  const {
    title,
    description,
    leading,
    trailing,
    size = 'md',
    titleStyle,
    descriptionStyle,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getListItemStyles(theme);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const interactive = props.onPress !== undefined;
  const disabled = interactive && Boolean(props.disabled);
  const descriptionId = interactive && description !== undefined
    ? `gj-list-item-${reactId}-description`
    : undefined;
  const dimensions = {
    minHeight: theme.metrics.control[size],
    paddingVertical: listItemVerticalPadding(theme, size),
  };

  const content = (
    <>
      {leading !== undefined ? <View style={styles.leading}>{leading}</View> : null}
      <View style={styles.copy}>
        <RNText
          style={[
            roleTextStyle(theme, listItemTextRole(size)),
            styles.title,
            { color: disabled ? theme.colors.textSubtle : theme.colors.text },
            titleStyle,
          ]}
        >
          {title}
        </RNText>
        {description !== undefined ? (
          <RNText
            nativeID={descriptionId}
            style={[
              roleTextStyle(theme, 'caption'),
              styles.description,
              { color: disabled ? theme.colors.textSubtle : theme.colors.textMuted },
              descriptionStyle,
            ]}
          >
            {description}
          </RNText>
        ) : null}
      </View>
      {trailing !== undefined ? <View style={styles.trailing}>{trailing}</View> : null}
    </>
  );

  if (interactive) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.accessibilityLabel ?? title}
        aria-label={props.accessibilityLabel ?? title}
        accessibilityHint={props.accessibilityHint ?? description}
        {...(Platform.OS === 'web' && descriptionId !== undefined
          ? ({ 'aria-describedby': descriptionId } as Record<string, unknown>)
          : {})}
        accessibilityState={{ disabled }}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={props.onPress}
        testID={testID}
        {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
        style={({ pressed }) => [
          styles.row,
          dimensions,
          pressed && !disabled ? { opacity: 0.82 } : null,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.row, dimensions, style]}
    >
      {content}
    </View>
  );
}
