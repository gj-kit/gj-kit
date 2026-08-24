/**
 * Shared native anchored surface for Menu/Select.
 *
 * A transparent full-window Modal hosts a panel positioned by the measured
 * trigger frame — the same placement/sideOffset/collisionPadding vocabulary
 * as the web popup. The backdrop paints nothing but still owns every outside
 * gesture: an outside tap (or an attempted scroll of the content underneath)
 * dismisses the panel instead of reaching the page — dismiss-on-scroll, not
 * reposition, is the deliberate policy. Keyboard Escape, hardware Back, and
 * the accessibility escape are inherited from Dialog unchanged. A re-measured
 * trigger that leaves the collision boundary closes the panel with reason
 * 'anchor-detached', matching the web popup. The Modal draws with translucent
 * status/navigation bars on Android so its window shares the coordinate
 * origin `measureInWindow` reports (real-device verification is tracked as a
 * design-doc §12 residual risk — jsdom cannot model the Android Modal window).
 */
import { useCallback, useEffect, useState } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { Dialog } from './dialog';
import type { DialogDismissDetails, DialogFocusRef } from './dialog';
import { elevationStyle, nativeWindProps, themedStyles } from './internal';
import { computeAnchoredPanelFrame } from './menu-select-anchored-position';
import type { NativeMenuSelectDismissDetails } from './menu-select-sheet.native';
import type {
  OverlayDirection,
  OverlayDismissDetails,
  OverlayPlacement,
  OverlayRect,
  OverlaySize,
} from './overlay/types';
import { useTheme } from './provider';

/** The imperative measurement surface every RN host (and RNW node) exposes. */
type MeasurableTriggerHost = {
  readonly measureInWindow?: (
    callback: (x: number, y: number, width: number, height: number) => void,
  ) => void;
};

/**
 * The anchored surface closes with the sheet vocabulary plus the web-parity
 * 'anchor-detached' reason (a re-measured trigger that left the collision
 * boundary). The sheets themselves never emit it.
 */
export type NativeAnchoredMenuSelectDismissDetails =
  | NativeMenuSelectDismissDetails
  | (OverlayDismissDetails & { readonly reason: 'anchor-detached' });

export interface NativeAnchoredMenuSelectPanelProps {
  readonly visible: boolean;
  readonly overlayId: string;
  /** Names the modal view for assistive technology. */
  readonly accessibilityLabel: string;
  readonly triggerRef: RefObject<unknown>;
  /** Bumped by the owner whenever the trigger's layout may have moved. */
  readonly anchorLayoutVersion: number;
  readonly placement?: OverlayPlacement | undefined;
  readonly direction?: OverlayDirection | undefined;
  readonly sideOffset?: number | undefined;
  readonly alignOffset?: number | undefined;
  readonly collisionPadding?: number | undefined;
  readonly dismissDisabled: boolean;
  readonly initialFocusRef?: DialogFocusRef | undefined;
  readonly finalFocusRef: DialogFocusRef;
  readonly onDismiss: (details: NativeAnchoredMenuSelectDismissDetails) => void;
  readonly children: NonNullable<ReactNode>;
  readonly contentStyle?: StyleProp<ViewStyle> | undefined;
  readonly contentClassName?: string | undefined;
  readonly testID?: string | undefined;
}

const getStyles = themedStyles((theme: Theme) => ({
  overlay: {
    alignItems: 'stretch' as const,
    justifyContent: 'flex-start' as const,
    padding: theme.spacing.none,
  },
  backdrop: {
    // anchored는 딤 없는 표면이다 — 백드롭은 아무것도 칠하지 않지만 바깥
    // 제스처는 여전히 소유해 outside-press dismiss를 담당한다.
    backgroundColor: 'transparent' as const,
  },
  content: {
    alignSelf: 'flex-start' as const,
    position: 'absolute' as const,
    width: 'auto' as const,
  },
  panel: {
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: theme.spacing.xs,
    minWidth: theme.metrics.control.lg * 4,
    padding: theme.spacing.xs,
  },
  itemsScroll: {
    flexShrink: 1,
    minHeight: theme.spacing.none,
  },
  items: {
    gap: theme.spacing.xs,
  },
}));

function sameRect(previous: OverlayRect | null, next: OverlayRect): boolean {
  return (
    previous !== null &&
    previous.x === next.x &&
    previous.y === next.y &&
    previous.width === next.width &&
    previous.height === next.height
  );
}

/**
 * The dim-less anchored panel behind Menu/Select `presentation="anchored"`.
 * Product components keep item roles and typed callbacks; this surface only
 * owns transparent-Modal presentation, measurement, and positioning.
 */
