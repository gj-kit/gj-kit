import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { OverlayParentResetBoundary } from './layer';
import { createOverlayPortalStore } from './portal-store';
import type { OverlayPortalStore } from './portal-store';
import { createOverlayStack } from './stack';
import type { OverlayStack } from './stack';
import { createTooltipCoordinator } from './tooltip-coordinator';
import type { TooltipCoordinator } from './tooltip-coordinator';

interface OverlayEnvironment {
  readonly portals: OverlayPortalStore;
  readonly stack: OverlayStack;
  readonly tooltips: TooltipCoordinator;
}

const OverlayContext = createContext<OverlayEnvironment | null>(null);

export interface OverlayProviderProps {
  children: ReactNode;
}

/**
 * Overlay registry scope. 앱 전역 Provider 아래, navigation tree 위에 두는 것이 기본이다.
 * 별도 native Modal 안에서 inline overlay가 필요하면 그 Modal 안에 새 scope를 만든다.
 */
export function OverlayProvider({ children }: OverlayProviderProps): ReactElement {
  const environmentRef = useRef<OverlayEnvironment | null>(null);
  const cleanupGenerationRef = useRef(0);
  if (environmentRef.current === null) {
    environmentRef.current = {
      portals: createOverlayPortalStore(),
      stack: createOverlayStack(),
      tooltips: createTooltipCoordinator(),
    };
  }
  const environment = environmentRef.current;

  useEffect(() => {
    const generation = ++cleanupGenerationRef.current;
    return () => {
      // React StrictMode immediately replays effects against the same Provider
      // instance. A microtask lets that replay claim a new generation before a
      // real scope teardown permanently destroys its coordinator.
      void Promise.resolve().then(() => {
        if (cleanupGenerationRef.current === generation) {
          environment.tooltips.destroy();
        }
      });
    };
  }, [environment]);

  return (
    <OverlayContext.Provider value={environment}>
      <OverlayParentResetBoundary>{children}</OverlayParentResetBoundary>
    </OverlayContext.Provider>
  );
}

export function useOptionalOverlayPortalStore(): OverlayPortalStore | null {
  return useContext(OverlayContext)?.portals ?? null;
}

/** 내부 product overlay가 같은 Provider scope의 dismiss stack을 공유하는 통로. */
export function useOptionalOverlayStack(): OverlayStack | null {
  return useContext(OverlayContext)?.stack ?? null;
}

/** Internal Tooltip instances coordinate delay and warm-up within this scope. */
export function useOptionalTooltipCoordinator(): TooltipCoordinator | null {
  return useContext(OverlayContext)?.tooltips ?? null;
}
