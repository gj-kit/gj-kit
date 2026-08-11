import type { ReactNode } from 'react';

export interface OverlayPortalEntry {
  readonly id: string;
  readonly node: ReactNode;
  readonly order: number;
}

export interface OverlayPortalSnapshot {
  readonly entries: readonly OverlayPortalEntry[];
  readonly activeHostId: string | null;
}

export interface OverlayPortalStore {
  readonly getSnapshot: () => OverlayPortalSnapshot;
  readonly getServerSnapshot: () => OverlayPortalSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly mount: (id: string, node: ReactNode) => void;
  readonly update: (id: string, node: ReactNode) => void;
  readonly unmount: (id: string) => void;
  readonly mountHost: (id: string) => void;
  readonly unmountHost: (id: string) => void;
}

const EMPTY_SNAPSHOT: OverlayPortalSnapshot = Object.freeze({
  entries: Object.freeze([]),
  activeHostId: null,
});

/**
 * Provider 인스턴스마다 하나씩 만드는 portal registry.
 * 모듈 전역 상태가 아니므로 여러 앱 root·중첩 native Modal scope가 서로 격리된다.
 */
export function createOverlayPortalStore(): OverlayPortalStore {
  const listeners = new Set<() => void>();
  const entries = new Map<string, OverlayPortalEntry>();
  const hostOrder: string[] = [];
  let nextOrder = 0;
  let snapshot = EMPTY_SNAPSHOT;

  const emit = (): void => {
    snapshot = Object.freeze({
      entries: Object.freeze([...entries.values()].sort((left, right) => left.order - right.order)),
      activeHostId: hostOrder.at(-1) ?? null,
    });
    for (const listener of listeners) listener();
  };

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_SNAPSHOT,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    mount: (id, node) => {
      const current = entries.get(id);
      entries.set(id, {
        id,
        node,
        order: current?.order ?? nextOrder++,
      });
      emit();
    },
    update: (id, node) => {
      const current = entries.get(id);
      if (current === undefined) return;
      if (Object.is(current.node, node)) return;
      entries.set(id, { ...current, node });
      emit();
    },
    unmount: (id) => {
      if (!entries.delete(id)) return;
      emit();
    },
    mountHost: (id) => {
      const currentIndex = hostOrder.indexOf(id);
      if (currentIndex >= 0) hostOrder.splice(currentIndex, 1);
      hostOrder.push(id);
      emit();
    },
    unmountHost: (id) => {
      const currentIndex = hostOrder.indexOf(id);
      if (currentIndex < 0) return;
      hostOrder.splice(currentIndex, 1);
      emit();
    },
  };
}
