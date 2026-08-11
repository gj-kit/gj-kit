/**
 * Web Menu — product layer over the internal HTML Popover adapter.
 *
 * This file deliberately owns menu semantics, focus, and selection policy.
 * `WebPopover` only owns top-layer positioning and topmost dismissal.
 */
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { renderIconSlot } from './icons';
import { elevationStyle, mergeClassNames, nativeWindProps, themedStyles } from './internal';
import { assertMenuProps } from './menu-select-validation';
import type { MenuItem, MenuOpenChangeDetails, MenuProps } from './menu.types';
import { useIcons, useTheme } from './provider';
import { roleTextStyle } from './text';
import { createTypeaheadState, findTypeaheadMatch } from './overlay/typeahead';
import type { OverlayDismissDetails } from './overlay/types';
import { useOptionalOverlayStack } from './overlay/provider';
import { useOverlayParentId } from './overlay/layer';
import { WebPopover } from './overlay/web-popover.web';
import type { WebPopoverElement } from './overlay/web-popover.web';

type Focusable = { focus?: () => void };

type WebKeyboardEvent = {
  readonly key: string;
  readonly ctrlKey?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly shiftKey?: boolean | undefined;
  readonly nativeEvent?: unknown;
  preventDefault: () => void;
};

type MenuDimensions = {
  readonly paddingHorizontal: number;
  readonly gap: number;
  readonly triggerTypography: Theme['typography']['button'];
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
  content: {
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  item: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
  },
  leading: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  checkboxIndicator: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    justifyContent: 'center' as const,
  },
  copy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  shortcut: {
    flexShrink: 0,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return values;
}

function isPrintableKey(event: WebKeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key === ' ') return false;
  // Array.from counts Unicode code points, unlike UTF-16 string length.
  return Array.from(event.key).length === 1;
}

function isFocusableIndex(index: number, enabledIndices: readonly number[]): boolean {
  return enabledIndices.includes(index);
}

