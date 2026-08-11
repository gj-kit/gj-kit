import { describe, expectTypeOf, it } from "vitest";
import { View } from "react-native";
import { Pagination, getPaginationRange } from "../../src";
import type {
  PaginationCursorProps,
  PaginationItemsPageChangeDetails,
  PaginationNavigateDetails,
  PaginationNumberedItemsProps,
  PaginationNumberedPagesProps,
  PaginationPageLabelDetails,
  PaginationPagesPageChangeDetails,
  PaginationProps,
  PaginationRangeItem,
} from "../../src";

describe("Pagination discriminated public contracts", () => {
  it("keeps item totals and exact offset details together", () => {
    void (
      <Pagination
        mode="numbered"
        countMode="items"
        accessibilityLabel="검색 결과 페이지"
        page={2}
        totalItemCount={95}
        pageSize={20}
        presentation="full"
        boundaryCount={2}
        siblingCount={1}
        getPageAccessibilityLabel={(details) => {
          expectTypeOf(details).toEqualTypeOf<PaginationPageLabelDetails>();
          return `${details.current ? "현재" : "이동"} ${details.page} / ${
            details.pageCount
          }`;
        }}
        onPageChange={(page, details) => {
          expectTypeOf(page).toEqualTypeOf<number>();
          expectTypeOf(
            details
          ).toEqualTypeOf<PaginationItemsPageChangeDetails>();
          expectTypeOf(details.countMode).toEqualTypeOf<"items">();
          details.offset.toFixed(0);
          details.endOffsetExclusive.toFixed(0);
          details.visibleItemCount.toFixed(0);
        }}
        direction="rtl"
        size="sm"
        controlStyle={{ minWidth: 44 }}
        controlClassName="control"
        controlLabelStyle={{ opacity: 0.8 }}
        controlLabelClassName="control-label"
        statusStyle={{ opacity: 0.7 }}
        statusClassName="status"
        style={{ marginTop: 8 }}
        className="pagination"
        testID="results-pages"
      />
    );
  });

  it("keeps page totals free of item-offset fields", () => {
    void (
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel="문서 페이지"
        page={3}
        pageCount={12}
        presentation="compact"
        statusLabel="3 / 12 페이지"
        previousLabel="이전"
        nextLabel="다음"
        onPageChange={(page, details) => {
          expectTypeOf(page).toEqualTypeOf<number>();
          expectTypeOf(
            details
          ).toEqualTypeOf<PaginationPagesPageChangeDetails>();
          expectTypeOf(details.countMode).toEqualTypeOf<"pages">();
          // @ts-expect-error page-count mode never fabricates item offsets
          details.offset;
        }}
      />
    );
  });

  it("models cursor navigation without a numeric page", () => {
    void (
      <Pagination
        mode="cursor"
        accessibilityLabel="활동 더 보기"
        statusLabel="최근 활동 20개"
        hasPreviousPage
        hasNextPage={false}
        disabled={false}
        busy
        onNavigate={(direction, details) => {
          expectTypeOf(direction).toEqualTypeOf<"previous" | "next">();
          expectTypeOf(details).toEqualTypeOf<PaginationNavigateDetails>();
          expectTypeOf(details.mode).toEqualTypeOf<"cursor">();
          // @ts-expect-error cursor details deliberately have no reason
          details.reason;
          // @ts-expect-error cursor details deliberately have no page
          details.page;
        }}
      />
    );
  });

  it("narrows every branch through mode and countMode", () => {
    function inspect(props: PaginationProps): void {
      if (props.mode === "cursor") {
        expectTypeOf(props).toEqualTypeOf<PaginationCursorProps>();
        props.onNavigate("next", {
          mode: "cursor",
          direction: "next",
          hasPreviousPage: props.hasPreviousPage,
          hasNextPage: props.hasNextPage,
        });
        return;
      }
      if (props.countMode === "items") {
        expectTypeOf(props).toEqualTypeOf<PaginationNumberedItemsProps>();
        props.totalItemCount.toFixed(0);
        return;
      }
      expectTypeOf(props).toEqualTypeOf<PaginationNumberedPagesProps>();
      props.pageCount.toFixed(0);
    }

    void inspect;
  });

  it("exposes a readonly pure page-or-ellipsis range", () => {
    const range = getPaginationRange({
      page: 5,
      pageCount: 20,
      boundaryCount: 1,
      siblingCount: 2,
    });
    expectTypeOf(range).toEqualTypeOf<readonly PaginationRangeItem[]>();
    const item = range[0];
    if (item?.type === "page") {
      item.page.toFixed(0);
      expectTypeOf(item.current).toEqualTypeOf<boolean>();
    }
  });
});

