import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import type { GestureResponderEvent, StyleProp, TextStyle } from "react-native";
import type { Theme } from "../theme/tokens";
import { PRESSABLE_FEEDBACK_CLASS } from "./button";
import type { DialogFocusRef } from "./dialog";
import { renderIconSlot } from "./icons";
import { mergeClassNames, nativeWindProps, themedStyles } from "./internal";
import { assertSelectProps } from "./menu-select-validation";
import { NativeMenuSelectSheet } from "./menu-select-sheet.native";
import type { NativeMenuSelectDismissDetails } from "./menu-select-sheet.native";
import { useOptionalOverlayStack } from "./overlay/provider";
import { useIcons, useTheme } from "./provider";
import type {
  SelectItem,
  SelectOpenChangeDetails,
  SelectProps,
} from "./select.types";
import { roleTextStyle } from "./text";

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    gap: theme.spacing.sm,
  },
  label: {
    flexShrink: 1,
  },
  trigger: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    minHeight: theme.metrics.input,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: "100%" as const,
  },
  triggerLeading: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  triggerValue: {
    flex: 1,
    flexShrink: 1,
  },
  item: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    gap: theme.spacing.md,
    minHeight: theme.metrics.control.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  radio: {
    alignItems: "center" as const,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center" as const,
  },
  radioDot: {
    borderRadius: theme.radius.pill,
  },
  itemCopy: {
    flex: 1,
    flexShrink: 1,
    gap: theme.spacing.xs,
  },
  radioGroup: {
    gap: theme.spacing.sm,
  },
  helper: {
    flexShrink: 1,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function SelectItemCopy({
  item,
  foreground,
  labelStyle,
  labelClassName,
}: {
  readonly item: SelectItem<string>;
  readonly foreground: string;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly labelClassName?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.itemCopy}>
      <RNText
        {...nativeWindProps(labelClassName)}
        maxFontSizeMultiplier={theme.metrics.maxFontScale}
        style={[
          roleTextStyle(theme, "button"),
          { color: foreground },
          labelStyle,
        ]}
      >
        {item.label}
      </RNText>
      {item.description === undefined ? null : (
        <RNText
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            roleTextStyle(theme, "caption"),
            { color: theme.colors.textMuted },
          ]}
        >
          {item.description}
        </RNText>
      )}
    </View>
  );
}