function originalEvent(event: WebKeyboardEvent | unknown): unknown {
  if (typeof event === 'object' && event !== null && 'nativeEvent' in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

function menuDimensions(theme: Theme, size: NonNullable<MenuProps<string>['size']>): MenuDimensions {
  return size === 'sm'
    ? {
        paddingHorizontal: theme.spacing.md,
        gap: theme.spacing.sm,
        triggerTypography: theme.typography.label,
      }
    : {
        paddingHorizontal: theme.spacing.lg,
        gap: theme.spacing.md,
        triggerTypography: theme.typography.button,
      };
}

function triggerPalette(
  theme: Theme,
  variant: NonNullable<MenuProps<string>['variant']>,
  disabled: boolean,
): { readonly backgroundColor: string; readonly borderColor: string; readonly foreground: string } {
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

function itemCopy(
  item: MenuItem<string>,
  theme: Theme,
  itemLabelStyle: StyleProp<TextStyle> | undefined,
  itemLabelClassName: string | undefined,
  descriptionId: string | undefined,
  foreground: string,
): ReactNode {
  return (
    <View style={getStyles(theme).copy}>
      <RNText
        {...nativeWindProps(itemLabelClassName)}
        maxFontSizeMultiplier={theme.metrics.maxFontScale}
        style={[roleTextStyle(theme, 'button'), { color: foreground }, itemLabelStyle]}
      >
        {item.label}
      </RNText>
      {item.description === undefined ? null : (
        <RNText
          nativeID={descriptionId}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}
        >
          {item.description}
        </RNText>
      )}
    </View>
  );
}

/** Controlled, typed action/checkable menu. Web-only; native adapts separately. */
export function Menu<const T extends string>(props: MenuProps<T>): ReactElement {
  assertMenuProps(props);
  if (props.iconOnly && props.triggerIcon === undefined) {
    throw new TypeError('Menu iconOnly trigger requires triggerIcon.');
  }

  const {
    items,
    open,
    onOpenChange,
    onSelect,
    triggerLabel,
    iconOnly = false,
    triggerIcon,
    accessibilityLabel,
    disabled = false,
    busy = false,
    dismissDisabled = false,
    placement = 'bottom-start',
    direction = I18nManager.isRTL ? 'rtl' : 'ltr',
    sideOffset = 0,
    alignOffset = 0,
    collisionPadding,
    size = 'md',
    variant = 'filled',
    triggerStyle,
    triggerClassName,
    triggerLabelStyle,
    triggerLabelClassName,
    contentStyle,
    contentClassName,
    itemStyle,
    itemClassName,
    itemLabelStyle,
    itemLabelClassName,
    style,
    className,
    testID,
  } = props;
  const stack = useOptionalOverlayStack();
  if (stack === null) {
    throw new Error('Menu must be rendered inside OverlayProvider.');
  }
  const parentId = useOverlayParentId();

  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const dimensions = menuDimensions(theme, size);
  const palette = triggerPalette(theme, variant, disabled);
  const reactId = sanitizeId(useId());
  const menuId = `gj-menu-${reactId}`;
  const overlayId = `${menuId}-overlay`;
  const triggerRef = useRef<WebPopoverElement | null>(null);
  const itemRefs = useRef<Array<Focusable | null>>([]);
  const typeaheadRef = useRef(createTypeaheadState());
  const restoreTriggerRef = useRef(false);
  // Treat an initially controlled-open menu as an opening transition too.
  const wasOpenRef = useRef(false);
  const pendingOpenFocusRef = useRef<'first' | 'last' | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const enabledIndices = useMemo(
    () => items.reduce<number[]>((indices, item, index) => {
      if (!disabled && item.disabled !== true) indices.push(index);
      return indices;
    }, []),
    [disabled, items],
  );
  const fallbackIndex = enabledIndices[0] ?? -1;
  const rovingIndex =
    focusedIndex !== null && isFocusableIndex(focusedIndex, enabledIndices)
      ? focusedIndex
      : fallbackIndex;

  const requestOpenChange = useCallback(
    (nextOpen: boolean, details: MenuOpenChangeDetails<T>): void => {
      onOpenChange(nextOpen, details);
    },
    [onOpenChange],
  );

  const focusIndex = useCallback((index: number): void => {
    if (!isFocusableIndex(index, enabledIndices)) return;
    setFocusedIndex(index);
    itemRefs.current[index]?.focus?.();
  }, [enabledIndices]);

  const focusBoundary = useCallback((boundary: 'first' | 'last'): void => {
    const index = boundary === 'first' ? enabledIndices[0] : enabledIndices.at(-1);
    if (index !== undefined) focusIndex(index);
  }, [enabledIndices, focusIndex]);

  const moveFocus = useCallback((fromIndex: number, direction: 1 | -1): void => {
    if (enabledIndices.length === 0) return;
    const currentPosition = enabledIndices.indexOf(fromIndex);
    const fallbackPosition = direction === 1 ? -1 : enabledIndices.length;
    const nextPosition =
      ((currentPosition >= 0 ? currentPosition : fallbackPosition) + direction + enabledIndices.length) %
      enabledIndices.length;
    const nextIndex = enabledIndices[nextPosition];
    if (nextIndex !== undefined) focusIndex(nextIndex);
  }, [enabledIndices, focusIndex]);

  const selectItem = useCallback((index: number, event: unknown): void => {
    const item = items[index];
    if (item === undefined || disabled || busy || item.disabled) return;
    if (item.kind === 'checkbox') {
      onSelect({
        kind: 'checkbox',
        value: item.value,
        checked: item.checked === 'mixed' ? true : !item.checked,
        originalEvent: event,
      });
    } else {
      onSelect({ kind: 'action', value: item.value, originalEvent: event });
    }
    const shouldClose = item.closeOnSelect ?? (item.kind === 'action');
    if (shouldClose) {
      restoreTriggerRef.current = true;
      requestOpenChange(false, {
        reason: 'action-select',
        value: item.value,
        originalEvent: event,
      });
    }
  }, [busy, disabled, items, onSelect, requestOpenChange]);

  useLayoutEffect(() => {
    let focusRetry: ReturnType<typeof setTimeout> | null = null;
    const wasOpen = wasOpenRef.current;
    if (open && !wasOpen) {
      const boundary = pendingOpenFocusRef.current ?? 'first';
      pendingOpenFocusRef.current = null;
      const nextIndex = boundary === 'first' ? enabledIndices[0] : enabledIndices.at(-1);
      if (nextIndex !== undefined) {
        focusIndex(nextIndex);
        // Real browsers can finish the trigger's click/default focus sequence
        // after React's layout effects. Reassert once after that sequence so a
        // pointer-opened menu reliably starts on its first enabled item.
        focusRetry = setTimeout(() => {
          if (wasOpenRef.current) focusIndex(nextIndex);
        }, 0);
      }
    }
    if (!open && wasOpen && restoreTriggerRef.current) {
      restoreTriggerRef.current = false;
      (triggerRef.current as Focusable | null)?.focus?.();
    }
    if (!open) {
      typeaheadRef.current = createTypeaheadState();
      setFocusedIndex(null);
    }
    wasOpenRef.current = open;
    return () => {
      if (focusRetry !== null) clearTimeout(focusRetry);
    };
  }, [enabledIndices, focusIndex, open]);

  const handleLayerReady = useCallback((): void => {
    if (!open) return;
    const boundary = pendingOpenFocusRef.current ?? 'first';
    const nextIndex = boundary === 'first' ? enabledIndices[0] : enabledIndices.at(-1);
    if (nextIndex !== undefined) focusIndex(nextIndex);
  }, [enabledIndices, focusIndex, open]);

  const handlePopoverDismiss = useCallback((details: OverlayDismissDetails): void => {
    if (dismissDisabled) return;
    if (details.reason !== 'outside-press' && details.reason !== 'escape-key') return;
    restoreTriggerRef.current = details.reason === 'escape-key';
    requestOpenChange(false, {
      reason: details.reason,
      originalEvent: details.originalEvent,
    });
  }, [dismissDisabled, requestOpenChange]);

  const handleDetachedChange = useCallback((detached: boolean): void => {
    if (!detached || dismissDisabled) return;
    restoreTriggerRef.current = true;
    requestOpenChange(false, { reason: 'anchor-detached' });
  }, [dismissDisabled, requestOpenChange]);

  const handleTriggerPress = useCallback((event: unknown): void => {
    if (disabled || (open && dismissDisabled)) return;
    pendingOpenFocusRef.current = 'first';
    requestOpenChange(!open, { reason: 'trigger-press', originalEvent: event });
  }, [disabled, dismissDisabled, open, requestOpenChange]);

  const handleTriggerKeyDown = useCallback((event: WebKeyboardEvent): void => {
    if (disabled || open) return;
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    pendingOpenFocusRef.current = event.key === 'ArrowUp' ? 'last' : 'first';
    requestOpenChange(true, { reason: 'trigger-press', originalEvent: originalEvent(event) });
  }, [disabled, open, requestOpenChange]);

  const handleItemKeyDown = useCallback((index: number, event: WebKeyboardEvent): void => {
    const item = items[index];
    if (item === undefined || disabled || item.disabled) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(index, 1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(index, -1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      focusBoundary('first');
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      focusBoundary('last');
      return;
    }
    if (event.key === 'Tab') {
      requestOpenChange(false, {
        reason: 'tab-key',
        originalEvent: originalEvent(event),
      });
      return;
    }
    if (event.key === ' ' && item.kind === 'checkbox') {
      // RNW Pressable emulates Space only for button/menuitem roles, not for
      // menuitemcheckbox. Own this APG activation path without duplicating its
      // built-in Enter press handling.
      event.preventDefault();
      selectItem(index, originalEvent(event));
      return;
    }
    if (!isPrintableKey(event)) return;
    const result = findTypeaheadMatch({
      items: items.map((candidate) => ({
        id: candidate.value,
        textValue: candidate.textValue ?? candidate.label,
        disabled: disabled || candidate.disabled === true,
      })),
      state: typeaheadRef.current,
      input: event.key,
      now: Date.now(),
      activeId: item.value,
    });
    typeaheadRef.current = result.state;
    if (result.matchIndex >= 0) {
      event.preventDefault();
      focusIndex(result.matchIndex);
    }
  }, [disabled, focusBoundary, focusIndex, items, moveFocus, selectItem]);

  const triggerWebProps = webProps({
    role: 'button',
    tabIndex: disabled ? -1 : 0,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': menuId,
    'aria-label': triggerLabel,
    'aria-disabled': disabled,
    'aria-busy': busy,
    onKeyDown: handleTriggerKeyDown,
  });

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      <Pressable
        ref={(node) => {
          triggerRef.current = node as unknown as WebPopoverElement | null;
        }}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        accessibilityState={{ disabled, expanded: open, busy }}
        disabled={disabled}
        onPress={handleTriggerPress}
        {...(triggerWebProps as unknown as Record<string, unknown>)}
        {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, triggerClassName))}
        style={({ pressed }) => [
          styles.trigger,
          {
            minHeight: theme.metrics.control.md,
            minWidth: iconOnly ? theme.metrics.control.md : undefined,
            paddingHorizontal: dimensions.paddingHorizontal,
            gap: dimensions.gap,
            backgroundColor: pressed && !disabled ? theme.colors.surfaceSubtle : palette.backgroundColor,
            borderColor: palette.borderColor,
            opacity: disabled ? 0.58 : 1,
          },
          triggerStyle,
        ]}
      >
        {triggerIcon === undefined ? null : (
          <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.triggerIcon}>
            {renderIconSlot(triggerIcon, { color: palette.foreground, size: theme.metrics.icon.md })}
          </View>
        )}
        {iconOnly ? null : (
          <RNText
            {...nativeWindProps(triggerLabelClassName)}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              dimensions.triggerTypography,
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
        onDismiss={handlePopoverDismiss}
        triggerRef={triggerRef}
        placement={placement}
        direction={direction}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
        collisionInsets={collisionPadding}
        dismissible={!dismissDisabled}
        onLayerReady={handleLayerReady}
        onDetachedChange={handleDetachedChange}
      >
        <View
          nativeID={menuId}
          accessibilityRole="menu"
          accessibilityLabel={accessibilityLabel ?? triggerLabel}
          role="menu"
          aria-label={accessibilityLabel ?? triggerLabel}
          aria-busy={busy}
          {...nativeWindProps(contentClassName)}
          style={[
            styles.content,
            {
              maxHeight: 'inherit',
              maxWidth: 'inherit',
              minWidth: theme.metrics.control.lg * 4,
              overflowX: 'auto',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.textSubtle,
              ...elevationStyle(theme.elevation.md, theme.colors.shadow),
            } as unknown as ViewStyle,
            contentStyle,
          ]}
        >
          {items.map((item, index) => {
            const itemDisabled = disabled || item.disabled === true;
            const selected = item.kind === 'checkbox' && item.checked !== false;
            const highlighted = index === rovingIndex;
            const foreground = itemDisabled
              ? theme.colors.textSubtle
              : item.kind === 'action' && item.destructive
                ? theme.colors.danger
                : theme.colors.text;
            const descriptionId = item.description === undefined
              ? undefined
              : `${menuId}-item-${index}-description`;
            const itemWebProps = webProps({
              role: item.kind === 'checkbox' ? 'menuitemcheckbox' : 'menuitem',
              tabIndex: itemDisabled || index !== rovingIndex ? -1 : 0,
              'aria-label': item.label,
              'aria-disabled': itemDisabled,
              ...(item.kind === 'checkbox' ? { 'aria-checked': item.checked } : {}),
              ...(descriptionId === undefined ? {} : { 'aria-describedby': descriptionId }),
              onFocus: () => setFocusedIndex(index),
              onKeyDown: (event: WebKeyboardEvent) => handleItemKeyDown(index, event),
            });
            return (
              <Pressable
                key={item.value}
                ref={(node) => {
                  itemRefs.current[index] = node as unknown as Focusable | null;
                }}
                accessibilityRole={item.kind === 'checkbox' ? 'menuitem' : 'menuitem'}
                accessibilityLabel={item.label}
                accessibilityHint={item.description}
                accessibilityState={
                  item.kind === 'checkbox'
                    ? { checked: item.checked, disabled: itemDisabled }
                    : { disabled: itemDisabled }
                }
                disabled={itemDisabled}
                onPress={(event) => selectItem(index, event)}
                testID={item.testID ?? (testID === undefined ? undefined : `${testID}-item-${index}`)}
                {...(itemWebProps as unknown as Record<string, unknown>)}
                {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName))}
                style={({ pressed }) => [
                  styles.item,
                  {
                    minHeight: theme.metrics.control.md,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                    gap: theme.spacing.sm,
                    backgroundColor:
                      pressed && !itemDisabled
                        ? theme.colors.surfaceSubtle
                        : highlighted
                          ? theme.colors.primarySoft
                          : theme.colors.surface,
                    borderColor: highlighted ? theme.colors.primary : theme.colors.surface,
                    opacity: itemDisabled ? 0.52 : 1,
                  },
                  itemStyle,
                ]}
              >
                {item.kind === 'checkbox' ? (
                  <View
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                    style={[
                      styles.checkboxIndicator,
                      {
                        width: theme.metrics.icon.md,
                        height: theme.metrics.icon.md,
                        backgroundColor: selected ? theme.colors.primary : theme.colors.surfaceSubtle,
                      },
                    ]}
                  >
                    {selected
                      ? renderIconSlot(
                          item.checked === 'mixed' ? icons.minus : icons.check,
                          {
                            color: theme.colors.onPrimary,
                            size: theme.metrics.icon.sm,
                          },
                        ) ?? (
                          <RNText
                            style={[
                              roleTextStyle(theme, 'label'),
                              { color: theme.colors.onPrimary },
                            ]}
                          >
                            {item.checked === 'mixed' ? '−' : '✓'}
                          </RNText>
                        )
                      : null}
                  </View>
                ) : null}
                {item.leading === undefined ? null : (
                  <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.leading}>
                    {renderIconSlot(item.leading, { color: foreground, size: theme.metrics.icon.md })}
                  </View>
                )}
                {itemCopy(item, theme, itemLabelStyle, itemLabelClassName, descriptionId, foreground)}
                {item.shortcut === undefined ? null : (
                  <RNText
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                    style={[styles.shortcut, roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}
                  >
                    {item.shortcut}
                  </RNText>
                )}
              </Pressable>
            );
          })}
        </View>
      </WebPopover>
    </View>
  );
}
