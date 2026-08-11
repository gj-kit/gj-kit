/**
 * Internal registry relocation experiment.
 *
 * This is deliberately split from the public OverlayProvider so unused Host
 * rendering code never enters product bundles. It is not a React portal and is
 * not part of the package root API.
 */
import {
  Fragment,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { nativeWindProps } from '../internal';
import type { OverlayPortalStore } from './portal-store';
import { useOptionalOverlayPortalStore } from './provider';

export interface OverlayHostProps {
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

/** The most recently mounted Host becomes the active host of that Provider scope. */
export function OverlayHost({ style, className, testID }: OverlayHostProps): ReactElement | null {
  const store = useRequiredOverlayPortalStore('OverlayHost');
  const id = useId();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  useLayoutEffect(() => {
    store.mountHost(id);
    return () => store.unmountHost(id);
  }, [id, store]);

  if (snapshot.activeHostId !== null && snapshot.activeHostId !== id) return null;

  const position = (Platform.OS === 'web' ? 'fixed' : 'absolute') as ViewStyle['position'];
  return (
    <View
      collapsable={false}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        StyleSheet.absoluteFillObject,
        { position, pointerEvents: 'box-none' },
        style,
      ]}
    >
      {snapshot.entries.map((entry) => (
        <Fragment key={entry.id}>{entry.node}</Fragment>
      ))}
    </View>
  );
}

export interface OverlayPortalProps {
  children: NonNullable<ReactNode>;
}

/** For internal primitives. A public product component has to own the semantics and dismiss policy first. */
export function OverlayPortal({ children }: OverlayPortalProps): null {
  const store = useRequiredOverlayPortalStore('OverlayPortal');
  const id = useId();
  const latestNodeRef = useRef<ReactNode>(children);
  latestNodeRef.current = children;

  useLayoutEffect(() => {
    store.mount(id, latestNodeRef.current);
    return () => store.unmount(id);
  }, [id, store]);

  useLayoutEffect(() => {
    store.update(id, children);
  }, [children, id, store]);

  return null;
}

function useRequiredOverlayPortalStore(componentName: string): OverlayPortalStore {
  const store = useOptionalOverlayPortalStore();
  if (store === null) {
    throw new Error(`${componentName} must be rendered inside OverlayProvider.`);
  }
  return store;
}
