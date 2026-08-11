import type { PresenceAction, PresenceState } from './types';

const UNMOUNTED: PresenceState = {
  phase: 'unmounted',
  transitionId: 0,
  isMounted: false,
  isInteractive: false,
  participatesInOverlayStack: false,
};

const ENTERING: PresenceState = {
  phase: 'entering',
  transitionId: 0,
  isMounted: true,
  isInteractive: true,
  participatesInOverlayStack: true,
};

const PRESENT: PresenceState = {
  phase: 'present',
  transitionId: 0,
  isMounted: true,
  isInteractive: true,
  participatesInOverlayStack: true,
};

const EXITING: PresenceState = {
  phase: 'exiting',
  transitionId: 0,
  isMounted: true,
  isInteractive: false,
  participatesInOverlayStack: false,
};

export function createPresenceState(present: boolean): PresenceState {
  return present ? PRESENT : UNMOUNTED;
}

function withTransitionId(state: PresenceState, transitionId: number): PresenceState {
  return transitionId === state.transitionId ? state : { ...state, transitionId };
}

/** Pure lifecycle reducer. Animation drivers only report phase-tagged completion. */
export function presenceReducer(state: PresenceState, action: PresenceAction): PresenceState {
  if (action.type === 'animation-complete') {
    if (state.phase !== action.phase || state.transitionId !== action.transitionId) return state;
    return withTransitionId(
      action.phase === 'entering' ? PRESENT : UNMOUNTED,
      state.transitionId,
    );
  }

  if (action.present) {
    if (state.phase === 'present' || state.phase === 'entering') return state;
    return withTransitionId(action.hasMotion ? ENTERING : PRESENT, state.transitionId + 1);
  }

  if (state.phase === 'unmounted' || state.phase === 'exiting') return state;
  return withTransitionId(action.hasMotion ? EXITING : UNMOUNTED, state.transitionId + 1);
}
