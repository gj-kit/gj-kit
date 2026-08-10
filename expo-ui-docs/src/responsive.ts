import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

const STATIC_RENDER_WIDTH = 1200;

/**
 * Static HTML and the browser's first render must choose the same responsive tree.
 * After hydration, React Native Web's live viewport becomes the source of truth.
 */
export function useHydratedWindowWidth(): number {
  const { width } = useWindowDimensions();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return hydrated ? width : STATIC_RENDER_WIDTH;
}
