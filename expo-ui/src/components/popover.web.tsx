/** Web Popover — a non-modal rich dialog over the shared top-layer kernel. */
import { useCallback, useId, useLayoutEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import {
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import type { DialogFocusRef } from './dialog';
import { renderIconSlot } from './icons';
import type { IconRenderProps, RenderIcon } from './icons';
import {
  elevationStyle,
  mergeClassNames,
  nativeWindProps,
  themedStyles,
} from './internal';
import { useOverlayParentId } from './overlay/layer';
import { useOptionalOverlayStack } from './overlay/provider';
import type { OverlayDismissDetails, OverlayDismissReason } from './overlay/types';
import { WebPopover } from './overlay/web-popover.web';
import type { WebPopoverElement } from './overlay/web-popover.web';
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
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

type Focusable = { focus?: (() => void) | undefined };

type WebAttributeTarget = {
  setAttribute?: ((name: string, value: string) => void) | undefined;
  removeAttribute?: ((name: string) => void) | undefined;
};

type WebFocusEvent = {
  readonly relatedTarget?: unknown;
  readonly nativeEvent?: unknown;
};

type WebKeyboardEvent = {
  readonly key: string;
  readonly nativeEvent?: unknown;
};

type WebPointerEvent = {
  readonly target?: unknown;
};

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
  panel: {
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 0,
    minWidth: theme.metrics.control.lg * 4,
    overflow: 'hidden' as const,
  },
  header: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
  },
  copy: {
    flex: 1,
    gap: theme.spacing.xs,
    minWidth: 0,
  },
  close: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    justifyContent: 'center' as const,
    minHeight: theme.metrics.control.md,
    minWidth: theme.metrics.control.md,
  },
  closeIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  bodyScroll: {
    flexShrink: 1,
    minHeight: 0,
  },
  body: {
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
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

function focusBestEffort(ref: DialogFocusRef | undefined): void {
  try {
    ref?.current?.focus?.();
  } catch {
    // A controlled close may race unmount of a consumer-owned focus target.
  }
}

function originalEvent(event: unknown): unknown {
  if (typeof event === 'object' && event !== null && 'nativeEvent' in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

function isPublicDismissReason(
  reason: OverlayDismissReason,
): reason is Exclude<
  PopoverOpenChangeReason,
  'trigger-press' | 'hardware-back' | 'accessibility-escape'
> {
  return (
    reason === 'outside-press' ||
    reason === 'escape-key' ||
    reason === 'close-action' ||
    reason === 'tab-key' ||
    reason === 'focus-out' ||
    reason === 'anchor-detached'
  );
}

/**
 * Controlled web Popover. Unlike Dialog, it is deliberately non-modal: focus
 * may leave naturally and doing so always requests close.
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
    placement = 'bottom-start',
    direction = I18nManager.isRTL ? 'rtl' : 'ltr',
    sideOffset = 0,
    alignOffset = 0,
    collisionPadding,
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
  const parentId = useOverlayParentId();
  const theme = useTheme();
  const icons = useIcons();
  const strings = useStrings();
  const styles = getStyles(theme);
  const dimensions = triggerDimensions(theme, size);
  const palette = triggerPalette(theme, variant, disabled);
  const reactId = sanitizeId(useId());
  const baseId = `gj-popover-${reactId}`;
  const overlayId = overlayIdProp ?? `${baseId}-overlay`;
  const contentId = `${baseId}-content`;
  const titleId = `${baseId}-title`;
  const descriptionId = description === undefined ? undefined : `${baseId}-description`;
  const triggerRef = useRef<WebPopoverElement | null>(null);
  const floatingRef = useRef<WebPopoverElement | null>(null);
  const closeRef = useRef<View | null>(null);
  const openRef = useRef(open);
  const initialFocusClaimedRef = useRef(false);
  const closeRequestIdRef = useRef(0);
  const closeRequestPendingRef = useRef(false);
  const triggerPointerDownRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabExitPendingRef = useRef(false);
  const tabExitEventRef = useRef<unknown>(undefined);
  openRef.current = open;

  const focusTrigger = useCallback((): void => {
    try {
      (triggerRef.current as Focusable | null)?.focus?.();
    } catch {
      // The trigger may have been removed with its owning screen.
    }
  }, []);

  const handleStackDismiss = useCallback(
    (details: OverlayDismissDetails): void => {
      if (!isPublicDismissReason(details.reason)) return;
      const focusEscapeReason =
        details.reason === 'tab-key' ||
        details.reason === 'focus-out' ||
        details.reason === 'anchor-detached';
      if (dismissDisabled && !focusEscapeReason) return;
      if (closeRequestPendingRef.current) return;

      const requestId = ++closeRequestIdRef.current;
      closeRequestPendingRef.current = true;
      if (details.reason === 'escape-key' || details.reason === 'close-action') {
        focusTrigger();
      }
      onOpenChange(false, {
        reason: details.reason,
        ...(details.originalEvent === undefined
          ? {}
          : { originalEvent: details.originalEvent }),
      });
      // A controlled parent may reject a request. Suppress same-turn duplicate
      // blur/pointer paths, then allow the next genuine request.
      void Promise.resolve().then(() => {
        if (closeRequestIdRef.current !== requestId) return;
        closeRequestPendingRef.current = false;
      });
    },
    [dismissDisabled, focusTrigger, onOpenChange],
  );

  const requestStackDismiss = useCallback(
    (
      reason: Extract<
        OverlayDismissReason,
        'close-action' | 'tab-key' | 'focus-out' | 'anchor-detached'
      >,
      event?: unknown,
    ): void => {
      stack.requestDismiss(overlayId, reason, event);
    },
    [overlayId, stack],
  );

  useLayoutEffect(() => {
    if (!open && focusTimerRef.current !== null) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    if (!open) initialFocusClaimedRef.current = false;
    if (!open && tabExitTimerRef.current !== null) {
      clearTimeout(tabExitTimerRef.current);
      tabExitTimerRef.current = null;
      tabExitPendingRef.current = false;
      tabExitEventRef.current = undefined;
    }
    return () => {
      if (focusTimerRef.current !== null) {
        clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      if (tabExitTimerRef.current !== null) {
        clearTimeout(tabExitTimerRef.current);
        tabExitTimerRef.current = null;
      }
      tabExitPendingRef.current = false;
      tabExitEventRef.current = undefined;
    };
  }, [open]);

  const handleLayerReady = useCallback((): void => {
    closeRequestIdRef.current += 1;
    closeRequestPendingRef.current = false;
    if (initialFocusClaimedRef.current || focusTimerRef.current !== null) return;
    const focusTarget = initialFocusRef ?? (closeRef as DialogFocusRef);
    // Let every initially-open descendant finish registering first. Only the
    // final topmost layer in that commit may consume this open cycle's focus.
    focusTimerRef.current = setTimeout(() => {
      focusTimerRef.current = null;
      if (
        !openRef.current ||
        initialFocusClaimedRef.current ||
        !stack.isTopmost(overlayId)
      ) return;
      initialFocusClaimedRef.current = true;
      focusBestEffort(focusTarget);
    }, 0);
  }, [initialFocusRef, overlayId, stack]);

  const handleTriggerPress = useCallback((event: unknown): void => {
    triggerPointerDownRef.current = false;
    if (disabled || (open && dismissDisabled)) return;
    if (!open) {
      closeRequestIdRef.current += 1;
      closeRequestPendingRef.current = false;
    }
    onOpenChange(!open, {
      reason: 'trigger-press',
      originalEvent: originalEvent(event),
    });
  }, [disabled, dismissDisabled, onOpenChange, open]);

  const handleRootPointerDown = useCallback((event: WebPointerEvent): void => {
    const target = event.target ?? null;
    if (target === null || triggerRef.current?.contains(target) !== true) return;
    triggerPointerDownRef.current = true;
    // Keep the guard through the pointerdown default action, where the browser
    // moves focus and emits blur, but never beyond this interaction turn.
    void Promise.resolve().then(() => {
      triggerPointerDownRef.current = false;
    });
  }, []);

  const handleClosePress = useCallback((event: unknown): void => {
    if (dismissDisabled) return;
    requestStackDismiss('close-action', originalEvent(event));
  }, [dismissDisabled, requestStackDismiss]);

  const handleDetachedChange = useCallback((detached: boolean): void => {
    if (detached) requestStackDismiss('anchor-detached');
  }, [requestStackDismiss]);

  const handleFocusGuardExit = useCallback((event: unknown): void => {
    if (tabExitTimerRef.current !== null) {
      clearTimeout(tabExitTimerRef.current);
      tabExitTimerRef.current = null;
    }
    tabExitPendingRef.current = false;
    tabExitEventRef.current = undefined;
    requestStackDismiss('tab-key', event);
  }, [requestStackDismiss]);

  const handlePanelKeyDown = useCallback((event: WebKeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    // Never prevent default or synchronously unmount: the browser must first
    // move focus. The deferred check closes only when Tab actually left the
    // panel; internal focusable content remains usable.
    if (tabExitTimerRef.current !== null) {
      clearTimeout(tabExitTimerRef.current);
    }
    tabExitPendingRef.current = true;
    const sourceEvent = originalEvent(event);
    tabExitEventRef.current = sourceEvent;
    tabExitTimerRef.current = setTimeout(() => {
      tabExitTimerRef.current = null;
      if (!tabExitPendingRef.current) return;
      tabExitPendingRef.current = false;
      tabExitEventRef.current = undefined;
      const floating = floatingRef.current;
      const activeElement = floating?.ownerDocument?.activeElement;
      if (
        floating !== null &&
        floating !== undefined &&
        activeElement !== null &&
        activeElement !== undefined &&
        floating.contains(activeElement)
      ) {
        return;
      }
      requestStackDismiss('tab-key', sourceEvent);
    }, 0);
  }, [requestStackDismiss]);

  const handlePanelBlur = useCallback((event: WebFocusEvent): void => {
    if (!open) return;
    const relatedTarget = event.relatedTarget ?? null;
    if (
      relatedTarget !== null &&
      floatingRef.current?.contains(relatedTarget) === true
    ) {
      return;
    }
    if (
      triggerPointerDownRef.current &&
      relatedTarget !== null &&
      triggerRef.current?.contains(relatedTarget) === true
    ) {
      return;
    }
    // Tab owns the exact public reason and checks the final focused element
    // after the browser's default focus movement completes.
    if (tabExitPendingRef.current) {
      tabExitPendingRef.current = false;
      const tabEvent = tabExitEventRef.current;
      tabExitEventRef.current = undefined;
      if (tabExitTimerRef.current !== null) {
        clearTimeout(tabExitTimerRef.current);
      }
      tabExitTimerRef.current = setTimeout(() => {
        tabExitTimerRef.current = null;
        requestStackDismiss('tab-key', tabEvent);
      }, 0);
      return;
    }
    requestStackDismiss('focus-out', originalEvent(event));
  }, [open, requestStackDismiss]);

  useLayoutEffect(() => {
    // RNW maps a role=button Pressable to a native <button>, but drops the
    // flat aria-disabled override unless the native disabled prop is also set.
    // Keep this intentionally focusable so non-modal Tab can always escape.
    const closeTarget = closeRef.current as unknown as WebAttributeTarget | null;
    if (dismissDisabled) {
      closeTarget?.setAttribute?.('aria-disabled', 'true');
    } else {
      closeTarget?.removeAttribute?.('aria-disabled');
    }
  }, [dismissDisabled]);

  const closeIcon: RenderIcon = (iconProps) => (
    <View
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
  const panelWebProps = {
    onBlur: handlePanelBlur,
    onKeyDown: handlePanelKeyDown,
  } as const;
  const triggerWebProps = {
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    'aria-haspopup': 'dialog',
    'aria-expanded': open,
    'aria-controls': contentId,
    'aria-label': triggerLabel,
    'aria-disabled': disabled,
  } as const;
  const rootWebProps = {
    onPointerDown: handleRootPointerDown,
  } as const;

  return (
    <View
      testID={testID}
      {...(rootWebProps as unknown as Record<string, unknown>)}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      <Pressable
        ref={(node) => {
          triggerRef.current = node as unknown as WebPopoverElement | null;
        }}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={handleTriggerPress}
        testID={testID === undefined ? undefined : `${testID}-trigger`}
        {...(triggerWebProps as unknown as Record<string, unknown>)}
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
            aria-hidden
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

      <WebPopover
        open={open}
        overlayId={overlayId}
        overlayStack={stack}
        parentId={parentId}
        onDismiss={handleStackDismiss}
        triggerRef={triggerRef}
        floatingRef={floatingRef}
        placement={placement}
        direction={direction}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionInsets={collisionPadding}
        // Non-modal focus exits remain legal even when pointer/Escape policy is
        // guarded. The product callback vetoes only those guarded reasons.
        dismissible
        role="dialog"
        domId={contentId}
        accessibilityLabelledBy={titleId}
        accessibilityDescribedBy={descriptionId}
        connectTriggerFocusNavigation
        onFocusGuardExit={handleFocusGuardExit}
        onLayerReady={handleLayerReady}
        onDetachedChange={handleDetachedChange}
      >
        <View
          testID={testID === undefined ? undefined : `${testID}-panel`}
          {...(panelWebProps as unknown as Record<string, unknown>)}
          {...nativeWindProps(contentClassName)}
          style={[
            styles.panel,
            {
              maxHeight: 'inherit',
              maxWidth: 'inherit',
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.textSubtle,
              ...elevationStyle(theme.elevation.md, theme.colors.shadow),
            } as unknown as ViewStyle,
            contentStyle,
          ]}
        >
          <View style={styles.header}>
            <View style={styles.copy}>
              <RNText
                nativeID={titleId}
                accessibilityRole="header"
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                style={[
                  roleTextStyle(theme, 'title'),
                  { color: theme.colors.text },
                  titleStyle,
                ]}
              >
                {title}
              </RNText>
              {description === undefined ? null : (
                <RNText
                  nativeID={descriptionId}
                  maxFontSizeMultiplier={theme.metrics.maxFontScale}
                  style={[
                    roleTextStyle(theme, 'caption'),
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {description}
                </RNText>
              )}
            </View>
            <Pressable
              ref={closeRef}
              accessibilityRole="button"
              accessibilityLabel={resolvedCloseLabel}
              accessibilityState={{ disabled: dismissDisabled }}
              onPress={handleClosePress}
              testID={testID === undefined ? undefined : `${testID}-close`}
              {...({
                role: 'button',
                tabIndex: 0,
                'aria-disabled': dismissDisabled,
              } as unknown as Record<string, unknown>)}
              {...nativeWindProps(
                dismissDisabled ? undefined : PRESSABLE_FEEDBACK_CLASS,
              )}
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
          </View>
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
        </View>
      </WebPopover>
    </View>
  );
}
