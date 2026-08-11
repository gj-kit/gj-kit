import { overlayPlacements } from './overlay/position';
import type { MenuItem, MenuProps } from './menu.types';
import type { SelectItem, SelectProps } from './select.types';

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(value: unknown, name: string): void {
  if (value !== undefined) assertNonEmptyString(value, name);
}

function assertFiniteNumber(value: unknown, name: string, minimum?: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${name} must be a finite number.`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new RangeError(`${name} must be greater than or equal to ${minimum}.`);
  }
}

function assertGeometry(
  placement: string | undefined,
  direction: string | undefined,
  sideOffset: number | undefined,
  alignOffset: number | undefined,
  collisionPadding: number | undefined,
  component: string,
): void {
  if (placement !== undefined && !overlayPlacements.includes(placement as never)) {
    throw new RangeError(`${component} placement "${placement}" is not supported.`);
  }
  if (direction !== undefined && direction !== 'ltr' && direction !== 'rtl') {
    throw new RangeError(`${component} direction "${direction}" is not supported.`);
  }
  if (sideOffset !== undefined) assertFiniteNumber(sideOffset, `${component} sideOffset`);
  if (alignOffset !== undefined) assertFiniteNumber(alignOffset, `${component} alignOffset`);
  if (collisionPadding !== undefined) {
    assertFiniteNumber(collisionPadding, `${component} collisionPadding`, 0);
  }
}

function assertItemCopy(
  item: MenuItem<string> | SelectItem<string>,
  component: string,
): void {
  assertNonEmptyString(item.value, `${component} item value`);
  assertNonEmptyString(item.label, `${component} item "${item.value}" label`);
  assertOptionalNonEmptyString(item.textValue, `${component} item "${item.value}" textValue`);
  assertOptionalNonEmptyString(item.description, `${component} item "${item.value}" description`);
}

export function assertMenuProps<T extends string>(props: MenuProps<T>): void {
  assertNonEmptyString(props.triggerLabel, 'Menu triggerLabel');
  assertOptionalNonEmptyString(props.accessibilityLabel, 'Menu accessibilityLabel');
  assertGeometry(
    props.placement,
    props.direction,
    props.sideOffset,
    props.alignOffset,
    props.collisionPadding,
    'Menu',
  );
  if (props.bottomInset !== undefined) {
    assertFiniteNumber(props.bottomInset, 'Menu bottomInset', 0);
  }
  if (props.keyboardOverlap !== undefined) {
    assertFiniteNumber(props.keyboardOverlap, 'Menu keyboardOverlap', 0);
  }
  if (props.items.length === 0) {
    throw new RangeError('Menu items must contain at least one item.');
  }

  const values = new Set<string>();
  for (const item of props.items) {
    const runtimeItem = item as unknown as Record<string, unknown>;
    assertItemCopy(item, 'Menu');
    assertOptionalNonEmptyString(item.shortcut, `Menu item "${item.value}" shortcut`);
    if (values.has(item.value)) {
      throw new RangeError(`Menu item value "${item.value}" is duplicated.`);
    }
    values.add(item.value);
    if (runtimeItem.kind !== 'action' && runtimeItem.kind !== 'checkbox') {
      throw new TypeError(
        `Menu item "${item.value}" kind must be "action" or "checkbox".`,
      );
    }
    if (runtimeItem.kind === 'action' && runtimeItem.checked !== undefined) {
      throw new TypeError(`Menu action item "${item.value}" cannot define checked.`);
    }
    if (runtimeItem.kind === 'checkbox' && runtimeItem.destructive !== undefined) {
      throw new TypeError(`Menu checkbox item "${item.value}" cannot be destructive.`);
    }
    if (runtimeItem.kind === 'checkbox' &&
      typeof runtimeItem.checked !== 'boolean' && runtimeItem.checked !== 'mixed') {
      throw new TypeError(
        `Menu checkbox item "${item.value}" checked must be a boolean or "mixed".`,
      );
    }
  }
}

export function assertSelectProps<T extends string>(props: SelectProps<T>): void {
  assertNonEmptyString(props.label ?? props.accessibilityLabel, 'Select accessible label');
  assertOptionalNonEmptyString(props.label, 'Select label');
  assertOptionalNonEmptyString(props.accessibilityLabel, 'Select accessibilityLabel');
  assertNonEmptyString(props.placeholder, 'Select placeholder');
  assertOptionalNonEmptyString(props.description, 'Select description');
  assertOptionalNonEmptyString(props.error, 'Select error');
  assertGeometry(
    props.placement,
    props.direction,
    props.sideOffset,
    props.alignOffset,
    props.collisionPadding,
    'Select',
  );
  if (props.bottomInset !== undefined) {
    assertFiniteNumber(props.bottomInset, 'Select bottomInset', 0);
  }
  if (props.keyboardOverlap !== undefined) {
    assertFiniteNumber(props.keyboardOverlap, 'Select keyboardOverlap', 0);
  }
  if (props.items.length === 0) {
    throw new RangeError('Select items must contain at least one item.');
  }

  const values = new Set<string>();
  for (const item of props.items) {
    assertItemCopy(item, 'Select');
    if (values.has(item.value)) {
      throw new RangeError(`Select item value "${item.value}" is duplicated.`);
    }
    values.add(item.value);
  }
  if (props.value !== null && !values.has(props.value)) {
    throw new RangeError(`Select value "${props.value}" does not exist in items.`);
  }
}
