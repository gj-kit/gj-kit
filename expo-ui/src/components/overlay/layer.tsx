import { createContext, useContext } from 'react';
import type { ReactElement, ReactNode } from 'react';

const OverlayParentContext = createContext<string | undefined>(undefined);

export interface OverlayLayerBoundaryProps {
  readonly overlayId: string;
  readonly children: ReactNode;
}

export interface OverlayParentResetBoundaryProps {
  readonly children: ReactNode;
}

/** Marks every nested overlay as a child of the current mounted overlay. */
export function OverlayLayerBoundary({
  overlayId,
  children,
}: OverlayLayerBoundaryProps): ReactElement {
  return (
    <OverlayParentContext.Provider value={overlayId}>
      {children}
    </OverlayParentContext.Provider>
  );
}

/** Starts ancestry for a fresh overlay stack without inheriting an outer stack's id. */
export function OverlayParentResetBoundary({
  children,
}: OverlayParentResetBoundaryProps): ReactElement {
  return (
    <OverlayParentContext.Provider value={undefined}>
      {children}
    </OverlayParentContext.Provider>
  );
}

/** Internal overlay ancestry channel. Absence means the next overlay is a root layer. */
export function useOverlayParentId(): string | undefined {
  return useContext(OverlayParentContext);
}
