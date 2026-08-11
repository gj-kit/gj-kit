import type { ReactElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nManager } from "react-native";
import { Pagination } from "../../src/components/pagination.native";
import type { PaginationProps } from "../../src/components/pagination.types";
import { UiProvider } from "../../src/components/provider";
import { enStrings, koStrings } from "../../src/strings/strings";

function Providers({
  children,
  strings = enStrings,
}: {
  readonly children: ReactElement;
  readonly strings?: typeof enStrings | undefined;
}): ReactElement {
  return <UiProvider strings={strings}>{children}</UiProvider>;
}

function numberedProps(
  overrides: Partial<PaginationProps> = {}
): PaginationProps {
  return {
    mode: "numbered",
    countMode: "pages",
    accessibilityLabel: "Results pages",
    page: 5,
    pageCount: 10,
    onPageChange: vi.fn(),
    getPageAccessibilityLabel: ({ page, pageCount, current }) =>
      `Page ${page} of ${pageCount}${current ? ", current page" : ""}`,
    testID: "pager",
    ...overrides,
  } as PaginationProps;
}

function setViewportWidth(width: number): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "clientWidth"
  );
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
  return () => {
    if (descriptor === undefined) {
      delete (document.documentElement as unknown as { clientWidth?: number })
        .clientWidth;
    } else {
      Object.defineProperty(
        document.documentElement,
        "clientWidth",
        descriptor
      );
    }
    window.dispatchEvent(new Event("resize"));
  };
}

type ReactFiber = {
  readonly memoizedProps?: { readonly hitSlop?: unknown } | undefined;
  readonly return?: ReactFiber | null | undefined;
};

