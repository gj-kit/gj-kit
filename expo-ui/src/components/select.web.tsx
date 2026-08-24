/**
 * Web Select — controlled select-only combobox over the internal HTML Popover adapter.
 *
 * DOM focus remains on the library-owned trigger. The popup owns a provisional
 * active option through aria-activedescendant; only an explicit commit updates
 * the controlled value.
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
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { PRESSABLE_FEEDBACK_CLASS } from './button';
import { renderIconSlot } from './icons';
import type { IconRenderProps, RenderIcon } from './icons';
import {
  elevationStyle,
  mergeClassNames,
  nativeWindProps,
  themedStyles,
} from './internal';
import { assertSelectProps } from './menu-select-validation';
import { createTypeaheadState, findTypeaheadMatch } from './overlay/typeahead';
import type { OverlayDismissDetails } from './overlay/types';
import { useOptionalOverlayStack } from './overlay/provider';
import { useOverlayParentId } from './overlay/layer';
import { WebPopover } from './overlay/web-popover.web';
import type { WebPopoverElement } from './overlay/web-popover.web';
import { useIcons, useTheme } from './provider';
import type {
  SelectItem,
  SelectOpenChangeDetails,
  SelectProps,
} from './select.types';
import { roleTextStyle } from './text';
import {
  assertRenderTriggerRefAttached,
  assertRenderTriggerWebWiringAttached,
} from './trigger-render';
import type { TriggerRenderProps } from './trigger-render';

type Focusable = { focus?: () => void };

/** Narrow DOM bridge; src intentionally compiles without lib.dom. */
type ScrollableOption = {
  scrollIntoView?: (options?: { readonly block?: 'nearest' }) => void;
};

type WebKeyboardEvent = {
  readonly key: string;
  readonly ctrlKey?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly nativeEvent?: unknown;
  preventDefault: () => void;
};

type WebPointerEvent = {
  preventDefault: () => void;
};

type WebFocusEvent = {
  readonly relatedTarget?: unknown;
};

type ActiveBoundary = 'selected' | 'first' | 'last';

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'stretch' as const,
    gap: theme.spacing.sm,
  },
  label: {
    alignSelf: 'flex-start' as const,
  },
  labelRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.xs,
  },
  trigger: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
  },
  triggerLeading: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  value: {
    flex: 1,
    flexShrink: 1,
  },
  chevron: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  helper: {
    alignSelf: 'flex-start' as const,
  },
  content: {
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  option: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row' as const,
  },
  optionLeading: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
  optionCopy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  check: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    pointerEvents: 'none' as const,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function originalEvent(event: WebKeyboardEvent | unknown): unknown {
  if (typeof event === 'object' && event !== null && 'nativeEvent' in event) {
    return (event as { readonly nativeEvent?: unknown }).nativeEvent ?? event;
  }
  return event;
}

function isPrintableKey(event: WebKeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey || event.key === ' ') return false;
  return Array.from(event.key).length === 1;
}

function itemIndexByValue<T extends string>(
  items: readonly SelectItem<T>[],
  value: T | null,
): number {
  if (value === null) return -1;
  return items.findIndex((item) => item.value === value);
}

function containsIndex(indices: readonly number[], index: number): boolean {
  return indices.includes(index);
}

function fallbackGlyph(
  value: string,
  iconProps: IconRenderProps,
): ReactElement {
  return (
    <RNText
      aria-hidden
      style={[roleTextStyleFromIcon(iconProps), { color: iconProps.color }]}
    >
      {value}
    </RNText>
  );
}

/** Glyph size comes from the icon metric rather than a design literal. */
function roleTextStyleFromIcon(iconProps: IconRenderProps): TextStyle {
  return { fontSize: iconProps.size, lineHeight: iconProps.size };
}

function triggerDimensions(
  theme: Theme,
  size: NonNullable<SelectProps<string>['size']>,
): {
  readonly horizontalPadding: number;
  readonly gap: number;
  readonly typography: Theme['typography']['label'] | Theme['typography']['button'];
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
        typography: theme.typography.button,
      };
}

