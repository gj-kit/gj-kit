/** Why an open tooltip was closed by its provider-scoped coordinator. */
export type TooltipCoordinatorCloseReason = 'superseded' | 'scope-destroyed';

/**
 * A visual tooltip instance registered with the provider-scoped coordinator.
 * Product components own rendering; this object only coordinates open timing.
 */
export interface TooltipCoordinatorParticipant {
  readonly id: string;
  readonly onOpen: () => void;
  readonly onClose: (reason: TooltipCoordinatorCloseReason) => void;
}

export interface TooltipCoordinatorSnapshot {
  readonly activeId: string | null;
  readonly pendingId: string | null;
  readonly warmed: boolean;
}

/**
 * Pure provider-scoped timing coordinator. It guarantees that at most one
 * tooltip is active, cancels stale delayed opens, and keeps a short warm window
 * so pointer travel across a toolbar does not repeatedly incur the first delay.
 */
export interface TooltipCoordinator {
  requestOpen: (
    participant: TooltipCoordinatorParticipant,
    delayMs: number,
  ) => void;
  openNow: (participant: TooltipCoordinatorParticipant) => void;
  cancelOpen: (id: string) => void;
  notifyClosed: (id: string, cooldownMs: number) => void;
  release: (id: string) => void;
  getSnapshot: () => TooltipCoordinatorSnapshot;
  destroy: () => void;
}

interface PendingOpen {
  readonly participant: TooltipCoordinatorParticipant;
  readonly timer: ReturnType<typeof setTimeout>;
}

function assertId(id: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error('Tooltip coordinator id must be a non-empty string.');
  }
}

function assertDelay(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a finite non-negative number.`);
  }
}

/** Creates one coordinator per OverlayProvider scope. */
export function createTooltipCoordinator(): TooltipCoordinator {
  let active: TooltipCoordinatorParticipant | null = null;
  let pending: PendingOpen | null = null;
  let warmed = false;
  let cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  const clearPending = (): void => {
    if (pending !== null) clearTimeout(pending.timer);
    pending = null;
  };

  const clearCooldown = (): void => {
    if (cooldownTimer !== null) clearTimeout(cooldownTimer);
    cooldownTimer = null;
  };

  const activate = (participant: TooltipCoordinatorParticipant): void => {
    if (destroyed) return;
    assertId(participant.id);
    clearPending();
    clearCooldown();
    warmed = true;

    const previous = active;
    if (previous?.id === participant.id) return;
    active = participant;
    previous?.onClose('superseded');
    participant.onOpen();
  };

  const requestOpen = (
    participant: TooltipCoordinatorParticipant,
    delayMs: number,
  ): void => {
    if (destroyed) return;
    assertId(participant.id);
    assertDelay(delayMs, 'Tooltip delayMs');
    if (active?.id === participant.id || pending?.participant.id === participant.id) return;

    clearPending();
    const effectiveDelay = active !== null || warmed ? 0 : delayMs;
    if (effectiveDelay === 0) {
      activate(participant);
      return;
    }

    const timer = setTimeout(() => {
      if (pending?.timer !== timer) return;
      pending = null;
      activate(participant);
    }, effectiveDelay);
    pending = { participant, timer };
  };

  const openNow = (participant: TooltipCoordinatorParticipant): void => {
    if (destroyed) return;
    activate(participant);
  };

  const cancelOpen = (id: string): void => {
    assertId(id);
    if (pending?.participant.id === id) clearPending();
  };

  const notifyClosed = (id: string, cooldownMs: number): void => {
    if (destroyed) return;
    assertId(id);
    assertDelay(cooldownMs, 'Tooltip cooldownMs');
    if (pending?.participant.id === id) clearPending();
    if (active?.id !== id) return;

    active = null;
    clearCooldown();
    if (cooldownMs === 0) {
      warmed = false;
      return;
    }
    warmed = true;
    cooldownTimer = setTimeout(() => {
      cooldownTimer = null;
      if (active === null && pending === null) warmed = false;
    }, cooldownMs);
  };

  const release = (id: string): void => {
    assertId(id);
    if (pending?.participant.id === id) clearPending();
    if (active?.id !== id) return;
    active = null;
    clearCooldown();
    warmed = false;
  };

  const getSnapshot = (): TooltipCoordinatorSnapshot => ({
    activeId: active?.id ?? null,
    pendingId: pending?.participant.id ?? null,
    warmed,
  });

  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    const previous = active;
    active = null;
    clearPending();
    clearCooldown();
    warmed = false;
    previous?.onClose('scope-destroyed');
  };

  return {
    requestOpen,
    openNow,
    cancelOpen,
    notifyClosed,
    release,
    getSnapshot,
    destroy,
  };
}
