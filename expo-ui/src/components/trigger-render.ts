/**
 * The injected contract of the renderTrigger slot.
 *
 * The kit owns trigger behavior and accessibility; the consumer owns only the
 * visuals. Both a type-level union and runtime validation enforce that split.
 */
// 주입 객체는 선언된 키 외에도 플랫폼별 런타임 키(웹 aria 배선, aria-valuetext
// 등)를 실어 나른다 — 반환 요소에는 반드시 객체 전체를 spread해야 한다.
import type { GestureResponderEvent } from 'react-native';

/**
 * Props the kit injects into a `renderTrigger` element. Spread every one of
 * them onto a single Pressable — or an equivalent host that actually forwards
 * React Native press handling (a plain View silently drops `onPress` and
 * ships an announced-but-inoperable button, so it is not a valid host). The
 * kit owns press behavior, disabled/expanded accessibility state, ids, and
 * the measurement hooks that anchoring needs, while the consumer owns only
 * the visuals. The object also carries platform wiring beyond these declared
 * keys (web `aria-haspopup`/`aria-controls`/key handlers, Select value text),
 * so forwarding a hand-picked subset instead of spreading breaks the
 * contract.
 */
export interface TriggerRenderProps {
  /**
   * Must reach the returned host element. Anchored positioning measures the
   * trigger through it and dismissal restores focus to it; the component
   * throws when it opens without the ref attached.
   */
  readonly ref: (node: unknown) => void;
  readonly onPress: (event: GestureResponderEvent) => void;
  readonly disabled: boolean;
  /** 'button' for Menu (and native Select); 'combobox' for the web Select. */
  readonly accessibilityRole: 'button' | 'combobox';
  readonly accessibilityLabel: string;
  readonly accessibilityState: {
    readonly disabled: boolean;
    readonly expanded: boolean;
    readonly busy: boolean;
  };
  /**
   * Dual-written with accessibilityState.expanded: React Native maps aria-*
   * onto accessibilityState natively, while React Native Web needs the aria
   * attribute directly because it does not map accessibilityState to DOM aria.
   */
  readonly 'aria-expanded': boolean;
  /** Select only — the helper or error text of the field. */
  readonly accessibilityHint?: string | undefined;
  /** Select only — the displayed value or placeholder. */
  readonly accessibilityValue?: { readonly text: string } | undefined;
  /** The component's triggerTestID (web Select falls back to `${testID}-trigger`). */
  readonly testID?: string | undefined;
  /** Re-measures an open native anchored panel when the trigger's layout moves. */
  readonly onLayout?: (() => void) | undefined;
  /** Web Select only — the DOM id the label and popup relationships expect. */
  readonly nativeID?: string | undefined;
}

/**
 * Ref-attachment enforcement: called from an effect when the component opens
 * with a renderTrigger present. A consumer that dropped the injected `ref`
 * (by not spreading, or by overriding it) fails loudly here instead of
 * silently breaking anchoring and focus restoration. This is the ceiling of
 * what native can verify — RN host component props are not introspectable at
 * runtime — so the web-only sibling below additionally checks that the
 * injected accessibility wiring reached the attached DOM node.
 */
export function assertRenderTriggerRefAttached(
  component: 'Menu' | 'Select',
  node: unknown,
): void {
  if (node === null || node === undefined) {
    throw new Error(
      `${component} renderTrigger did not attach the injected ref before opening. ` +
        'Spread every injected prop — including ref — onto the returned Pressable; ' +
        'anchored measurement and focus restoration cannot reach the trigger without it.',
    );
  }
}

/** The narrow DOM surface the web wiring assertion reads. */
type AttributeReadableNode = {
  readonly getAttribute?: (name: string) => string | null;
};

/**
 * Web-only wiring enforcement: runs in the same open-transition layout effect
 * as the ref check, after the commit that wrote `aria-expanded="true"`. A
 * consumer that attached the ref but forwarded only a subset of the injected
 * props (or parked the ref on a non-interactive wrapper while spreading the
 * accessibility wiring onto an inner node) would otherwise ship a focusable
 * trigger that announces no role, no name, and no expanded/popup relationship
 * — exactly the silent loss this slot is fenced against. Native has no
 * equivalent check because RN host props cannot be read back at runtime.
 */
export function assertRenderTriggerWebWiringAttached(
  component: 'Menu' | 'Select',
  node: unknown,
  expectedRole: 'button' | 'combobox',
): void {
  const element = node as AttributeReadableNode | null | undefined;
  const readAttribute =
    element === null || element === undefined || typeof element.getAttribute !== 'function'
      ? null
      : element.getAttribute.bind(element);
  const role = readAttribute === null ? null : readAttribute('role');
  const expanded = readAttribute === null ? null : readAttribute('aria-expanded');
  const label = readAttribute === null ? null : readAttribute('aria-label');
  if (role === expectedRole && expanded === 'true' && label !== null && label !== '') {
    return;
  }
  const found =
    readAttribute === null
      ? 'a node that exposes no DOM attributes'
      : `role=${JSON.stringify(role)}, aria-expanded=${JSON.stringify(expanded)}, aria-label=${JSON.stringify(label)}`;
  throw new Error(
    `${component} renderTrigger attached the injected ref, but the injected accessibility ` +
      `wiring did not reach that element — expected role="${expectedRole}" with ` +
      `aria-expanded="true" and an accessible name on the open trigger; found ${found}. ` +
      'Spread the ENTIRE injected object onto the single Pressable the ref lands on; ' +
      'forwarding a subset (or parking the ref on a wrapper around the real trigger) ' +
      "silently strips the trigger's role, name, and popup state from assistive technology.",
  );
}
