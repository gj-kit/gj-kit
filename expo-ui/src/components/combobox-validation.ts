import type { ComboboxItem, ComboboxProps } from "./combobox.types";
import { resolveComboboxSelectedItems } from "./combobox-filter";
import { overlayPlacements } from "./overlay/position";

function assertRecord(
  value: unknown,
  label: string
): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
}

function assertNonEmptyString(
  value: unknown,
  label: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-empty string.`);
  }
}

function assertOptionalNonEmptyString(value: unknown, label: string): void {
  if (value !== undefined) assertNonEmptyString(value, label);
}

function assertBoolean(
  value: unknown,
  label: string
): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${label} must be a boolean.`);
  }
}

function assertOptionalBoolean(value: unknown, label: string): void {
  if (value !== undefined) assertBoolean(value, label);
}

function assertFunction(
  value: unknown,
  label: string
): asserts value is (...args: never[]) => unknown {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function.`);
  }
}

function assertOptionalFunction(value: unknown, label: string): void {
  if (value !== undefined) assertFunction(value, label);
}

function assertFiniteNumber(
  value: unknown,
  label: string,
  minimum?: number
): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  if (minimum !== undefined && value < minimum) {
    throw new RangeError(
      `${label} must be greater than or equal to ${minimum}.`
    );
  }
}

function assertOptionalFiniteNumber(
  value: unknown,
  label: string,
  minimum?: number
): void {
  if (value !== undefined) assertFiniteNumber(value, label, minimum);
}

function assertLocale(value: unknown): void {
  if (value === undefined) return;
  if (typeof value === "string") {
    assertNonEmptyString(value, "Combobox filterLocale");
    return;
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(
      "Combobox filterLocale must be a non-empty string or string array."
    );
  }
  for (const entry of value) {
    assertNonEmptyString(entry, "Combobox filterLocale entry");
  }
}

function assertComboboxItem(
  value: unknown,
  source: string
): asserts value is ComboboxItem<string> {
  assertRecord(value, source);
  assertNonEmptyString(value.value, `${source} value`);
  assertNonEmptyString(value.label, `${source} label`);
  assertOptionalNonEmptyString(value.textValue, `${source} textValue`);
  assertOptionalNonEmptyString(value.description, `${source} description`);
  assertOptionalNonEmptyString(value.testID, `${source} testID`);
  assertOptionalBoolean(value.disabled, `${source} disabled`);
  if (value.keywords !== undefined) {
    if (!Array.isArray(value.keywords)) {
      throw new TypeError(`${source} keywords must be an array.`);
    }
    for (const keyword of value.keywords) {
      assertNonEmptyString(keyword, `${source} keyword`);
    }
  }
}

function assertState(value: unknown): asserts value is {
  readonly status: "ready" | "loading" | "error";
  readonly items: readonly ComboboxItem<string>[];
  readonly statusLabel?: string;
  readonly onRetry?: () => void;
} {
  assertRecord(value, "Combobox state");
  if (
    value.status !== "ready" &&
    value.status !== "loading" &&
    value.status !== "error"
  ) {
    throw new RangeError(
      `Combobox state status "${String(value.status)}" is not supported.`
    );
  }
  if (!Array.isArray(value.items)) {
    throw new TypeError("Combobox state items must be an array.");
  }
  for (const [index, item] of value.items.entries()) {
    assertComboboxItem(item, `Combobox state item at index ${index}`);
  }
  if (value.status === "error") {
    assertNonEmptyString(value.statusLabel, "Combobox error state statusLabel");
    assertOptionalFunction(value.onRetry, "Combobox error state onRetry");
  } else {
    assertOptionalNonEmptyString(
      value.statusLabel,
      "Combobox state statusLabel"
    );
    if (value.onRetry !== undefined) {
      throw new TypeError(
        `Combobox ${value.status} state cannot define onRetry.`
      );
    }
  }
}

function assertOptionalClassAndTestStrings(raw: Record<string, unknown>): void {
  const properties = [
    "className",
    "testID",
    "labelClassName",
    "controlClassName",
    "inputClassName",
    "summaryClassName",
    "helperClassName",
    "contentClassName",
    "listClassName",
    "itemClassName",
    "itemLabelClassName",
    "statusClassName",
    "clearButtonClassName",
  ] as const;
  for (const property of properties) {
    assertOptionalNonEmptyString(raw[property], `Combobox ${property}`);
  }
}

function assertForbiddenProps(raw: Record<string, unknown>): void {
  const forbidden = [
    "defaultValue",
    "defaultInputValue",
    "defaultOpen",
    "freeSolo",
    "multiple",
    "unstyled",
  ] as const;
  for (const property of forbidden) {
    if (raw[property] !== undefined) {
      throw new TypeError(`Combobox does not support ${property}.`);
    }
  }
}

/** Shared JavaScript boundary validation for both platform implementations. */
export function assertComboboxProps<T extends string>(
  props: ComboboxProps<T>
): void {
  const raw = props as unknown as Record<string, unknown>;
  assertRecord(raw, "Combobox props");
  assertForbiddenProps(raw);

  assertNonEmptyString(
    raw.label ?? raw.accessibilityLabel,
    "Combobox accessible label"
  );
  assertOptionalNonEmptyString(raw.label, "Combobox label");
  assertOptionalNonEmptyString(
    raw.accessibilityLabel,
    "Combobox accessibilityLabel"
  );
  assertString(raw.inputValue, "Combobox inputValue");
  assertNonEmptyString(raw.placeholder, "Combobox placeholder");
  assertOptionalNonEmptyString(raw.description, "Combobox description");
  assertOptionalNonEmptyString(raw.error, "Combobox error");
  for (const property of [
    "emptyLabel",
    "noResultsLabel",
    "loadingLabel",
    "clearLabel",
    "retryLabel",
  ] as const) {
    assertOptionalNonEmptyString(raw[property], `Combobox ${property}`);
  }
  assertOptionalClassAndTestStrings(raw);

  assertBoolean(raw.open, "Combobox open");
  assertOptionalBoolean(raw.required, "Combobox required");
  assertOptionalBoolean(raw.disabled, "Combobox disabled");
  assertOptionalBoolean(raw.clearable, "Combobox clearable");
  assertOptionalBoolean(raw.openOnFocus, "Combobox openOnFocus");
  assertFunction(raw.onInputValueChange, "Combobox onInputValueChange");
  assertFunction(raw.onOpenChange, "Combobox onOpenChange");
  assertFunction(raw.onValueChange, "Combobox onValueChange");

  if (
    raw.filter !== undefined &&
    raw.filter !== null &&
    typeof raw.filter !== "function"
  ) {
    throw new TypeError(
      "Combobox filter must be a function, null, or undefined."
    );
  }
  assertLocale(raw.filterLocale);

  if (
    raw.placement !== undefined &&
    !overlayPlacements.includes(raw.placement as never)
  ) {
    throw new RangeError(
      `Combobox placement "${String(raw.placement)}" is not supported.`
    );
  }
  if (
    raw.direction !== undefined &&
    raw.direction !== "ltr" &&
    raw.direction !== "rtl"
  ) {
    throw new RangeError(
      `Combobox direction "${String(raw.direction)}" is not supported.`
    );
  }
  if (
    raw.presentation !== undefined &&
    raw.presentation !== "auto" &&
    raw.presentation !== "bottom" &&
    raw.presentation !== "center" &&
    raw.presentation !== "inline"
  ) {
    throw new RangeError(
      `Combobox presentation "${String(raw.presentation)}" is not supported.`
    );
  }
  if (raw.size !== undefined && raw.size !== "sm" && raw.size !== "md") {
    throw new RangeError(
      `Combobox size "${String(raw.size)}" is not supported.`
    );
  }
  assertOptionalFiniteNumber(raw.sideOffset, "Combobox sideOffset");
  assertOptionalFiniteNumber(raw.alignOffset, "Combobox alignOffset");
  assertOptionalFiniteNumber(
    raw.collisionPadding,
    "Combobox collisionPadding",
    0
  );
  assertOptionalFiniteNumber(raw.bottomInset, "Combobox bottomInset", 0);
  assertOptionalFiniteNumber(
    raw.keyboardOverlap,
    "Combobox keyboardOverlap",
    0
  );

  assertState(raw.state);
  const items = raw.state.items as readonly ComboboxItem<T>[];

  if (raw.selectionMode === "single") {
    if (raw.selectedItems !== undefined) {
      throw new TypeError("Combobox single mode cannot define selectedItems.");
    }
    if (raw.maxSelected !== undefined) {
      throw new TypeError("Combobox single mode cannot define maxSelected.");
    }
    if (raw.selectionLimitLabel !== undefined) {
      throw new TypeError(
        "Combobox single mode cannot define selectionLimitLabel."
      );
    }
    if (raw.getSelectionSummary !== undefined) {
      throw new TypeError(
        "Combobox single mode cannot define getSelectionSummary."
      );
    }
    if (raw.value !== null) {
      assertNonEmptyString(raw.value, "Combobox single value");
    }
    if (raw.selectedItem !== undefined) {
      assertComboboxItem(raw.selectedItem, "Combobox selectedItem");
    }
    resolveComboboxSelectedItems(
      items,
      raw.value as T | null,
      raw.selectedItem as ComboboxItem<T> | undefined
    );
    return;
  }

  if (raw.selectionMode !== "multiple") {
    throw new RangeError(
      `Combobox selectionMode "${String(raw.selectionMode)}" is not supported.`
    );
  }
  if (raw.selectedItem !== undefined) {
    throw new TypeError("Combobox multiple mode cannot define selectedItem.");
  }
  if (!Array.isArray(raw.value)) {
    throw new TypeError("Combobox multiple value must be an array.");
  }
  for (const selectedValue of raw.value) {
    assertNonEmptyString(selectedValue, "Combobox multiple selected value");
  }
  if (raw.selectedItems !== undefined) {
    if (!Array.isArray(raw.selectedItems)) {
      throw new TypeError("Combobox selectedItems must be an array.");
    }
    for (const [index, item] of raw.selectedItems.entries()) {
      assertComboboxItem(item, `Combobox selectedItems item at index ${index}`);
    }
  }
  if (raw.maxSelected === undefined) {
    if (raw.selectionLimitLabel !== undefined) {
      throw new TypeError("Combobox selectionLimitLabel requires maxSelected.");
    }
  } else {
    if (
      typeof raw.maxSelected !== "number" ||
      !Number.isSafeInteger(raw.maxSelected) ||
      raw.maxSelected <= 0
    ) {
      throw new RangeError(
        "Combobox maxSelected must be a positive safe integer."
      );
    }
    assertNonEmptyString(
      raw.selectionLimitLabel,
      "Combobox selectionLimitLabel"
    );
  }
  assertOptionalFunction(
    raw.getSelectionSummary,
    "Combobox getSelectionSummary"
  );
  resolveComboboxSelectedItems(
    items,
    raw.value as readonly T[],
    raw.selectedItems as readonly ComboboxItem<T>[] | undefined
  );
}
