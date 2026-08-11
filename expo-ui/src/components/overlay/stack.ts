import type {
  OverlayDismissReason,
  OverlayDismissResult,
  OverlayStackEntry,
  OverlayStackRegistration,
  OverlayStackSnapshot,
  OverlayStackUpdate,
} from './types';

interface InternalEntry extends OverlayStackEntry {
  readonly token: symbol;
  readonly onDismiss: OverlayStackRegistration['onDismiss'];
}

export interface OverlayStackHandle {
  readonly update: (update: OverlayStackUpdate) => void;
  readonly unmount: () => void;
}

export interface OverlayStack {
  readonly mount: (registration: OverlayStackRegistration) => OverlayStackHandle;
  readonly update: (id: string, update: OverlayStackUpdate) => void;
  /** Unmounting a parent also removes every registered descendant. */
  readonly unmount: (id: string) => void;
  readonly getSnapshot: () => OverlayStackSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly isTopmost: (id: string) => boolean;
  readonly isDescendant: (id: string, ancestorId: string) => boolean;
  readonly requestDismiss: (
    id: string,
    reason: OverlayDismissReason,
    originalEvent?: unknown,
  ) => OverlayDismissResult;
  readonly requestTopmostDismiss: (
    reason: OverlayDismissReason,
    originalEvent?: unknown,
  ) => OverlayDismissResult;
}

function publicEntry(entry: InternalEntry): OverlayStackEntry {
  const base = {
    id: entry.id,
    dismissible: entry.dismissible,
    mountOrder: entry.mountOrder,
  };

  return Object.freeze(
    entry.parentId === undefined ? base : { ...base, parentId: entry.parentId },
  );
}

