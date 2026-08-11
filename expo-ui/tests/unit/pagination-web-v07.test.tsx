import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { Pagination } from "../../src/components/pagination.web";
import { UiProvider } from "../../src/components/provider";
import { enStrings } from "../../src/strings/strings";

function Providers({
  children,
  strings = enStrings,
}: {
  readonly children: ReactElement;
  readonly strings?: typeof enStrings;
}) {
  return <UiProvider strings={strings}>{children}</UiProvider>;
}

function renderPages(
  overrides: Record<string, unknown> = {},
  strings = enStrings
) {
  const onPageChange = vi.fn();
  const result = render(
    <Providers strings={strings}>
      <Pagination
        mode="numbered"
        countMode="pages"
        accessibilityLabel="Results pagination"
        page={5}
        pageCount={12}
        onPageChange={onPageChange}
        {...overrides}
      />
    </Providers>
  );
  return { ...result, onPageChange };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Pagination web semantic numbered navigation", () => {
  it("emits a native nav/status/ol/li/button tree and marks one current page", () => {
    const { onPageChange } = renderPages({ presentation: "auto" });

    const navigation = screen.getByRole("navigation", {
      name: "Results pagination",
    });
    expect(navigation.tagName).toBe("NAV");
    expect(navigation.getAttribute("dir")).toBe("ltr");
    expect(navigation.querySelector(":scope > span")?.tagName).toBe("SPAN");
    expect(navigation.querySelector(":scope > [role='status']")).toBeNull();
    expect(navigation.querySelector(":scope > [aria-live]")).toBeNull();
    const list = navigation.querySelector(":scope > ol");
    expect(list?.tagName).toBe("OL");
    expect(
      Array.from(list?.children ?? []).every((child) => child.tagName === "LI")
    ).toBe(true);

    const buttons = within(navigation).getAllByRole("button");
    expect(within(navigation).getAllByRole("listitem")).toHaveLength(
      buttons.length
    );
    expect(buttons.every((button) => button.tagName === "BUTTON")).toBe(true);
    expect(
      buttons.every((button) => button.getAttribute("type") === "button")
    ).toBe(true);
    const current = navigation.querySelectorAll("button[aria-current='page']");
    expect(current).toHaveLength(1);
    expect(current[0]?.textContent).toBe("5");
    expect(screen.getByText("5 / 12").textContent).toBe("5 / 12");

    fireEvent.click(screen.getByRole("button", { name: "5" }));
    expect(onPageChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "6" }));
    expect(onPageChange).toHaveBeenCalledTimes(1);
    const [page, details] = onPageChange.mock.calls[0] as [
      number,
      Record<string, unknown>
    ];
    const { originalEvent, ...request } = details;
    expect(page).toBe(6);
    expect(request).toEqual({
      mode: "numbered",
      countMode: "pages",
      reason: "page-press",
      previousPage: 5,
      page: 6,
      pageCount: 12,
    });
    expect(originalEvent).toBeInstanceOf(MouseEvent);
  });

  it("reports exact item offsets and the final visible count for controlled requests", () => {
    const onPageChange = vi.fn();
    render(
      <Providers>
        <Pagination
          mode="numbered"
          countMode="items"
          accessibilityLabel="Invoices pagination"
          page={2}
          totalItemCount={25}
          pageSize={10}
          onPageChange={onPageChange}
        />
      </Providers>
    );

    expect(screen.getByText("11–20 / 25").textContent).toBe("11–20 / 25");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    const [page, details] = onPageChange.mock.calls[0] as [
      number,
      Record<string, unknown>
    ];
    const { originalEvent, ...request } = details;
    expect(page).toBe(3);
    expect(request).toEqual({
      mode: "numbered",
      countMode: "items",
      reason: "next-press",
      previousPage: 2,
      page: 3,
      pageCount: 3,
      totalItemCount: 25,
      pageSize: 10,
      offset: 20,
      endOffsetExclusive: 25,
      visibleItemCount: 5,
    });
    expect(originalEvent).toBeInstanceOf(MouseEvent);
  });

  it("uses the empty collection sentinel without inventing a selectable page", () => {
    const { onPageChange } = renderPages({ page: 1, pageCount: 0 });
    const navigation = screen.getByRole("navigation");

    expect(screen.getByText("0 / 0").textContent).toBe("0 / 0");
    expect(navigation.querySelector("button[aria-current='page']")).toBeNull();
    const buttons = within(navigation).getAllByRole("button");
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(
      true
    );
    buttons.forEach((button) => fireEvent.click(button));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("Pagination web compact and cursor boundaries", () => {
  it("compact keeps only previous/status/next while auto and full stay numbered", () => {
    const { onPageChange } = renderPages({
      page: 2,
      pageCount: 5,
      presentation: "compact",
    });
    const navigation = screen.getByRole("navigation");
    const buttons = within(navigation).getAllByRole("button");

    expect(buttons.map((button) => button.textContent)).toEqual([
      "Previous page",
      "Next page",
    ]);
    expect(navigation.querySelector("[aria-current='page']")).toBeNull();
    expect(screen.getByText("2 / 5").textContent).toBe("2 / 5");

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    const [page, details] = onPageChange.mock.calls[0] as [
      number,
      Record<string, unknown>
    ];
    expect(page).toBe(1);
    expect(details).toMatchObject({
      mode: "numbered",
      countMode: "pages",
      reason: "previous-press",
      previousPage: 2,
      page: 1,
      pageCount: 5,
    });
  });

  it("cursor never renders page numbers and emits exact logical directions", () => {
    const onNavigate = vi.fn();
    render(
      <Providers>
        <Pagination
          mode="cursor"
          accessibilityLabel="Activity pagination"
          statusLabel="Older activity is available"
          hasPreviousPage
          hasNextPage
          onNavigate={onNavigate}
        />
      </Providers>
    );

    const navigation = screen.getByRole("navigation");
    expect(screen.getByText("Older activity is available").textContent).toBe(
      "Older activity is available"
    );
    expect(
      within(navigation)
        .getAllByRole("button")
        .some((button) => /^\d+$/.test(button.textContent ?? ""))
    ).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onNavigate).toHaveBeenCalledTimes(2);
    for (const [index, direction] of ["previous", "next"].entries()) {
      const [actualDirection, details] = onNavigate.mock.calls[index] as [
        string,
        Record<string, unknown>
      ];
      const { originalEvent, ...request } = details;
      expect(actualDirection).toBe(direction);
      expect(request).toEqual({
        mode: "cursor",
        direction,
        hasPreviousPage: true,
        hasNextPage: true,
      });
      expect(originalEvent).toBeInstanceOf(MouseEvent);
    }
  });

  it("blocks edge, current, disabled, and busy requests with real disabled buttons", () => {
    const first = renderPages({ page: 1, pageCount: 3, testID: "pager" });
    const previous = screen.getByTestId("pager-previous");
    const current = screen.getByTestId("pager-page-1");
    const next = screen.getByTestId("pager-next");

    expect(previous.hasAttribute("disabled")).toBe(true);
    expect(current.hasAttribute("disabled")).toBe(false);
    expect(next.hasAttribute("disabled")).toBe(false);
    fireEvent.click(previous);
    fireEvent.click(current);
    expect(first.onPageChange).not.toHaveBeenCalled();

    first.rerender(
      <Providers>
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Results pagination"
          page={2}
          pageCount={3}
          disabled
          testID="pager"
          onPageChange={first.onPageChange}
        />
      </Providers>
    );
    within(screen.getByTestId("pager"))
      .getAllByRole("button")
      .forEach((button) => expect(button.hasAttribute("disabled")).toBe(true));

    first.rerender(
      <Providers>
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Results pagination"
          page={2}
          pageCount={3}
          busy
          testID="pager"
          onPageChange={first.onPageChange}
        />
      </Providers>
    );
    expect(screen.getByTestId("pager").getAttribute("aria-busy")).toBe("true");
    within(screen.getByTestId("pager"))
      .getAllByRole("button")
      .forEach((button) => {
        expect(button.hasAttribute("disabled")).toBe(true);
        fireEvent.click(button);
      });
    expect(first.onPageChange).not.toHaveBeenCalled();
  });
});

describe("Pagination web localization, direction, and raw style hooks", () => {
  it("uses complete Provider strings and lets individual labels win", () => {
    const strings = {
      ...enStrings,
      previousPage: "Back",
      nextPage: "Forward",
    };
    const first = renderPages({ page: 2, pageCount: 3 }, strings);
    expect(screen.getByRole("button", { name: "Back" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forward" })).toBeTruthy();

    first.rerender(
      <Providers strings={strings}>
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Results pagination"
          page={2}
          pageCount={3}
          previousLabel="Older"
          nextLabel="Newer"
          onPageChange={first.onPageChange}
        />
      </Providers>
    );
    expect(screen.getByRole("button", { name: "Older" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Newer" })).toBeTruthy();
  });

  it("uses dir for RTL visual ordering while callbacks retain logical meaning", () => {
    const { onPageChange } = renderPages({
      page: 3,
      pageCount: 5,
      direction: "rtl",
      style: { direction: "ltr" },
    });
    const navigation = screen.getByRole("navigation");
    expect(navigation.getAttribute("dir")).toBe("rtl");
    expect(getComputedStyle(navigation).direction).toBe("rtl");

    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange.mock.calls.map(([page]) => page)).toEqual([2, 4]);
    expect(
      onPageChange.mock.calls.map(([, details]) => details.reason)
    ).toEqual(["previous-press", "next-press"]);
  });

  it("supports page accessibility labels and rejects blank formatter output", () => {
    const getPageAccessibilityLabel = vi.fn(
      ({ page, pageCount, current }) =>
        `Page ${page} of ${pageCount}${current ? ", current" : ""}`
    );
    renderPages({ getPageAccessibilityLabel });
    expect(
      screen
        .getByRole("button", { name: "Page 5 of 12, current" })
        .getAttribute("aria-current")
    ).toBe("page");
    expect(getPageAccessibilityLabel).toHaveBeenCalledWith({
      page: 5,
      pageCount: 12,
      current: true,
    });
    expect(getPageAccessibilityLabel).toHaveBeenCalledTimes(5);

    cleanup();
    expect(() =>
      renderPages({ getPageAccessibilityLabel: () => "   " })
    ).toThrowError(
      "Pagination getPageAccessibilityLabel result for page 1 must be a nonblank string."
    );
  });

  it("rejects a blank resolved Provider control label", () => {
    expect(() =>
      renderPages(
        {},
        {
          ...enStrings,
          previousPage: "   ",
        }
      )
    ).toThrowError(
      "Pagination resolved previousLabel must be a nonblank string."
    );
  });

  it("converts RN root/control/label/status hooks to valid CSS lengths", () => {
    renderPages({
      testID: "styled-pager",
      className: "root-hook",
      controlClassName: "control-hook",
      controlLabelClassName: "label-hook",
      statusClassName: "status-hook",
      style: { paddingHorizontal: 7, lineHeight: 24 },
      controlStyle: {
        height: 1,
        marginStart: 3,
        minHeight: 1,
        minWidth: 1,
        paddingVertical: 5,
        width: 1,
      },
      controlLabelStyle: { lineHeight: 20 },
      statusStyle: { lineHeight: 18, marginStart: 2 },
    });

    const root = screen.getByTestId("styled-pager");
    const control = screen.getByTestId("styled-pager-page-5");
    const label = control.querySelector("span");
    const status = screen.getByTestId("styled-pager-status");
    expect(root.className).toBe("root-hook");
    expect(root.style.paddingLeft).toBe("7px");
    expect(root.style.paddingRight).toBe("7px");
    expect(root.style.lineHeight).toBe("24px");
    expect(root.getAttribute("style")).not.toContain("padding-horizontal");

    expect(control.className).toContain("control-hook");
    expect(control.style.marginInlineStart).toBe("3px");
    expect(control.style.paddingTop).toBe("5px");
    expect(control.style.paddingBottom).toBe("5px");
    expect(control.style.minHeight).toBe("44px");
    expect(control.style.minWidth).toBe("44px");
    expect(control.style.borderStyle).toBe("solid");
    expect(control.style.fontFamily).toBe("inherit");
    expect(label?.className).toBe("label-hook");
    expect(label?.style.lineHeight).toBe("20px");
    expect(status.className).toBe("status-hook");
    expect(status.style.lineHeight).toBe("18px");
    expect(status.style.marginInlineStart).toBe("2px");
  });

  it("uses the token control sizes for md and sm browser buttons", () => {
    const first = renderPages({ testID: "sized" });
    expect(screen.getByTestId("sized-page-5").style.minHeight).toBe("44px");
    expect(screen.getByTestId("sized-page-5").style.minWidth).toBe("44px");

    first.rerender(
      <Providers>
        <Pagination
          mode="numbered"
          countMode="pages"
          accessibilityLabel="Results pagination"
          page={5}
          pageCount={12}
          size="sm"
          testID="sized"
          onPageChange={first.onPageChange}
        />
      </Providers>
    );
    expect(screen.getByTestId("sized-page-5").style.minHeight).toBe("36px");
    expect(screen.getByTestId("sized-page-5").style.minWidth).toBe("36px");
  });
});
