import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";
import { Pressable, StyleSheet, Text as RNText, View } from "react-native";
import type { GestureResponderEvent, StyleProp, TextStyle } from "react-native";
import type { Theme } from "../theme/tokens";
import { PRESSABLE_FEEDBACK_CLASS } from "./button";
import type { DialogFocusRef } from "./dialog";
import { renderIconSlot } from "./icons";
import { mergeClassNames, nativeWindProps, themedStyles } from "./internal";
import { assertMenuProps } from "./menu-select-validation";
import { NativeMenuSelectSheet } from "./menu-select-sheet.native";
import type { NativeMenuSelectDismissDetails } from "./menu-select-sheet.native";
import type { MenuItem, MenuOpenChangeDetails, MenuProps } from "./menu.types";
import { useOptionalOverlayStack } from "./overlay/provider";
import { useIcons, useTheme } from "./provider";
import { roleTextStyle } from "./text";

type MenuDimensions = {
  readonly paddingHorizontal: number;
  readonly gap: number;
  readonly triggerTypography: Theme["typography"]["button"];
};

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: "flex-start" as const,
  },
  trigger: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    justifyContent: "center" as const,
    minHeight: theme.metrics.control.md,
  },
  triggerIcon: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  item: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row" as const,
    minHeight: theme.metrics.control.md,
  },
  leading: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  checkboxIndicator: {
    alignItems: "center" as const,
    borderRadius: theme.radius.sm,
    justifyContent: "center" as const,
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
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function menuDimensions(
  theme: Theme,
  size: NonNullable<MenuProps<string>["size"]>
): MenuDimensions {
  return size === "sm"
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
  variant: NonNullable<MenuProps<string>["variant"]>,
  disabled: boolean
): {
  readonly backgroundColor: string;
  readonly borderColor: string;
  readonly foreground: string;
} {
  if (disabled) {
    return {
      backgroundColor: theme.colors.surfaceSubtle,
      borderColor: theme.colors.textSubtle,
      foreground: theme.colors.textSubtle,
    };
  }
  switch (variant) {
    case "filled":
      return {
        backgroundColor: theme.colors.primary,
        borderColor: theme.colors.primary,
        foreground: theme.colors.onPrimary,
      };
    case "ghost":
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

function MenuItemCopy({
  item,
  foreground,
  labelStyle,
  labelClassName,
}: {
  readonly item: MenuItem<string>;
  readonly foreground: string;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly labelClassName?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <View style={styles.copy}>
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

/** Native/default controlled menu. Compact screens adapt to a bottom action surface. */
export function Menu<const T extends string>(
  props: MenuProps<T>
): ReactElement {
  assertMenuProps(props);
  if (props.iconOnly && props.triggerIcon === undefined) {
    throw new TypeError("Menu iconOnly trigger requires triggerIcon.");
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
    presentation = "auto",
    bottomInset = 0,
    keyboardOverlap = 0,
    size = "md",
    variant = "filled",
    triggerTestID,
    triggerHoverStyle,
    itemHoverStyle,
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
    // 우아한 폴백을 두지 않는 이유: overlay stack이 topmost-first dismissal을
    // 중재하므로, stack 없이 열리면 중첩 overlay의 Escape/outside-press 소유권이
    // 보장되지 않는다. Dialog 단독 동작과 달리 여기서는 계약 위반으로 막는다.
    throw new Error(
      "Menu requires the overlay dismissal stack that coordinates stacked overlays (topmost-first Escape/outside-press ownership). Wrap the app — or the test render — in <UiProvider> from '@gj-kit/expo-ui', which creates the overlay scope automatically, or in an explicit <OverlayProvider>."
    );
  }

  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const dimensions = menuDimensions(theme, size);
  const palette = triggerPalette(theme, variant, disabled);
  const reactId = sanitizeId(useId());
  const overlayId = `gj-menu-${reactId}-overlay`;
  const triggerRef = useRef<View | null>(null);
  const initialItemRef = useRef<View | null>(null);
  const [triggerHovered, setTriggerHovered] = useState(false);
  const [hoveredItemIndex, setHoveredItemIndex] = useState<number | null>(null);
  useEffect(() => {
    // 닫힌 사이 pointer가 떠나도 hover-out 이벤트가 오지 않으므로 재오픈 시
    // stale hover 하이라이트를 남기지 않는다.
    if (!open) setHoveredItemIndex(null);
  }, [open]);
  const initialIndex = items.findIndex(
    (item) => !disabled && !busy && item.disabled !== true
  );

  const requestOpenChange = useCallback(
    (nextOpen: boolean, details: MenuOpenChangeDetails<T>): void => {
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
    (item: MenuItem<T>, event: GestureResponderEvent): void => {
      if (disabled || busy || item.disabled) return;
      if (item.kind === "checkbox") {
        onSelect({
          kind: "checkbox",
          value: item.value,
          checked: item.checked === true ? false : true,
          originalEvent: event,
        });
      } else {
        onSelect({ kind: "action", value: item.value, originalEvent: event });
      }
      const shouldClose = item.closeOnSelect ?? item.kind === "action";
      if (shouldClose) {
        requestOpenChange(false, {
          reason: "action-select",
          value: item.value,
          originalEvent: event,
        });
      }
    },
    [busy, disabled, onSelect, requestOpenChange]
  );

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
        accessibilityState={{ disabled, expanded: open, busy }}
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
            minWidth: iconOnly ? theme.metrics.control.md : undefined,
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
          !disabled && triggerHovered && triggerHoverStyle !== undefined
            ? triggerHoverStyle
            : null,
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

      <NativeMenuSelectSheet
        visible={open}
        overlayId={overlayId}
        overlayStack={stack}
        title={triggerLabel}
        accessibilityLabel={accessibilityLabel}
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
        {items.map((item, index) => {
          const itemDisabled = disabled || busy || item.disabled === true;
          const checked = item.kind === "checkbox" && item.checked !== false;
          const foreground = itemDisabled
            ? theme.colors.textSubtle
            : item.kind === "action" && item.destructive
            ? theme.colors.danger
            : theme.colors.text;
          return (
            <Pressable
              key={item.value}
              ref={index === initialIndex ? initialItemRef : undefined}
              accessibilityRole={
                item.kind === "checkbox" ? "checkbox" : "button"
              }
              accessibilityLabel={item.label}
              accessibilityHint={item.description}
              accessibilityState={
                item.kind === "checkbox"
                  ? { checked: item.checked, disabled: itemDisabled, busy }
                  : { disabled: itemDisabled, busy }
              }
              aria-checked={item.kind === "checkbox" ? item.checked : undefined}
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
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  gap: theme.spacing.sm,
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
              {item.kind === "checkbox" ? (
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.checkboxIndicator,
                    {
                      width: theme.metrics.icon.md,
                      height: theme.metrics.icon.md,
                      backgroundColor: checked
                        ? theme.colors.primary
                        : theme.colors.surfaceSubtle,
                    },
                  ]}
                >
                  {checked
                    ? renderIconSlot(
                        item.checked === "mixed" ? icons.minus : icons.check,
                        {
                          color: theme.colors.onPrimary,
                          size: theme.metrics.icon.sm,
                        }
                      ) ?? (
                        <RNText
                          style={[
                            roleTextStyle(theme, "label"),
                            { color: theme.colors.onPrimary },
                          ]}
                        >
                          {item.checked === "mixed" ? "−" : "✓"}
                        </RNText>
                      )
                    : null}
                </View>
              ) : null}
              {item.leading === undefined ? null : (
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={styles.leading}
                >
                  {renderIconSlot(item.leading, {
                    color: foreground,
                    size: theme.metrics.icon.md,
                  })}
                </View>
              )}
              <MenuItemCopy
                item={item}
                foreground={foreground}
                labelStyle={itemLabelStyle}
                labelClassName={itemLabelClassName}
              />
              {item.shortcut === undefined ? null : (
                <RNText
                  accessible={false}
                  style={[
                    styles.shortcut,
                    roleTextStyle(theme, "caption"),
                    { color: theme.colors.textMuted },
                  ]}
                >
                  {item.shortcut}
                </RNText>
              )}
            </Pressable>
          );
        })}
      </NativeMenuSelectSheet>
    </View>
  );
}
