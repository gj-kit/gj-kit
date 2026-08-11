import { describe, expect, it, vi } from "vitest";
import {
  getPaginationRange,
  type PaginationRangeItem,
} from "../../src/components/pagination-range";
import type {
  PaginationCursorProps,
  PaginationNumberedItemsProps,
  PaginationNumberedPagesProps,
  PaginationProps,
} from "../../src/components/pagination.types";
import {
  assertPaginationProps,
  getPaginationNavigateDetails,
  getPaginationPageAccessibilityLabel,
  getPaginationPageChangeDetails,
  getPaginationPageCount,
  getPaginationStatusLabel,
} from "../../src/components/pagination-validation";

function itemSummary(
  items: readonly PaginationRangeItem[]
): readonly (number | string)[] {
  return items.map((item) => (item.type === "page" ? item.page : item.type));
}

function pageNumbers(items: readonly PaginationRangeItem[]): readonly number[] {
  return items.flatMap((item) => (item.type === "page" ? [item.page] : []));
}

function pagesProps(
  overrides: Partial<PaginationNumberedPagesProps> = {}
): PaginationNumberedPagesProps {
  return {
    mode: "numbered",
    countMode: "pages",
    accessibilityLabel: "Results pages",
    page: 5,
    pageCount: 12,
    onPageChange: vi.fn(),
    ...overrides,
  };
}

function itemsProps(
  overrides: Partial<PaginationNumberedItemsProps> = {}
): PaginationNumberedItemsProps {
  return {
    mode: "numbered",
    countMode: "items",
    accessibilityLabel: "Search results",
    page: 2,
    totalItemCount: 95,
    pageSize: 20,
    onPageChange: vi.fn(),
    ...overrides,
  };
}

function cursorProps(
  overrides: Partial<PaginationCursorProps> = {}
): PaginationCursorProps {
  return {
    mode: "cursor",
    accessibilityLabel: "Activity pages",
    statusLabel: "Loaded 20 activities",
    hasPreviousPage: true,
    hasNextPage: false,
    onNavigate: vi.fn(),
    ...overrides,
  };
}

function unsafeProps(value: unknown): PaginationProps {
  return value as PaginationProps;
}

