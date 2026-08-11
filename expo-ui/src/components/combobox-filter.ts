import type {
  ComboboxFilter,
  ComboboxFilterDetails,
  ComboboxItem,
} from "./combobox.types";

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
}

function assertLocale(locale: string | readonly string[] | undefined): void {
  if (locale === undefined) return;
  if (typeof locale === "string") {
    if (locale.trim().length === 0) {
      throw new TypeError("Combobox filter locale must be a non-empty string.");
    }
    return;
  }
  if (!Array.isArray(locale) || locale.length === 0) {
    throw new TypeError(
      "Combobox filter locale must be a non-empty string or string array."
    );
  }
  for (const entry of locale) {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      throw new TypeError(
        "Combobox filter locale entries must be non-empty strings."
      );
    }
  }
}

/**
 * Search normalization shared by the built-in Combobox filter.
 *
 * Lowercasing happens before decomposition so Turkish dotted I behaves as the
 * requested locale expects. Combining marks are removed only when they follow
 * a Latin base; marks remain meaningful in scripts such as Devanagari.
 */
export function normalizeComboboxText(
  value: string,
  locale?: string | readonly string[] | undefined
): string {
  assertString(value, "Combobox filter text");
  assertLocale(locale);
  const lower =
    locale === undefined
      ? value.toLocaleLowerCase()
      : value.toLocaleLowerCase(locale);
  let latinBase = false;
  let normalized = "";
  for (const point of lower.normalize("NFKD")) {
    if (/\p{Mark}/u.test(point)) {
      if (!latinBase) normalized += point;
      continue;
    }
    latinBase = /\p{Script=Latin}/u.test(point);
    normalized += point;
  }
  return normalized.normalize("NFC");
}

function queryDetails(
  query: string,
  locale?: string | readonly string[] | undefined
): ComboboxFilterDetails {
  const normalizedQuery = normalizeComboboxText(query, locale);
  const trimmed = normalizedQuery.trim();
  const tokens = trimmed.length === 0 ? [] : trimmed.split(/\s+/u);
  return {
    normalizedQuery,
    tokens,
    ...(locale === undefined ? {} : { locale }),
  };
}

function normalizedItemText<T extends string>(
  item: ComboboxItem<T>,
  locale?: string | readonly string[] | undefined
): string {
  return [item.label, item.textValue, ...(item.keywords ?? [])]
    .filter((value): value is string => value !== undefined)
    .map((value) => normalizeComboboxText(value, locale))
    .join(" ");
}

/**
 * Deterministic zero-dependency filtering.
 *
 * - undefined filter: every normalized whitespace token must occur in the
 *   combined label/textValue/keywords copy.
 * - function filter: the caller owns matching, while this helper still supplies
 *   one normalized query/tokens object for every item.
 * - null filter: results are already filtered; the original array is returned.
 */
export function filterComboboxItems<T extends string>(
  items: readonly ComboboxItem<T>[],
  query: string,
  filter?: ComboboxFilter<T> | null | undefined,
  locale?: string | readonly string[] | undefined
): readonly ComboboxItem<T>[] {
  if (!Array.isArray(items)) {
    throw new TypeError("Combobox filter items must be an array.");
  }
  assertString(query, "Combobox filter query");
  assertLocale(locale);
  if (filter !== undefined && filter !== null && typeof filter !== "function") {
    throw new TypeError(
      "Combobox filter must be a function, null, or undefined."
    );
  }
  if (filter === null) return items;

  const details = queryDetails(query, locale);
  if (filter !== undefined) {
    return items.filter((item) => filter(item, query, details));
  }
  if (details.tokens.length === 0) return items;

  return items.filter((item) => {
    const text = normalizedItemText(item, locale);
    return details.tokens.every((token) => text.includes(token));
  });
}

function assertCurrentValuesUnique<T extends string>(
  items: readonly ComboboxItem<T>[]
): Map<T, ComboboxItem<T>> {
  if (!Array.isArray(items)) {
    throw new TypeError("Combobox state items must be an array.");
  }
  const byValue = new Map<T, ComboboxItem<T>>();
  for (const item of items) {
    if (byValue.has(item.value)) {
      throw new RangeError(
        `Combobox item value "${item.value}" is duplicated.`
      );
    }
    byValue.set(item.value, item);
  }
  return byValue;
}

export function resolveComboboxSelectedItems<T extends string>(
  items: readonly ComboboxItem<T>[],
  value: T | null,
  selectedItem?: ComboboxItem<T> | undefined
): readonly ComboboxItem<T>[];
export function resolveComboboxSelectedItems<T extends string>(
  items: readonly ComboboxItem<T>[],
  value: readonly T[],
  selectedItems?: readonly ComboboxItem<T>[] | undefined
): readonly ComboboxItem<T>[];
/** Resolves selected values in selection order from current items plus hydration. */
export function resolveComboboxSelectedItems<T extends string>(
  items: readonly ComboboxItem<T>[],
  value: T | null | readonly T[],
  hydration?: ComboboxItem<T> | readonly ComboboxItem<T>[] | undefined
): readonly ComboboxItem<T>[] {
  const byValue = assertCurrentValuesUnique(items);
  const values = Array.isArray(value) ? value : value === null ? [] : [value];
  const valueSet = new Set<T>();
  for (const selectedValue of values) {
    if (valueSet.has(selectedValue)) {
      throw new RangeError(
        `Combobox selected value "${selectedValue}" is duplicated.`
      );
    }
    valueSet.add(selectedValue);
  }

  const hydrated =
    hydration === undefined
      ? []
      : Array.isArray(hydration)
      ? hydration
      : [hydration];
  const hydratedValues = new Set<T>();
  for (const item of hydrated) {
    if (!valueSet.has(item.value)) {
      throw new RangeError(
        `Combobox hydrated item value "${item.value}" is not selected.`
      );
    }
    if (hydratedValues.has(item.value)) {
      throw new RangeError(
        `Combobox hydrated item value "${item.value}" is duplicated.`
      );
    }
    hydratedValues.add(item.value);
    // Current query results are authoritative; hydration fills only missing values.
    if (!byValue.has(item.value)) byValue.set(item.value, item);
  }

  return values.map((selectedValue) => {
    const item = byValue.get(selectedValue);
    if (item === undefined) {
      throw new RangeError(
        `Combobox selected value "${selectedValue}" cannot be resolved from state items or hydration.`
      );
    }
    return item;
  });
}
