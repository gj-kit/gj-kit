import type {
  PaginationBoundaryCount,
  PaginationSiblingCount,
} from "./pagination.types";

export interface PaginationRangeOptions {
  /** Controlled, one-based page. pageCount=0 uses the sentinel page 1. */
  readonly page: number;
  readonly pageCount: number;
  readonly boundaryCount?: PaginationBoundaryCount | undefined;
  readonly siblingCount?: PaginationSiblingCount | undefined;
}

export type PaginationRangeItem =
  | {
      readonly type: "page";
      readonly page: number;
      readonly current: boolean;
    }
  | {
      readonly type: "start-ellipsis" | "end-ellipsis";
    };

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

function assertRangeCount(
  value: unknown,
  name: "boundaryCount" | "siblingCount"
): asserts value is PaginationBoundaryCount | PaginationSiblingCount {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new Error(`Pagination ${name} must be 0, 1, or 2.`);
  }
}

function integerRange(start: number, end: number): number[] {
  if (end < start) return [];
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function pageItems(
  pages: readonly number[],
  currentPage: number
): PaginationRangeItem[] {
  return pages.map((page) => ({
    type: "page",
    page,
    current: page === currentPage,
  }));
}

/**
 * Produces a deterministic, presentation-only numbered range.
 *
 * Near an edge, unused sibling slots are filled with adjacent pages so the
 * control does not abruptly shrink. Ellipses never represent a selectable
 * page and the current page is present exactly once.
 */
export function getPaginationRange({
  page,
  pageCount,
  boundaryCount = 1,
  siblingCount = 1,
}: PaginationRangeOptions): readonly PaginationRangeItem[] {
  assertSafeIntegerAtLeast(pageCount, 0, "pageCount");
  assertSafeIntegerAtLeast(page, 1, "page");
  assertRangeCount(boundaryCount, "boundaryCount");
  assertRangeCount(siblingCount, "siblingCount");

  if (pageCount === 0) {
    if (page !== 1) {
      throw new Error("Pagination page must be 1 when pageCount is 0.");
    }
    return [];
  }
  if (page > pageCount) {
    throw new Error("Pagination page must not exceed pageCount.");
  }

  const totalSlots = boundaryCount * 2 + siblingCount * 2 + 3;
  if (pageCount <= totalSlots) {
    return pageItems(integerRange(1, pageCount), page);
  }

  const leftSibling = Math.max(page - siblingCount, boundaryCount + 1);
  const rightSibling = Math.min(page + siblingCount, pageCount - boundaryCount);
  const showStartEllipsis = leftSibling > boundaryCount + 2;
  const showEndEllipsis = rightSibling < pageCount - boundaryCount - 1;
  const adjacentItemCount = boundaryCount + siblingCount * 2 + 2;

  if (!showStartEllipsis && showEndEllipsis) {
    return [
      ...pageItems(integerRange(1, adjacentItemCount), page),
      { type: "end-ellipsis" },
      ...pageItems(
        integerRange(pageCount - boundaryCount + 1, pageCount),
        page
      ),
    ];
  }

  if (showStartEllipsis && !showEndEllipsis) {
    return [
      ...pageItems(integerRange(1, boundaryCount), page),
      { type: "start-ellipsis" },
      ...pageItems(
        integerRange(pageCount - adjacentItemCount + 1, pageCount),
        page
      ),
    ];
  }

  return [
    ...pageItems(integerRange(1, boundaryCount), page),
    { type: "start-ellipsis" },
    ...pageItems(integerRange(leftSibling, rightSibling), page),
    { type: "end-ellipsis" },
    ...pageItems(integerRange(pageCount - boundaryCount + 1, pageCount), page),
  ];
}
