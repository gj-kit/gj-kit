/** Native Popover — an adaptive modal surface with an owned trigger. */
import { useCallback, useId, useRef } from 'react';
import type { ReactElement } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import type { Theme } from '../theme/tokens';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { Dialog, DialogPanel } from './dialog';
import type { DialogDismissDetails, DialogFocusRef } from './dialog';
import { renderIconSlot } from './icons';
import type { IconRenderProps, RenderIcon } from './icons';
import {
  mergeClassNames,
  nativeWindProps,
  themedStyles,
} from './internal';
import {
  assertPopoverCloseLabel,
  assertPopoverProps,
} from './popover.types';
import type {
  PopoverOpenChangeReason,
  PopoverProps,
  PopoverTriggerSize,
  PopoverTriggerVariant,
} from './popover.types';
import { useOptionalOverlayStack } from './overlay/provider';
import { useIcons, useStrings, useTheme } from './provider';

type TriggerDimensions = {
  readonly minHeight: number;
  readonly paddingHorizontal: number;
  readonly gap: number;
  readonly typography: Theme['typography']['button'];
};

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'flex-start' as const,
  },
  trigger: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
    justifyContent: 'center' as const,
  },
  triggerIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bottomOverlay: {
    alignItems: 'stretch' as const,
    justifyContent: 'flex-end' as const,
    paddingBottom: theme.spacing.none,
  },
  centerOverlay: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  panel: {
    gap: theme.spacing.lg,
    position: 'relative' as const,
  },
  close: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    justifyContent: 'center' as const,
    minHeight: theme.metrics.control.md,
    minWidth: theme.metrics.control.md,
    position: 'absolute' as const,
    right: theme.spacing.xxl,
    top: theme.spacing.xxl,
    zIndex: 1,
  },
  closeIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  bodyScroll: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  body: {
    gap: theme.spacing.md,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function triggerDimensions(
  theme: Theme,
  size: PopoverTriggerSize,
): TriggerDimensions {
  return size === 'sm'
    ? {
        minHeight: theme.metrics.control.sm,
        paddingHorizontal: theme.spacing.md,
        gap: theme.spacing.sm,
        typography: theme.typography.label,
      }
    : {
        minHeight: theme.metrics.control.md,
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.md,
        typography: theme.typography.button,
      };
}

function triggerPalette(
  theme: Theme,
  variant: PopoverTriggerVariant,
  disabled: boolean,
): {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly foreground: string;
} {
  if (disabled) {
    return {
      backgroundColor: theme.colors.surfaceSubtle,
      borderColor: theme.colors.line,
      foreground: theme.colors.textSubtle,
    };
  }
  switch (variant) {
    case 'filled':
      return {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
        foreground: theme.colors.onPrimary,
      };
    case 'ghost':
      return {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.surface,
        foreground: theme.colors.primary,
      };
    default:
      return {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.textSubtle,
        foreground: theme.colors.text,
      };
  }
}

function originalEvent(event: unknown): unknown {
  if (typeof event === 'object' && event !== null && 'nativeEvent' in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

function closeGlyph(iconProps: IconRenderProps): ReactElement {
  return (
    <RNText
      aria-hidden
      style={{ color: iconProps.color, fontSize: iconProps.size }}
    >
      ×
    </RNText>
  );
}

function nativeDismissReason(
  reason: DialogDismissDetails['reason'],
): Exclude<
  PopoverOpenChangeReason,
  'trigger-press' | 'tab-key' | 'focus-out' | 'anchor-detached'
> {
  return reason === 'backdrop-press' ? 'outside-press' : reason;
}

/**
 * Controlled native Popover. Compact screens use a bottom presentation while
 * tablets retain the centered dialog form.
 */
export function Popover(props: PopoverProps): ReactElement {
  assertPopoverProps(props);
  const {
    children,
    open,
    onOpenChange,
    title,
    description,
    triggerLabel,
    iconOnly = false,
    triggerIcon,
    closeAccessibilityLabel,
    initialFocusRef,
    disabled = false,
    dismissDisabled = false,
    overlayId: overlayIdProp,
    presentation = 'auto',
    bottomInset = 0,
    keyboardOverlap = 0,
    size = 'md',
    variant = 'outlined',
    triggerStyle,
    triggerClassName,
    triggerLabelStyle,
    triggerLabelClassName,
    contentStyle,
    contentClassName,
    bodyStyle,
    bodyClassName,
    titleStyle,
    style,
    className,
    testID,
  } = props;
  const stack = useOptionalOverlayStack();
  if (stack === null) {
    throw new Error('Popover must be rendered inside OverlayProvider.');
  }
  const theme = useTheme();
  const icons = useIcons();
  const strings = useStrings();
  const styles = getStyles(theme);
  const { height, width } = useWindowDimensions();
  const dimensions = triggerDimensions(theme, size);
  const palette = triggerPalette(theme, variant, disabled);
  const reactId = sanitizeId(useId());
  const overlayId = overlayIdProp ?? `gj-popover-${reactId}-overlay`;
  const triggerRef = useRef<View | null>(null);
  const closeRef = useRef<View | null>(null);

  const resolvedPresentation =
    presentation === 'auto'
      ? width < theme.breakpoints.tablet
        ? 'bottom'
        : 'center'
      : presentation;
  const avoidance =
    keyboardOverlap > theme.spacing.none ? keyboardOverlap : bottomInset;
  const invariantPaddingBottom =
    theme.spacing.xxl +
    (resolvedPresentation === 'bottom' ? avoidance : theme.spacing.none);
  const viewportHeight =
    height > theme.spacing.none ? height : theme.breakpoints.tablet;
  const invariantMaxHeight = Math.max(
    theme.metrics.control.lg,
    viewportHeight - theme.spacing.xl - theme.spacing.xl,
  );

  const handleTriggerPress = useCallback(
    (event: GestureResponderEvent): void => {
      if (disabled || (open && dismissDisabled)) return;
      onOpenChange(!open, {
        reason: 'trigger-press',
        originalEvent: originalEvent(event),
      });
    },
    [disabled, dismissDisabled, onOpenChange, open],
  );

  const handleDialogDismiss = useCallback(
    (details: DialogDismissDetails): void => {
      const reason = nativeDismissReason(details.reason);
      onOpenChange(false, {
        reason,
        ...(details.originalEvent === undefined
          ? {}
          : { originalEvent: details.originalEvent }),
      });
    },
    [onOpenChange],
  );

  const handleClosePress = useCallback(
    (event: GestureResponderEvent): void => {
      if (dismissDisabled) return;
      stack.requestDismiss(overlayId, 'close-action', event);
    },
    [dismissDisabled, overlayId, stack],
  );

  const closeIcon: RenderIcon = (iconProps) => (
    <View
      accessible={false}
      aria-hidden
      importantForAccessibility="no-hide-descendants"
      style={styles.closeIcon}
    >
      {renderIconSlot(icons.close, iconProps) ?? closeGlyph(iconProps)}
    </View>
  );
  const resolvedCloseLabel = closeAccessibilityLabel ?? strings.close;
  if (closeAccessibilityLabel === undefined) {
    assertPopoverCloseLabel(resolvedCloseLabel, 'Popover strings.close');
  }

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={handleTriggerPress}
        testID={testID === undefined ? undefined : `${testID}-trigger`}
        {...nativeWindProps(
          mergeClassNames(PRESSABLE_FEEDBACK_CLASS, triggerClassName),
        )}
        style={({ pressed }) => [
          styles.trigger,
          {
            minHeight: dimensions.minHeight,
            minWidth: iconOnly ? dimensions.minHeight : undefined,
            paddingHorizontal: dimensions.paddingHorizontal,
            gap: dimensions.gap,
            backgroundColor:
              pressed && !disabled
                ? theme.colors.surfaceSubtle
                : palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity: disabled ? 0.58 : 1,
          },
          triggerStyle,
        ]}
      >
        {triggerIcon === undefined ? null : (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.triggerIcon}
          >
            {renderIconSlot(triggerIcon, {
              color: palette.foreground,
              size: theme.metrics.icon.md,
            })}
          </View>
        )}
        {iconOnly ? null : (
          <RNText
            {...nativeWindProps(triggerLabelClassName)}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              dimensions.typography,
              theme.typography.fontFamily === undefined
                ? null
                : { fontFamily: theme.typography.fontFamily },
              { color: palette.foreground },
              triggerLabelStyle,
            ]}
          >
            {triggerLabel}
          </RNText>
        )}
      </Pressable>

      <Dialog
        visible={open}
        onDismiss={handleDialogDismiss}
        dismissDisabled={dismissDisabled}
        initialFocusRef={initialFocusRef ?? (closeRef as DialogFocusRef)}
        finalFocusRef={triggerRef as DialogFocusRef}
        overlayId={overlayId}
        overlayStyle={
          resolvedPresentation === 'bottom'
            ? styles.bottomOverlay
            : styles.centerOverlay
        }
        animationType={resolvedPresentation === 'bottom' ? 'slide' : 'fade'}
        testID={testID === undefined ? undefined : `${testID}-dialog`}
      >
        <DialogPanel
          title={title}
          description={description}
          titleStyle={titleStyle}
          showCloseButton={false}
          testID={testID === undefined ? undefined : `${testID}-panel`}
          className={contentClassName}
          style={[
            styles.panel,
            contentStyle,
            {
              maxHeight: invariantMaxHeight,
              overflow: 'hidden',
              paddingBottom: invariantPaddingBottom,
              paddingRight:
                theme.spacing.xxl +
                theme.metrics.control.md +
                theme.spacing.md,
              borderColor: theme.colors.textSubtle,
            },
          ]}
        >
          <Pressable
            ref={closeRef}
            accessibilityRole="button"
            accessibilityLabel={resolvedCloseLabel}
            accessibilityState={{ disabled: dismissDisabled }}
            disabled={dismissDisabled}
            tabIndex={Platform.OS === 'web' ? 0 : undefined}
            onPress={handleClosePress}
            testID={testID === undefined ? undefined : `${testID}-close`}
            {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
            style={({ pressed }) => [
              styles.close,
              {
                backgroundColor:
                  pressed && !dismissDisabled
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                opacity: dismissDisabled ? 0.52 : 1,
              },
            ]}
          >
            {closeIcon({
              color: dismissDisabled
                ? theme.colors.textSubtle
                : theme.colors.text,
              size: theme.metrics.icon.md,
            })}
          </Pressable>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={styles.bodyScroll}
            testID={testID === undefined ? undefined : `${testID}-body-scroll`}
          >
            <View
              testID={testID === undefined ? undefined : `${testID}-body`}
              {...nativeWindProps(bodyClassName)}
              style={[styles.body, bodyStyle]}
            >
              {children}
            </View>
          </ScrollView>
        </DialogPanel>
      </Dialog>
    </View>
  );
}
