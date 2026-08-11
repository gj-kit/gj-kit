import { useCallback, useId, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from "react-native";
import type {
  FocusEvent,
  GestureResponderEvent,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import type { Theme } from "../theme/tokens";
import { PRESSABLE_FEEDBACK_CLASS } from "./button";
import {
  filterComboboxItems,
  resolveComboboxSelectedItems,
} from "./combobox-filter";
import { NativeComboboxSheet } from "./combobox-native-sheet";
import type {
  NativeComboboxSheetDismissDetails,
  NativeComboboxSheetPresentation,
} from "./combobox-native-sheet";
import type {
  ComboboxInputValueChangeReason,
  ComboboxItem,
  ComboboxOpenChangeReason,
  ComboboxProps,
} from "./combobox.types";
import { assertComboboxProps } from "./combobox-validation";
import type { DialogFocusRef } from "./dialog";
import { renderIconSlot } from "./icons";
import {
  mergeClassNames,
  nativeWindProps,
  themedStyles,
} from "./internal";
import { useIcons, useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    gap: theme.spacing.sm,
    width: "100%" as const,
  },
  label: {
    flexShrink: 1,
  },
  control: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    width: "100%" as const,
  },
  summary: {
    flex: 1,
    flexShrink: 1,
    minWidth: theme.spacing.none,
  },
  decorative: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    pointerEvents: "none" as const,
  },
  searchControl: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    width: "100%" as const,
  },
  input: {
    flex: 1,
    minWidth: theme.spacing.none,
    paddingVertical: theme.spacing.none,
  },
  inlineContent: {
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    gap: theme.spacing.md,
    minHeight: theme.spacing.none,
    overflow: "hidden" as const,
    padding: theme.spacing.md,
    width: "100%" as const,
  },
  list: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  listContent: {
    gap: theme.spacing.sm,
  },
  optionGroup: {
    gap: theme.spacing.sm,
  },
  item: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    width: "100%" as const,
  },
  indicator: {
    alignItems: "center" as const,
    borderWidth: StyleSheet.hairlineWidth,
    height: theme.metrics.icon.md,
    justifyContent: "center" as const,
    width: theme.metrics.icon.md,
  },
  radioIndicator: {
    borderRadius: theme.radius.pill,
  },
  checkboxIndicator: {
    borderRadius: theme.radius.sm,
  },
  radioDot: {
    borderRadius: theme.radius.pill,
    height: theme.metrics.icon.sm,
    width: theme.metrics.icon.sm,
  },
  itemCopy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.xs,
    minWidth: theme.spacing.none,
  },
  status: {
    flexShrink: 0,
  },
  actions: {
    flexShrink: 0,
    gap: theme.spacing.sm,
  },
  action: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center" as const,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    width: "100%" as const,
  },
  helper: {
    flexShrink: 1,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function eventValue(
  event:
    | GestureResponderEvent
    | FocusEvent
    | undefined,
): unknown {
  return event?.nativeEvent;
}

function definedOriginalEvent(originalEvent: unknown):
  | { readonly originalEvent: unknown }
  | Record<string, never> {
  return originalEvent === undefined ? {} : { originalEvent };
}

function assertSelectionSummary(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      "Combobox getSelectionSummary must return a non-empty string.",
    );
  }
}

function buildMultipleSummary<T extends string>(
  items: readonly ComboboxItem<T>[],
  placeholder: string,
  getSelectionSummary:
    | ((items: readonly ComboboxItem<T>[]) => string)
    | undefined,
): string {
  if (items.length === 0) return placeholder;
  if (getSelectionSummary !== undefined) {
    const summary = getSelectionSummary(items);
    assertSelectionSummary(summary);
    return summary;
  }
  const visibleLabels = items.slice(0, 2).map((item) => item.label).join(", ");
  return items.length > 2
    ? `${visibleLabels} +${items.length - 2}`
    : visibleLabels;
}