/** Native/default controlled Select with an adaptive radio action surface. */
export function Select<const T extends string>(
  props: SelectProps<T>
): ReactElement {
  assertSelectProps(props);
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
    presentation = "auto",
    bottomInset = 0,
    keyboardOverlap = 0,
    size = "md",
    leading,
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
  const stack = useOptionalOverlayStack();
  if (stack === null) {
    // 우아한 폴백을 두지 않는 이유: overlay stack이 topmost-first dismissal을
    // 중재하므로, stack 없이 열리면 중첩 overlay의 Escape/outside-press 소유권이
    // 보장되지 않는다. Dialog 단독 동작과 달리 여기서는 계약 위반으로 막는다.
    throw new Error(
      "Select requires the overlay dismissal stack that coordinates stacked overlays (topmost-first Escape/outside-press ownership). Wrap the app — or the test render — in <UiProvider> from '@gj-kit/expo-ui', which creates the overlay scope automatically, or in an explicit <OverlayProvider>."
    );
  }

  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const overlayId = `gj-select-${reactId}-overlay`;
  const triggerRef = useRef<View | null>(null);
  const initialItemRef = useRef<View | null>(null);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
  useEffect(() => {
    // 닫힌 사이 pointer가 떠나도 hover-out 이벤트가 오지 않으므로 재오픈 시
    // stale hover 하이라이트를 남기지 않는다.
    if (!open) setHoveredItemIndex(null);
  }, [open]);
  const selectedItem = items.find((item) => item.value === value) ?? null;
  const selectedEnabledIndex = items.findIndex(
    (item) =>
      item.value === value && item.disabled !== true && !disabled && !busy
  );
  const firstEnabledIndex = items.findIndex(
    (item) => item.disabled !== true && !disabled && !busy
  );
  const initialIndex =
    selectedEnabledIndex >= 0 ? selectedEnabledIndex : firstEnabledIndex;
  const accessibleName = accessibilityLabel ?? label;
  const helper = error ?? description;
  const displayedValue = selectedItem?.label ?? placeholder;
  const displayedLeading = leading ?? selectedItem?.leading;
  const triggerHeight =
    size === "sm" ? theme.metrics.control.md : theme.metrics.input;

  const requestOpenChange = useCallback(
    (nextOpen: boolean, details: SelectOpenChangeDetails<T>): void => {
      onOpenChange(nextOpen, details);
    },
    [onOpenChange]
  );

  const handleTriggerPress = useCallback(
    (event: GestureResponderEvent): void => {
      if (disabled || (open && dismissDisabled)) return;
      requestOpenChange(!open, {
        reason: "trigger-press",
        originalEvent: event,
      });
    },
    [disabled, dismissDisabled, open, requestOpenChange]
  );

  const handleSheetDismiss = useCallback(
    (details: NativeMenuSelectDismissDetails): void => {
      const reason =
        details.reason === "backdrop-press" ? "outside-press" : details.reason;
      requestOpenChange(false, {
        reason,
        originalEvent: details.originalEvent,
      });
    },
    [requestOpenChange]
  );

  const selectItem = useCallback(
    (item: SelectItem<T>, event: GestureResponderEvent): void => {
      if (disabled || busy || item.disabled) return;
      if (item.value !== value) onValueChange(item.value);
      requestOpenChange(false, {
        reason: "option-select",
        value: item.value,
        originalEvent: event,
      });
    },
    [busy, disabled, onValueChange, requestOpenChange, value]
  );

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      {label === undefined ? null : (
        <RNText
          {...nativeWindProps(labelClassName)}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.label,
            roleTextStyle(theme, "label"),
            {
              color:
                error === undefined ? theme.colors.text : theme.colors.danger,
            },
            labelStyle,
          ]}
        >
          {label}
          {required ? " *" : null}
        </RNText>
      )}
      <Pressable
        ref={triggerRef}
        accessibilityRole="button"
        accessibilityLabel={accessibleName}
        accessibilityHint={helper}
        accessibilityState={{ disabled, expanded: open, busy }}
        accessibilityValue={{ text: displayedValue }}
        aria-valuetext={displayedValue}
        disabled={disabled}
        onPress={handleTriggerPress}
        onHoverIn={
          triggerHoverStyle === undefined
            ? undefined
            : () => setTriggerHovered(true)
        }
        onHoverOut={
          triggerHoverStyle === undefined
            ? undefined
            : () => setTriggerHovered(false)
        }
        testID={triggerTestID}
        {...nativeWindProps(
          mergeClassNames(PRESSABLE_FEEDBACK_CLASS, triggerClassName)
        )}
        style={({ pressed }) => [
          styles.trigger,
          {
            minHeight: triggerHeight,
            backgroundColor:
              pressed && !disabled
                ? theme.colors.surfaceSubtle
                : theme.colors.surface,
            borderColor:
              error === undefined
                ? theme.colors.textSubtle
                : theme.colors.danger,
            opacity: disabled ? 0.58 : 1,
          },
          triggerStyle,
          !disabled && triggerHovered && triggerHoverStyle !== undefined
            ? triggerHoverStyle
            : null,
        ]}
      >
        {displayedLeading === undefined ? null : (
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={styles.triggerLeading}
          >
            {renderIconSlot(displayedLeading, {
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
            styles.triggerValue,
            roleTextStyle(theme, "button"),
            {
              color:
                selectedItem === null
                  ? theme.colors.textMuted
                  : theme.colors.text,
            },
            valueStyle,
          ]}
        >
          {displayedValue}
        </RNText>
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          {renderIconSlot(icons.chevronDown, {
            color: disabled ? theme.colors.textSubtle : theme.colors.textMuted,
            size: theme.metrics.icon.md,
          }) ?? (
            <RNText
              style={[
                roleTextStyle(theme, "button"),
                {
                  color: disabled
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
      {helper === undefined ? null : (
        <RNText
          {...nativeWindProps(helperClassName)}
          accessibilityLiveRegion={error === undefined ? "none" : "polite"}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={[
            styles.helper,
            roleTextStyle(theme, "caption"),
            {
              color:
                error === undefined
                  ? theme.colors.textMuted
                  : theme.colors.danger,
            },
            helperStyle,
          ]}
        >
          {helper}
        </RNText>
      )}

      <NativeMenuSelectSheet
        visible={open}
        overlayId={overlayId}
        overlayStack={stack}
        title={label ?? accessibilityLabel}
        description={helper}
        accessibilityLabel={accessibleName}
        presentation={presentation}
        dismissDisabled={dismissDisabled}
        bottomInset={bottomInset}
        keyboardOverlap={keyboardOverlap}
        initialFocusRef={
          initialIndex < 0 ? undefined : (initialItemRef as DialogFocusRef)
        }
        finalFocusRef={triggerRef as DialogFocusRef}
        onDismiss={handleSheetDismiss}
        contentStyle={contentStyle}
        contentClassName={contentClassName}
        testID={testID === undefined ? undefined : `${testID}-sheet`}
      >
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel={accessibleName}
          accessibilityState={{ busy }}
          style={styles.radioGroup}
        >
          {items.map((item, index) => {
            const itemDisabled = disabled || busy || item.disabled === true;
            const checked = item.value === value;
            const foreground = itemDisabled
              ? theme.colors.textSubtle
              : theme.colors.text;
            return (
              <Pressable
                key={item.value}
                ref={index === initialIndex ? initialItemRef : undefined}
                accessibilityRole="radio"
                accessibilityLabel={item.label}
                accessibilityHint={item.description}
                accessibilityState={{ checked, disabled: itemDisabled, busy }}
                aria-checked={checked}
                disabled={itemDisabled}
                onPress={(event) => selectItem(item, event)}
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
                          current === index ? null : current
                        )
                }
                testID={
                  item.testID ??
                  (testID === undefined ? undefined : `${testID}-item-${index}`)
                }
                {...nativeWindProps(
                  mergeClassNames(PRESSABLE_FEEDBACK_CLASS, itemClassName)
                )}
                style={({ pressed }) => [
                  styles.item,
                  {
                    backgroundColor:
                      pressed && !itemDisabled
                        ? theme.colors.surfaceSubtle
                        : checked
                        ? theme.colors.primarySoft
                        : theme.colors.surface,
                    borderColor: checked
                      ? theme.colors.primary
                      : theme.colors.textSubtle,
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
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.radio,
                    {
                      width: theme.metrics.icon.lg,
                      height: theme.metrics.icon.lg,
                      borderColor: checked
                        ? theme.colors.primary
                        : theme.colors.textSubtle,
                      backgroundColor: theme.colors.surface,
                    },
                  ]}
                >
                  {checked ? (
                    <View
                      style={[
                        styles.radioDot,
                        {
                          width: theme.spacing.sm,
                          height: theme.spacing.sm,
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    />
                  ) : null}
                </View>
                {item.leading === undefined ? null : (
                  <View
                    accessible={false}
                    importantForAccessibility="no-hide-descendants"
                    style={styles.triggerLeading}
                  >
                    {renderIconSlot(item.leading, {
                      color: foreground,
                      size: theme.metrics.icon.md,
                    })}
                  </View>
                )}
                <SelectItemCopy
                  item={item}
                  foreground={foreground}
                  labelStyle={itemLabelStyle}
                  labelClassName={itemLabelClassName}
                />
              </Pressable>
            );
          })}
        </View>
      </NativeMenuSelectSheet>
    </View>
  );
}