describe("Pagination numbered range", () => {
  it("keeps a stable useful window at the beginning, middle, and end", () => {
    expect(itemSummary(getPaginationRange({ page: 1, pageCount: 10 }))).toEqual(
      [1, 2, 3, 4, 5, "end-ellipsis", 10]
    );
    expect(itemSummary(getPaginationRange({ page: 5, pageCount: 10 }))).toEqual(
      [1, "start-ellipsis", 4, 5, 6, "end-ellipsis", 10]
    );
    expect(
      itemSummary(getPaginationRange({ page: 10, pageCount: 10 }))
    ).toEqual([1, "start-ellipsis", 6, 7, 8, 9, 10]);
    expect(
      itemSummary(
        getPaginationRange({
          page: 5,
          pageCount: 10,
          boundaryCount: 0,
          siblingCount: 0,
        })
      )
    ).toEqual(["start-ellipsis", 5, "end-ellipsis"]);
  });

  it("returns every page when ellipses would not reduce the output", () => {
    const items = getPaginationRange({ page: 4, pageCount: 7 });
    expect(itemSummary(items)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      items.filter((item) => item.type === "page" && item.current)
    ).toEqual([{ type: "page", page: 4, current: true }]);
  });

  it("uses page 1 as the sole zero-count sentinel and emits no range item", () => {
    for (const boundaryCount of [0, 1, 2] as const) {
      for (const siblingCount of [0, 1, 2] as const) {
        expect(
          getPaginationRange({
            page: 1,
            pageCount: 0,
            boundaryCount,
            siblingCount,
          })
        ).toEqual([]);
      }
    }
    expect(() => getPaginationRange({ page: 2, pageCount: 0 })).toThrow(
      "page must be 1"
    );
  });

  it("preserves all structural invariants exhaustively through 250 pages", () => {
    let evaluated = 0;
    for (let pageCount = 1; pageCount <= 250; pageCount += 1) {
      for (let page = 1; page <= pageCount; page += 1) {
        for (const boundaryCount of [0, 1, 2] as const) {
          for (const siblingCount of [0, 1, 2] as const) {
            const items = getPaginationRange({
              page,
              pageCount,
              boundaryCount,
              siblingCount,
            });
            const pages = pageNumbers(items);
            const slotLimit = boundaryCount * 2 + siblingCount * 2 + 3;
            const context = `page=${page}, pageCount=${pageCount}, boundary=${boundaryCount}, sibling=${siblingCount}`;
            const fail = (message: string): never => {
              throw new Error(`${message} (${context})`);
            };

            if (items.length > Math.min(pageCount, slotLimit)) {
              fail("range exceeded its slot budget");
            }
            if (new Set(pages).size !== pages.length)
              fail("page was duplicated");
            if (pages.some((value) => value < 1 || value > pageCount)) {
              fail("page was outside the valid count");
            }
            if (pages.filter((value) => value === page).length !== 1) {
              fail("current page was missing or duplicated");
            }
            if (
              items.filter((item) => item.type === "page" && item.current)
                .length !== 1
            ) {
              fail("current marker was missing or duplicated");
            }
            for (let index = 1; index < pages.length; index += 1) {
              const previous = pages[index - 1];
              const next = pages[index];
              if (
                previous === undefined ||
                next === undefined ||
                previous >= next
              ) {
                fail("rendered pages were not strictly ascending");
              }
            }
            if (
              items.some(
                (item, index) =>
                  item.type !== "page" &&
                  items[index + 1] !== undefined &&
                  items[index + 1]?.type !== "page"
              )
            ) {
              fail("ellipses were adjacent");
            }
            if (
              items.filter((item) => item.type === "start-ellipsis").length >
                1 ||
              items.filter((item) => item.type === "end-ellipsis").length > 1
            ) {
              fail("an ellipsis kind was duplicated");
            }

            for (let boundary = 1; boundary <= boundaryCount; boundary += 1) {
              if (boundary <= pageCount && !pages.includes(boundary)) {
                fail("leading boundary page was missing");
              }
              const endBoundary = pageCount - boundary + 1;
              if (endBoundary >= 1 && !pages.includes(endBoundary)) {
                fail("trailing boundary page was missing");
              }
            }
            for (let delta = -siblingCount; delta <= siblingCount; delta += 1) {
              const sibling = page + delta;
              if (
                sibling >= 1 &&
                sibling <= pageCount &&
                !pages.includes(sibling)
              ) {
                fail("requested sibling page was missing");
              }
            }

            const positionedPages = items.flatMap((item, index) =>
              item.type === "page" ? [{ index, page: item.page }] : []
            );
            const first = positionedPages[0];
            const last = positionedPages.at(-1);
            if (first !== undefined && first.page > 1) {
              if (items[0]?.type !== "start-ellipsis") {
                fail("leading gap lacked a start ellipsis");
              }
            }
            if (last !== undefined && last.page < pageCount) {
              if (items.at(-1)?.type !== "end-ellipsis") {
                fail("trailing gap lacked an end ellipsis");
              }
            }
            for (let index = 1; index < positionedPages.length; index += 1) {
              const previous = positionedPages[index - 1];
              const next = positionedPages[index];
              if (previous === undefined || next === undefined) continue;
              const between = items.slice(previous.index + 1, next.index);
              if (next.page === previous.page + 1 && between.length !== 0) {
                fail("adjacent pages contained an ellipsis");
              }
              if (next.page > previous.page + 1 && between.length !== 1) {
                fail("omitted page gap lacked exactly one ellipsis");
              }
            }
            evaluated += 1;
          }
        }
      }
    }
    expect(evaluated).toBe(282_375);
  });

  it("rejects unsafe pages, counts, and unsupported range budgets", () => {
    const invalidCases = [
      { page: 0, pageCount: 1 },
      { page: 1.5, pageCount: 2 },
      { page: 3, pageCount: 2 },
      { page: 1, pageCount: -1 },
      { page: 1, pageCount: Number.MAX_SAFE_INTEGER + 1 },
      { page: 1, pageCount: 2, boundaryCount: 3 },
      { page: 1, pageCount: 2, siblingCount: -1 },
    ];
    for (const invalid of invalidCases) {
      expect(() =>
        getPaginationRange(invalid as Parameters<typeof getPaginationRange>[0])
      ).toThrow(/Pagination/);
    }
  });
});

