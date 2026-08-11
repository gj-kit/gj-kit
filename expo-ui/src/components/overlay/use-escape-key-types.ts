export interface UseEscapeKeyOptions {
  readonly enabled: boolean;
  /** Return true only when this layer consumed the shared Escape event. */
  readonly onEscape: (event: unknown) => boolean;
}