/** RNW consumes hitSlop before the host DOM node, so inspect its nearest Pressable fiber. */
function pressableHitSlop(element: HTMLElement): number | undefined {
  const fiberKey = Object.keys(element).find((key) =>
    key.startsWith("__reactFiber")
  );
  let fiber =
    fiberKey === undefined
      ? undefined
      : (element as unknown as Record<string, ReactFiber>)[fiberKey];
  while (fiber !== undefined && fiber !== null) {
    const value = fiber.memoizedProps?.hitSlop;
    if (typeof value === "number") return value;
    fiber = fiber.return ?? undefined;
  }
  return undefined;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Pagination native presentation and interaction contracts", () => {
  it("renders a named toolbar with real full-page buttons and a selected current page", () => {
    const onPageChange = vi.fn();
    render(
      <Providers>
        <Pagination
          {...numberedProps({ presentation: "full", onPageChange })}
        />
      </Providers>
    );

    const toolbar = screen.getByRole("toolbar", { name: "Results pages" });
    expect(toolbar).toBe(screen.getByTestId("pager"));
    expect(
      within(toolbar).getByRole("button", { name: "Previous page" })
    ).toBeTruthy();
    expect(
      within(toolbar).getByRole("button", { name: "Next page" })
    ).toBeTruthy();
    expect(screen.getByTestId("pager-start-ellipsis")).toBeTruthy();
    expect(screen.getByTestId("pager-end-ellipsis")).toBeTruthy();
    expect(screen.getByTestId("pager-status").textContent).toBe("5 / 10");
    expect(
      screen.getByTestId("pager-status").getAttribute("aria-live")
    ).toBeNull();

    const current = within(toolbar).getByRole("button", {
      name: "Page 5 of 10, current page",
    });
    expect(current.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(current);
    expect(onPageChange).not.toHaveBeenCalled();

    fireEvent.click(
      within(toolbar).getByRole("button", { name: "Page 6 of 10" })
    );
    expect(onPageChange).toHaveBeenCalledWith(
      6,
      expect.objectContaining({
        mode: "numbered",
        countMode: "pages",
        reason: "page-press",
        previousPage: 5,
        page: 6,
        pageCount: 10,
        originalEvent: expect.anything(),
      })
    );
  });

  it("uses the tablet token for auto compact/full and derives item status without a live region", async () => {
    const restoreViewport = setViewportWidth(390);
    try {
      render(
        <Providers>
          <Pagination
            mode="numbered"
            countMode="items"
            accessibilityLabel="Results pages"
            page={5}
            totalItemCount={95}
            pageSize={10}
            presentation="auto"
            onPageChange={vi.fn()}
            getPageAccessibilityLabel={({ page, pageCount, current }) =>
              `Page ${page} of ${pageCount}${current ? ", current page" : ""}`
            }
            testID="pager"
          />
        </Providers>
      );

      const status = screen.getByTestId("pager-status");
      expect(status.textContent).toBe("41–50 / 95");
      expect(status.getAttribute("aria-live")).toBeNull();
      expect(screen.queryByTestId("pager-page-5")).toBeNull();

      act(() => {
        Object.defineProperty(document.documentElement, "clientWidth", {
          configurable: true,
          value: 1_000,
        });
        window.dispatchEvent(new Event("resize"));
      });

      await waitFor(() =>
        expect(screen.getByTestId("pager-page-5")).toBeTruthy()
      );
      expect(screen.getByTestId("pager-status").textContent).toBe("41–50 / 95");
    } finally {
      cleanup();
      restoreViewport();
    }
  });

  it("keeps cursor mode compact at wide widths and reports stable cursor directions", () => {
    const restoreViewport = setViewportWidth(1_200);
    const onNavigate = vi.fn();
    try {
      render(
        <Providers>
          <Pagination
            mode="cursor"
            accessibilityLabel="Audit log pages"
            statusLabel="Items after event 300"
            hasPreviousPage
            hasNextPage={false}
            onNavigate={onNavigate}
            testID="cursor"
          />
        </Providers>
      );

      const toolbar = screen.getByRole("toolbar", { name: "Audit log pages" });
      expect(screen.getByTestId("cursor-status").textContent).toBe(
        "Items after event 300"
      );
      expect(within(toolbar).queryByText(/^\d+$/)).toBeNull();
      const previous = within(toolbar).getByRole("button", {
        name: "Previous page",
      });
      const next = within(toolbar).getByRole("button", { name: "Next page" });
      expect(previous.getAttribute("aria-disabled")).not.toBe("true");
      expect(next.getAttribute("aria-disabled")).toBe("true");

      fireEvent.click(previous);
      fireEvent.click(next);
      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith("previous", {
        mode: "cursor",
        direction: "previous",
        hasPreviousPage: true,
        hasNextPage: false,
        originalEvent: expect.anything(),
      });
    } finally {
      cleanup();
      restoreViewport();
    }
  });

  it("reverses only visual order in RTL while previous still requests the smaller page", () => {
    const onPageChange = vi.fn();
    render(
      <Providers>
        <Pagination
          {...numberedProps({
            direction: "rtl",
            page: 3,
            pageCount: 5,
            presentation: "full",
            style: { direction: "ltr", gap: 19 },
            onPageChange,
          })}
        />
      </Providers>
    );

    const rootStyle = getComputedStyle(screen.getByTestId("pager"));
    const controlsStyle = getComputedStyle(
      screen.getByTestId("pager-controls")
    );
    expect(rootStyle.direction).toBe("rtl");
    expect(rootStyle.gap).toBe("19px");
    expect(controlsStyle.direction).toBe("rtl");
    expect(controlsStyle.flexDirection).toBe("row");
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(
      2,
      expect.objectContaining({
        reason: "previous-press",
        previousPage: 3,
        page: 2,
      })
    );
  });

  it("inherits global RTL once and lets an explicit LTR direction override it", () => {
    const originalRTL = I18nManager.isRTL;
    try {
      (I18nManager as unknown as { isRTL: boolean }).isRTL = true;
      const result = render(
        <Providers>
          <Pagination {...numberedProps({ presentation: "compact" })} />
        </Providers>
      );

      expect(getComputedStyle(screen.getByTestId("pager")).direction).toBe(
        "rtl"
      );
      expect(
        getComputedStyle(screen.getByTestId("pager-controls")).flexDirection
      ).toBe("row");

      result.rerender(
        <Providers>
          <Pagination
            {...numberedProps({
              direction: "ltr",
              presentation: "compact",
            })}
          />
        </Providers>
      );
      expect(getComputedStyle(screen.getByTestId("pager")).direction).toBe(
        "ltr"
      );
    } finally {
      (I18nManager as unknown as { isRTL: boolean }).isRTL = originalRTL;
    }
  });

  it("blocks global busy, edge, and disabled controls while exposing their states", () => {
    const onPageChange = vi.fn();
    const result = render(
      <Providers>
        <Pagination
          {...numberedProps({
            page: 1,
            pageCount: 2,
            presentation: "full",
            busy: true,
            onPageChange,
          })}
        />
      </Providers>
    );

    const toolbar = screen.getByRole("toolbar", { name: "Results pages" });
    expect(toolbar.getAttribute("aria-busy")).toBe("true");
    for (const button of within(toolbar).getAllByRole("button")) {
      expect(button.getAttribute("aria-disabled")).toBe("true");
      fireEvent.click(button);
    }
    expect(onPageChange).not.toHaveBeenCalled();

    result.rerender(
      <Providers>
        <Pagination
          {...numberedProps({
            page: 1,
            pageCount: 2,
            presentation: "full",
            onPageChange,
          })}
        />
      </Providers>
    );
    expect(
      screen
        .getByRole("button", { name: "Previous page" })
        .getAttribute("aria-disabled")
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenLastCalledWith(
      2,
      expect.objectContaining({ reason: "next-press", page: 2 })
    );

    onPageChange.mockClear();
    result.rerender(
      <Providers>
        <Pagination
          {...numberedProps({
            page: 2,
            pageCount: 3,
            presentation: "full",
            disabled: true,
            onPageChange,
          })}
        />
      </Providers>
    );
    expect(toolbar.getAttribute("aria-disabled")).toBe("true");
    for (const button of within(toolbar).getAllByRole("button")) {
      fireEvent.click(button);
    }
    expect(onPageChange).not.toHaveBeenCalled();
  });

  it("uses provider labels, lets props override them, and keeps sm visuals at token size", () => {
    const result = render(
      <Providers strings={koStrings}>
        <Pagination
          {...numberedProps({ presentation: "compact", size: "sm" })}
        />
      </Providers>
    );

    const previous = screen.getByRole("button", { name: "이전 페이지" });
    const next = screen.getByRole("button", { name: "다음 페이지" });
    expect(previous.textContent).toBe("이전 페이지");
    expect(next.textContent).toBe("다음 페이지");
    expect(previous.style.minHeight).toBe("36px");
    expect(previous.style.minWidth).toBe("36px");
    const hitSlop = pressableHitSlop(previous);
    expect(hitSlop).toBe(4);
    expect(36 + (hitSlop ?? 0) * 2).toBeGreaterThanOrEqual(44);

    result.rerender(
      <Providers strings={koStrings}>
        <Pagination
          {...numberedProps({
            presentation: "compact",
            previousLabel: "뒤로",
            nextLabel: "앞으로",
          })}
        />
      </Providers>
    );
    expect(screen.getByRole("button", { name: "뒤로" }).textContent).toBe(
      "뒤로"
    );
    const overriddenNext = screen.getByRole("button", { name: "앞으로" });
    expect(overriddenNext.textContent).toBe("앞으로");
    expect(overriddenNext.style.minHeight).toBe("44px");
  });

  it("forwards token-safe style hooks and rejects malformed runtime inputs", () => {
    render(
      <Providers>
        <Pagination
          {...numberedProps({
            presentation: "compact",
            className: "pager-root",
            style: { marginTop: 7 },
            controlClassName: "pager-control",
            controlStyle: {
              height: 1,
              maxHeight: 1,
              maxWidth: 1,
              minHeight: 1,
              minWidth: 1,
              opacity: 0.71,
              width: 1,
            },
            controlLabelClassName: "pager-label",
            controlLabelStyle: { opacity: 0.72 },
            statusClassName: "pager-status",
            statusStyle: { opacity: 0.73 },
          })}
        />
      </Providers>
    );

    const root = screen.getByTestId("pager");
    expect(root.style.marginTop).toBe("7px");
    const previous = screen.getByTestId("pager-previous");
    expect(previous.style.opacity).toBe("0.71");
    expect(previous.style.minHeight).toBe("44px");
    expect(previous.style.minWidth).toBe("44px");
    expect(previous.style.maxHeight).toBe("44px");
    expect(previous.style.maxWidth).toBe("44px");
    expect((previous.firstElementChild as HTMLElement).style.opacity).toBe(
      "0.72"
    );
    expect(screen.getByTestId("pager-status").style.opacity).toBe("0.73");

    cleanup();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <Providers>
          <Pagination {...numberedProps({ page: 2, pageCount: 1 })} />
        </Providers>
      )
    ).toThrow();

    cleanup();
    expect(() =>
      render(
        <Providers strings={{ ...enStrings, previousPage: " " }}>
          <Pagination {...numberedProps({ presentation: "compact" })} />
        </Providers>
      )
    ).toThrow("Pagination resolved previousLabel must be a nonblank string.");
    error.mockRestore();
  });
});
