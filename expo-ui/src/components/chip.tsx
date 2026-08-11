/**
 * Chip — 짧은 액션, 토글 필터, 제거 가능한 값을 하나의 시각 언어로 표현한다.
 *
 * Chip 자체에는 단일 ARIA 패턴이 없다. 그래서 kind가 의미와 콜백을 함께 고정한다:
 * action은 버튼, filter는 이름이 바뀌지 않는 토글 버튼, removable은 정적 값과
 * 별도의 제거 버튼이다. removable의 Pressable을 컨테이너 안에 중첩하지 않는다.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { Theme, TextRole } from '../theme/tokens';
import { renderIconSlot } from './icons';
import type { IconRenderProps, RenderIcon } from './icons';
import { mergeClassNames, nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { useIcons, useTheme } from './provider';
import { roleTextStyle } from './text';

export type ChipKind = 'action' | 'filter' | 'removable';
export type ChipVariant = 'filled' | 'outlined';
export type ChipSize = 'sm' | 'md';

type ChipBaseProps = Omit<CommonProps, 'unstyled'> & {
  kind: ChipKind;
  label: string;
  /** 기본 'filled'. */
  variant?: ChipVariant | undefined;
  /** 기본 'md'. */
  size?: ChipSize | undefined;
  /** 장식 아이콘. filter가 선택됐고 leading이 없으면 Provider check 아이콘을 쓴다. */
  leading?: ReactNode | RenderIcon | undefined;
  disabled?: boolean | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  unstyled?: never;
};

export type ActionChipProps = ChipBaseProps & {
  kind: 'action';
  onPress: () => void;
  selected?: never;
  onSelectedChange?: never;
  onRemove?: never;
  removeAccessibilityLabel?: never;
};

export type FilterChipProps = ChipBaseProps & {
  kind: 'filter';
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onPress?: never;
  onRemove?: never;
  removeAccessibilityLabel?: never;
};

export type RemovableChipProps = ChipBaseProps & {
  kind: 'removable';
  onRemove: () => void;
  /** 제거 버튼은 보이는 값 라벨과 다른 동작이므로 별도 접근성 이름이 필수다. */
  removeAccessibilityLabel: string;
  onPress?: never;
  selected?: never;
  onSelectedChange?: never;
};

export type ChipProps = ActionChipProps | FilterChipProps | RemovableChipProps;

type ChipPalette = {
  backgroundColor: string;
  borderColor: string;
  foregroundColor: string;
};

function chipPalette(
  theme: Theme,
  variant: ChipVariant,
  selected: boolean,
  disabled: boolean,
): ChipPalette {
  if (disabled) {
    return {
      backgroundColor: variant === 'filled' ? theme.colors.surfaceSubtle : theme.colors.surface,
      borderColor: theme.colors.line,
      foregroundColor: theme.colors.textSubtle,
    };
  }

  if (selected) {
    return {
      backgroundColor: variant === 'filled' ? theme.colors.primarySoft : theme.colors.surface,
      borderColor: variant === 'filled' ? theme.colors.primarySoft : theme.colors.primary,
      foregroundColor: theme.colors.primaryStrong,
    };
  }

  return {
    backgroundColor: variant === 'filled' ? theme.colors.surfaceSubtle : theme.colors.surface,
    borderColor: variant === 'filled' ? theme.colors.surfaceSubtle : theme.colors.line,
    foregroundColor: theme.colors.text,
  };
}

function chipDimensions(theme: Theme, size: ChipSize): {
  minHeight: number;
  paddingHorizontal: number;
  paddingVertical: number;
  gap: number;
  iconSize: number;
  textRole: TextRole;
} {
  return size === 'sm'
    ? {
        minHeight: theme.metrics.control.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
        gap: theme.spacing.xs,
        iconSize: theme.metrics.icon.sm,
        textRole: 'caption',
      }
    : {
        minHeight: theme.metrics.control.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        gap: theme.spacing.sm,
        iconSize: theme.metrics.icon.md,
        textRole: 'label',
      };
}

const getStyles = themedStyles((theme: Theme) => ({
  container: {
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
  },
  label: {
    flexShrink: 1,
    includeFontPadding: false,
  },
  decorativeIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  glyph: {
    fontWeight: theme.typography.title.fontWeight,
    includeFontPadding: false,
    textAlign: 'center' as const,
  },
  removeButton: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    justifyContent: 'center' as const,
  },
}));