function targetInvariantStyle(
  style: StyleProp<ViewStyle> | undefined,
  target: number,
): ViewStyle {
  const flattened = StyleSheet.flatten(style) ?? {};
  const { minHeight, minWidth, maxHeight, maxWidth, ...safeStyle } = flattened;
  return {
    ...safeStyle,
    minHeight:
      typeof minHeight === "number" ? Math.max(target, minHeight) : target,
    minWidth:
      typeof minWidth === "number" ? Math.max(target, minWidth) : target,
    ...(typeof maxHeight === "number"
      ? { maxHeight: Math.max(target, maxHeight) }
      : {}),
    ...(typeof maxWidth === "number"
      ? { maxWidth: Math.max(target, maxWidth) }
      : {}),
  };
}

interface OptionRowsProps<T extends string> {
  readonly props: ComboboxProps<T>;
  readonly items: readonly ComboboxItem<T>[];
  readonly selectedValues: ReadonlySet<T>;
  readonly atLimit: boolean;
  readonly onSelect: (
    item: ComboboxItem<T>,
    event: GestureResponderEvent,
  ) => void;
  readonly targetHeight: number;
}

function OptionRows<T extends string>({
  props,
  items,
  selectedValues,
  atLimit,
  onSelect,
  targetHeight,
}: OptionRowsProps<T>): ReactElement {
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const multiple = props.selectionMode === "multiple";
  const busy = props.state.status === "loading";
  const safeItemStyle = targetInvariantStyle(props.itemStyle, targetHeight);

  return (
    <View
      accessibilityRole={multiple ? undefined : "radiogroup"}
      accessibilityLabel={props.accessibilityLabel ?? props.label}
      accessibilityState={{ busy }}
      style={styles.optionGroup}
    >
      {items.map((item) => {
        const checked = selectedValues.has(item.value);
        const itemDisabled =
          props.disabled === true ||
          item.disabled === true ||
          (multiple && atLimit && !checked);
        const foreground = itemDisabled
          ? theme.colors.textSubtle
          : theme.colors.text;
        const selectionForeground = checked
          ? theme.colors.onPrimary
          : theme.colors.textMuted;

        return (
          <Pressable
            key={item.value}
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityLabel={item.label}
            accessibilityHint={item.description}
            accessibilityState={{
              busy,
              checked,
              disabled: itemDisabled,
            }}
            aria-checked={checked}
            disabled={itemDisabled}
            onPress={(event) => onSelect(item, event)}
            testID={
              item.testID ??
              (props.testID === undefined
                ? undefined
                : `${props.testID}-option-${item.value}`)
            }
            {...nativeWindProps(
              mergeClassNames(PRESSABLE_FEEDBACK_CLASS, props.itemClassName),
            )}
            style={({ pressed }) => [
              styles.item,
              {
                backgroundColor:
                  pressed && !itemDisabled
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                borderColor: checked
                  ? theme.colors.primary
                  : theme.colors.line,
                opacity: itemDisabled ? 0.58 : 1,
              },
              safeItemStyle,
            ]}
          >
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={[
                styles.indicator,
                multiple
                  ? styles.checkboxIndicator
                  : styles.radioIndicator,
                {
                  backgroundColor: checked
                    ? theme.colors.primary
                    : theme.colors.surface,
                  borderColor: checked
                    ? theme.colors.primary
                    : theme.colors.textSubtle,
                },
              ]}
            >
              {checked ? (
                multiple ? (
                  renderIconSlot(icons.check, {
                    color: selectionForeground,
                    size: theme.metrics.icon.sm,
                  }) ?? (
                    <RNText
                      maxFontSizeMultiplier={theme.metrics.maxFontScale}
                      style={[
                        roleTextStyle(theme, "caption"),
                        { color: selectionForeground },
                      ]}
                    >
                      ✓
                    </RNText>
                  )
                ) : (
                  <View
                    style={[
                      styles.radioDot,
                      { backgroundColor: selectionForeground },
                    ]}
                  />
                )
              ) : null}
            </View>

            {item.leading === undefined ? null : (
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={styles.decorative}
              >
                {renderIconSlot(item.leading, {
                  color: foreground,
                  size: theme.metrics.icon.md,
                })}
              </View>
            )}

            <View style={styles.itemCopy}>
              <RNText
                {...nativeWindProps(props.itemLabelClassName)}
                numberOfLines={1}
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                style={[
                  roleTextStyle(theme, "button"),
                  { color: foreground },
                  props.itemLabelStyle,
                ]}
              >
                {item.label}
              </RNText>
              {item.description === undefined ? null : (
                <RNText
                  maxFontSizeMultiplier={theme.metrics.maxFontScale}
                  style={[
                    roleTextStyle(theme, "caption"),
                    {
                      color: itemDisabled
                        ? theme.colors.textSubtle
                        : theme.colors.textMuted,
                    },
                  ]}
                >
                  {item.description}
                </RNText>
              )}
            </View>

            {item.trailing === undefined ? null : (
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={styles.decorative}
              >
                {renderIconSlot(item.trailing, {
                  color: foreground,
                  size: theme.metrics.icon.md,
                })}
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Native controlled searchable selection with adaptive modal and inline surfaces. */
export function Combobox<const T extends string>(
  props: ComboboxProps<T>,
): ReactElement {
  // This JavaScript boundary must fail before any hook is called so invalid
  // discriminants cannot change the component's hook order between renders.
  assertComboboxProps(props);

  const selectedItems: readonly ComboboxItem<T>[] =
    props.selectionMode === "single"
      ? resolveComboboxSelectedItems(
          props.state.items,
          props.value,
          props.selectedItem,
        )
      : resolveComboboxSelectedItems(
          props.state.items,
          props.value,
          props.selectedItems,
        );
  const filteredItems = filterComboboxItems(
    props.state.items,
    props.inputValue,
    props.filter,
    props.filterLocale,
  );
  const selectedValues = new Set(selectedItems.map((item) => item.value));
  const summary =
    props.selectionMode === "single"
      ? (selectedItems[0]?.label ?? props.placeholder)
      : buildMultipleSummary(
          selectedItems,
          props.placeholder,
          props.getSelectionSummary,
        );

  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const triggerRef = useRef<View | null>(null);
  const searchRef = useRef<TextInput | null>(null);
  const overlayId = `gj-combobox-${reactId}-overlay`;
  const presentation = props.presentation ?? "auto";
  const inline = presentation === "inline";
  const helper = props.error ?? props.description;
  const accessibleName = props.accessibilityLabel ?? props.label;
  const targetHeight = Math.max(
    theme.metrics.control.md,
    props.size === "sm" ? theme.metrics.control.md : theme.metrics.input,
  );
  const multipleAtLimit =
    props.selectionMode === "multiple" &&
    props.maxSelected !== undefined &&
    props.value.length >= props.maxSelected;
  const hasSelection = selectedItems.length > 0;
  const clearable = props.clearable ?? true;
  const openOnFocus = props.openOnFocus ?? true;
  const showClear =
    clearable && !props.disabled && (hasSelection || props.inputValue.length > 0);
  const clearLabel = props.clearLabel ?? strings.deselectAll;
  const retryLabel = props.retryLabel ?? strings.retry;
  const safeControlStyle = targetInvariantStyle(
    props.controlStyle,
    targetHeight,
  );
  const safeClearButtonStyle = targetInvariantStyle(
    props.clearButtonStyle,
    theme.metrics.control.md,
  );

  let mainStatusLabel: string | undefined;
  if (props.state.status === "loading") {
    mainStatusLabel =
      props.state.statusLabel ?? props.loadingLabel ?? strings.loading;
  } else if (props.state.status === "error") {
    mainStatusLabel = props.state.statusLabel;
  } else if (props.state.statusLabel !== undefined) {
    mainStatusLabel = props.state.statusLabel;
  }
  const emptyStatusLabel =
    props.state.status === "ready" && filteredItems.length === 0
      ? props.inputValue.trim().length === 0
        ? (props.emptyLabel ?? strings.emptyTitle)
        : (props.noResultsLabel ?? strings.noResults)
      : undefined;
  const limitStatusLabel =
    multipleAtLimit && props.selectionMode === "multiple"
      ? props.selectionLimitLabel
      : undefined;

  const requestInputValueChange = useCallback(
    (
      nextInputValue: string,
      reason: ComboboxInputValueChangeReason,
      item?: ComboboxItem<T>,
      originalEvent?: unknown,
    ): void => {
      if (nextInputValue === props.inputValue) return;
      props.onInputValueChange(nextInputValue, {
        reason,
        previousInputValue: props.inputValue,
        isComposing: false,
        ...(item === undefined ? {} : { item }),
        ...definedOriginalEvent(originalEvent),
      });
    },
    [props],
  );

  const requestOpenChange = useCallback(
    (
      nextOpen: boolean,
      reason: ComboboxOpenChangeReason,
      item?: ComboboxItem<T>,
      originalEvent?: unknown,
    ): void => {
      if (nextOpen === props.open) return;
      props.onOpenChange(nextOpen, {
        reason,
        ...(item === undefined ? {} : { item }),
        ...definedOriginalEvent(originalEvent),
      });
    },
    [props],
  );

  const restoreInputAndDismiss = useCallback(
    (
      reason: ComboboxOpenChangeReason,
      originalEvent?: unknown,
    ): void => {
      const restoredInput =
        props.selectionMode === "single"
          ? (selectedItems[0]?.label ?? "")
          : "";
      requestInputValueChange(
        restoredInput,
        "dismiss-restore",
        undefined,
        originalEvent,
      );
      requestOpenChange(false, reason, undefined, originalEvent);
    },
    [props.selectionMode, requestInputValueChange, requestOpenChange, selectedItems],
  );

  const handleTriggerPress = useCallback(
    (event: GestureResponderEvent): void => {
      if (props.disabled) return;
      if (props.open) {
        restoreInputAndDismiss("trigger-press", eventValue(event));
        return;
      }
      requestOpenChange(true, "trigger-press", undefined, eventValue(event));
    },
    [props.disabled, props.open, requestOpenChange, restoreInputAndDismiss],
  );

  const handleInputChange = useCallback(
    (nextInputValue: string): void => {
      if (props.disabled) return;
      requestInputValueChange(nextInputValue, "input-change");
      if (inline && !props.open) {
        requestOpenChange(true, "input-change");
      }
    },
    [inline, props.disabled, props.open, requestInputValueChange, requestOpenChange],
  );

  const handleInputFocus = useCallback(
    (event: FocusEvent): void => {
      if (
        inline &&
        openOnFocus &&
        !props.disabled &&
        !props.open
      ) {
        requestOpenChange(
          true,
          "input-focus",
          undefined,
          eventValue(event),
        );
      }
    },
    [inline, openOnFocus, props.disabled, props.open, requestOpenChange],
  );

  const handleSelect = useCallback(
    (item: ComboboxItem<T>, event: GestureResponderEvent): void => {
      const checked = selectedValues.has(item.value);
      const limitBlocksSelection =
        props.selectionMode === "multiple" && multipleAtLimit && !checked;
      if (
        props.disabled ||
        item.disabled === true ||
        limitBlocksSelection
      ) {
        return;
      }
      const originalEvent = eventValue(event);

      if (props.selectionMode === "single") {
        if (item.value !== props.value) {
          props.onValueChange(item.value, {
            selectionMode: "single",
            reason: "option-select",
            previousValue: props.value,
            item,
            ...definedOriginalEvent(originalEvent),
          });
        }
        requestInputValueChange(
          item.label,
          "option-select",
          item,
          originalEvent,
        );
        requestOpenChange(
          false,
          "option-select",
          item,
          originalEvent,
        );
        return;
      }

      const nextValue = checked
        ? props.value.filter((value) => value !== item.value)
        : [...props.value, item.value];
      props.onValueChange(nextValue, {
        selectionMode: "multiple",
        reason: checked ? "option-remove" : "option-select",
        previousValue: props.value,
        item,
        ...definedOriginalEvent(originalEvent),
      });
      requestInputValueChange(
        "",
        "option-select",
        item,
        originalEvent,
      );
    },
    [
      multipleAtLimit,
      props,
      requestInputValueChange,
      requestOpenChange,
      selectedValues,
    ],
  );

  const handleClear = useCallback(
    (event: GestureResponderEvent): void => {
      if (props.disabled) return;
      const originalEvent = eventValue(event);
      if (props.selectionMode === "single") {
        if (props.value !== null) {
          props.onValueChange(null, {
            selectionMode: "single",
            reason: "clear-action",
            previousValue: props.value,
            ...definedOriginalEvent(originalEvent),
          });
        }
      } else if (props.value.length > 0) {
        props.onValueChange([], {
          selectionMode: "multiple",
          reason: "clear-action",
          previousValue: props.value,
          ...definedOriginalEvent(originalEvent),
        });
      }
      requestInputValueChange(
        "",
        "clear-action",
        undefined,
        originalEvent,
      );
    },
    [props, requestInputValueChange],
  );

  const handleSheetDismiss = useCallback(
    (details: NativeComboboxSheetDismissDetails): void => {
      const reason: ComboboxOpenChangeReason =
        details.reason === "backdrop-press"
          ? "outside-press"
          : details.reason;
      restoreInputAndDismiss(reason, details.originalEvent);
    },
    [restoreInputAndDismiss],
  );

  const search = (
    <View
      {...nativeWindProps(props.controlClassName)}
      style={[
        styles.searchControl,
        {
          backgroundColor: theme.colors.surface,
          borderColor:
            props.error === undefined
              ? theme.colors.textSubtle
              : theme.colors.danger,
          opacity: props.disabled ? 0.58 : 1,
        },
        safeControlStyle,
      ]}
    >
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={styles.decorative}
      >
        {renderIconSlot(icons.search, {
          color: theme.colors.textSubtle,
          size: theme.metrics.icon.md,
        })}
      </View>
      <TextInput
        ref={searchRef}
        accessibilityLabel={accessibleName}
        accessibilityHint={helper}
        accessibilityState={{
          busy: props.state.status === "loading",
          disabled: props.disabled === true,
        }}
        aria-invalid={props.error !== undefined}
        editable={!props.disabled}
        onChangeText={handleInputChange}
        onFocus={handleInputFocus}
        placeholder={props.placeholder}
        placeholderTextColor={theme.colors.textSubtle}
        returnKeyType="search"
        testID={
          props.testID === undefined ? undefined : `${props.testID}-input`
        }
        value={props.inputValue}
        {...nativeWindProps(props.inputClassName)}
        style={[
          styles.input,
          roleTextStyle(theme, "body"),
          { color: theme.colors.text },
          props.inputStyle,
        ]}
      />
    </View>
  );

  const status =
    mainStatusLabel === undefined &&
    limitStatusLabel === undefined &&
    emptyStatusLabel === undefined ? undefined : (
      <>
        {mainStatusLabel === undefined ? null : (
          <RNText
            accessibilityLiveRegion="polite"
            accessibilityRole={props.state.status === "error" ? "alert" : undefined}
            testID={
              props.testID === undefined
                ? undefined
                : `${props.testID}-status`
            }
            {...nativeWindProps(props.statusClassName)}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              styles.status,
              roleTextStyle(theme, "caption"),
              {
                color:
                  props.state.status === "error"
                    ? theme.colors.danger
                    : theme.colors.textMuted,
              },
              props.statusStyle,
            ]}
          >
            {mainStatusLabel}
          </RNText>
        )}
        {limitStatusLabel === undefined ? null : (
          <RNText
            accessibilityLiveRegion="polite"
            testID={
              props.testID === undefined ? undefined : `${props.testID}-limit`
            }
            {...nativeWindProps(props.statusClassName)}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              styles.status,
              roleTextStyle(theme, "caption"),
              { color: theme.colors.warningStrong },
              props.statusStyle,
            ]}
          >
            {limitStatusLabel}
          </RNText>
        )}
        {emptyStatusLabel === undefined ? null : (
          <RNText
            accessibilityLiveRegion="polite"
            testID={
              props.testID === undefined ? undefined : `${props.testID}-empty`
            }
            {...nativeWindProps(props.statusClassName)}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              styles.status,
              roleTextStyle(theme, "caption"),
              { color: theme.colors.textMuted },
              props.statusStyle,
            ]}
          >
            {emptyStatusLabel}
          </RNText>
        )}
      </>
    );

  const optionRows = (
    <OptionRows
      props={props}
      items={filteredItems}
      selectedValues={selectedValues}
      atLimit={multipleAtLimit}
      onSelect={handleSelect}
      targetHeight={theme.metrics.control.md}
    />
  );

  const actions: ReactNode =
    showClear ||
    (props.state.status === "error" && props.state.onRetry !== undefined) ? (
      <View style={styles.actions}>
        {props.state.status === "error" &&
        props.state.onRetry !== undefined ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            disabled={props.disabled}
            onPress={props.state.onRetry}
            testID={
              props.testID === undefined ? undefined : `${props.testID}-retry`
            }
            {...nativeWindProps(PRESSABLE_FEEDBACK_CLASS)}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor:
                  pressed && !props.disabled
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                borderColor: theme.colors.textSubtle,
                opacity: props.disabled ? 0.58 : 1,
              },
              targetInvariantStyle(undefined, theme.metrics.control.md),
            ]}
          >
            <RNText
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              style={[
                roleTextStyle(theme, "button"),
                { color: theme.colors.text },
              ]}
            >
              {retryLabel}
            </RNText>
          </Pressable>
        ) : null}
        {showClear ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={clearLabel}
            disabled={props.disabled}
            onPress={handleClear}
            testID={
              props.testID === undefined ? undefined : `${props.testID}-clear`
            }
            {...nativeWindProps(
              mergeClassNames(
                PRESSABLE_FEEDBACK_CLASS,
                props.clearButtonClassName,
              ),
            )}
            style={({ pressed }) => [
              styles.action,
              {
                backgroundColor:
                  pressed && !props.disabled
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                borderColor: theme.colors.textSubtle,
                opacity: props.disabled ? 0.58 : 1,
              },
              safeClearButtonStyle,
            ]}
          >
            <RNText
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              style={[
                roleTextStyle(theme, "button"),
                { color: theme.colors.text },
              ]}
            >
              {clearLabel}
            </RNText>
          </Pressable>
        ) : null}
      </View>
    ) : undefined;

  return (
    <View
      testID={props.testID}
      {...nativeWindProps(props.className)}
      style={[styles.root, props.style]}
    >
      {props.label === undefined ? null : (
        <RNText
          testID={
            props.testID === undefined ? undefined : `${props.testID}-label`
          }
          {...nativeWindProps(props.labelClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.label,
            roleTextStyle(theme, "label"),
            {
              color:
                props.error === undefined
                  ? theme.colors.text
                  : theme.colors.danger,
            },
            props.labelStyle,
          ]}
        >
          {props.label}
          {props.required ? " *" : null}
        </RNText>
      )}

      {inline ? (
        search
      ) : (
        <Pressable
          ref={triggerRef}
          accessibilityRole="button"
          accessibilityLabel={accessibleName}
          accessibilityHint={helper}
          accessibilityState={{
            busy: props.state.status === "loading",
            disabled: props.disabled === true,
            expanded: props.open,
          }}
          accessibilityValue={{ text: summary }}
          aria-valuetext={summary}
          disabled={props.disabled}
          onPress={handleTriggerPress}
          {...nativeWindProps(
            mergeClassNames(
              PRESSABLE_FEEDBACK_CLASS,
              props.controlClassName,
            ),
          )}
          style={({ pressed }) => [
            styles.control,
            {
              backgroundColor:
                pressed && !props.disabled
                  ? theme.colors.surfaceSubtle
                  : theme.colors.surface,
              borderColor:
                props.error === undefined
                  ? theme.colors.textSubtle
                  : theme.colors.danger,
              opacity: props.disabled ? 0.58 : 1,
            },
            safeControlStyle,
          ]}
        >
          <RNText
            {...nativeWindProps(props.summaryClassName)}
            testID={
              props.testID === undefined ? undefined : `${props.testID}-summary`
            }
            numberOfLines={1}
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              styles.summary,
              roleTextStyle(theme, "button"),
              {
                color: hasSelection
                  ? theme.colors.text
                  : theme.colors.textMuted,
              },
              props.summaryStyle,
            ]}
          >
            {summary}
          </RNText>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.decorative}
          >
            {renderIconSlot(icons.chevronDown, {
              color: props.disabled
                ? theme.colors.textSubtle
                : theme.colors.textMuted,
              size: theme.metrics.icon.md,
            }) ?? (
              <RNText
                maxFontSizeMultiplier={theme.metrics.maxFontScale}
                style={[
                  roleTextStyle(theme, "button"),
                  {
                    color: props.disabled
                      ? theme.colors.textSubtle
                      : theme.colors.textMuted,
                  },
                ]}
              >
                ⌄
              </RNText>
            )}
          </View>
        </Pressable>
      )}

      {helper === undefined ? null : (
        <RNText
          accessibilityLiveRegion={props.error === undefined ? "none" : "polite"}
          testID={
            props.testID === undefined ? undefined : `${props.testID}-helper`
          }
          {...nativeWindProps(props.helperClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.helper,
            roleTextStyle(theme, "caption"),
            {
              color:
                props.error === undefined
                  ? theme.colors.textMuted
                  : theme.colors.danger,
            },
            props.helperStyle,
          ]}
        >
          {helper}
        </RNText>
      )}

      {inline ? (
        props.open ? (
          <View
            testID={
              props.testID === undefined ? undefined : `${props.testID}-content`
            }
            {...nativeWindProps(props.contentClassName)}
            style={[
              styles.inlineContent,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.line,
              },
              props.contentStyle,
            ]}
          >
            {status}
            <ScrollView
              testID={
                props.testID === undefined ? undefined : `${props.testID}-list`
              }
              keyboardShouldPersistTaps="handled"
              {...nativeWindProps(props.listClassName)}
              style={[styles.list, props.listStyle]}
              contentContainerStyle={styles.listContent}
            >
              {optionRows}
            </ScrollView>
            {actions}
          </View>
        ) : null
      ) : (
        <NativeComboboxSheet
          visible={props.open}
          overlayId={overlayId}
          title={props.label ?? props.accessibilityLabel}
          description={helper}
          accessibilityLabel={accessibleName}
          presentation={presentation as NativeComboboxSheetPresentation}
          bottomInset={props.bottomInset}
          keyboardOverlap={props.keyboardOverlap}
          initialFocusRef={searchRef as DialogFocusRef}
          finalFocusRef={triggerRef as DialogFocusRef}
          onDismiss={handleSheetDismiss}
          search={search}
          status={status}
          results={optionRows}
          actions={actions}
          contentStyle={props.contentStyle}
          contentClassName={props.contentClassName}
          resultsStyle={props.listStyle}
          resultsClassName={props.listClassName}
          testID={props.testID}
        />
      )}
    </View>
  );
}