describe("Pagination runtime validation and controlled details", () => {
  it("accepts all three branches and validates Provider-resolved labels", () => {
    expect(() =>
      assertPaginationProps(pagesProps(), {
        previousLabel: "Previous page",
        nextLabel: "Next page",
      })
    ).not.toThrow();
    expect(() => assertPaginationProps(itemsProps())).not.toThrow();
    expect(() => assertPaginationProps(cursorProps())).not.toThrow();
  });

  it("derives page counts and exact default statuses without inventing cursors", () => {
    expect(getPaginationPageCount(itemsProps())).toBe(5);
    expect(
      getPaginationPageCount(itemsProps({ totalItemCount: 0, page: 1 }))
    ).toBe(0);
    expect(getPaginationStatusLabel(itemsProps())).toBe("21–40 / 95");
    expect(
      getPaginationStatusLabel(itemsProps({ page: 5, totalItemCount: 95 }))
    ).toBe("81–95 / 95");
    expect(
      getPaginationStatusLabel(itemsProps({ page: 1, totalItemCount: 0 }))
    ).toBe("0 / 0");
    expect(getPaginationStatusLabel(pagesProps())).toBe("5 / 12");
    expect(
      getPaginationStatusLabel(pagesProps({ page: 1, pageCount: 0 }))
    ).toBe("0 / 0");
    expect(
      getPaginationStatusLabel(pagesProps({ statusLabel: "Custom" }))
    ).toBe("Custom");
    expect(getPaginationStatusLabel(cursorProps())).toBe(
      "Loaded 20 activities"
    );
  });

  it("emits item offsets and page-only details from their narrowed branches", () => {
    const event = { type: "press" };
    expect(
      getPaginationPageChangeDetails(itemsProps(), 5, "next-press", event)
    ).toEqual({
      mode: "numbered",
      countMode: "items",
      page: 5,
      previousPage: 2,
      pageCount: 5,
      reason: "next-press",
      totalItemCount: 95,
      pageSize: 20,
      offset: 80,
      endOffsetExclusive: 95,
      visibleItemCount: 15,
      originalEvent: event,
    });
    expect(
      getPaginationPageChangeDetails(pagesProps(), 4, "page-press")
    ).toEqual({
      mode: "numbered",
      countMode: "pages",
      page: 4,
      previousPage: 5,
      pageCount: 12,
      reason: "page-press",
      originalEvent: undefined,
    });
  });

  it("emits opaque cursor details without a fabricated page or reason", () => {
    const event = { type: "press" };
    expect(
      getPaginationNavigateDetails(cursorProps(), "previous", event)
    ).toEqual({
      mode: "cursor",
      direction: "previous",
      hasPreviousPage: true,
      hasNextPage: false,
      originalEvent: event,
    });
    expect(() =>
      getPaginationNavigateDetails(
        cursorProps(),
        "forward" as Parameters<typeof getPaginationNavigateDetails>[1]
      )
    ).toThrow("navigation direction");
  });

  it("passes one object to page label formatters and rejects blank output", () => {
    const formatter = vi.fn(
      ({
        page,
        pageCount,
        current,
      }: {
        page: number;
        pageCount: number;
        current: boolean;
      }) => `${current ? "Current" : "Go to"} page ${page} of ${pageCount}`
    );
    const props = pagesProps({ getPageAccessibilityLabel: formatter });
    expect(getPaginationPageAccessibilityLabel(props, 5)).toBe(
      "Current page 5 of 12"
    );
    expect(formatter).toHaveBeenCalledWith({
      page: 5,
      pageCount: 12,
      current: true,
    });
    expect(() =>
      getPaginationPageAccessibilityLabel(
        pagesProps({ getPageAccessibilityLabel: () => "   " }),
        3
      )
    ).toThrow("getPageAccessibilityLabel result for page 3");
  });

  it("enforces zero-count sentinel and safe integer bounds", () => {
    expect(() =>
      assertPaginationProps(pagesProps({ page: 1, pageCount: 0 }))
    ).not.toThrow();
    expect(() =>
      assertPaginationProps(itemsProps({ page: 1, totalItemCount: 0 }))
    ).not.toThrow();
    const invalid = [
      pagesProps({ page: 0 }),
      pagesProps({ page: 13 }),
      pagesProps({ page: 2, pageCount: 0 }),
      pagesProps({ pageCount: -1 }),
      pagesProps({ pageCount: 1.5 }),
      itemsProps({ totalItemCount: -1 }),
      itemsProps({ totalItemCount: Number.MAX_SAFE_INTEGER + 1 }),
      itemsProps({ pageSize: 0 }),
      itemsProps({ pageSize: 1.5 }),
    ];
    for (const props of invalid) {
      expect(() => assertPaginationProps(props)).toThrow(/Pagination/);
    }
  });

  it("fails fast for invalid enums, callbacks, booleans, and labels", () => {
    const invalid = [
      { ...pagesProps(), mode: "offset" },
      { ...pagesProps(), direction: "vertical" },
      { ...pagesProps(), size: "lg" },
      { ...pagesProps(), presentation: "minimal" },
      { ...pagesProps(), boundaryCount: 3 },
      { ...pagesProps(), siblingCount: -1 },
      { ...pagesProps(), accessibilityLabel: " " },
      { ...pagesProps(), previousLabel: "" },
      { ...pagesProps(), nextLabel: "\n" },
      { ...pagesProps(), statusLabel: " " },
      { ...pagesProps(), disabled: "yes" },
      { ...pagesProps(), busy: 1 },
      { ...pagesProps(), onPageChange: null },
      { ...cursorProps(), statusLabel: " " },
      { ...cursorProps(), hasPreviousPage: 1 },
      { ...cursorProps(), hasNextPage: null },
      { ...cursorProps(), onNavigate: false },
      { ...pagesProps(), unstyled: true },
    ];
    for (const props of invalid) {
      expect(() => assertPaginationProps(unsafeProps(props))).toThrow(
        /Pagination/
      );
    }
    expect(() =>
      assertPaginationProps(pagesProps(), {
        previousLabel: " ",
        nextLabel: "Next",
      })
    ).toThrow("resolved previousLabel");
  });

  it("enforces the numbered count XOR and cursor/numbered separation at runtime", () => {
    const invalid = [
      { ...itemsProps(), pageCount: 5 },
      { ...pagesProps(), totalItemCount: 100 },
      { ...pagesProps(), pageSize: 20 },
      { ...pagesProps(), countMode: "unknown" },
      { ...pagesProps(), hasPreviousPage: false },
      { ...pagesProps(), onNavigate: vi.fn() },
      { ...cursorProps(), page: 1 },
      { ...cursorProps(), countMode: "pages" },
      { ...cursorProps(), pageCount: 5 },
      { ...cursorProps(), onPageChange: vi.fn() },
    ];
    for (const props of invalid) {
      expect(() => assertPaginationProps(unsafeProps(props))).toThrow(
        /Pagination/
      );
    }
  });
});
