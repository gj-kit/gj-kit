/**
 * Chip — short actions, toggle filters, static selections, and removable values in one visual language.
 *
 * A chip has no single ARIA pattern of its own, so kind pins the semantics and
 * the callback together: action is a button, filter is a toggle button whose name
 * does not change, static is plain text with an optional visual selected state, and
 * removable is a static value plus a separate remove button. The removable Pressable
 * is never nested inside the container.
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

export type ChipKind = 'action' | 'filter' | 'static' | 'removable';
export type ChipVariant = 'filled' | 'outlined';
export type ChipSize = 'sm' | 'md';

type ChipBaseProps = Omit<CommonProps, 'unstyled'> & {
  kind: ChipKind;
  label: string;
  /** Defaults to 'filled'. */
  variant?: ChipVariant | undefined;
  /** Defaults to 'md'. */
  size?: ChipSize | undefined;
  /** A decorative icon. A selected filter with no leading uses the Provider's check icon. */
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

/** A read-only value or selected tag. `selected` changes appearance only; this branch has no widget role or selection ARIA state. */
export type StaticChipProps = Omit<ChipBaseProps, 'disabled'> & {
  kind: 'static';
  /** Defaults to false. This is visual state only; use a filter chip when the user can change it. */
  selected?: boolean | undefined;
  disabled?: never;
  onPress?: never;
  onSelectedChange?: never;
  onRemove?: never;
  removeAccessibilityLabel?: never;
};

export type RemovableChipProps = ChipBaseProps & {
  kind: 'removable';
  onRemove: () => void;
  /** The remove button does something different from the visible value label, so a separate accessible name is required. */
  removeAccessibilityLabel: string;
  onPress?: never;
  selected?: never;
  onSelectedChange?: never;
};

export type ChipProps = ActionChipProps | FilterChipProps | StaticChipProps | RemovableChipProps;

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
  const selected =
    props.kind === 'filter' || props.kind === 'static' ? Boolean(props.selected) : false;
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

  if (props.kind === 'static') {
    // A static chip is ordinary text, not a disabled button or a selection widget.
    // Its selected prop changes color only, so it emits neither button nor ARIA selection state.
    return (
      <View
        testID={testID}
        {...nativeWindProps(className)}
        style={rootStyle}
      >
        {sharedContent}
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
