import { useCallback } from "react";
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
import type { OverlayDismissDetails, OverlayDismissReason } from "./overlay/types";
import { useStrings, useTheme } from "./provider";
import { roleTextStyle } from "./text";

export type NativeComboboxSheetPresentation = "auto" | "bottom" | "center";

export type NativeComboboxSheetDismissReason = Extract<
  OverlayDismissReason,
  | "backdrop-press"
  | "escape-key"
  | "hardware-back"
  | "accessibility-escape"
  | "cancel-action"
>;

export interface NativeComboboxSheetDismissDetails
  extends OverlayDismissDetails {
  readonly reason: NativeComboboxSheetDismissReason;
}

export interface NativeComboboxSheetProps {
  readonly visible: boolean;
  readonly overlayId: string;
  readonly title: string;
  readonly description?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly presentation?: NativeComboboxSheetPresentation | undefined;
  readonly bottomInset?: number | undefined;
  readonly keyboardOverlap?: number | undefined;
  readonly initialFocusRef: DialogFocusRef;
  readonly finalFocusRef: DialogFocusRef;
  readonly onDismiss: (details: NativeComboboxSheetDismissDetails) => void;
  /** Fixed searchable control. It never scrolls with the result collection. */
  readonly search: ReactElement;
  /** Loading/error/limit feedback remains visible while retained results scroll. */
  readonly status?: ReactNode | undefined;
  /** The only scrollable region in the sheet. */
  readonly results: NonNullable<ReactNode>;
  /** Retry/clear actions are siblings of the result scroller, never nested rows. */
  readonly actions?: ReactNode | undefined;
  readonly contentStyle?: StyleProp<ViewStyle> | undefined;
  readonly contentClassName?: string | undefined;
  readonly resultsStyle?: StyleProp<ViewStyle> | undefined;
  readonly resultsClassName?: string | undefined;
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
  results: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  resultsContent: {
    gap: theme.spacing.sm,
  },
  actions: {
    flexShrink: 0,
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
      "Combobox strings.cancel must be a non-empty string."
    );
  }
}

function originalEvent(event: GestureResponderEvent): unknown {
  return event.nativeEvent;
}

function panelInvariantStyle(
  style: StyleProp<ViewStyle> | undefined,
  invariantMaxHeight: number,
  invariantPaddingBottom: number,
): ViewStyle {
  const flattened = StyleSheet.flatten(style) ?? {};
  const { maxHeight: _maxHeight, minHeight, paddingBottom: _paddingBottom, ...safeStyle } =
    flattened;
  return {
    ...safeStyle,
    ...(typeof minHeight === "number"
      ? {
          minHeight: Math.min(
            invariantMaxHeight,
            Math.max(0, minHeight),
          ),
        }
      : {}),
    maxHeight: invariantMaxHeight,
    overflow: "hidden",
    paddingBottom: invariantPaddingBottom,
  };
}

/**
 * Native Combobox modal surface. Dialog owns the only overlay-stack entry;
 * search/status/actions stay fixed while only the result collection scrolls.
 */
export function NativeComboboxSheet({
  visible,
  overlayId,
  title,
  description,
  accessibilityLabel,
  presentation = "auto",
  bottomInset = 0,
  keyboardOverlap = 0,
  initialFocusRef,
  finalFocusRef,
  onDismiss,
  search,
  status,
  results,
  actions,
  contentStyle,
  contentClassName,
  resultsStyle,
  resultsClassName,
  testID,
}: NativeComboboxSheetProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  const { height, width } = useWindowDimensions();
  const cancelLabel = strings.cancel;
  assertNonEmptyCancelLabel(cancelLabel);

  const resolvedPresentation =
    presentation === "auto"
      ? width < theme.breakpoints.tablet
        ? "bottom"
        : "center"
      : presentation;
  const safeBottomInset = Math.max(theme.spacing.none, bottomInset);
  const safeKeyboardOverlap = Math.max(theme.spacing.none, keyboardOverlap);
  const bottomAvoidance =
    safeKeyboardOverlap > theme.spacing.none
      ? safeKeyboardOverlap
      : safeBottomInset;
  const invariantPaddingBottom =
    theme.spacing.xxl +
    (resolvedPresentation === "bottom"
      ? bottomAvoidance
      : theme.spacing.none);
  const viewportHeight =
    height > theme.spacing.none ? height : theme.breakpoints.tablet;
  const centerKeyboardReduction =
    resolvedPresentation === "center"
      ? safeKeyboardOverlap
      : theme.spacing.none;
  const invariantMaxHeight = Math.max(
    theme.metrics.control.lg,
    viewportHeight -
      theme.spacing.xl -
      theme.spacing.xl -
      centerKeyboardReduction
  );
  const safePanelStyle = panelInvariantStyle(
    contentStyle,
    invariantMaxHeight,
    invariantPaddingBottom,
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
          : (details as NativeComboboxSheetDismissDetails)
      );
    },
    [onDismiss]
  );

  const handleCancel = useCallback(
    (event: GestureResponderEvent): void => {
      onDismiss({
        overlayId,
        reason: "cancel-action",
        originalEvent: originalEvent(event),
      });
    },
    [onDismiss, overlayId]
  );

  return (
    <Dialog
      visible={visible}
      onDismiss={handleDialogDismiss}
      accessibilityLabel={accessibilityLabel}
      initialFocusRef={initialFocusRef}
      finalFocusRef={finalFocusRef}
      overlayId={overlayId}
      overlayStyle={
        resolvedPresentation === "bottom"
          ? styles.bottomOverlay
          : styles.centerOverlay
      }
      animationType={resolvedPresentation === "bottom" ? "slide" : "fade"}
      testID={testID === undefined ? undefined : `${testID}-content`}
    >
      <DialogPanel
        title={title}
        description={description}
        showCloseButton={false}
        testID={testID === undefined ? undefined : `${testID}-panel`}
        className={contentClassName}
        style={[
          styles.panel,
          safePanelStyle,
        ]}
      >
        <View style={styles.body}>
          {search}
          {status}
          <ScrollView
            testID={testID === undefined ? undefined : `${testID}-list`}
            keyboardShouldPersistTaps="handled"
            {...nativeWindProps(resultsClassName)}
            style={[styles.results, resultsStyle]}
            contentContainerStyle={styles.resultsContent}
          >
            {results}
          </ScrollView>
          {actions === undefined ? null : (
            <View
              testID={testID === undefined ? undefined : `${testID}-actions`}
              style={styles.actions}
            >
              {actions}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            onPress={handleCancel}
            testID={testID === undefined ? undefined : `${testID}-cancel`}
            style={({ pressed }) => [
              styles.cancel,
              {
                backgroundColor: pressed
                  ? theme.colors.surfaceSubtle
                  : theme.colors.surface,
                borderColor: theme.colors.textSubtle,
              },
              { minHeight: theme.metrics.control.md },
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
