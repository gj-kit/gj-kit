import type {
  PaginationCursorProps,
  PaginationItemsPageChangeDetails,
  PaginationNavigateDetails,
  PaginationNavigateDirection,
  PaginationNumberedItemsProps,
  PaginationNumberedPagesProps,
  PaginationPageChangeReason,
  PaginationPagesPageChangeDetails,
  PaginationProps,
} from "./pagination.types";

export interface PaginationResolvedLabels {
  readonly previousLabel: string;
  readonly nextLabel: string;
}

type PaginationNumberedProps =
  | PaginationNumberedItemsProps
  | PaginationNumberedPagesProps;

export function assertNonblankPaginationString(
  value: unknown,
  name: string
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Pagination ${name} must be a nonblank string.`);
  }
}

function assertSafeIntegerAtLeast(
  value: unknown,
  minimum: number,
  name: string
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(
      `Pagination ${name} must be a safe integer greater than or equal to ${minimum}.`
    );
  }
}

function assertPageWithinCount(
  page: unknown,
  pageCount: number
): asserts page is number {
  assertSafeIntegerAtLeast(page, 1, "page");
  if (pageCount === 0 && page !== 1) {
    throw new Error("Pagination page must be 1 when pageCount is 0.");
  }
  if (pageCount > 0 && page > pageCount) {
    throw new Error("Pagination page must not exceed pageCount.");
  }
}

function assertOptionalBoolean(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    throw new Error(`Pagination ${name} must be a boolean.`);
  }
}

function hasValue(
  raw: Readonly<Record<string, unknown>>,
  name: string
): boolean {
  return raw[name] !== undefined;
}

function assertNoValues(
  raw: Readonly<Record<string, unknown>>,
  names: readonly string[],
  branch: string
): void {
  const invalid = names.find((name) => hasValue(raw, name));
  if (invalid !== undefined) {
    throw new Error(`Pagination ${branch} mode does not accept ${invalid}.`);
  }
}

function assertPageChangeReason(
  value: unknown
): asserts value is PaginationPageChangeReason {
  if (
    value !== "page-press" &&
    value !== "previous-press" &&
    value !== "next-press"
  ) {
    throw new Error(
      'Pagination page change reason must be "page-press", "previous-press", or "next-press".'
    );
  }
}

export function getPaginationPageCount(props: PaginationNumberedProps): number {
  if (props.countMode === "pages") return props.pageCount;
  if (props.totalItemCount === 0) return 0;
  return Math.ceil(props.totalItemCount / props.pageSize);
}

export function getPaginationStatusLabel(props: PaginationProps): string {
  if (props.mode === "cursor") return props.statusLabel;
  if (props.statusLabel !== undefined) return props.statusLabel;
  if (props.countMode === "pages") {
    if (props.pageCount === 0) return "0 / 0";
    return `${props.page} / ${props.pageCount}`;
  }
  if (props.totalItemCount === 0) return "0 / 0";
  const offset = (props.page - 1) * props.pageSize;
  const endOffsetExclusive = Math.min(
    offset + props.pageSize,
    props.totalItemCount
  );
  return `${offset + 1}–${endOffsetExclusive} / ${props.totalItemCount}`;
}

export function getPaginationPageAccessibilityLabel(
  props: PaginationNumberedProps,
  page: number,
  pageCount: number = getPaginationPageCount(props)
): string | undefined {
  if (props.getPageAccessibilityLabel === undefined) return undefined;
  const label = props.getPageAccessibilityLabel({
    page,
    pageCount,
    current: page === props.page,
  });
  assertNonblankPaginationString(
    label,
    `getPageAccessibilityLabel result for page ${page}`
  );
  return label;
}

export function assertPaginationProps(
  props: PaginationProps,
  resolvedLabels?: PaginationResolvedLabels
): void {
  const raw = props as unknown as Readonly<Record<string, unknown>>;
  assertNonblankPaginationString(raw.accessibilityLabel, "accessibilityLabel");
  if (raw.unstyled !== undefined) {
    throw new Error("Pagination does not support unstyled.");
  }
  if (
    raw.direction !== undefined &&
    raw.direction !== "ltr" &&
    raw.direction !== "rtl"
  ) {
    throw new Error('Pagination direction must be "ltr" or "rtl".');
  }
  if (raw.size !== undefined && raw.size !== "sm" && raw.size !== "md") {
    throw new Error('Pagination size must be "sm" or "md".');
  }
  assertOptionalBoolean(raw.disabled, "disabled");
  assertOptionalBoolean(raw.busy, "busy");
  if (raw.previousLabel !== undefined) {
    assertNonblankPaginationString(raw.previousLabel, "previousLabel");
  }
  if (raw.nextLabel !== undefined) {
    assertNonblankPaginationString(raw.nextLabel, "nextLabel");
  }
  if (resolvedLabels !== undefined) {
    assertNonblankPaginationString(
      resolvedLabels.previousLabel,
      "resolved previousLabel"
    );
    assertNonblankPaginationString(
      resolvedLabels.nextLabel,
      "resolved nextLabel"
    );
  }

  if (raw.mode !== "numbered" && raw.mode !== "cursor") {
    throw new Error('Pagination mode must be "numbered" or "cursor".');
  }

  if (raw.mode === "cursor") {
    assertNoValues(
      raw,
      [
        "page",
        "presentation",
        "boundaryCount",
        "siblingCount",
        "getPageAccessibilityLabel",
        "countMode",
        "totalItemCount",
        "pageSize",
        "pageCount",
        "onPageChange",
      ],
      "cursor"
    );
    assertNonblankPaginationString(raw.statusLabel, "statusLabel");
    if (typeof raw.hasPreviousPage !== "boolean") {
      throw new Error("Pagination hasPreviousPage must be a boolean.");
    }
    if (typeof raw.hasNextPage !== "boolean") {
      throw new Error("Pagination hasNextPage must be a boolean.");
    }
    if (typeof raw.onNavigate !== "function") {
      throw new Error("Pagination cursor mode requires onNavigate.");
    }
    return;
  }

  assertNoValues(
    raw,
    ["hasPreviousPage", "hasNextPage", "onNavigate"],
    "numbered"
  );
  if (
    raw.presentation !== undefined &&
    raw.presentation !== "auto" &&
    raw.presentation !== "full" &&
    raw.presentation !== "compact"
  ) {
    throw new Error(
      'Pagination presentation must be "auto", "full", or "compact".'
    );
  }
  if (
    raw.boundaryCount !== undefined &&
    raw.boundaryCount !== 0 &&
    raw.boundaryCount !== 1 &&
    raw.boundaryCount !== 2
  ) {
    throw new Error("Pagination boundaryCount must be 0, 1, or 2.");
  }
  if (
    raw.siblingCount !== undefined &&
    raw.siblingCount !== 0 &&
    raw.siblingCount !== 1 &&
    raw.siblingCount !== 2
  ) {
    throw new Error("Pagination siblingCount must be 0, 1, or 2.");
  }
  if (
    raw.getPageAccessibilityLabel !== undefined &&
    typeof raw.getPageAccessibilityLabel !== "function"
  ) {
    throw new Error("Pagination getPageAccessibilityLabel must be a function.");
  }
  if (raw.statusLabel !== undefined) {
    assertNonblankPaginationString(raw.statusLabel, "statusLabel");
  }
  if (typeof raw.onPageChange !== "function") {
    throw new Error("Pagination numbered mode requires onPageChange.");
  }

  let pageCount: number;
  if (raw.countMode === "items") {
    if (raw.pageCount !== undefined) {
      throw new Error("Pagination items countMode does not accept pageCount.");
    }
    assertSafeIntegerAtLeast(raw.totalItemCount, 0, "totalItemCount");
    assertSafeIntegerAtLeast(raw.pageSize, 1, "pageSize");
    pageCount =
      raw.totalItemCount === 0
        ? 0
        : Math.ceil(raw.totalItemCount / raw.pageSize);
    if (!Number.isSafeInteger(pageCount)) {
      throw new Error("Pagination computed pageCount must be a safe integer.");
    }
  } else if (raw.countMode === "pages") {
    if (raw.totalItemCount !== undefined || raw.pageSize !== undefined) {
      throw new Error(
        "Pagination pages countMode does not accept totalItemCount or pageSize."
      );
    }
    assertSafeIntegerAtLeast(raw.pageCount, 0, "pageCount");
    pageCount = raw.pageCount;
  } else {
    throw new Error('Pagination countMode must be "items" or "pages".');
  }

  assertPageWithinCount(raw.page, pageCount);
}

export function getPaginationPageChangeDetails(
  props: PaginationNumberedItemsProps,
  page: number,
  reason: PaginationPageChangeReason,
  originalEvent?: unknown
): PaginationItemsPageChangeDetails;
export function getPaginationPageChangeDetails(
  props: PaginationNumberedPagesProps,
  page: number,
  reason: PaginationPageChangeReason,
  originalEvent?: unknown
): PaginationPagesPageChangeDetails;
export function getPaginationPageChangeDetails(
  props: PaginationNumberedProps,
  page: number,
  reason: PaginationPageChangeReason,
  originalEvent?: unknown
): PaginationItemsPageChangeDetails | PaginationPagesPageChangeDetails;
export function getPaginationPageChangeDetails(
  props: PaginationNumberedProps,
  page: number,
  reason: PaginationPageChangeReason,
  originalEvent?: unknown
): PaginationItemsPageChangeDetails | PaginationPagesPageChangeDetails {
  const pageCount = getPaginationPageCount(props);
  assertPageWithinCount(page, pageCount);
  assertPageChangeReason(reason);
  const common = {
    mode: "numbered" as const,
    page,
    previousPage: props.page,
    pageCount,
    reason,
    originalEvent,
  };
  if (props.countMode === "pages") {
    return { ...common, countMode: "pages" };
  }
  const offset = Math.min((page - 1) * props.pageSize, props.totalItemCount);
  const endOffsetExclusive = Math.min(
    offset + props.pageSize,
    props.totalItemCount
  );
  return {
    ...common,
    countMode: "items",
    totalItemCount: props.totalItemCount,
    pageSize: props.pageSize,
    offset,
    endOffsetExclusive,
    visibleItemCount: endOffsetExclusive - offset,
  };
}

export function getPaginationNavigateDetails(
  props: PaginationCursorProps,
  direction: PaginationNavigateDirection,
  originalEvent?: unknown
): PaginationNavigateDetails {
  if (direction !== "previous" && direction !== "next") {
    throw new Error(
      'Pagination navigation direction must be "previous" or "next".'
    );
  }
  return {
    mode: "cursor",
    direction,
    hasPreviousPage: props.hasPreviousPage,
    hasNextPage: props.hasNextPage,
    originalEvent,
  };
}
