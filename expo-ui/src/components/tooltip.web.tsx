/** Browser Tooltip: visual description over the shared anchored-overlay kernel. */
import {
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactElement } from 'react';
import {
  I18nManager,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import type { ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { buttonPalette, PRESSABLE_FEEDBACK_CLASS } from './button';
import { renderIconSlot } from './icons';
import {
  elevationStyle,
  mergeClassNames,
  nativeWindProps,
  themedStyles,
} from './internal';
import { useOverlayParentId } from './overlay/layer';
import type { TooltipCoordinatorParticipant } from './overlay/tooltip-coordinator';
import type { OverlayDismissDetails } from './overlay/types';
import {
  useOptionalOverlayStack,
  useOptionalTooltipCoordinator,
} from './overlay/provider';
import { WebPopover } from './overlay/web-popover.web';
import type { WebPopoverElement } from './overlay/web-popover.web';
import { useTheme } from './provider';
import { roleTextStyle } from './text';
import { assertTooltipProps } from './tooltip.types';
import type { TooltipProps } from './tooltip.types';

const DEFAULT_OPEN_DELAY_MS = 700;
const DEFAULT_CLOSE_DELAY_MS = 100;

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignSelf: 'flex-start' as const,
  },
  trigger: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    justifyContent: 'center' as const,
  },
  triggerIcon: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  content: {
    alignSelf: 'flex-start' as const,
    borderRadius: theme.radius.sm,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  screenReaderDescription: {
    position: 'absolute' as const,
    width: 1,
    height: 1,
    margin: -1,
    opacity: 0,
    overflow: 'hidden' as const,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return values;
}

export function Tooltip(props: TooltipProps): ReactElement {
  assertTooltipProps(props);
  const {
    content,
    triggerLabel,
    triggerIcon,
    onPress,
    tooltipDisabled = false,
    delayMs = DEFAULT_OPEN_DELAY_MS,
    closeDelayMs = DEFAULT_CLOSE_DELAY_MS,
    placement = 'top-center',
    direction = I18nManager.isRTL ? 'rtl' : 'ltr',
    sideOffset,
    collisionPadding,
    size = 'sm',
    variant = 'secondary',
    style,
    className,
    triggerStyle,
    triggerClassName,
    contentStyle,
    contentClassName,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const stack = useOptionalOverlayStack();
  const coordinator = useOptionalTooltipCoordinator();
  const parentId = useOverlayParentId();
  if (stack === null || coordinator === null) {
    throw new Error('Tooltip must be rendered inside OverlayProvider.');
  }

  const generatedId = sanitizeId(useId());
  const tooltipId = `gj-tooltip-${generatedId}`;
  const descriptionId = `${tooltipId}-description`;
  const overlayId = `${tooltipId}-overlay`;
  const triggerRef = useRef<WebPopoverElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const focusedRef = useRef(false);
  const triggerHoveredRef = useRef(false);
  const contentHoveredRef = useRef(false);
  const tooltipDisabledRef = useRef(tooltipDisabled);
  tooltipDisabledRef.current = tooltipDisabled;
  const [open, setOpen] = useState(false);
  openRef.current = open;

  const clearCloseTimer = useCallback((): void => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const participant = useMemo<TooltipCoordinatorParticipant>(
    () => ({
      id: overlayId,
      onOpen: () => {
        clearCloseTimer();
        if (tooltipDisabledRef.current) {
          coordinator.notifyClosed(overlayId, 0);
          return;
        }
        openRef.current = true;
        setOpen(true);
      },
      onClose: () => {
        clearCloseTimer();
        openRef.current = false;
        setOpen(false);
      },
    }),
    [clearCloseTimer, coordinator, overlayId],
  );

  const closeNow = useCallback((): void => {
    clearCloseTimer();
    coordinator.cancelOpen(overlayId);
    if (!openRef.current) return;
    openRef.current = false;
    setOpen(false);
    coordinator.notifyClosed(overlayId, closeDelayMs);
  }, [clearCloseTimer, closeDelayMs, coordinator, overlayId]);

  const scheduleClose = useCallback((): void => {
    coordinator.cancelOpen(overlayId);
    clearCloseTimer();
    if (!openRef.current || focusedRef.current) return;
    if (closeDelayMs === 0) {
      closeNow();
      return;
    }
    closeTimerRef.current = setTimeout(closeNow, closeDelayMs);
  }, [clearCloseTimer, closeDelayMs, closeNow, coordinator, overlayId]);

  const scheduleOpen = useCallback((): void => {
    if (tooltipDisabled) return;
    clearCloseTimer();
    coordinator.requestOpen(participant, delayMs);
  }, [clearCloseTimer, coordinator, delayMs, participant, tooltipDisabled]);

  const openImmediately = useCallback((): void => {
    if (tooltipDisabled) return;
    clearCloseTimer();
    coordinator.openNow(participant);
  }, [clearCloseTimer, coordinator, participant, tooltipDisabled]);

  const handleTriggerHoverIn = useCallback((): void => {
    triggerHoveredRef.current = true;
    scheduleOpen();
  }, [scheduleOpen]);

  const handleTriggerHoverOut = useCallback((): void => {
    triggerHoveredRef.current = false;
    if (!contentHoveredRef.current) scheduleClose();
  }, [scheduleClose]);

  const handleContentPointerEnter = useCallback((): void => {
    contentHoveredRef.current = true;
    clearCloseTimer();
  }, [clearCloseTimer]);

  const handleContentPointerLeave = useCallback((): void => {
    contentHoveredRef.current = false;
    if (!triggerHoveredRef.current) scheduleClose();
  }, [scheduleClose]);

  const handleFocus = useCallback((): void => {
    focusedRef.current = true;
    openImmediately();
  }, [openImmediately]);

  const handleBlur = useCallback((): void => {
    focusedRef.current = false;
    closeNow();
  }, [closeNow]);

  const handlePress = useCallback((): void => {
    closeNow();
    onPress();
  }, [closeNow, onPress]);

  const handleDismiss = useCallback(
    (_details: OverlayDismissDetails): void => closeNow(),
    [closeNow],
  );

  useLayoutEffect(() => {
    if (!tooltipDisabled) return;
    closeNow();
  }, [closeNow, tooltipDisabled]);

  useLayoutEffect(() => {
    if (!open) return;
    const ownerDocument = triggerRef.current?.ownerDocument;
    if (ownerDocument === null || ownerDocument === undefined) return;
    const onScroll = (): void => closeNow();
    ownerDocument.addEventListener('scroll', onScroll, true);
    return () => ownerDocument.removeEventListener('scroll', onScroll, true);
  }, [closeNow, open]);

  useLayoutEffect(
    () => () => {
      clearCloseTimer();
      coordinator.release(overlayId);
    },
    [clearCloseTimer, coordinator, overlayId],
  );

  const diameter = size === 'sm' ? theme.metrics.control.md : theme.metrics.control.lg;
  const palette = buttonPalette(variant, false, theme);
  const triggerWebProps = webProps({
    role: 'button',
    tabIndex: 0,
    'aria-label': triggerLabel,
    ...(tooltipDisabled ? {} : { 'aria-describedby': descriptionId }),
  });
  const contentWebProps = webProps({
    onPointerEnter: handleContentPointerEnter,
    onPointerLeave: handleContentPointerLeave,
  });

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      {tooltipDisabled ? null : (
        <RNText
          nativeID={descriptionId}
          maxFontSizeMultiplier={theme.metrics.maxFontScale}
          style={styles.screenReaderDescription}
        >
          {content}
        </RNText>
      )}
      <Pressable
        ref={(node) => {
          triggerRef.current = node as unknown as WebPopoverElement | null;
        }}
        accessibilityRole="button"
        accessibilityLabel={triggerLabel}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onHoverIn={handleTriggerHoverIn}
        onHoverOut={handleTriggerHoverOut}
        onPress={handlePress}
        {...(triggerWebProps as unknown as Record<string, unknown>)}
        {...nativeWindProps(mergeClassNames(PRESSABLE_FEEDBACK_CLASS, triggerClassName))}
        style={({ pressed }) => [
          styles.trigger,
          {
            width: diameter,
            height: diameter,
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor ?? palette.backgroundColor,
            borderWidth: palette.borderColor ? StyleSheet.hairlineWidth : 0,
            opacity: pressed ? 0.9 : 1,
          },
          triggerStyle,
        ]}
      >
        <View
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.triggerIcon}
        >
          {renderIconSlot(triggerIcon, {
            color: palette.textColor,
            size: theme.metrics.icon.md,
          })}
        </View>
      </Pressable>

      <WebPopover
        open={open && !tooltipDisabled}
        overlayId={overlayId}
        overlayStack={stack}
        onDismiss={handleDismiss}
        triggerRef={triggerRef}
        parentId={parentId}
        placement={placement}
        direction={direction}
        sideOffset={sideOffset ?? theme.spacing.sm}
        collisionInsets={collisionPadding ?? theme.spacing.md}
        role="tooltip"
        domId={tooltipId}
        onDetachedChange={(detached) => {
          if (detached) closeNow();
        }}
      >
        <View
          {...contentWebProps}
          {...nativeWindProps(contentClassName)}
          style={[
            styles.content,
            {
              maxWidth: theme.breakpoints.tablet / 2,
              backgroundColor: theme.colors.text,
              ...elevationStyle(theme.elevation.sm, theme.colors.shadow),
            } as unknown as ViewStyle,
            contentStyle,
          ]}
        >
          <RNText
            maxFontSizeMultiplier={theme.metrics.maxFontScale}
            style={[
              roleTextStyle(theme, 'caption'),
              { color: theme.colors.background },
            ]}
          >
            {content}
          </RNText>
        </View>
      </WebPopover>
    </View>
  );
}
