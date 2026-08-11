/**
 * Web Combobox — an editable, fully controlled input with a listbox popup.
 *
 * DOM focus stays on the TextInput. Active-option focus is projected with
 * aria-activedescendant, while committed membership remains aria-selected.
 */
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import {
  filterComboboxItems,
  resolveComboboxSelectedItems,
} from './combobox-filter';
import type { ComboboxItem, ComboboxProps } from './combobox.types';
import { assertComboboxProps } from './combobox-validation';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
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
import type { OverlayDismissDetails } from './overlay/types';
import { WebPopover } from './overlay/web-popover.web';
import type { WebPopoverElement } from './overlay/web-popover.web';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

type Focusable = { focus?: () => void };

type WebInputElement = Focusable & {
  readonly value?: string;
  addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void;
};

type ScrollableOption = {
  scrollIntoView?: (options?: { readonly block?: 'nearest' }) => void;
};

type WebKeyboardEvent = {
  readonly key?: string | undefined;
  readonly keyCode?: number | undefined;
  readonly nativeEvent?: unknown;
  preventDefault: () => void;
};

type WebInputEvent = {
  readonly nativeEvent?: unknown;
  readonly target?: unknown;
};

type WebFocusEvent = {
  readonly relatedTarget?: unknown;
  readonly nativeEvent?: unknown;
};

type WebPointerEvent = {
  preventDefault: () => void;
};

type ActiveBoundary = 'first' | 'last';

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'stretch' as const,
    gap: theme.spacing.sm,
  },
  labelRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.xs,
  },
  label: {
    alignSelf: 'flex-start' as const,
  },
  anchorRegion: {
    alignSelf: 'stretch' as const,
    gap: theme.spacing.sm,
  },
  control: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
  },
  summary: {
    flexShrink: 1,
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.spacing.none,
  },
  clearButton: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    justifyContent: 'center' as const,
  },
  helper: {
    alignSelf: 'flex-start' as const,
  },
  content: {
    alignSelf: 'stretch' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.sm,
    padding: theme.spacing.xs,
  },
  status: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  list: {
    gap: theme.spacing.xs,
  },
  item: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
  },
  itemVisual: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  itemCopy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  retryButton: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center' as const,
    paddingHorizontal: theme.spacing.lg,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function originalEvent(event: unknown): unknown {
  if (typeof event === 'object' && event !== null && 'nativeEvent' in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

function eventRecord(event: unknown): Record<string, unknown> | null {
  return typeof event === 'object' && event !== null
    ? (event as Record<string, unknown>)
    : null;
}

function nestedEventRecord(event: unknown): Record<string, unknown> | null {
  const direct = eventRecord(event);
  return direct === null ? null : eventRecord(direct.nativeEvent);
}

function eventIsComposing(event: unknown): boolean {
  const direct = eventRecord(event);
  const nested = nestedEventRecord(event);
  return direct?.isComposing === true || nested?.isComposing === true;
}

function eventKeyCode(event: unknown): number | undefined {
  const direct = eventRecord(event);
  const nested = nestedEventRecord(event);
  const value = direct?.keyCode ?? nested?.keyCode;
  return typeof value === 'number' ? value : undefined;
}

function eventKey(event: unknown): string | undefined {
  const direct = eventRecord(event);
  const nested = nestedEventRecord(event);
  const value = direct?.key ?? nested?.key;
  return typeof value === 'string' ? value : undefined;
}

function inputEventText(event: WebInputEvent): string | null {
  const nested = nestedEventRecord(event);
  if (typeof nested?.text === 'string') return nested.text;
  const direct = eventRecord(event.target);
  return typeof direct?.value === 'string' ? direct.value : null;
}

function combineIdRefs(...values: Array<string | undefined>): string | undefined {
  const combined = values.filter((value): value is string => Boolean(value)).join(' ');
  return combined.length === 0 ? undefined : combined;
}

function fallbackGlyph(
  value: string,
  iconProps: IconRenderProps,
): ReactElement {
  return (
    <RNText
      aria-hidden
      style={[
        { fontSize: iconProps.size, lineHeight: iconProps.size },
        { color: iconProps.color },
      ]}
    >
      {value}
    </RNText>
  );
}

function controlDimensions(
  theme: Theme,
  size: NonNullable<ComboboxProps<string>['size']>,
): {
  readonly horizontalPadding: number;
  readonly gap: number;
  readonly typography: Theme['typography']['label'] | Theme['typography']['body'];
} {
  return size === 'sm'
    ? {
        horizontalPadding: theme.spacing.md,
        gap: theme.spacing.sm,
        typography: theme.typography.label,
      }
    : {
        horizontalPadding: theme.spacing.lg,
        gap: theme.spacing.md,
        typography: theme.typography.body,
      };
}

function ItemCopy({
  item,
  descriptionId,
  foreground,
  theme,
  itemLabelStyle,
  itemLabelClassName,
}: {
  readonly item: ComboboxItem<string>;
  readonly descriptionId?: string | undefined;
  readonly foreground: string;
  readonly theme: Theme;
  readonly itemLabelStyle?: StyleProp<TextStyle> | undefined;
  readonly itemLabelClassName?: string | undefined;
}): ReactElement {
  const styles = getStyles(theme);
  return (
    <View style={styles.itemCopy}>
      <RNText
        {...nativeWindProps(itemLabelClassName)}
        maxFontSizeMultiplier={theme.metrics.maxFontScale}
        style={[
          roleTextStyle(theme, 'button'),
          { color: foreground },
          itemLabelStyle,
        ]}
      >
        {item.label}
      </RNText>
      {item.description === undefined ? null : (
        <RNText
          nativeID={descriptionId}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            roleTextStyle(theme, 'caption'),
            { color: theme.colors.textMuted },
          ]}
        >
          {item.description}
        </RNText>
      )}
    </View>
  );
}

