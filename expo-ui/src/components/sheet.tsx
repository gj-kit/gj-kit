/**
 * Sheet — a controlled, adaptive modal surface for rich application content.
 *
 * The sheet deliberately owns neither a trigger nor scrolling in every case:
 * compact screens use a bottom sheet, larger screens use a logical end drawer,
 * and virtualized consumers can opt out of the internal ScrollView.
 */
import { isValidElement, useEffect, useId, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import {
  I18nManager,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { Dialog, DialogPanel } from './dialog';
import type {
  DialogDismissDetails,
  DialogFocusRef,
} from './dialog';
import type { CommonProps } from './internal';
import { nativeWindProps, themedStyles } from './internal';
import { useTheme } from './provider';
import { useReducedMotion } from './use-reduced-motion';

export type SheetPresentation = 'auto' | 'bottom' | 'start' | 'end';

/** Sheet requests use the same bounded dismissal reasons as Dialog. */
export type SheetOpenChangeDetails = DialogDismissDetails;

/**
 * Host-provided safe-area measurements. The root entry intentionally does not
 * import react-native-safe-area-context; applications may compose their hook
 * result into this dependency-free value object.
 */
export interface SheetSafeAreaInsets {
  readonly top?: number | undefined;
  readonly right?: number | undefined;
  readonly bottom?: number | undefined;
  readonly left?: number | undefined;
}

interface SheetBaseProps extends Omit<CommonProps, 'unstyled'> {
  open: boolean;
  onOpenChange: (open: boolean, details: SheetOpenChangeDetails) => void;
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  /** Compact screens resolve auto to bottom; tablet and larger resolve to end. */
  presentation?: SheetPresentation | undefined;
  accessibilityLabel?: string | undefined;
  /** Defaults to strings.close. */
  closeAccessibilityLabel?: string | undefined;
  /** Defaults to true. */
  dismissOnBackdrop?: boolean | undefined;
  /** Blocks the backdrop, Escape/Back, the accessibility escape, and the close action alike. */
  dismissDisabled?: boolean | undefined;
  initialFocusRef?: DialogFocusRef | undefined;
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  safeAreaInsets?: SheetSafeAreaInsets | undefined;
  /** Replaces the bottom safe-area inset when greater than 0. */
  keyboardOverlap?: number | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  bodyStyle?: StyleProp<ViewStyle> | undefined;
  bodyClassName?: string | undefined;
  footerStyle?: StyleProp<ViewStyle> | undefined;
  footerClassName?: string | undefined;
  unstyled?: never;
}

type InternallyScrolledSheetProps = {
  scrollMode?: 'internal' | undefined;
  children: NonNullable<ReactNode>;
  contentContainerStyle?: StyleProp<ViewStyle> | undefined;
  contentContainerClassName?: string | undefined;
};

type ConsumerScrolledSheetProps = {
  scrollMode: 'provided';
  /** A single ScrollView, FlatList, or other consumer-owned scroll element. */
  children: ReactElement;
  contentContainerStyle?: never;
  contentContainerClassName?: never;
};

export type SheetProps = SheetBaseProps &
  (InternallyScrolledSheetProps | ConsumerScrolledSheetProps);

type PhysicalSide = 'left' | 'right';

const getStyles = themedStyles((theme: Theme) => ({
  bottomOverlay: {
    alignItems: 'stretch' as const,
    justifyContent: 'flex-end' as const,
    paddingBottom: theme.spacing.none,
    paddingLeft: theme.spacing.none,
    paddingRight: theme.spacing.none,
  },
  sideOverlay: {
    justifyContent: 'flex-start' as const,
    paddingBottom: theme.spacing.none,
    paddingLeft: theme.spacing.none,
    paddingRight: theme.spacing.none,
    paddingTop: theme.spacing.none,
  },
  bottomContent: {
    alignSelf: 'center' as const,
  },
  sideContent: {
    height: '100%' as const,
    maxHeight: '100%' as const,
  },
  panel: {
    gap: theme.spacing.lg,
    minHeight: theme.metrics.control.lg,
  },
  body: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  internalScroll: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  contentContainer: {
    gap: theme.spacing.md,
  },
  footer: {
    flexShrink: 0,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function assertNonEmptyString(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(
  value: string | undefined,
  label: string,
): void {
  if (value !== undefined) assertNonEmptyString(value, label);
}

function assertFiniteNonNegative(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${label} must be finite and greater than or equal to 0.`,
    );
  }
  return value;
}

function assertPresentation(value: string): asserts value is SheetPresentation {
  if (
    value !== 'auto' &&
    value !== 'bottom' &&
    value !== 'start' &&
    value !== 'end'
  ) {
    throw new Error(
      'Sheet presentation must be "auto", "bottom", "start", or "end".',
    );
  }
}

function assertScrollMode(value: string): asserts value is 'internal' | 'provided' {
  if (value !== 'internal' && value !== 'provided') {
    throw new Error('Sheet scrollMode must be "internal" or "provided".');
  }
}

function resolvePhysicalSide(
  presentation: Exclude<SheetPresentation, 'auto' | 'bottom'>,
): PhysicalSide {
  if (presentation === 'start') {
    return I18nManager.isRTL ? 'right' : 'left';
  }
  return I18nManager.isRTL ? 'left' : 'right';
}

function contentContainerClassProps(
  className: string | undefined,
): Record<string, unknown> {
  return className === undefined ? {} : { contentContainerClassName: className };
}

/** Controlled adaptive sheet. It only requests closure; the caller owns open. */
export function Sheet({
  children,
  open,
  onOpenChange,
  title,
  description,
  leading,
  footer,
  presentation = 'auto',
  accessibilityLabel,
  closeAccessibilityLabel,
  dismissOnBackdrop = true,
  dismissDisabled = false,
  initialFocusRef,
  finalFocusRef,
  overlayId: overlayIdProp,
  safeAreaInsets,
  keyboardOverlap = 0,
  scrollMode = 'internal',
  titleStyle,
  bodyStyle,
  bodyClassName,
  footerStyle,
  footerClassName,
  style,
  className,
  testID,
  ...scrollProps
}: SheetProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const { height, width } = useWindowDimensions();
  const reactId = sanitizeId(useId());
  const overlayId = overlayIdProp ?? `gj-sheet-${reactId}`;
  const reduceMotion = useReducedMotion();
  const [cycleAnimation, setCycleAnimation] = useState<
    'none' | 'slide' | 'fade'
  >('none');

  assertNonEmptyString(title, 'Sheet title');
  assertOptionalNonEmptyString(description, 'Sheet description');
  assertOptionalNonEmptyString(accessibilityLabel, 'Sheet accessibilityLabel');
  assertOptionalNonEmptyString(
    closeAccessibilityLabel,
    'Sheet closeAccessibilityLabel',
  );
  assertOptionalNonEmptyString(overlayIdProp, 'Sheet overlayId');
  assertPresentation(presentation);
  assertScrollMode(scrollMode);
  if (children === null || children === undefined) {
    throw new Error('Sheet children must be non-null.');
  }
  if (scrollMode === 'provided' && !isValidElement(children)) {
    throw new Error(
      'Sheet children must be a single React element when scrollMode is "provided".',
    );
  }

  const safeTop = assertFiniteNonNegative(
    safeAreaInsets?.top ?? 0,
    'Sheet safeAreaInsets.top',
  );
  const safeRight = assertFiniteNonNegative(
    safeAreaInsets?.right ?? 0,
    'Sheet safeAreaInsets.right',
  );
  const safeBottom = assertFiniteNonNegative(
    safeAreaInsets?.bottom ?? 0,
    'Sheet safeAreaInsets.bottom',
  );
  const safeLeft = assertFiniteNonNegative(
    safeAreaInsets?.left ?? 0,
    'Sheet safeAreaInsets.left',
  );
  const safeKeyboardOverlap = assertFiniteNonNegative(
    keyboardOverlap,
    'Sheet keyboardOverlap',
  );
  const bottomAvoidance =
    safeKeyboardOverlap > theme.spacing.none
      ? safeKeyboardOverlap
      : safeBottom;
  const resolvedPresentation =
    presentation === 'auto'
      ? width < theme.breakpoints.tablet
        ? 'bottom'
        : 'end'
      : presentation;
  const physicalSide =
    resolvedPresentation === 'bottom'
      ? null
      : resolvePhysicalSide(resolvedPresentation);
  const preferredAnimation =
    reduceMotion === false
      ? resolvedPresentation === 'bottom'
        ? 'slide'
        : 'fade'
      : 'none';
  useEffect(() => {
    if (reduceMotion === true) {
      // Reduce motion immediately, including while the sheet is visible.
      setCycleAnimation('none');
    } else if (!open) {
      // Prepare the next entrance only after a closed state commits. Learning
      // the preference or crossing a breakpoint while already open must not
      // replay RNW entrance keyframes. This state-based latch is safe when a
      // concurrent close render is aborted because effects never commit.
      setCycleAnimation(preferredAnimation);
    }
  }, [open, preferredAnimation, reduceMotion]);
  const viewportHeight =
    height > theme.spacing.none ? height : theme.breakpoints.tablet;
  const bottomTopGap = Math.max(theme.spacing.xl, safeTop);
  const maxHeight =
    resolvedPresentation === 'bottom'
      ? Math.max(
          theme.metrics.control.lg,
          viewportHeight - bottomTopGap,
        )
      : viewportHeight;
  const panelInvariant: ViewStyle = {
    borderBottomLeftRadius:
      resolvedPresentation === 'bottom' || physicalSide === 'left'
        ? theme.radius.none
        : theme.radius.lg,
    borderBottomRightRadius:
      resolvedPresentation === 'bottom' || physicalSide === 'right'
        ? theme.radius.none
        : theme.radius.lg,
    borderTopLeftRadius:
      physicalSide === 'left' ? theme.radius.none : theme.radius.lg,
    borderTopRightRadius:
      physicalSide === 'right' ? theme.radius.none : theme.radius.lg,
    height: resolvedPresentation === 'bottom' ? undefined : '100%',
    maxHeight,
    overflow: 'hidden',
    paddingTop:
      theme.spacing.xxl +
      (resolvedPresentation === 'bottom' ? theme.spacing.none : safeTop),
    paddingRight: theme.spacing.xxl + safeRight,
    paddingBottom: theme.spacing.xxl + bottomAvoidance,
    paddingLeft: theme.spacing.xxl + safeLeft,
  };
  const sideAlignment =
    physicalSide === null
      ? undefined
      : physicalSide === 'left'
        ? 'flex-start'
        : 'flex-end';
  const animationType =
    reduceMotion === true ? 'none' : cycleAnimation;
  const contentContainerStyle =
    scrollMode === 'internal'
      ? scrollProps.contentContainerStyle
      : undefined;
  const contentContainerClassName =
    scrollMode === 'internal'
      ? scrollProps.contentContainerClassName
      : undefined;
  const renderedFooter =
    footer === undefined || footer === null ? undefined : (
      <View
        testID={testID === undefined ? undefined : `${testID}-footer`}
        {...nativeWindProps(footerClassName)}
        style={[styles.footer, footerStyle, { flexShrink: 0 }]}
      >
        {footer}
      </View>
    );

  const handleDismiss = (details: DialogDismissDetails): void => {
    onOpenChange(false, details);
  };

  return (
    <Dialog
      visible={open}
      onDismiss={handleDismiss}
      dismissOnBackdrop={dismissOnBackdrop}
      dismissDisabled={dismissDisabled}
      accessibilityLabel={accessibilityLabel}
      initialFocusRef={initialFocusRef}
      finalFocusRef={finalFocusRef}
      overlayId={overlayId}
      overlayStyle={[
        resolvedPresentation === 'bottom'
          ? styles.bottomOverlay
          : styles.sideOverlay,
        physicalSide === null
          ? { paddingTop: bottomTopGap }
          : { alignItems: sideAlignment },
      ]}
      contentStyle={[
        resolvedPresentation === 'bottom'
          ? styles.bottomContent
          : styles.sideContent,
        physicalSide === null
          ? null
          : { alignSelf: sideAlignment, height: '100%', maxHeight: '100%' },
      ]}
      animationType={animationType}
      testID={testID}
    >
      <DialogPanel
        title={title}
        description={description}
        leading={leading}
        footer={renderedFooter}
        titleStyle={titleStyle}
        closeAccessibilityLabel={closeAccessibilityLabel}
        closeButtonTestID={
          testID === undefined ? undefined : `${testID}-close`
        }
        className={className}
        testID={testID === undefined ? undefined : `${testID}-panel`}
        style={[styles.panel, style, panelInvariant]}
      >
        <View
          testID={testID === undefined ? undefined : `${testID}-body`}
          {...nativeWindProps(bodyClassName)}
          style={[
            styles.body,
            bodyStyle,
            {
              flex: resolvedPresentation === 'bottom' ? undefined : 1,
              flexShrink: 1,
              minHeight: theme.spacing.none,
            },
          ]}
        >
          {scrollMode === 'internal' ? (
            <ScrollView
              testID={
                testID === undefined ? undefined : `${testID}-body-scroll`
              }
              keyboardShouldPersistTaps="handled"
              style={[
                styles.internalScroll,
                { flexShrink: 1, minHeight: theme.spacing.none },
              ]}
              contentContainerStyle={[
                styles.contentContainer,
                contentContainerStyle,
              ]}
              {...contentContainerClassProps(contentContainerClassName)}
            >
              {children}
            </ScrollView>
          ) : (
            children
          )}
        </View>
      </DialogPanel>
    </Dialog>
  );
}