export function NativeAnchoredMenuSelectPanel({
  visible,
  overlayId,
  accessibilityLabel,
  triggerRef,
  anchorLayoutVersion,
  placement = 'bottom-start',
  direction = 'ltr',
  sideOffset = 0,
  alignOffset = 0,
  collisionPadding,
  dismissDisabled,
  initialFocusRef,
  finalFocusRef,
  onDismiss,
  children,
  contentStyle,
  contentClassName,
  testID,
}: NativeAnchoredMenuSelectPanelProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [anchor, setAnchor] = useState<OverlayRect | null>(null);
  const [panelSize, setPanelSize] = useState<OverlaySize | null>(null);

  const measureAnchor = useCallback((): void => {
    const host = triggerRef.current as MeasurableTriggerHost | null;
    if (host === null || host === undefined) return;
    if (typeof host.measureInWindow !== 'function') return;
    host.measureInWindow((x, y, width, height) => {
      // 분리 중인 host는 NaN을 보고할 수 있다 — 마지막 유효 프레임을 유지한다.
      if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(width) ||
        !Number.isFinite(height)
      ) {
        return;
      }
      const next: OverlayRect = { x, y, width, height };
      setAnchor((previous) => (sameRect(previous, next) ? previous : next));
    });
  }, [triggerRef]);

  useEffect(() => {
    if (!visible) {
      // 다음 오픈이 이전 프레임에 잠깐 그려지지 않도록 측정 상태를 비운다.
      setAnchor(null);
      setPanelSize(null);
      return;
    }
    measureAnchor();
    // anchorLayoutVersion·창 크기 변화는 열려 있는 동안 재측정을 트리거한다.
  }, [anchorLayoutVersion, measureAnchor, visible, windowHeight, windowWidth]);

  const handlePanelLayout = useCallback((event: LayoutChangeEvent): void => {
    const { width, height } = event.nativeEvent.layout;
    setPanelSize((previous) =>
      previous !== null && previous.width === width && previous.height === height
        ? previous
        : { width, height },
    );
  }, []);

  const handleDialogDismiss = useCallback(
    (details: DialogDismissDetails): void => {
      onDismiss(
        details.reason === 'close-action'
          ? {
              overlayId: details.overlayId,
              reason: 'cancel-action',
              ...(details.originalEvent === undefined
                ? {}
                : { originalEvent: details.originalEvent }),
            }
          : (details as NativeMenuSelectDismissDetails),
      );
    },
    [onDismiss],
  );

  const frame =
    anchor === null || panelSize === null
      ? null
      : computeAnchoredPanelFrame({
          anchor,
          panel: panelSize,
          window: { width: windowWidth, height: windowHeight },
          placement,
          direction,
          sideOffset,
          alignOffset,
          ...(collisionPadding === undefined ? {} : { collisionPadding }),
        });

  const anchorDetached = frame !== null && frame.detached;
  useEffect(() => {
    // 웹 패리티: 재측정된 트리거가 collision boundary를 벗어나면 보이는 앵커
    // 없이 가장자리에 clamp된 채 남지 않고 'anchor-detached'로 닫는다.
    // dismissDisabled는 웹과 동일하게 detach 정리도 보류한다(clamp 유지).
    if (!visible || !anchorDetached || dismissDisabled) return;
    onDismiss({ overlayId, reason: 'anchor-detached' });
  }, [anchorDetached, dismissDisabled, onDismiss, overlayId, visible]);

  return (
    <Dialog
      visible={visible}
      onDismiss={handleDialogDismiss}
      dismissDisabled={dismissDisabled}
      accessibilityLabel={accessibilityLabel}
      // anchored 표면은 즉시 나타난다 — 위치가 측정 후 확정되므로 입장
      // 애니메이션이 오히려 위치 점프처럼 보인다.
      animationType="none"
      // Android: Modal 창 좌표계를 measureInWindow 좌표계(전체 화면)와
      // 일치시킨다 — 비투명 Modal 창은 status bar 높이만큼 어긋난다.
      statusBarTranslucent
      navigationBarTranslucent
      initialFocusRef={initialFocusRef}
      finalFocusRef={finalFocusRef}
      overlayId={overlayId}
      overlayStyle={styles.overlay}
      backdropStyle={styles.backdrop}
      contentStyle={[
        styles.content,
        frame === null
          ? // 첫 레이아웃은 화면 밖이 아닌 원점에서 투명하게 측정한다 —
            // 자연 크기를 얻은 뒤에야 프레임이 확정된다.
            {
              left: 0,
              top: 0,
              maxWidth: windowWidth,
              opacity: 0,
              pointerEvents: 'none' as const,
            }
          : {
              left: frame.left,
              top: frame.top,
              maxWidth: frame.maxWidth,
              maxHeight: frame.maxHeight,
            },
      ]}
      testID={testID}
    >
      <View
        onLayout={handlePanelLayout}
        {...nativeWindProps(contentClassName)}
        testID={testID === undefined ? undefined : `${testID}-panel`}
        style={[
          styles.panel,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.textSubtle,
            maxHeight: frame === null ? undefined : frame.maxHeight,
            ...elevationStyle(theme.elevation.md, theme.colors.shadow),
          },
          contentStyle,
        ]}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          testID={testID === undefined ? undefined : `${testID}-items`}
          style={styles.itemsScroll}
          contentContainerStyle={styles.items}
        >
          {children}
        </ScrollView>
      </View>
    </Dialog>
  );
}