/** Editable, restricted-value Combobox for React Native Web. */
export function Combobox<const T extends string>(
  props: ComboboxProps<T>,
): ReactElement {
  assertComboboxProps(props);
  const {
    state,
    inputValue,
    onInputValueChange,
    open,
    onOpenChange,
    filter,
    filterLocale,
    label,
    accessibilityLabel,
    placeholder,
    description,
    error,
    required = false,
    disabled = false,
    clearable = true,
    openOnFocus = true,
    emptyLabel,
    noResultsLabel,
    loadingLabel,
    clearLabel,
    retryLabel,
    placement = 'bottom-start',
    direction = I18nManager.isRTL ? 'rtl' : 'ltr',
    sideOffset = 0,
    alignOffset = 0,
    collisionPadding,
    presentation = 'auto',
    size = 'md',
    labelStyle,
    labelClassName,
    controlStyle,
    controlClassName,
    inputStyle,
    inputClassName,
    summaryStyle,
    summaryClassName,
    helperStyle,
    helperClassName,
    contentStyle,
    contentClassName,
    listStyle,
    listClassName,
    itemStyle,
    itemClassName,
    itemLabelStyle,
    itemLabelClassName,
    statusStyle,
    statusClassName,
    clearButtonStyle,
    clearButtonClassName,
    style,
    className,
    testID,
  } = props;
  const inline = presentation === 'inline';
  const stack = useOptionalOverlayStack();
  if (!inline && stack === null) {
    throw new Error(
      'Combobox overlay presentations must be rendered inside OverlayProvider.',
    );
  }
  const parentId = useOverlayParentId();
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const styles = getStyles(theme);
  const dimensions = controlDimensions(theme, size);
  const reactId = sanitizeId(useId());
  const baseId = `gj-combobox-${reactId}`;
  const inputId = `${baseId}-input`;
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;
  const summaryId = `${baseId}-summary`;
  const overlayId = `${baseId}-overlay`;
  const supportText = error ?? description;
  const supportId = error !== undefined
    ? errorId
    : description !== undefined
      ? descriptionId
      : undefined;
  const accessibleName = accessibilityLabel ?? label;
  const items = state.items;
  const filteredItems = useMemo(
    () => filterComboboxItems(items, inputValue, filter, filterLocale),
    [filter, filterLocale, inputValue, items],
  );
  const selectedItems = useMemo<readonly ComboboxItem<T>[]>(() => {
    if (props.selectionMode === 'single') {
      return resolveComboboxSelectedItems(
        items,
        props.value,
        props.selectedItem,
      );
    }
    return resolveComboboxSelectedItems(
      items,
      props.value,
      props.selectedItems,
    );
  }, [items, props]);
  const selectedValues = useMemo(
    () => new Set(selectedItems.map((item) => item.value)),
    [selectedItems],
  );
  const limitReached =
    props.selectionMode === 'multiple' &&
    props.maxSelected !== undefined &&
    props.value.length >= props.maxSelected;
  const itemDisabled = useCallback((item: ComboboxItem<T>): boolean => (
    disabled ||
    item.disabled === true ||
    (limitReached && !selectedValues.has(item.value))
  ), [disabled, limitReached, selectedValues]);
  const enabledItems = useMemo(
    () => filteredItems.filter((item) => !itemDisabled(item)),
    [filteredItems, itemDisabled],
  );
  const selectionSummary = useMemo((): string | undefined => {
    if (props.selectionMode !== 'multiple' || selectedItems.length === 0) {
      return undefined;
    }
    if (props.getSelectionSummary !== undefined) {
      const summary = props.getSelectionSummary(selectedItems);
      if (typeof summary !== 'string' || summary.trim().length === 0) {
        throw new TypeError(
          'Combobox getSelectionSummary must return a non-empty string.',
        );
      }
      return summary;
    }
    const visible = selectedItems.slice(0, 2).map((item) => item.label).join(', ');
    const remaining = selectedItems.length - 2;
    return remaining > 0 ? `${visible} +${remaining}` : visible;
  }, [props, selectedItems]);

  const anchorRef = useRef<WebPopoverElement | null>(null);
  const floatingRef = useRef<WebPopoverElement | null>(null);
  const inputRef = useRef<WebInputElement | null>(null);
  const optionRefs = useRef(new Map<T, ScrollableOption>());
  const pendingBoundaryRef = useRef<ActiveBoundary | null>(null);
  const closeRequestIdRef = useRef(0);
  const closeRequestPendingRef = useRef(false);
  const wasOpenRef = useRef(false);
  const composingRef = useRef(false);
  const compositionFinalValueRef = useRef<string | null>(null);
  const [compositionActive, setCompositionActive] = useState(false);
  const [activeValue, setActiveValue] = useState<T | null>(null);
  const activeIndex = activeValue === null
    ? -1
    : filteredItems.findIndex(
        (item) => item.value === activeValue && !itemDisabled(item),
      );
  const activeItem = activeIndex < 0 ? undefined : filteredItems[activeIndex];
  const activeOptionId = activeIndex < 0
    ? undefined
    : `${baseId}-option-${activeIndex}`;

  const requestOpen = useCallback((
    details: Parameters<typeof onOpenChange>[1],
  ): void => {
    if (disabled || open) return;
    closeRequestIdRef.current += 1;
    closeRequestPendingRef.current = false;
    onOpenChange(true, details);
  }, [disabled, onOpenChange, open]);

  const requestClose = useCallback((
    details: Parameters<typeof onOpenChange>[1],
  ): boolean => {
    if (!open || closeRequestPendingRef.current) return false;
    const requestId = ++closeRequestIdRef.current;
    closeRequestPendingRef.current = true;
    onOpenChange(false, details);
    void Promise.resolve().then(() => {
      if (closeRequestIdRef.current !== requestId) return;
      closeRequestPendingRef.current = false;
    });
    return true;
  }, [onOpenChange, open]);

  const requestInput = useCallback((
    nextInputValue: string,
    reason: Parameters<typeof onInputValueChange>[1]['reason'],
    event?: unknown,
    item?: ComboboxItem<T>,
    isComposing = false,
    force = false,
  ): void => {
    if (!force && nextInputValue === inputValue) return;
    onInputValueChange(nextInputValue, {
      reason,
      previousInputValue: inputValue,
      isComposing,
      ...(item === undefined ? {} : { item }),
      ...(event === undefined ? {} : { originalEvent: event }),
    });
  }, [inputValue, onInputValueChange]);

  const restoredInputValue = props.selectionMode === 'single'
    ? (selectedItems[0]?.label ?? '')
    : '';

  const requestDismiss = useCallback((
    reason:
      | 'outside-press'
      | 'escape-key'
      | 'tab-key'
      | 'focus-out'
      | 'anchor-detached',
    event?: unknown,
  ): void => {
    if (!open || closeRequestPendingRef.current) return;
    requestInput(restoredInputValue, 'dismiss-restore', event);
    requestClose({
      reason,
      ...(event === undefined ? {} : { originalEvent: event }),
    });
  }, [open, requestClose, requestInput, restoredInputValue]);

  const setBoundary = useCallback((boundary: ActiveBoundary): void => {
    const next = boundary === 'last' ? enabledItems.at(-1) : enabledItems[0];
    setActiveValue(next?.value ?? null);
  }, [enabledItems]);

  const moveActive = useCallback((directionDelta: 1 | -1): void => {
    if (enabledItems.length === 0) return;
    const current = enabledItems.findIndex((item) => item.value === activeValue);
    if (current < 0) {
      setBoundary(directionDelta === 1 ? 'first' : 'last');
      return;
    }
    const nextIndex = Math.min(
      Math.max(current + directionDelta, 0),
      enabledItems.length - 1,
    );
    setActiveValue(enabledItems[nextIndex]?.value ?? null);
  }, [activeValue, enabledItems, setBoundary]);

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    if (!open) {
      if (activeValue !== null) setActiveValue(null);
    } else if (!compositionActive) {
      if (!wasOpen) {
        setBoundary(pendingBoundaryRef.current ?? 'first');
        pendingBoundaryRef.current = null;
      } else if (activeIndex < 0) {
        setBoundary('first');
      }
    }
    wasOpenRef.current = open;
  }, [activeIndex, activeValue, compositionActive, open, setBoundary]);

  useLayoutEffect(() => {
    if (!open || activeItem === undefined) return;
    optionRefs.current.get(activeItem.value)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeItem, open]);

  const handleLayerReady = useCallback((): void => {
    if (open) inputRef.current?.focus?.();
  }, [open]);

  const commitItem = useCallback((item: ComboboxItem<T>, event: unknown): void => {
    if (!open || itemDisabled(item)) return;
    const eventValue = originalEvent(event);
    if (props.selectionMode === 'single') {
      if (props.value !== item.value) {
        props.onValueChange(item.value, {
          selectionMode: 'single',
          reason: 'option-select',
          previousValue: props.value,
          item,
          originalEvent: eventValue,
        });
      }
      requestInput(item.label, 'option-select', eventValue, item);
      requestClose({ reason: 'option-select', item, originalEvent: eventValue });
      return;
    }

    const selected = props.value.includes(item.value);
    const nextValue = selected
      ? props.value.filter((value) => value !== item.value)
      : [...props.value, item.value];
    props.onValueChange(nextValue, {
      selectionMode: 'multiple',
      reason: selected ? 'option-remove' : 'option-select',
      previousValue: props.value,
      item,
      originalEvent: eventValue,
    });
    requestInput('', 'option-select', eventValue, item);
    inputRef.current?.focus?.();
  }, [itemDisabled, open, props, requestClose, requestInput]);

  const handleInputChange = useCallback((event: WebInputEvent): void => {
    const next = inputEventText(event);
    if (next === null) return;
    const composing = composingRef.current || eventIsComposing(event);
    if (composing && !composingRef.current) {
      composingRef.current = true;
      setCompositionActive(true);
    }
    if (!composing && compositionFinalValueRef.current === next) {
      compositionFinalValueRef.current = null;
      return;
    }
    compositionFinalValueRef.current = null;
    requestInput(next, 'input-change', originalEvent(event), undefined, composing);
    if (!open) {
      requestOpen({ reason: 'input-change', originalEvent: originalEvent(event) });
    }
  }, [open, requestInput, requestOpen]);

  const handleInputFocus = useCallback((event: unknown): void => {
    if (openOnFocus) {
      requestOpen({ reason: 'input-focus', originalEvent: originalEvent(event) });
    }
  }, [openOnFocus, requestOpen]);

  const handleInputBlur = useCallback((event: WebFocusEvent): void => {
    composingRef.current = false;
    compositionFinalValueRef.current = null;
    setCompositionActive(false);
    const relatedTarget = event.relatedTarget ?? null;
    if (
      !open ||
      (relatedTarget !== null && (
        anchorRef.current?.contains(relatedTarget) === true ||
        floatingRef.current?.contains(relatedTarget) === true
      ))
    ) {
      return;
    }
    requestDismiss('focus-out', originalEvent(event));
  }, [open, requestDismiss]);

  const handleCompositionStart = useCallback((): void => {
    composingRef.current = true;
    compositionFinalValueRef.current = null;
    setCompositionActive(true);
  }, []);

  const handleCompositionEnd = useCallback((event: unknown): void => {
    composingRef.current = false;
    setCompositionActive(false);
    const finalValue = inputEventText(event as WebInputEvent)
      ?? inputRef.current?.value
      ?? inputValue;
    compositionFinalValueRef.current = finalValue;
    requestInput(
      finalValue,
      'input-change',
      originalEvent(event),
      undefined,
      false,
      true,
    );
    void Promise.resolve().then(() => {
      if (compositionFinalValueRef.current === finalValue) {
        compositionFinalValueRef.current = null;
      }
    });
  }, [inputValue, requestInput]);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.addEventListener?.('compositionstart', handleCompositionStart);
    input.addEventListener?.('compositionend', handleCompositionEnd);
    return () => {
      input.removeEventListener?.('compositionstart', handleCompositionStart);
      input.removeEventListener?.('compositionend', handleCompositionEnd);
    };
  }, [handleCompositionEnd, handleCompositionStart]);

  const handleInputKeyDown = useCallback((event: WebKeyboardEvent): void => {
    if (
      disabled ||
      composingRef.current ||
      compositionActive ||
      eventIsComposing(event) ||
      event.keyCode === 229 ||
      eventKeyCode(event) === 229
    ) {
      return;
    }

    const key = eventKey(event);
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        pendingBoundaryRef.current = key === 'ArrowUp' ? 'last' : 'first';
        requestOpen({
          reason: 'trigger-key',
          originalEvent: originalEvent(event),
        });
      } else {
        moveActive(key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }
    if (key === 'Enter') {
      if (open && activeItem !== undefined) {
        event.preventDefault();
        commitItem(activeItem, event);
      }
      return;
    }
    if (key === 'Tab') {
      if (open) requestDismiss('tab-key', originalEvent(event));
      return;
    }
    if (key === 'Escape' && open) {
      event.preventDefault();
      requestDismiss('escape-key', originalEvent(event));
    }
  }, [
    activeItem,
    commitItem,
    compositionActive,
    disabled,
    moveActive,
    open,
    requestDismiss,
    requestOpen,
  ]);

  const handlePopoverDismiss = useCallback((details: OverlayDismissDetails): void => {
    if (details.reason !== 'outside-press' && details.reason !== 'escape-key') return;
    requestDismiss(details.reason, details.originalEvent);
  }, [requestDismiss]);

  const handleDetachedChange = useCallback((detached: boolean): void => {
    if (detached) requestDismiss('anchor-detached');
  }, [requestDismiss]);

  const handleClear = useCallback((event: unknown): void => {
    if (disabled) return;
    const eventValue = originalEvent(event);
    if (props.selectionMode === 'single') {
      if (props.value !== null) {
        props.onValueChange(null, {
          selectionMode: 'single',
          reason: 'clear-action',
          previousValue: props.value,
          originalEvent: eventValue,
        });
      }
    } else if (props.value.length > 0) {
      props.onValueChange([], {
        selectionMode: 'multiple',
        reason: 'clear-action',
        previousValue: props.value,
        originalEvent: eventValue,
      });
    }
    requestInput('', 'clear-action', eventValue);
    inputRef.current?.focus?.();
    if (!open) {
      requestOpen({ reason: 'trigger-press', originalEvent: eventValue });
    }
  }, [disabled, open, props, requestInput, requestOpen]);

  const hasSelection = props.selectionMode === 'single'
    ? props.value !== null
    : props.value.length > 0;
  const showClear = clearable && !disabled && (hasSelection || inputValue.length > 0);
  const mainStatus = state.status === 'loading'
    ? (state.statusLabel ?? loadingLabel ?? strings.loading)
    : state.status === 'error'
      ? state.statusLabel
      : state.statusLabel;
  const limitStatus = limitReached && props.selectionMode === 'multiple'
    ? props.selectionLimitLabel
    : undefined;
  const emptyStatus =
    state.status === 'ready' &&
    mainStatus === undefined &&
    filteredItems.length === 0
      ? inputValue.trim().length === 0
        ? (emptyLabel ?? strings.emptyTitle)
        : (noResultsLabel ?? strings.noResults)
      : undefined;
  const describedBy = combineIdRefs(
    supportId,
    selectionSummary === undefined ? undefined : summaryId,
  );
  const listMounted = open;
  const inputWebProps = {
    role: 'combobox',
    'aria-autocomplete': 'list',
    'aria-haspopup': 'listbox',
    'aria-expanded': open,
    ...(listMounted ? { 'aria-controls': listboxId } : {}),
    ...(listMounted && activeOptionId !== undefined
      ? { 'aria-activedescendant': activeOptionId }
      : {}),
    ...(accessibilityLabel === undefined
      ? { 'aria-labelledby': labelId }
      : { 'aria-label': accessibilityLabel }),
    ...(describedBy === undefined ? {} : { 'aria-describedby': describedBy }),
    ...(error === undefined ? {} : { 'aria-errormessage': errorId }),
    'aria-invalid': error !== undefined,
    'aria-required': required,
    'aria-disabled': disabled,
    'aria-busy': state.status === 'loading',
    autoComplete: 'off',
    onFocus: handleInputFocus,
    onBlur: handleInputBlur,
  } as const;
  const closeIcon: RenderIcon = (iconProps) =>
    renderIconSlot(icons.close, iconProps) ?? fallbackGlyph('×', iconProps);
  const checkIcon: RenderIcon = (iconProps) =>
    renderIconSlot(icons.check, iconProps) ?? fallbackGlyph('✓', iconProps);
  const fontFamily = theme.typography.fontFamily === undefined
    ? null
    : { fontFamily: theme.typography.fontFamily };

  const statusNode = (
    <>
      {mainStatus === undefined ? null : (
        <RNText
          nativeID={`${baseId}-status`}
          accessibilityLiveRegion="polite"
          {...({ role: 'status' } as unknown as Record<string, unknown>)}
          testID={testID === undefined ? undefined : `${testID}-status`}
          {...nativeWindProps(statusClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.status,
            roleTextStyle(theme, 'caption'),
            {
              color: state.status === 'error'
                ? theme.colors.danger
                : theme.colors.textMuted,
            },
            statusStyle,
          ]}
        >
          {mainStatus}
        </RNText>
      )}
      {limitStatus === undefined ? null : (
        <RNText
          accessibilityLiveRegion="polite"
          {...({ role: 'status' } as unknown as Record<string, unknown>)}
          testID={testID === undefined ? undefined : `${testID}-limit`}
          {...nativeWindProps(statusClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.status,
            roleTextStyle(theme, 'caption'),
            { color: theme.colors.warningStrong },
            statusStyle,
          ]}
        >
          {limitStatus}
        </RNText>
      )}
      {emptyStatus === undefined ? null : (
        <RNText
          accessibilityLiveRegion="polite"
          {...({ role: 'status' } as unknown as Record<string, unknown>)}
          testID={testID === undefined ? undefined : `${testID}-empty`}
          {...nativeWindProps(statusClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.status,
            roleTextStyle(theme, 'caption'),
            { color: theme.colors.textMuted },
            statusStyle,
          ]}
        >
          {emptyStatus}
        </RNText>
      )}
    </>
  );

  const listbox = (
    <View
      nativeID={listboxId}
      accessibilityLabel={accessibleName}
      {...({
        role: 'listbox',
        'aria-label': accessibleName,
        'aria-busy': state.status === 'loading',
        ...(props.selectionMode === 'multiple'
          ? { 'aria-multiselectable': true }
          : {}),
      } as unknown as Record<string, unknown>)}
      testID={testID === undefined ? undefined : `${testID}-list`}
      {...nativeWindProps(listClassName)}
      style={[styles.list, listStyle]}
    >
      {filteredItems.map((item, index) => {
        const selected = selectedValues.has(item.value);
        const blocked = itemDisabled(item);
        const active = item.value === activeValue && !blocked;
        const optionId = `${baseId}-option-${index}`;
        const optionDescriptionId = item.description === undefined
          ? undefined
          : `${optionId}-description`;
        const foreground = blocked
          ? theme.colors.textSubtle
          : selected
            ? theme.colors.primaryStrong
            : theme.colors.text;
        const optionWebProps = {
          role: 'option',
          tabIndex: -1,
          'aria-label': item.label,
          'aria-selected': selected,
          'aria-disabled': blocked,
          ...(optionDescriptionId === undefined
            ? {}
            : { 'aria-describedby': optionDescriptionId }),
          ...(active ? { 'data-active': '' } : {}),
          onPointerDown: (event: WebPointerEvent) => event.preventDefault(),
        } as const;
        return (
          <Pressable
            key={item.value}
            ref={(node) => {
              if (node === null) {
                optionRefs.current.delete(item.value);
              } else {
                optionRefs.current.set(
                  item.value,
                  node as unknown as ScrollableOption,
                );
              }
            }}
            nativeID={optionId}
            accessibilityLabel={item.label}
            accessibilityHint={item.description}
            accessibilityState={{ disabled: blocked, selected }}
            disabled={blocked}
            onHoverIn={() => setActiveValue(item.value)}
            onPress={(event) => commitItem(item, event)}
            testID={
              item.testID ??
              (testID === undefined ? undefined : `${testID}-option-${item.value}`)
            }
            {...(optionWebProps as unknown as Record<string, unknown>)}
            {...nativeWindProps(
              mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName),
            )}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor: pressed || active
                  ? theme.colors.surfaceSubtle
                  : selected
                    ? theme.colors.primarySoft
                    : theme.colors.surface,
                borderColor: active
                  ? theme.colors.primary
                  : theme.colors.surface,
                gap: dimensions.gap,
                opacity: blocked ? 0.58 : 1,
                paddingHorizontal: dimensions.horizontalPadding,
                paddingVertical: theme.spacing.sm,
              },
              itemStyle,
              { minHeight: theme.metrics.control.md },
            ]}
          >
            {item.leading === undefined ? null : (
              <View
                accessible={false}
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemVisual}
              >
                {renderIconSlot(item.leading, {
                  color: foreground,
                  size: theme.metrics.icon.md,
                })}
              </View>
            )}
            <ItemCopy
              item={item}
              descriptionId={optionDescriptionId}
              foreground={foreground}
              theme={theme}
              itemLabelStyle={itemLabelStyle}
              itemLabelClassName={itemLabelClassName}
            />
            {item.trailing === undefined ? null : (
              <View
                accessible={false}
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemVisual}
              >
                {renderIconSlot(item.trailing, {
                  color: foreground,
                  size: theme.metrics.icon.md,
                })}
              </View>
            )}
            {selected ? (
              <View
                accessible={false}
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemVisual}
              >
                {checkIcon({
                  color: blocked
                    ? theme.colors.textSubtle
                    : theme.colors.primaryStrong,
                  size: theme.metrics.icon.md,
                })}
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  const retry = state.status === 'error' && state.onRetry !== undefined ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={retryLabel ?? strings.retry}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={state.onRetry}
      testID={testID === undefined ? undefined : `${testID}-retry`}
      {...({
        onPointerDown: (event: WebPointerEvent) => event.preventDefault(),
      } as unknown as Record<string, unknown>)}
      style={({ pressed }) => [
        styles.retryButton,
        {
          backgroundColor: pressed
            ? theme.colors.surfaceSubtle
            : theme.colors.surface,
          borderColor: theme.colors.textSubtle,
          opacity: disabled ? 0.58 : 1,
        },
        { minHeight: theme.metrics.control.md },
      ]}
    >
      <RNText
        maxFontSizeMultiplier={theme.metrics.maxFontScale}
        style={[
          roleTextStyle(theme, 'button'),
          { color: theme.colors.text },
        ]}
      >
        {retryLabel ?? strings.retry}
      </RNText>
    </Pressable>
  ) : null;

  const surface = (
    <View
      testID={testID === undefined ? undefined : `${testID}-content`}
      {...nativeWindProps(contentClassName)}
      style={[
        styles.content,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.textSubtle,
          ...(inline
            ? {}
            : elevationStyle(theme.elevation.md, theme.colors.shadow)),
        },
        contentStyle,
        {
          maxHeight: 'inherit',
          maxWidth: 'inherit',
          overflowX: 'auto',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        } as unknown as ViewStyle,
      ]}
    >
      {statusNode}
      {listbox}
    </View>
  );

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      {label === undefined ? null : (
        <View style={styles.labelRow}>
          <RNText
            nativeID={labelId}
            testID={testID === undefined ? undefined : `${testID}-label`}
            {...nativeWindProps(labelClassName)}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              styles.label,
              roleTextStyle(theme, 'label'),
              { color: theme.colors.text },
              labelStyle,
            ]}
          >
            {label}
          </RNText>
          {required ? (
            <RNText
              accessible={false}
              aria-hidden
              importantForAccessibility="no-hide-descendants"
              style={[
                roleTextStyle(theme, 'label'),
                { color: theme.colors.danger },
              ]}
            >
              *
            </RNText>
          ) : null}
        </View>
      )}

      <View
        ref={(node) => {
          anchorRef.current = node as unknown as WebPopoverElement | null;
        }}
        style={styles.anchorRegion}
      >
        <View
          {...nativeWindProps(controlClassName)}
          style={[
            styles.control,
            {
              backgroundColor: theme.colors.surface,
              borderColor: error === undefined
                ? theme.colors.textSubtle
                : theme.colors.danger,
              gap: dimensions.gap,
              opacity: disabled ? 0.58 : 1,
              paddingHorizontal: dimensions.horizontalPadding,
            },
            controlStyle,
            { minHeight: theme.metrics.control.md },
          ]}
        >
          {selectionSummary === undefined ? null : (
            <RNText
              nativeID={summaryId}
              numberOfLines={1}
              testID={testID === undefined ? undefined : `${testID}-summary`}
              {...nativeWindProps(summaryClassName)}
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              style={[
                styles.summary,
                dimensions.typography,
                fontFamily,
                { color: theme.colors.text },
                summaryStyle,
                { maxWidth: '50%' },
              ]}
            >
              {selectionSummary}
            </RNText>
          )}
          <TextInput
            ref={(node) => {
              inputRef.current = node as unknown as WebInputElement | null;
            }}
            value={inputValue}
            onChange={handleInputChange as never}
            onKeyPress={handleInputKeyDown as never}
            editable={!disabled}
            nativeID={inputId}
            accessibilityLabel={accessibilityLabel}
            accessibilityLabelledBy={
              accessibilityLabel === undefined ? labelId : undefined
            }
            accessibilityHint={supportText}
            accessibilityState={{
              busy: state.status === 'loading',
              disabled,
              expanded: open,
            }}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.textSubtle}
            testID={testID === undefined ? undefined : `${testID}-input`}
            {...(inputWebProps as unknown as Record<string, unknown>)}
            {...nativeWindProps(inputClassName)}
            style={[
              styles.input,
              dimensions.typography,
              fontFamily,
              { color: theme.colors.text },
              inputStyle,
              { minHeight: theme.metrics.control.md },
            ]}
          />
          {showClear ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={clearLabel ?? strings.deselectAll}
              onPress={handleClear}
              testID={testID === undefined ? undefined : `${testID}-clear`}
              {...({
                onPointerDown: (event: WebPointerEvent) => event.preventDefault(),
              } as unknown as Record<string, unknown>)}
              {...nativeWindProps(
                mergeClassNames(PRESSABLE_FEEDBACK_CLASS, clearButtonClassName),
              )}
              style={({ pressed }) => [
                styles.clearButton,
                {
                  backgroundColor: pressed
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                },
                clearButtonStyle,
                {
                  minHeight: theme.metrics.control.md,
                  minWidth: theme.metrics.control.md,
                },
              ]}
            >
              <View
                accessible={false}
                aria-hidden
                importantForAccessibility="no-hide-descendants"
                style={styles.itemVisual}
              >
                {closeIcon({
                  color: theme.colors.textMuted,
                  size: theme.metrics.icon.md,
                })}
              </View>
            </Pressable>
          ) : null}
        </View>
        {retry}
      </View>

      {supportText === undefined ? null : (
        <RNText
          nativeID={supportId}
          accessibilityLiveRegion={error === undefined ? undefined : 'polite'}
          testID={testID === undefined ? undefined : `${testID}-helper`}
          {...nativeWindProps(helperClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.helper,
            roleTextStyle(theme, 'caption'),
            {
              color: error === undefined
                ? theme.colors.textMuted
                : theme.colors.danger,
            },
            helperStyle,
          ]}
        >
          {supportText}
        </RNText>
      )}

      {inline
        ? (open ? surface : null)
        : (
          <WebPopover
            open={open}
            overlayId={overlayId}
            overlayStack={stack as NonNullable<typeof stack>}
            parentId={parentId}
            onDismiss={handlePopoverDismiss}
            triggerRef={anchorRef}
            floatingRef={floatingRef}
            placement={placement}
            direction={direction}
            sideOffset={sideOffset}
            alignOffset={alignOffset}
            collisionInsets={collisionPadding}
            dismissible
            matchTriggerWidth
            onLayerReady={handleLayerReady}
            onDetachedChange={handleDetachedChange}
          >
            {surface}
          </WebPopover>
        )}
    </View>
  );
}