describe("Pagination compile-time misuse prevention", () => {
  it("requires a stable name, explicit mode, and controlled callback", () => {
    void (
      (
        // @ts-expect-error accessibilityLabel is required for the navigation region
        <Pagination
          mode="numbered"
          countMode="pages"
          page={1}
          pageCount={1}
          onPageChange={() => {}}
        />
      )
    );
    void (
      (
        // @ts-expect-error mode is an explicit required discriminator
        <Pagination
          accessibilityLabel="Pages"
          countMode="pages"
          page={1}
          pageCount={1}
          onPageChange={() => {}}
        />
      )
    );
    void (
      (
        // @ts-expect-error numbered pagination is controlled and requires onPageChange
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Pages"
          page={1}
          pageCount={1}
        />
      )
    );
    void (
      (
        // @ts-expect-error cursor pagination is controlled and requires onNavigate
        <Pagination
          mode="cursor"
          accessibilityLabel="More"
          statusLabel="20 loaded"
          hasPreviousPage={false}
          hasNextPage
        />
      )
    );
  });

  it("makes item totals and page totals mutually exclusive", () => {
    void (
      (
        // @ts-expect-error item-count mode computes pageCount and must not accept it
        <Pagination
          mode="numbered"
          countMode="items"
          accessibilityLabel="Items"
          page={1}
          totalItemCount={10}
          pageSize={5}
          pageCount={2}
          onPageChange={() => {}}
        />
      )
    );
    void (
      (
        // @ts-expect-error page-count mode has no item total
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Pages"
          page={1}
          pageCount={2}
          totalItemCount={10}
          onPageChange={() => {}}
        />
      )
    );
    void (
      (
        // @ts-expect-error page-count mode has no pageSize
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Pages"
          page={1}
          pageCount={2}
          pageSize={5}
          onPageChange={() => {}}
        />
      )
    );
  });

  it("keeps cursor and numbered surfaces disjoint", () => {
    void (
      (
        // @ts-expect-error cursor mode never accepts a numeric page
        <Pagination
          mode="cursor"
          accessibilityLabel="More"
          statusLabel="20 loaded"
          hasPreviousPage={false}
          hasNextPage
          page={1}
          onNavigate={() => {}}
        />
      )
    );
    void (
      (
        // @ts-expect-error cursor mode requires a meaningful statusLabel
        <Pagination
          mode="cursor"
          accessibilityLabel="More"
          hasPreviousPage={false}
          hasNextPage
          onNavigate={() => {}}
        />
      )
    );
    void (
      (
        // @ts-expect-error numbered mode does not accept cursor availability
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Pages"
          page={1}
          pageCount={2}
          hasNextPage
          onPageChange={() => {}}
        />
      )
    );
  });

  it("limits presentation budgets and forbids legacy escape hatches", () => {
    void (
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel="Pages"
        page={1}
        pageCount={10}
        // @ts-expect-error boundaryCount is intentionally bounded to a small union
        boundaryCount={3}
        onPageChange={() => {}}
      />
    );
    void (
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel="Pages"
        page={1}
        pageCount={10}
        // @ts-expect-error siblingCount is intentionally bounded to a small union
        siblingCount={4}
        onPageChange={() => {}}
      />
    );
    void (
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel="Pages"
        page={1}
        pageCount={1}
        onPageChange={() => {}}
        // @ts-expect-error unstyled is unavailable across public primitives
        unstyled
      />
    );
    void (
      (
        // @ts-expect-error Pagination owns its controls and has no child composition
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Pages"
          page={1}
          pageCount={1}
          onPageChange={() => {}}
        >
          <View />
        </Pagination>
      )
    );
  });
});