function assertId(id: string, label: string): void {
  if (id.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

/** Creates an isolated stack. No registration leaks across OverlayProvider instances. */
export function createOverlayStack(): OverlayStack {
  const entries = new Map<string, InternalEntry>();
  const listeners = new Set<() => void>();
  let mountOrder = 0;
  let snapshot: OverlayStackSnapshot = Object.freeze({
    entries: Object.freeze([]),
    topmost: null,
  });

  function lineageMountOrder(entry: InternalEntry): number {
    let order = entry.mountOrder;
    let cursor = entry.parentId;
    const visited = new Set<string>();
    while (cursor !== undefined && !visited.has(cursor)) {
      visited.add(cursor);
      const parent = entries.get(cursor);
      if (parent === undefined) break;
      order = Math.max(order, parent.mountOrder);
      cursor = parent.parentId;
    }
    return order;
  }

  /**
   * React mounts child layout effects before parent effects. A controlled
   * Dialog and its initially-open child overlay can therefore register in the
   * reverse of their visual ancestry. The branch's latest lineage order keeps
   * unrelated overlays chronological while an actual descendant always stays
   * above its parent.
   */
  function compareStackOrder(left: InternalEntry, right: InternalEntry): number {
    const leftLineageOrder = lineageMountOrder(left);
    const rightLineageOrder = lineageMountOrder(right);
    if (leftLineageOrder !== rightLineageOrder) {
      return leftLineageOrder - rightLineageOrder;
    }
    if (isDescendant(left.id, right.id)) return 1;
    if (isDescendant(right.id, left.id)) return -1;
    return left.mountOrder - right.mountOrder;
  }

  function topmostInternal(): InternalEntry | undefined {
    return [...entries.values()].sort(compareStackOrder).at(-1);
  }

  function rebuildSnapshot(): void {
    const ordered = Object.freeze(
      [...entries.values()]
        .sort(compareStackOrder)
        .map(publicEntry),
    );

    snapshot = Object.freeze({
      entries: ordered,
      topmost: ordered.at(-1) ?? null,
    });
  }

  function emit(): void {
    rebuildSnapshot();
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function wouldCreateCycle(id: string, parentId: string | undefined): boolean {
    let cursor = parentId;
    const visited = new Set<string>();

    while (cursor !== undefined && !visited.has(cursor)) {
      if (cursor === id) return true;
      visited.add(cursor);
      cursor = entries.get(cursor)?.parentId;
    }

    return false;
  }

  function updateInternal(id: string, update: OverlayStackUpdate, token?: symbol): void {
    const current = entries.get(id);
    if (current === undefined || (token !== undefined && current.token !== token)) return;

    const nextParentId =
      update.parentId === null
        ? undefined
        : update.parentId === undefined
          ? current.parentId
          : update.parentId;

    if (nextParentId !== undefined) {
      assertId(nextParentId, 'Overlay parentId');
    }
    if (wouldCreateCycle(id, nextParentId)) {
      throw new Error(`Overlay parent relationship would create a cycle at "${id}".`);
    }

    const nextDismissible = update.dismissible ?? current.dismissible;
    const nextOnDismiss = update.onDismiss ?? current.onDismiss;
    const metadataChanged =
      nextParentId !== current.parentId || nextDismissible !== current.dismissible;
    const callbackChanged = nextOnDismiss !== current.onDismiss;

    if (!metadataChanged && !callbackChanged) return;

    const nextBase = {
      id: current.id,
      dismissible: nextDismissible,
      mountOrder: current.mountOrder,
      token: current.token,
      onDismiss: nextOnDismiss,
    };
    entries.set(
      id,
      nextParentId === undefined ? nextBase : { ...nextBase, parentId: nextParentId },
    );

    if (metadataChanged) emit();
  }

  function isDescendant(id: string, ancestorId: string): boolean {
    if (id === ancestorId) return false;

    let cursor = entries.get(id)?.parentId;
    const visited = new Set<string>();
    while (cursor !== undefined && !visited.has(cursor)) {
      if (cursor === ancestorId) return true;
      visited.add(cursor);
      cursor = entries.get(cursor)?.parentId;
    }
    return false;
  }

  function unmountInternal(id: string, token?: symbol): void {
    const current = entries.get(id);
    if (current === undefined || (token !== undefined && current.token !== token)) return;

    const idsToRemove = [id];
    for (const candidate of entries.keys()) {
      if (isDescendant(candidate, id)) idsToRemove.push(candidate);
    }
    for (const candidate of idsToRemove) entries.delete(candidate);
    emit();
  }

  function dispatch(
    entry: InternalEntry,
    reason: OverlayDismissReason,
    originalEvent?: unknown,
  ): OverlayDismissResult {
    if (!entry.dismissible) {
      return {
        status: 'blocked',
        overlayId: entry.id,
        blockerId: entry.id,
        blockReason: 'not-dismissible',
      };
    }

    entry.onDismiss(
      originalEvent === undefined
        ? { overlayId: entry.id, reason }
        : { overlayId: entry.id, reason, originalEvent },
    );
    return { status: 'dismissed', overlayId: entry.id };
  }

  function requestDismiss(
    id: string,
    reason: OverlayDismissReason,
    originalEvent?: unknown,
  ): OverlayDismissResult {
    const requested = entries.get(id);
    if (requested === undefined) return { status: 'not-found', overlayId: id };

    const topmost = topmostInternal();
    if (topmost !== undefined && topmost.id !== id) {
      return {
        status: 'blocked',
        overlayId: id,
        blockerId: topmost.id,
        blockReason: 'not-topmost',
      };
    }

    return dispatch(requested, reason, originalEvent);
  }

  function requestTopmostDismiss(
    reason: OverlayDismissReason,
    originalEvent?: unknown,
  ): OverlayDismissResult {
    const topmost = topmostInternal();
    return topmost === undefined ? { status: 'empty' } : dispatch(topmost, reason, originalEvent);
  }

  function mount(registration: OverlayStackRegistration): OverlayStackHandle {
    assertId(registration.id, 'Overlay id');
    if (entries.has(registration.id)) {
      throw new Error(`Overlay id "${registration.id}" is already mounted in this stack.`);
    }
    if (registration.parentId !== undefined) {
      assertId(registration.parentId, 'Overlay parentId');
      if (wouldCreateCycle(registration.id, registration.parentId)) {
        throw new Error(
          `Overlay parent relationship would create a cycle at "${registration.id}".`,
        );
      }
    }

    const token = Symbol(registration.id);
    const base: InternalEntry = {
      id: registration.id,
      dismissible: registration.dismissible ?? true,
      mountOrder: ++mountOrder,
      token,
      onDismiss: registration.onDismiss,
      ...(registration.parentId === undefined ? {} : { parentId: registration.parentId }),
    };
    entries.set(registration.id, base);
    emit();

    return {
      update: (update) => updateInternal(registration.id, update, token),
      unmount: () => unmountInternal(registration.id, token),
    };
  }

  return {
    mount,
    update: updateInternal,
    unmount: unmountInternal,
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    isTopmost: (id) => snapshot.topmost?.id === id,
    isDescendant,
    requestDismiss,
    requestTopmostDismiss,
  };
}
