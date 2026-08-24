/**
 * Pure frame math for the native anchored presentation of Menu/Select.
 *
 * Wraps the shared overlay geometry (`computeOverlayPosition`) with the native
 * specifics: the window is the collision boundary, `collisionPadding` insets
 * it uniformly, and the resolved available space is returned as max sizes so
 * the panel scrolls internally instead of escaping the window.
 */
// 웹 WebPopover와 같은 placement/sideOffset/collisionPadding 어휘를 그대로
// 쓴다 — flip/shift 정책 차이가 생기지 않도록 계산은 공유 함수에 위임한다.
import { computeOverlayPosition } from './overlay/position';
import type {
  OverlayDirection,
  OverlayPlacement,
  OverlayRect,
  OverlaySize,
} from './overlay/types';

export interface AnchoredPanelFrameOptions {
  /** The trigger frame in window coordinates (measureInWindow). */
  readonly anchor: OverlayRect;
  /** The panel's measured (unclamped or previously clamped) size. */
  readonly panel: OverlaySize;
  /** The window size the transparent Modal covers. */
  readonly window: OverlaySize;
  readonly placement?: OverlayPlacement | undefined;
  readonly direction?: OverlayDirection | undefined;
  readonly sideOffset?: number | undefined;
  readonly alignOffset?: number | undefined;
  /** Uniform inset of the collision boundary from the window edges. */
  readonly collisionPadding?: number | undefined;
}

export interface AnchoredPanelFrame {
  readonly left: number;
  readonly top: number;
  /** Collision-bounded caps for the panel; content scrolls inside them. */
  readonly maxWidth: number;
  readonly maxHeight: number;
  /** The placement actually resolved after collision flipping. */
  readonly placement: OverlayPlacement;
  readonly flipped: boolean;
  readonly shifted: boolean;
  /** True when the anchor no longer intersects the collision boundary. */
  readonly detached: boolean;
}

/** Computes where an anchored native panel sits inside the window. */
export function computeAnchoredPanelFrame(
  options: AnchoredPanelFrameOptions,
): AnchoredPanelFrame {
  const result = computeOverlayPosition({
    anchor: options.anchor,
    floating: options.panel,
    viewport: {
      x: 0,
      y: 0,
      width: options.window.width,
      height: options.window.height,
    },
    placement: options.placement ?? 'bottom-start',
    direction: options.direction ?? 'ltr',
    sideOffset: options.sideOffset ?? 0,
    alignOffset: options.alignOffset ?? 0,
    ...(options.collisionPadding === undefined
      ? {}
      : { collisionInsets: options.collisionPadding }),
    flip: true,
    shift: true,
  });
  return {
    left: result.x,
    top: result.y,
    maxWidth: Math.max(0, result.availableWidth),
    maxHeight: Math.max(0, result.availableHeight),
    placement: result.placement,
    flipped: result.flipped,
    shifted: result.shifted,
    detached: result.detached,
  };
}
