import { useCallback, useRef } from "react";
import type { ReactElement, ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from "react-native";
import type { GestureResponderEvent, StyleProp, ViewStyle } from "react-native";
import type { Theme } from "../theme/tokens";
import { Dialog, DialogPanel } from "./dialog";
import type { DialogDismissDetails, DialogFocusRef } from "./dialog";
import { nativeWindProps, themedStyles } from "./internal";
import type { OverlayStack } from "./overlay/stack";
import type {
  OverlayDismissDetails,
  OverlayDismissReason,
} from "./overlay/types";
import { useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

export type NativeMenuSelectPresentation = "auto" | "bottom" | "center";

export type NativeMenuSelectDismissReason = Extract<
  OverlayDismissReason,
  | "backdrop-press"
  | "escape-key"
  | "hardware-back"
  | "accessibility-escape"
  | "cancel-action"
>;

export interface NativeMenuSelectDismissDetails extends OverlayDismissDetails {
  readonly reason: NativeMenuSelectDismissReason;
}

export interface NativeMenuSelectSheetProps {
  readonly visible: boolean;
  readonly overlayId: string;
  readonly overlayStack: OverlayStack;
  readonly title: string;
  readonly description?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly presentation?: NativeMenuSelectPresentation | undefined;
  readonly dismissDisabled: boolean;
  readonly bottomInset?: number | undefined;
  readonly keyboardOverlap?: number | undefined;
  readonly initialFocusRef?: DialogFocusRef | undefined;
  readonly finalFocusRef: DialogFocusRef;
  readonly onDismiss: (details: NativeMenuSelectDismissDetails) => void;
  readonly children: NonNullable<ReactNode>;
  readonly contentStyle?: StyleProp<ViewStyle> | undefined;
  readonly contentClassName?: string | undefined;
  readonly testID?: string | undefined;
}

const getStyles = themedStyles((theme: Theme) => ({
  bottomOverlay: {
    alignItems: "stretch" as const,
    justifyContent: "flex-end" as const,
    paddingBottom: theme.spacing.none,
  },
  centerOverlay: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  panel: {
    gap: theme.spacing.lg,
  },
  body: {
    flexShrink: 1,
    gap: theme.spacing.md,
    minHeight: theme.spacing.none,
  },
  itemsScroll: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  items: {
    gap: theme.spacing.sm,
  },
  cancel: {
    alignItems: "center" as const,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center" as const,
    minHeight: theme.metrics.control.md,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    width: "100%" as const,
  },
}));

function assertNonEmptyCancelLabel(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(
      "NativeMenuSelectSheet strings.cancel must be a non-empty string."
    );
  }
}

/** Shared native modal surface. Product components retain item roles and typed callbacks. */
export function NativeMenuSelectSheet({
  visible,
  overlayId,
  overlayStack,
  title,
  description,
  accessibilityLabel,
  presentation = "auto",
  dismissDisabled,
  bottomInset = 0,
  keyboardOverlap = 0,
  initialFocusRef,
  finalFocusRef,
  onDismiss,
  children,
  contentStyle,
  contentClassName,
  testID,
}: NativeMenuSelectSheetProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const cancelLabel = strings.cancel;
  assertNonEmptyCancelLabel(cancelLabel);
  const styles = getStyles(theme);
  const { height, width } = useWindowDimensions();
  const cancelRef = useRef<View | null>(null);

  const resolvedPresentation =
    presentation === "auto"
      ? width < theme.breakpoints.tablet
        ? "bottom"
        : "center"
      : presentation;
  const avoidance =
    keyboardOverlap > theme.spacing.none ? keyboardOverlap : bottomInset;
  const invariantPaddingBottom =
    theme.spacing.xxl +
    (resolvedPresentation === "bottom" ? avoidance : theme.spacing.none);
  const viewportHeight =
    height > theme.spacing.none ? height : theme.breakpoints.tablet;
  const invariantMaxHeight = Math.max(
    theme.metrics.control.lg,
    viewportHeight - theme.spacing.xl - theme.spacing.xl
  );

  const handleDialogDismiss = useCallback(
    (details: DialogDismissDetails): void => {
      onDismiss(
        details.reason === "close-action"
          ? {
              overlayId: details.overlayId,
              reason: "cancel-action",
              ...(details.originalEvent === undefined
                ? {}
                : { originalEvent: details.originalEvent }),
            }
          : (details as NativeMenuSelectDismissDetails)
      );
    },
    [onDismiss]
  );

  const handleCancel = useCallback(
    (event: GestureResponderEvent): void => {
      if (dismissDisabled) return;
      // Dialog owns the single stack entry. Its public close reason is mapped
      // back to the sheet's cancel reason in handleDialogDismiss.
      overlayStack.requestDismiss(overlayId, "close-action", event);
    },
    [dismissDisabled, overlayId, overlayStack]
  );

  return (
    <Dialog
      visible={visible}
      onDismiss={handleDialogDismiss}
      dismissDisabled={dismissDisabled}
      accessibilityLabel={accessibilityLabel}
      initialFocusRef={
        initialFocusRef ?? (dismissDisabled ? undefined : cancelRef)
      }
      finalFocusRef={finalFocusRef}
      overlayId={overlayId}
      overlayStyle={
        resolvedPresentation === "bottom"
          ? styles.bottomOverlay
          : styles.centerOverlay
      }
      animationType={resolvedPresentation === "bottom" ? "slide" : "fade"}
      testID={testID}
    >
      <DialogPanel
        title={title}
        description={description}
        showCloseButton={false}
        testID={testID === undefined ? undefined : `${testID}-panel`}
        className={contentClassName}
        style={[
          styles.panel,
          contentStyle,
          {
            maxHeight: invariantMaxHeight,
            overflow: "hidden",
            paddingBottom: invariantPaddingBottom,
          },
        ]}
      >
        <View style={styles.body}>
          <ScrollView
            testID={testID === undefined ? undefined : `${testID}-items`}
            keyboardShouldPersistTaps="handled"
            style={styles.itemsScroll}
            contentContainerStyle={styles.items}
          >
            {children}
          </ScrollView>
          <Pressable
            ref={cancelRef}
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            accessibilityState={{ disabled: dismissDisabled }}
            disabled={dismissDisabled}
            onPress={handleCancel}
            testID={testID === undefined ? undefined : `${testID}-cancel`}
            style={({ pressed }) => [
              styles.cancel,
              {
                backgroundColor:
                  pressed && !dismissDisabled
                    ? theme.colors.surfaceSubtle
                    : theme.colors.surface,
                borderColor: theme.colors.textSubtle,
                opacity: dismissDisabled ? 0.52 : 1,
              },
            ]}
          >
            <RNText
              maxFontSizeMultiplier={theme.metrics.maxFontScale}
              style={[
                roleTextStyle(theme, "button"),
                { color: theme.colors.text },
              ]}
            >
              {cancelLabel}
            </RNText>
          </Pressable>
        </View>
      </DialogPanel>
    </Dialog>
  );
}
