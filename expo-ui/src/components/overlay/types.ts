/** Reasons shared by every product overlay. */
export type OverlayDismissReason =
  | 'backdrop-press'
  | 'outside-press'
  | 'escape-key'
  | 'hardware-back'
  | 'accessibility-escape'
  | 'close-action'
  | 'cancel-action'
  | 'action-select'
  | 'tab-key'
  | 'focus-out'
  | 'anchor-detached'
  | 'programmatic';

/** The callback payload is platform-neutral; native/DOM events remain opaque. */
export interface OverlayDismissDetails {
  readonly overlayId: string;
  readonly reason: OverlayDismissReason;
  readonly originalEvent?: unknown;
}

export interface OverlayStackRegistration {
  readonly id: string;
  readonly parentId?: string;
  readonly dismissible?: boolean;
  readonly onDismiss: (details: OverlayDismissDetails) => void;
}

export interface OverlayStackUpdate {
  /** `null` clears an existing parent without relying on optional-property ambiguity. */
  readonly parentId?: string | null;
  readonly dismissible?: boolean;
  readonly onDismiss?: (details: OverlayDismissDetails) => void;
}

export interface OverlayStackEntry {
  readonly id: string;
  readonly parentId?: string;
  readonly dismissible: boolean;
  readonly mountOrder: number;
}

export interface OverlayStackSnapshot {
  readonly entries: readonly OverlayStackEntry[];
  readonly topmost: OverlayStackEntry | null;
}

export type OverlayDismissResult =
  | {
      readonly status: 'dismissed';
      readonly overlayId: string;
    }
  | {
      readonly status: 'blocked';
      readonly overlayId: string;
      readonly blockerId: string;
      readonly blockReason: 'not-topmost' | 'not-dismissible';
    }
  | {
      readonly status: 'not-found';
      readonly overlayId: string;
    }
  | {
      readonly status: 'empty';
    };

export type OverlaySide = 'top' | 'right' | 'bottom' | 'left';
export type OverlayAlign = 'start' | 'center' | 'end';
export type OverlayPlacement = `${OverlaySide}-${OverlayAlign}`;
export type OverlayDirection = 'ltr' | 'rtl';

export interface OverlayPoint {
  readonly x: number;
  readonly y: number;
}

export interface OverlaySize {
  readonly width: number;
  readonly height: number;
}

export interface OverlayRect extends OverlayPoint, OverlaySize {}

export interface OverlayCollisionInsets {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

export interface OverlayOverflow {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface ComputeOverlayPositionOptions {
  readonly anchor: OverlayRect;
  readonly floating: OverlaySize;
  readonly viewport: OverlayRect;
  readonly placement: OverlayPlacement;
  readonly direction?: OverlayDirection;
  readonly sideOffset?: number;
  /** Positive values move toward logical end. */
  readonly alignOffset?: number;
  readonly collisionInsets?: number | OverlayCollisionInsets;
  readonly flip?: boolean;
  readonly shift?: boolean;
}

export interface OverlayPositionResult extends OverlayPoint {
  readonly placement: OverlayPlacement;
  readonly side: OverlaySide;
  readonly align: OverlayAlign;
  readonly flipped: boolean;
  readonly shifted: boolean;
  /** True when the anchor has no visible intersection with the collision boundary. */
  readonly detached: boolean;
  /** Space available on the resolved side, inside the collision boundary. */
  readonly availableWidth: number;
  readonly availableHeight: number;
  readonly overflow: OverlayOverflow;
}

export interface TypeaheadItem {
  readonly id: string;
  readonly textValue: string;
  readonly disabled?: boolean;
}

export interface TypeaheadState {
  readonly query: string;
  readonly lastTypedAt: number | null;
  readonly lastMatchId: string | null;
}

export interface FindTypeaheadMatchOptions<T extends TypeaheadItem> {
  readonly items: readonly T[];
  readonly state: TypeaheadState;
  readonly input: string;
  readonly now: number;
  readonly activeId?: string | null;
  readonly timeoutMs?: number;
  readonly locale?: string | readonly string[];
}

export interface TypeaheadMatchResult<T extends TypeaheadItem> {
  readonly state: TypeaheadState;
  readonly match: T | null;
  readonly matchIndex: number;
}

export type PresencePhase = 'unmounted' | 'entering' | 'present' | 'exiting';

export interface PresenceState {
  readonly phase: PresencePhase;
  /** Monotonic token that rejects completions from an older same-phase animation. */
  readonly transitionId: number;
  readonly isMounted: boolean;
  readonly isInteractive: boolean;
  /** Exiting visuals stay mounted but must stop blocking or dismissing other overlays. */
  readonly participatesInOverlayStack: boolean;
}

export type PresenceAction =
  | {
      readonly type: 'set-present';
      readonly present: boolean;
      readonly hasMotion: boolean;
    }
  | {
      readonly type: 'animation-complete';
      /** Must be captured from the state that started this animation. */
      readonly phase: 'entering' | 'exiting';
      readonly transitionId: number;
    };