function OptionCopy({
  item,
  descriptionId,
  foreground,
  theme,
  itemLabelStyle,
  itemLabelClassName,
}: {
  readonly item: SelectItem<string>;
  readonly descriptionId?: string | undefined;
  readonly foreground: string;
  readonly theme: Theme;
  readonly itemLabelStyle?: StyleProp<TextStyle> | undefined;
  readonly itemLabelClassName?: string | undefined;
}): ReactElement {
  const styles = getStyles(theme);
  return (
    <View style={styles.optionCopy}>
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

/** Controlled select-only combobox. Web-only; native adapts with a modal surface. */
export function Select<const T extends string>(
  props: SelectProps<T>,
): ReactElement {
  assertSelectProps(props);
  const stack = useOptionalOverlayStack();
  if (stack === null) {
    // 우아한 폴백을 두지 않는 이유: WebPopover의 outside-press/Escape 소유권
    // 프로토콜이 stack의 topmost 판정에 의존한다 — stack 없이는 어느 레이어가
    // 이벤트를 소비할지 결정할 수 없어 중첩 overlay 정합성이 깨진다.
    throw new Error(
      "Select requires the overlay dismissal stack that coordinates stacked overlays (topmost-first Escape/outside-press ownership). Wrap the app — or the test render — in <UiProvider> from '@gj-kit/expo-ui', which creates the overlay scope automatically, or in an explicit <OverlayProvider>.",
    );
  }
  const parentId = useOverlayParentId();

  const {
    items,
    value,
    onValueChange,
    open,
    onOpenChange,
    label,
    accessibilityLabel,
    placeholder,
    description,
    error,
    required = false,
    disabled = false,
    busy = false,
    dismissDisabled = false,
    placement = 'bottom-start',
    direction = I18nManager.isRTL ? 'rtl' : 'ltr',
    sideOffset = 0,
    alignOffset = 0,
    collisionPadding,
    size = 'md',
    leading,
    renderTrigger,
    triggerTestID,
    triggerHoverStyle,
    itemHoverStyle,
    labelStyle,
    labelClassName,
    triggerStyle,
    triggerClassName,
    valueStyle,
    valueClassName,
    helperStyle,
    helperClassName,
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
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const dimensions = triggerDimensions(theme, size);
  const reactId = sanitizeId(useId());
  const baseId = `gj-select-${reactId}`;
  const triggerId = `${baseId}-trigger`;
  const labelId = `${baseId}-label`;
  const listboxId = `${baseId}-listbox`;
  const descriptionId = `${baseId}-description`;
  const errorId = `${baseId}-error`;
  const overlayId = `${baseId}-overlay`;
  const supportText = error ?? description;
  const supportId = error !== undefined
    ? errorId
    : description !== undefined
      ? descriptionId
      : undefined;
  const accessibleName = accessibilityLabel ?? label;
  const selectedIndex = itemIndexByValue(items, value);
  const selectedItem = selectedIndex < 0 ? undefined : items[selectedIndex];
  const triggerValue = selectedItem?.label ?? placeholder;
  const triggerLeading = leading ?? selectedItem?.leading;
  const triggerRef = useRef<WebPopoverElement | null>(null);
  const floatingRef = useRef<WebPopoverElement | null>(null);
  const optionRefs = useRef<Array<ScrollableOption | null>>([]);
  const typeaheadRef = useRef(createTypeaheadState());
  const pendingBoundaryRef = useRef<ActiveBoundary | null>(null);
  const closeRequestIdRef = useRef(0);
  const closeRequestPendingRef = useRef(false);
  // RNW PressResponder synthesizes onPress on keyboard keyup. Enter/Space are
  // handled on keydown below, so the generated second activation is consumed.
  const suppressKeyboardPressRef = useRef(false);
  const wasOpenRef = useRef(false);
  const previousValueRef = useRef<T | null>(value);
  const enabledIndices = useMemo(
    () => items.reduce<number[]>((indices, item, index) => {
      if (!disabled && !busy && item.disabled !== true) indices.push(index);
      return indices;
    }, []),
    [busy, disabled, items],
  );
  const selectedEnabled = containsIndex(enabledIndices, selectedIndex);

  const initialActiveValue = (): T | null => {
    if (selectedEnabled && selectedItem !== undefined) return selectedItem.value;
    const first = enabledIndices[0];
    return first === undefined ? null : (items[first]?.value ?? null);
  };
  const [activeValue, setActiveValue] = useState<T | null>(() =>
    open ? initialActiveValue() : null,
  );
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
  const activeIndexCandidate = itemIndexByValue(items, activeValue);
  const activeIndex = containsIndex(enabledIndices, activeIndexCandidate)
    ? activeIndexCandidate
    : -1;
  const activeOptionId = activeIndex < 0
    ? undefined
    : `${baseId}-option-${activeIndex}`;

  const resolveBoundary = useCallback((boundary: ActiveBoundary): T | null => {
    if (boundary === 'selected' && selectedEnabled && selectedItem !== undefined) {
      return selectedItem.value;
    }
    const index = boundary === 'last' ? enabledIndices.at(-1) : enabledIndices[0];
    return index === undefined ? null : (items[index]?.value ?? null);
  }, [enabledIndices, items, selectedEnabled, selectedItem]);

  const requestOpenChange = useCallback((
    nextOpen: boolean,
    details: SelectOpenChangeDetails<T>,
  ): void => {
    onOpenChange(nextOpen, details);
  }, [onOpenChange]);

  const requestClose = useCallback((
    details: SelectOpenChangeDetails<T>,
    restoreFocus: boolean,
  ): void => {
    if (closeRequestPendingRef.current) return;
    const requestId = ++closeRequestIdRef.current;
    closeRequestPendingRef.current = true;
    // A controlled parent may acknowledge this request asynchronously. Restore
    // now so its timing cannot race a later render or leak into another close.
    if (restoreFocus) {
      (triggerRef.current as Focusable | null)?.focus?.();
    }
    requestOpenChange(false, details);
    // Let a parent refuse the request without blocking a later dismissal. Focus
    // restoration has already been fulfilled and carries no deferred state.
    void Promise.resolve().then(() => {
      if (closeRequestIdRef.current !== requestId) return;
      closeRequestPendingRef.current = false;
    });
  }, [requestOpenChange, triggerRef]);

  const focusTrigger = useCallback((): void => {
    (triggerRef.current as Focusable | null)?.focus?.();
  }, []);

  const setActiveIndex = useCallback((index: number): void => {
    if (!containsIndex(enabledIndices, index)) return;
    const item = items[index];
    if (item !== undefined) setActiveValue(item.value);
  }, [enabledIndices, items]);

  const moveActive = useCallback((direction: 1 | -1): void => {
    if (enabledIndices.length === 0) return;
    const currentPosition = enabledIndices.indexOf(activeIndex);
    if (currentPosition < 0) {
      const fallback = direction === 1 ? enabledIndices[0] : enabledIndices.at(-1);
      if (fallback !== undefined) setActiveIndex(fallback);
      return;
    }
    const nextPosition = Math.min(
      Math.max(currentPosition + direction, 0),
      enabledIndices.length - 1,
    );
    const nextIndex = enabledIndices[nextPosition];
    if (nextIndex !== undefined) setActiveIndex(nextIndex);
  }, [activeIndex, enabledIndices, setActiveIndex]);

  const commitIndex = useCallback((
    index: number,
    event: unknown,
    restoreFocus: boolean,
    closeReason: 'option-select' | 'tab-key' = 'option-select',
  ): void => {
    const item = items[index];
    if (
      item === undefined ||
      disabled ||
      busy ||
      item.disabled === true ||
      !open
    ) {
      return;
    }
    if (item.value !== value) onValueChange(item.value);
    requestClose({
      reason: closeReason,
      value: item.value,
      originalEvent: event,
    }, restoreFocus);
  }, [busy, disabled, items, onValueChange, open, requestClose, value]);

  useLayoutEffect(() => {
    const wasOpen = wasOpenRef.current;
    const valueChanged = previousValueRef.current !== value;
    if (!open) {
      if (activeValue !== null) setActiveValue(null);
      typeaheadRef.current = createTypeaheadState();
      // 닫힌 사이 hover-out 이벤트가 오지 않으므로 재오픈 시 stale hover를 남기지 않는다.
      setHoveredItemIndex(null);
    } else {
      let next = activeValue;
      if (!wasOpen) {
        next = resolveBoundary(pendingBoundaryRef.current ?? 'selected');
        pendingBoundaryRef.current = null;
      } else if (valueChanged) {
        next = resolveBoundary('selected');
      } else if (activeIndex < 0) {
        next = resolveBoundary('selected');
      }
      if (next !== activeValue) setActiveValue(next);
    }
    wasOpenRef.current = open;
    previousValueRef.current = value;
  }, [activeIndex, activeValue, focusTrigger, open, resolveBoundary, value]);

  const handleLayerReady = useCallback((): void => {
    if (open) focusTrigger();
  }, [focusTrigger, open]);

  useLayoutEffect(() => {
    if (!open || activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, open]);

  const handlePopoverDismiss = useCallback((details: OverlayDismissDetails): void => {
    if (dismissDisabled) return;
    if (details.reason !== 'outside-press' && details.reason !== 'escape-key') return;
    // Pointer dismissal must not steal focus from the element the user chose.
    requestClose({
      reason: details.reason,
      originalEvent: details.originalEvent,
    }, details.reason === 'escape-key');
  }, [dismissDisabled, requestClose]);

  const handleDetachedChange = useCallback((detached: boolean): void => {
    if (!detached || dismissDisabled) return;
    requestClose({ reason: 'anchor-detached' }, false);
  }, [dismissDisabled, requestClose]);

  const requestTriggerToggle = useCallback((
    event: unknown,
    boundary: ActiveBoundary,
  ): void => {
    if (disabled || (open && dismissDisabled)) return;
    if (!open) {
      // A rapid reopen starts a new interaction cycle. Invalidate cleanup from
      // the prior close request before it can affect this open popup.
      closeRequestIdRef.current += 1;
      closeRequestPendingRef.current = false;
      pendingBoundaryRef.current = boundary;
    }
    requestOpenChange(!open, {
      reason: 'trigger-press',
      originalEvent: event,
    });
  }, [disabled, dismissDisabled, open, requestOpenChange]);

  const handleTriggerPress = useCallback((event: unknown): void => {
    if (suppressKeyboardPressRef.current) {
      suppressKeyboardPressRef.current = false;
      return;
    }
    requestTriggerToggle(event, 'selected');
  }, [requestTriggerToggle]);

  const handleTriggerKeyUp = useCallback((event: WebKeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    // Keep the flag through the whole keyup propagation. PressResponder's
    // generated onPress may run before or after this user handler.
    void Promise.resolve().then(() => {
      suppressKeyboardPressRef.current = false;
    });
  }, []);

  const handleTriggerBlur = useCallback((event: WebFocusEvent): void => {
    // A key sequence can be interrupted before keyup (window switch, pointer
    // focus change). Never let that stale guard consume a later pointer press.
    suppressKeyboardPressRef.current = false;
    const relatedTarget = event.relatedTarget ?? null;
    if (
      !open ||
      (relatedTarget !== null && (
        triggerRef.current?.contains(relatedTarget) === true ||
        floatingRef.current?.contains(relatedTarget) === true
      ))
    ) {
      return;
    }
    // A non-modal popup must never trap Tab or programmatic/AT focus outside,
    // even when pointer/Escape dismissal is intentionally vetoed.
    requestClose({ reason: 'focus-out' }, false);
  }, [open, requestClose]);

  const handleTriggerKeyDown = useCallback((event: WebKeyboardEvent): void => {
    if (disabled) return;
    if (!open) {
      if (
        event.key !== 'ArrowDown' &&
        event.key !== 'ArrowUp' &&
        event.key !== 'Enter' &&
        event.key !== ' '
      ) {
        return;
      }
      event.preventDefault();
      if (event.key === 'Enter' || event.key === ' ') {
        suppressKeyboardPressRef.current = true;
      }
      closeRequestIdRef.current += 1;
      closeRequestPendingRef.current = false;
      const boundary: ActiveBoundary = event.key === 'ArrowUp'
        ? 'last'
        : event.key === 'ArrowDown'
          ? 'first'
          : 'selected';
      pendingBoundaryRef.current = boundary;
      requestOpenChange(true, {
        reason: 'trigger-key',
        originalEvent: originalEvent(event),
      });
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      const first = enabledIndices[0];
      if (first !== undefined) setActiveIndex(first);
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      const last = enabledIndices.at(-1);
      if (last !== undefined) setActiveIndex(last);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      suppressKeyboardPressRef.current = true;
      if (activeIndex >= 0) {
        commitIndex(activeIndex, originalEvent(event), true);
      }
      return;
    }
    if (event.key === 'Tab') {
      if (!busy && activeIndex >= 0) {
        // Do not restore focus: the browser must complete its natural Tab move.
        commitIndex(activeIndex, originalEvent(event), false, 'tab-key');
      } else {
        requestClose({
          reason: 'tab-key',
          originalEvent: originalEvent(event),
        }, false);
      }
      return;
    }
    if (!isPrintableKey(event)) return;
    const result = findTypeaheadMatch({
      items: items.map((item) => ({
        id: item.value,
        textValue: item.textValue ?? item.label,
        disabled: disabled || busy || item.disabled === true,
      })),
      state: typeaheadRef.current,
      input: event.key,
      now: Date.now(),
      activeId: activeValue,
    });
    typeaheadRef.current = result.state;
    if (result.matchIndex >= 0) {
      event.preventDefault();
      setActiveIndex(result.matchIndex);
    }
  }, [
    activeIndex,
    activeValue,
    busy,
    commitIndex,
    disabled,
    dismissDisabled,
    enabledIndices,
    items,
    moveActive,
    open,
    requestClose,
    setActiveIndex,
  ]);

  const triggerWebProps = {
    role: 'combobox',
    tabIndex: disabled ? -1 : 0,
    'aria-haspopup': 'listbox',
    'aria-expanded': open,
    'aria-controls': listboxId,
    ...(activeOptionId === undefined || !open
      ? {}
      : { 'aria-activedescendant': activeOptionId }),
    ...(accessibilityLabel === undefined
      ? { 'aria-labelledby': labelId }
      : { 'aria-label': accessibilityLabel }),
    ...(supportId === undefined ? {} : { 'aria-describedby': supportId }),
    ...(error === undefined ? {} : { 'aria-errormessage': errorId }),
    'aria-invalid': error !== undefined,
    'aria-required': required,
    'aria-disabled': disabled,
    'aria-busy': busy,
    onKeyDown: handleTriggerKeyDown,
    onKeyUp: handleTriggerKeyUp,
    onBlur: handleTriggerBlur,
  } as const;

  const setTriggerNode = useCallback((node: unknown): void => {
    triggerRef.current = node as WebPopoverElement | null;
  }, []);
  const hasRenderTrigger = renderTrigger !== undefined;
  useLayoutEffect(() => {
    if (!open || !hasRenderTrigger) return;
    // renderTrigger 계약 강제: 주입 ref가 open 전에 붙지 않았으면 조용한
    // 앵커링/포커스 복원 실패 대신 즉시 실패한다.
    assertRenderTriggerRefAttached('Select', triggerRef.current);
    // 같은 커밋이 aria-expanded="true"를 썼다 — 주입 combobox 배선이 ref가
    // 붙은 그 노드에 실제로 도달했는지도 검증한다(부분 spread·래퍼 파킹이
    // role/이름/expanded를 조용히 잃는 것을 시끄럽게 만든다).
    assertRenderTriggerWebWiringAttached('Select', triggerRef.current, 'combobox');
  }, [hasRenderTrigger, open]);
  // 주입 계약: 선언된 키에 더해 combobox aria 배선·키보드/blur 핸들러를
  // 런타임 키로 싣는다. 접근 가능한 이름은 항상 구체 문자열로 주입한다.
  const injectedTriggerProps = {
    ref: setTriggerNode,
    onPress: handleTriggerPress,
    disabled,
    accessibilityRole: 'combobox',
    // assertSelectProps가 label 또는 accessibilityLabel의 존재를 보장한다.
    accessibilityLabel: accessibleName as string,
    accessibilityHint: supportText,
    accessibilityValue: { text: triggerValue },
    accessibilityState: { disabled, expanded: open, busy },
    testID:
      triggerTestID ?? (testID === undefined ? undefined : `${testID}-trigger`),
    nativeID: triggerId,
    ...triggerWebProps,
    // 주입 이름이 항상 구체 문자열이므로 labelledby 대신 aria-label로 고정한다.
    ...(accessibilityLabel === undefined
      ? { 'aria-labelledby': undefined, 'aria-label': accessibleName }
      : {}),
  } as unknown as TriggerRenderProps;

  const chevronIcon: RenderIcon = (iconProps) =>
    renderIconSlot(icons.chevronDown, iconProps) ?? fallbackGlyph('⌄', iconProps);
  const checkIcon: RenderIcon = (iconProps) =>
    renderIconSlot(icons.check, iconProps) ?? fallbackGlyph('✓', iconProps);
  const fontFamily = theme.typography.fontFamily === undefined
    ? null
    : { fontFamily: theme.typography.fontFamily };

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

      {renderTrigger !== undefined
        ? renderTrigger(injectedTriggerProps)
        : (
      <Pressable
        ref={(node) => {
          triggerRef.current = node as unknown as WebPopoverElement | null;
        }}
        nativeID={triggerId}
        accessibilityRole="combobox"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={supportText}
        accessibilityValue={{ text: triggerValue }}
        accessibilityState={{ disabled, expanded: open, busy }}
        disabled={disabled}
        onPress={handleTriggerPress}
        onHoverIn={
          triggerHoverStyle === undefined ? undefined : () => setTriggerHovered(true)
        }
        onHoverOut={
          triggerHoverStyle === undefined ? undefined : () => setTriggerHovered(false)
        }
        testID={
          triggerTestID ??
          (testID === undefined ? undefined : `${testID}-trigger`)
        }
        {...(triggerWebProps as unknown as Record<string, unknown>)}
        {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, triggerClassName))}
        style={({ pressed }) => [
          styles.trigger,
          {
            minHeight: theme.metrics.control.md,
            paddingHorizontal: dimensions.horizontalPadding,
            gap: dimensions.gap,
            backgroundColor:
              pressed && !disabled
                ? theme.colors.surfaceSubtle
                : theme.colors.surface,
            borderColor:
              error !== undefined
                ? theme.colors.danger
                : theme.colors.textSubtle,
            opacity: disabled ? 0.58 : 1,
          },
          triggerStyle,
          !disabled && triggerHovered && triggerHoverStyle !== undefined
            ? triggerHoverStyle
            : null,
        ]}
      >
        {triggerLeading === undefined ? null : (
          <View
            accessible={false}
            aria-hidden
            importantForAccessibility="no-hide-descendants"
            style={styles.triggerLeading}
          >
            {renderIconSlot(triggerLeading, {
              color: disabled ? theme.colors.textSubtle : theme.colors.text,
              size: theme.metrics.icon.md,
            })}
          </View>
        )}
        <RNText
          {...nativeWindProps(valueClassName)}
          numberOfLines={1}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.value,
            dimensions.typography,
            fontFamily,
            {
              color: disabled
                ? theme.colors.textSubtle
                : selectedItem === undefined
                  ? theme.colors.textMuted
                  : theme.colors.text,
            },
            valueStyle,
          ]}
        >
          {triggerValue}
        </RNText>
        <View
          accessible={false}
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.chevron}
        >
          {chevronIcon({
            color: disabled ? theme.colors.textSubtle : theme.colors.textMuted,
            size: theme.metrics.icon.md,
          })}
        </View>
      </Pressable>
        )}

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

      <WebPopover
        open={open}
        overlayId={overlayId}
        overlayStack={stack}
        parentId={parentId}
        onDismiss={handlePopoverDismiss}
        triggerRef={triggerRef}
        floatingRef={floatingRef}
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
          nativeID={listboxId}
          accessibilityLabel={accessibleName}
          {...({
            role: 'listbox',
            'aria-label': accessibleName,
            'aria-busy': busy,
          } as unknown as Record<string, unknown>)}
          testID={testID === undefined ? undefined : `${testID}-content`}
          {...nativeWindProps(contentClassName)}
          style={[
            styles.content,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.textSubtle,
              maxHeight: 'inherit',
              maxWidth: 'inherit',
              overflowX: 'auto',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              ...elevationStyle(theme.elevation.md, theme.colors.shadow),
            } as unknown as ViewStyle,
            contentStyle,
          ]}
        >
          {items.map((item, index) => {
            const itemDisabled = disabled || busy || item.disabled === true;
            const selected = item.value === value;
            const active = index === activeIndex;
            const optionId = `${baseId}-option-${index}`;
            const optionDescriptionId = item.description === undefined
              ? undefined
              : `${optionId}-description`;
            const foreground = itemDisabled
              ? theme.colors.textSubtle
              : selected
                ? theme.colors.primaryStrong
                : theme.colors.text;
            const optionWebProps = {
              role: 'option',
              tabIndex: -1,
              'aria-label': item.label,
              'aria-selected': selected,
              'aria-disabled': itemDisabled,
              ...(optionDescriptionId === undefined
                ? {}
                : { 'aria-describedby': optionDescriptionId }),
              'data-active': active ? '' : undefined,
              onPointerDown: (event: WebPointerEvent) => event.preventDefault(),
            } as const;
            return (
              <Pressable
                key={item.value}
                ref={(node) => {
                  optionRefs.current[index] = node as unknown as ScrollableOption | null;
                }}
                nativeID={optionId}
                accessibilityLabel={item.label}
                accessibilityHint={item.description}
                accessibilityState={{ selected, disabled: itemDisabled }}
                disabled={itemDisabled}
                onPress={(event) => commitIndex(index, event, true)}
                onHoverIn={
                  itemHoverStyle === undefined
                    ? undefined
                    : () => setHoveredItemIndex(index)
                }
                onHoverOut={
                  itemHoverStyle === undefined
                    ? undefined
                    : () =>
                        setHoveredItemIndex((current) =>
                          current === index ? null : current,
                        )
                }
                testID={
                  item.testID ??
                  (testID === undefined ? undefined : `${testID}-item-${index}`)
                }
                {...(optionWebProps as unknown as Record<string, unknown>)}
                {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName))}
                style={({ pressed }) => [
                  styles.option,
                  {
                    minHeight: theme.metrics.control.md,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.sm,
                    gap: theme.spacing.sm,
                    backgroundColor:
                      pressed && !itemDisabled
                        ? theme.colors.surfaceSubtle
                        : active
                          ? theme.colors.primarySoft
                          : theme.colors.surface,
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.surface,
                    opacity: itemDisabled ? 0.52 : 1,
                  },
                  itemStyle,
                  !itemDisabled &&
                  hoveredItemIndex === index &&
                  itemHoverStyle !== undefined
                    ? itemHoverStyle
                    : null,
                ]}
              >
                {item.leading === undefined ? null : (
                  <View
                    accessible={false}
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.optionLeading}
                  >
                    {renderIconSlot(item.leading, {
                      color: foreground,
                      size: theme.metrics.icon.md,
                    })}
                  </View>
                )}
                <OptionCopy
                  item={item}
                  descriptionId={optionDescriptionId}
                  foreground={foreground}
                  theme={theme}
                  itemLabelStyle={itemLabelStyle}
                  itemLabelClassName={itemLabelClassName}
                />
                {selected ? (
                  <View
                    accessible={false}
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                    style={styles.check}
                  >
                    {checkIcon({
                      color: theme.colors.primary,
                      size: theme.metrics.icon.md,
                    })}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </WebPopover>
    </View>
  );
}
