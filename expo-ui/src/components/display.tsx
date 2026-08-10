/**
 * Avatar / Divider / ListItem — 표시·구조 기본 프리미티브.
 *
 * 색·간격·타이포·제어 크기는 테마 토큰을 통해서만 흐른다.
 * 이미지·인터랙션 의미는 타입 유니언으로 강제해 무의미한 접근성
 * 요소가 발행되지 않게 한다.
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

/** Avatar가 소유하는 소스·스타일·접근성 prop은 이 슬롯에서 덮어쓸 수 없다. */
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
  /** 이름은 이미지 미지정·로드 실패 시 초성을 만드는 데 쓴다. */
  name: string;
  source?: ImageSourcePropType | undefined;
  size?: AvatarSize | undefined;
  /** 미지정 시 name에서 초성을 만든다. */
  fallback?: ReactNode | undefined;
  /** 소스·스타일·접근성을 제외한 RN Image prop. onError는 내부 폴백과 병합된다. */
  imageProps?: AvatarImageProps | undefined;
  imageStyle?: StyleProp<ImageStyle> | undefined;
  unstyled?: never;
};

type InformativeAvatar = {
  /** 프로필 이미지가 전달하는 의미. 장식이 아니면 필수다. */
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

/** 공백 단어는 첫·끝 글자, 한 단어는 첫 두 글자를 쓴다. Hangul도 안전하다. */
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
  /** 테마 color role만 허용. 기본 'line'. */
  color?: ColorKey | undefined;
  /** 기본 StyleSheet.hairlineWidth. */
  thickness?: number | undefined;
  /** 선의 시작·끝 축 여백. 토큰 키가 1급, 숫자는 실측 탈출구. */
  inset?: SpacingKey | number | undefined;
  /** 선과 인접 콘텐츠 사이 여백. 토큰 키가 1급, 숫자는 실측 탈출구. */
  spacing?: SpacingKey | number | undefined;
  /** 기본 true. false면 separator 의미론을 발행한다. */
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