function fallbackGlyph(
  glyph: string,
  iconProps: IconRenderProps,
  style: TextStyle,
): ReactElement {
  return (
    <RNText
      aria-hidden
      style={[style, { color: iconProps.color, fontSize: iconProps.size }]}
    >
      {glyph}
    </RNText>
  );
}

function ChipIcon({
  icon,
  color,
  size,
}: {
  icon: ReactNode | RenderIcon;
  color: string;
  size: number;
}): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <View
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.decorativeIcon}
    >
      {renderIconSlot(icon, { color, size })}
    </View>
  );
}

function ChipLabel({
  label,
  color,
  role,
  labelStyle,
  labelClassName,
}: {
  label: string;
  color: string;
  role: TextRole;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
}): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <RNText
      numberOfLines={1}
      maxFontSizeMultiplier={theme.metrics.maxFontScale}
      {...nativeWindProps(labelClassName)}
      style={[roleTextStyle(theme, role), styles.label, { color }, labelStyle]}
    >
      {label}
    </RNText>
  );
}

export function Chip(props: ChipProps): ReactElement {
  const {
    label,
    variant = 'filled',
    size = 'md',
    leading,
    disabled = false,
    labelStyle,
    labelClassName,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const selected = props.kind === 'filter' ? props.selected : false;
  const palette = chipPalette(theme, variant, selected, disabled);
  const dimensions = chipDimensions(theme, size);
  const checkIcon: RenderIcon =
    icons.check ??
    ((iconProps) => fallbackGlyph('✓', iconProps, styles.glyph));
  const resolvedLeading = leading ?? (props.kind === 'filter' && selected ? checkIcon : undefined);
  const sharedContent = (
    <>
      {resolvedLeading !== undefined ? (
        <ChipIcon
          icon={resolvedLeading}
          color={palette.foregroundColor}
          size={dimensions.iconSize}
        />
      ) : null}
      <ChipLabel
        label={label}
        color={palette.foregroundColor}
        role={dimensions.textRole}
        labelStyle={labelStyle}
        labelClassName={labelClassName}
      />
    </>
  );
  const rootStyle = [
    styles.container,
    {
      minHeight: dimensions.minHeight,
      paddingHorizontal: dimensions.paddingHorizontal,
      paddingVertical: dimensions.paddingVertical,
      gap: dimensions.gap,
      backgroundColor: palette.backgroundColor,
      borderColor: palette.borderColor,
    },
    style,
  ];

  if (props.kind === 'removable') {
    const removeIcon: RenderIcon =
      icons.close ??
      ((iconProps) => fallbackGlyph('×', iconProps, styles.glyph));
    const removeButtonSize = Math.max(
      theme.metrics.icon.lg,
      dimensions.minHeight - theme.spacing.md,
    );

    return (
      <View
        testID={testID}
        {...nativeWindProps(className)}
        style={rootStyle}
      >
        {sharedContent}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={props.removeAccessibilityLabel}
          accessibilityState={{ disabled }}
          aria-disabled={disabled}
          disabled={disabled}
          hitSlop={theme.spacing.sm}
          onPress={props.onRemove}
          {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
          style={[
            styles.removeButton,
            { width: removeButtonSize, height: removeButtonSize },
          ]}
        >
          <ChipIcon
            icon={removeIcon}
            color={palette.foregroundColor}
            size={dimensions.iconSize}
          />
        </Pressable>
      </View>
    );
  }

  if (props.kind === 'filter') {
    return (
      <Pressable
        accessible
        accessibilityRole={Platform.OS === 'web' ? 'button' : 'togglebutton'}
        accessibilityLabel={label}
        accessibilityState={{ checked: selected, disabled }}
        aria-pressed={selected}
        aria-disabled={disabled}
        disabled={disabled}
        onPress={() => props.onSelectedChange(!selected)}
        testID={testID}
        {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
        style={rootStyle}
      >
        {sharedContent}
      </Pressable>
    );
  }

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={props.onPress}
      testID={testID}
      {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, className))}
      style={rootStyle}
    >
      {sharedContent}
    </Pressable>
  );
}
