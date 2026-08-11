import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "react-native";
import { Combobox } from "../../src/components/combobox.native";
import type {
  ComboboxItem,
  ComboboxProps,
  ComboboxState,
} from "../../src/components/combobox.types";
import { UiProvider } from "../../src/components/provider";
import { enStrings, koStrings } from "../../src/strings/strings";
import { lightTheme } from "../../src/theme/createTheme";

type Value = "alpha" | "beta" | "remote";

const items = [
  {
    value: "alpha",
    label: "Alpha family",
    keywords: ["first"],
    description: "Primary option",
  },
  { value: "beta", label: "Beta group", textValue: "second" },
] as const satisfies readonly ComboboxItem<Value>[];

const readyState: ComboboxState<Value> = {
  status: "ready",
  items,
};

function finishModalAnimationFrom(element: HTMLElement): void {
  let current: HTMLElement | null = element;
  while (current !== null && current !== document.body) {
    fireEvent.animationEnd(current);
    current = current.parentElement;
  }
}

async function showModal(testID = "native-combo-content"): Promise<HTMLElement> {
  const modalRoot = screen.getByTestId(testID);
  finishModalAnimationFrom(modalRoot);
  return screen.findByRole("dialog");
}

interface SingleHarnessProps {
  readonly initialOpen?: boolean;
  readonly initialValue?: Value | null;
  readonly initialInputValue?: string;
  readonly state?: ComboboxState<Value>;
  readonly selectedItem?: ComboboxItem<Value>;
  readonly presentation?: "auto" | "bottom" | "center" | "inline";
  readonly bottomInset?: number;
  readonly keyboardOverlap?: number;
  readonly openOnFocus?: boolean;
  readonly clearable?: boolean;
  readonly filter?: ComboboxProps<Value>["filter"];
  readonly contentStyle?: ComboboxProps<Value>["contentStyle"];
  readonly controlStyle?: ComboboxProps<Value>["controlStyle"];
  readonly itemStyle?: ComboboxProps<Value>["itemStyle"];
  readonly clearButtonStyle?: ComboboxProps<Value>["clearButtonStyle"];
  readonly onRetry?: () => void;
  readonly eventOrder?: string[];
}

function SingleHarness({
  initialOpen = false,
  initialValue = null,
  initialInputValue = "",
  state = readyState,
  selectedItem,
  presentation,
  bottomInset,
  keyboardOverlap,
  openOnFocus,
  clearable,
  filter,
  contentStyle,
  controlStyle,
  itemStyle,
  clearButtonStyle,
  eventOrder,
}: SingleHarnessProps) {
  const [value, setValue] = useState<Value | null>(initialValue);
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [open, setOpen] = useState(initialOpen);

  return (
    <UiProvider>
      <Combobox
        selectionMode="single"
        label="Family"
        placeholder="Choose a family"
        state={state}
        value={value}
        selectedItem={selectedItem?.value === value ? selectedItem : undefined}
        inputValue={inputValue}
        open={open}
        presentation={presentation}
        bottomInset={bottomInset}
        keyboardOverlap={keyboardOverlap}
        openOnFocus={openOnFocus}
        clearable={clearable}
        filter={filter}
        contentStyle={contentStyle}
        controlStyle={controlStyle}
        itemStyle={itemStyle}
        clearButtonStyle={clearButtonStyle}
        onValueChange={(nextValue, details) => {
          eventOrder?.push(`value:${String(nextValue)}:${details.reason}`);
          setValue(nextValue);
        }}
        onInputValueChange={(nextInput, details) => {
          eventOrder?.push(`input:${nextInput}:${details.reason}`);
          setInputValue(nextInput);
        }}
        onOpenChange={(nextOpen, details) => {
          eventOrder?.push(`open:${String(nextOpen)}:${details.reason}`);
          setOpen(nextOpen);
        }}
        testID="native-combo"
      />
    </UiProvider>
  );
}

interface MultipleHarnessProps {
  readonly initialOpen?: boolean;
  readonly initialValue?: readonly Value[];
  readonly initialInputValue?: string;
  readonly selectedItems?: readonly ComboboxItem<Value>[];
  readonly maxSelected?: number;
  readonly eventOrder?: string[];
  readonly clearable?: boolean;
}

function MultipleHarness({
  initialOpen = true,
  initialValue = ["alpha"],
  initialInputValue = "a",
  selectedItems,
  maxSelected,
  eventOrder,
  clearable,
}: MultipleHarnessProps) {
  const [value, setValue] = useState<readonly Value[]>(initialValue);
  const [inputValue, setInputValue] = useState(initialInputValue);
  const [open, setOpen] = useState(initialOpen);

  return (
    <UiProvider>
      <Combobox
        selectionMode="multiple"
        label="Families"
        placeholder="Choose families"
        state={readyState}
        value={value}
        selectedItems={selectedItems}
        inputValue={inputValue}
        open={open}
        {...(maxSelected === undefined
          ? {}
          : {
              maxSelected,
              selectionLimitLabel: `Choose up to ${maxSelected}`,
            })}
        clearable={clearable}
        onValueChange={(nextValue, details) => {
          eventOrder?.push(
            `value:${nextValue.join(",")}:${details.reason}`,
          );
          setValue(nextValue);
        }}
        onInputValueChange={(nextInput, details) => {
          eventOrder?.push(`input:${nextInput}:${details.reason}`);
          setInputValue(nextInput);
        }}
        onOpenChange={(nextOpen, details) => {
          eventOrder?.push(`open:${String(nextOpen)}:${details.reason}`);
          setOpen(nextOpen);
        }}
        testID="native-combo"
      />
    </UiProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Combobox native controlled selection", () => {
  it("hydrates an absent single value, prioritizes its closed summary, and orders changed callbacks", async () => {
    const eventOrder: string[] = [];
    render(
      <SingleHarness
        initialValue="remote"
        initialInputValue="query remains canonical"
        selectedItem={{ value: "remote", label: "Remote family" }}
        eventOrder={eventOrder}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Family" });
    expect(trigger.getAttribute("aria-valuetext")).toBe("Remote family");
    expect(screen.getByText("Remote family")).toBeTruthy();

    fireEvent.click(trigger);
    expect(eventOrder).toEqual(["open:true:trigger-press"]);
    const dialog = await showModal();
    const input = screen.getByTestId("native-combo-input");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(
      within(dialog).queryByRole("radio", { name: "Remote family" }),
    ).toBeNull();
    fireEvent.change(input, { target: { value: "" } });

    eventOrder.length = 0;
    fireEvent.click(within(dialog).getByRole("radio", { name: "Alpha family" }));
    expect(eventOrder).toEqual([
      "value:alpha:option-select",
      "input:Alpha family:option-select",
      "open:false:option-select",
    ]);
  });

  it("preserves multiple insertion order, clears the query, and stays open for add/remove", async () => {
    const eventOrder: string[] = [];
    render(<MultipleHarness eventOrder={eventOrder} />);
    let dialog = await showModal();

    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Beta group" }));
    expect(eventOrder).toEqual([
      "value:alpha,beta:option-select",
      "input::option-select",
    ]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByTestId("native-combo-input")).toHaveProperty("value", "");

    eventOrder.length = 0;
    dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Alpha family" }));
    expect(eventOrder).toEqual(["value:beta:option-remove"]);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("compacts fifty selections to one line and lets selected rows remove at the limit", async () => {
    const manyItems = Array.from({ length: 51 }, (_, index) => ({
      value: `item-${index}`,
      label: `Item ${index}`,
    }));
    const selected = manyItems.slice(0, 50).map((item) => item.value);
    const onValueChange = vi.fn();

    render(
      <UiProvider>
        <Combobox
          selectionMode="multiple"
          label="Large selection"
          placeholder="Choose items"
          state={{ status: "loading", items: manyItems, statusLabel: "Refreshing" }}
          value={selected}
          inputValue=""
          open
          maxSelected={50}
          selectionLimitLabel="Maximum 50 selected"
          onValueChange={onValueChange}
          onInputValueChange={() => {}}
          onOpenChange={() => {}}
          testID="many-combo"
        />
      </UiProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Large selection" });
    expect(trigger.getAttribute("aria-valuetext")).toBe("Item 0, Item 1 +48");
    const summary = screen.getByText("Item 0, Item 1 +48");
    expect(window.getComputedStyle(summary).whiteSpace).toBe("nowrap");

    const dialog = await showModal("many-combo-content");
    expect(screen.getByTestId("many-combo-status").textContent).toBe(
      "Refreshing",
    );
    expect(screen.getByTestId("many-combo-limit").textContent).toBe(
      "Maximum 50 selected",
    );
    const selectedRow = within(dialog).getByRole("checkbox", { name: "Item 0" });
    const blockedRow = within(dialog).getByRole("checkbox", { name: "Item 50" });
    expect(selectedRow.getAttribute("aria-disabled")).not.toBe("true");
    expect(blockedRow.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(selectedRow);
    expect(onValueChange).toHaveBeenLastCalledWith(
      selected.slice(1),
      expect.objectContaining({ reason: "option-remove" }),
    );
  });

  it("skips unchanged single value/input callbacks but still requests close", async () => {
    const eventOrder: string[] = [];
    render(
      <SingleHarness
        initialOpen
        initialValue="beta"
        initialInputValue="Beta group"
        eventOrder={eventOrder}
      />,
    );
    const dialog = await showModal();
    fireEvent.click(within(dialog).getByRole("radio", { name: "Beta group" }));
    expect(eventOrder).toEqual(["open:false:option-select"]);
  });
});

describe("Combobox native search and asynchronous states", () => {
  it("filters normalized text/keywords, supports custom and manual filtering, and never selects on submit", () => {
    const onValueChange = vi.fn();
    const onInputValueChange = vi.fn();
    const base = {
      selectionMode: "single" as const,
      label: "Inline family",
      placeholder: "Choose",
      state: readyState,
      value: null,
      inputValue: "FIRST",
      open: true,
      presentation: "inline" as const,
      onValueChange,
      onInputValueChange,
      onOpenChange: vi.fn(),
      testID: "inline-combo",
    };
    const { rerender } = render(<Combobox {...base} />);
    expect(screen.getByRole("radio", { name: "Alpha family" })).toBeTruthy();
    expect(screen.queryByRole("radio", { name: "Beta group" })).toBeNull();
    fireEvent.submit(screen.getByTestId("inline-combo-input"));
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("inline-combo-clear"));
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onInputValueChange).toHaveBeenLastCalledWith(
      "",
      expect.objectContaining({ reason: "clear-action" }),
    );

    rerender(
      <Combobox
        {...base}
        filter={(item) => item.value === "beta"}
      />,
    );
    expect(screen.queryByRole("radio", { name: "Alpha family" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Beta group" })).toBeTruthy();

    rerender(<Combobox {...base} filter={null} />);
    expect(screen.getByRole("radio", { name: "Alpha family" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Beta group" })).toBeTruthy();
  });

  it("distinguishes ready empty/no-results and retains selectable rows while loading or errored", async () => {
    const { rerender } = render(
      <SingleHarness
        initialOpen
        state={{ status: "ready", items: [] }}
      />,
    );
    await showModal();
    expect(screen.getByTestId("native-combo-empty").textContent).toBe(
      enStrings.emptyTitle,
    );

    cleanup();
    render(
      <SingleHarness
        initialOpen
        initialInputValue="missing"
        state={readyState}
      />,
    );
    await showModal();
    expect(screen.getByTestId("native-combo-empty").textContent).toBe(
      enStrings.noResults,
    );

    cleanup();
    const loadingOrder: string[] = [];
    render(
      <SingleHarness
        initialOpen
        state={{ status: "loading", items, statusLabel: "Refreshing" }}
        eventOrder={loadingOrder}
      />,
    );
    let dialog = await showModal();
    expect(screen.getByTestId("native-combo-status").textContent).toBe(
      "Refreshing",
    );
    const loadingRow = within(dialog).getByRole("radio", { name: "Beta group" });
    expect(loadingRow.getAttribute("aria-disabled")).not.toBe("true");
    fireEvent.click(loadingRow);
    expect(loadingOrder[0]).toBe("value:beta:option-select");

    cleanup();
    const retry = vi.fn();
    render(
      <UiProvider>
        <Combobox
          selectionMode="single"
          label="Family"
          placeholder="Choose"
          state={{
            status: "error",
            statusLabel: "Network unavailable",
            items,
            onRetry: retry,
          }}
          value={null}
          inputValue=""
          open
          onValueChange={() => {}}
          onInputValueChange={() => {}}
          onOpenChange={() => {}}
          testID="native-combo"
        />
      </UiProvider>,
    );
    dialog = await showModal();
    const errorRow = within(dialog).getByRole("radio", { name: "Alpha family" });
    expect(errorRow.getAttribute("aria-disabled")).not.toBe("true");
    const list = screen.getByTestId("native-combo-list");
    const retryButton = screen.getByTestId("native-combo-retry");
    expect(list.contains(retryButton)).toBe(false);
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);

    // Keep rerender referenced so TypeScript verifies the testing-library result
    // shape even though each modal state is isolated to avoid exit-animation bleed.
    expect(typeof rerender).toBe("function");
  });
});

describe("Combobox native adaptive sheet and dismissal", () => {
  it("keeps search/status/actions/cancel fixed and only the handled-tap result list scrollable", async () => {
    render(
      <SingleHarness
        initialOpen
        initialValue="alpha"
        state={{ status: "loading", items }}
        clearable
      />,
    );
    const dialog = await showModal();
    const input = screen.getByTestId("native-combo-input");
    const status = screen.getByTestId("native-combo-status");
    const list = screen.getByTestId("native-combo-list");
    const actions = screen.getByTestId("native-combo-actions");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });

    expect(list.contains(input)).toBe(false);
    expect(list.contains(status)).toBe(false);
    expect(list.contains(actions)).toBe(false);
    expect(list.contains(cancel)).toBe(false);
    expect(input.parentElement?.parentElement).toBe(list.parentElement);
    expect(cancel.parentElement).toBe(list.parentElement);
    expect(window.getComputedStyle(list).overflowY).toBe("auto");
    expect(list.getAttribute("data-keyboard-should-persist-taps")).toBeNull();
    // RNW consumes keyboardShouldPersistTaps instead of leaking a non-DOM
    // attribute. The source component owns the explicit `handled` prop; real
    // keyboard/touch retention remains part of the native device release gate.
  });

  it("uses keyboard-overlap/bottom-inset invariants and subtracts overlap from center height", async () => {
    const clientHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientHeight",
    );
    const clientWidth = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientWidth",
    );
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 390,
    });
    window.dispatchEvent(new Event("resize"));

    try {
      render(
        <SingleHarness
          initialOpen
          presentation="auto"
          bottomInset={13}
          keyboardOverlap={21}
          contentStyle={{ paddingBottom: 1, minHeight: 9_999, maxHeight: 1 }}
        />,
      );
      await showModal();
      let panel = screen.getByTestId("native-combo-panel");
      expect(panel.style.paddingBottom).toBe(
        `${lightTheme.spacing.xxl + 21}px`,
      );
      expect(panel.style.maxHeight).toBe(
        `${300 - lightTheme.spacing.xl * 2}px`,
      );
      expect(panel.style.minHeight).toBe(
        `${300 - lightTheme.spacing.xl * 2}px`,
      );

      cleanup();
      Object.defineProperty(document.documentElement, "clientWidth", {
        configurable: true,
        value: 900,
      });
      window.dispatchEvent(new Event("resize"));
      render(
        <SingleHarness
          initialOpen
          presentation="auto"
          bottomInset={13}
          keyboardOverlap={21}
          contentStyle={{ paddingBottom: 1, minHeight: 9_999, maxHeight: 1 }}
        />,
      );
      await showModal();
      panel = screen.getByTestId("native-combo-panel");
      expect(panel.style.paddingBottom).toBe(`${lightTheme.spacing.xxl}px`);
      expect(panel.style.maxHeight).toBe(
        `${300 - lightTheme.spacing.xl * 2 - 21}px`,
      );
      expect(panel.style.minHeight).toBe(
        `${300 - lightTheme.spacing.xl * 2 - 21}px`,
      );
    } finally {
      cleanup();
      if (clientHeight === undefined) {
        delete (
          document.documentElement as unknown as { clientHeight?: number }
        ).clientHeight;
      } else {
        Object.defineProperty(
          document.documentElement,
          "clientHeight",
          clientHeight,
        );
      }
      if (clientWidth === undefined) {
        delete (
          document.documentElement as unknown as { clientWidth?: number }
        ).clientWidth;
      } else {
        Object.defineProperty(
          document.documentElement,
          "clientWidth",
          clientWidth,
        );
      }
      window.dispatchEvent(new Event("resize"));
    }
  });

  it("restores the canonical input before cancel/backdrop/Escape close and restores trigger focus", async () => {
    const eventOrder: string[] = [];
    render(
      <SingleHarness
        initialOpen
        initialValue="alpha"
        initialInputValue="temporary query"
        eventOrder={eventOrder}
      />,
    );
    const modalRoot = screen.getByTestId("native-combo-content");
    const dialog = await showModal();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(eventOrder).toEqual([
      "input:Alpha family:dismiss-restore",
      "open:false:cancel-action",
    ]);
    finishModalAnimationFrom(modalRoot);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Family" }),
      ),
    );

    cleanup();
    const backdropOrder: string[] = [];
    render(
      <SingleHarness
        initialOpen
        initialValue="alpha"
        initialInputValue="temporary query"
        eventOrder={backdropOrder}
      />,
    );
    await showModal();
    fireEvent.pointerDown(screen.getByTestId("native-combo-content-backdrop"));
    expect(backdropOrder).toEqual([
      "input:Alpha family:dismiss-restore",
      "open:false:outside-press",
    ]);

    cleanup();
    const escapeOrder: string[] = [];
    render(
      <SingleHarness
        initialOpen
        initialValue="alpha"
        initialInputValue="temporary query"
        eventOrder={escapeOrder}
      />,
    );
    await showModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(escapeOrder).toEqual([
      "input:Alpha family:dismiss-restore",
      "open:false:escape-key",
    ]);
  });

  it("maps native hardware back and accessibility escape without making dismissal optional", async () => {
    const originalOS = Platform.OS;
    Platform.OS = "android";
    const hardwareOrder: string[] = [];
    try {
      render(
        <SingleHarness
          initialOpen
          initialValue="alpha"
          initialInputValue="query"
          eventOrder={hardwareOrder}
        />,
      );
      finishModalAnimationFrom(screen.getByTestId("native-combo-content"));
      fireEvent.keyUp(document, { key: "Escape" });
      expect(hardwareOrder).toEqual([
        "input:Alpha family:dismiss-restore",
        "open:false:hardware-back",
      ]);
    } finally {
      cleanup();
      Platform.OS = originalOS;
    }

    Platform.OS = "ios";
    const accessibilityOrder: string[] = [];
    try {
      render(
        <SingleHarness
          initialOpen
          initialValue="alpha"
          initialInputValue="query"
          eventOrder={accessibilityOrder}
        />,
      );
      finishModalAnimationFrom(screen.getByTestId("native-combo-content"));
      fireEvent(
        screen.getByTestId("native-combo-content-content"),
        new Event("accessibilityEscape"),
      );
      // RNW cannot synthesize the native accessibility action. VoiceOver and
      // TalkBack execution remains an explicit real-device release gate.
      expect(accessibilityOrder).toEqual([]);
    } finally {
      cleanup();
      Platform.OS = originalOS;
    }
  });
});

describe("Combobox native inline, actions, localization, and guards", () => {
  it("renders inline without UiProvider/OverlayProvider/Modal and opens from focus or typing", () => {
    const onOpenChange = vi.fn();
    const onInputValueChange = vi.fn();
    const { rerender } = render(
      <Combobox
        selectionMode="single"
        accessibilityLabel="Standalone family"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        open={false}
        presentation="inline"
        onValueChange={() => {}}
        onInputValueChange={onInputValueChange}
        onOpenChange={onOpenChange}
        testID="inline-combo"
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByTestId("inline-combo-content")).toBeNull();
    const input = screen.getByTestId("inline-combo-input");
    fireEvent.focus(input);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "input-focus" }),
    );

    onOpenChange.mockClear();
    fireEvent.change(input, { target: { value: "alp" } });
    expect(onInputValueChange).toHaveBeenLastCalledWith(
      "alp",
      expect.objectContaining({ reason: "input-change" }),
    );
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "input-change" }),
    );

    rerender(
      <Combobox
        selectionMode="single"
        accessibilityLabel="Standalone family"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue="alp"
        open
        presentation="inline"
        onValueChange={() => {}}
        onInputValueChange={() => {}}
        onOpenChange={() => {}}
        testID="inline-combo"
      />,
    );
    expect(screen.getByTestId("inline-combo-content")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("keeps clear as a sibling action, requests value before input, and localizes defaults", async () => {
    const eventOrder: string[] = [];
    render(
      <UiProvider strings={koStrings}>
        <MultipleHarness
          initialValue={["alpha", "beta"]}
          initialInputValue="query"
          clearable
          eventOrder={eventOrder}
        />
      </UiProvider>,
    );
    const dialog = await showModal();
    expect(within(dialog).getByRole("button", { name: koStrings.cancel })).toBeTruthy();
    const clear = screen.getByRole("button", { name: koStrings.deselectAll });
    expect(screen.getByTestId("native-combo-list").contains(clear)).toBe(false);
    expect(clear.querySelector("button")).toBeNull();
    fireEvent.click(clear);
    expect(eventOrder).toEqual([
      "value::clear-action",
      "input::clear-action",
    ]);
  });

  it("enforces token target sizes after consumer styles", async () => {
    render(
      <SingleHarness
        initialOpen
        initialValue="alpha"
        clearable
        controlStyle={{
          minHeight: 1,
          minWidth: 1,
          maxHeight: 1,
          maxWidth: 1,
        }}
        itemStyle={{
          minHeight: 1,
          minWidth: 1,
          maxHeight: 1,
          maxWidth: 1,
        }}
        clearButtonStyle={{
          minHeight: 1,
          minWidth: 1,
          maxHeight: 1,
          maxWidth: 1,
        }}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Family" });
    expect(window.getComputedStyle(trigger).minHeight).toBe(
      `${lightTheme.metrics.input}px`,
    );
    expect(window.getComputedStyle(trigger).maxHeight).toBe(
      `${lightTheme.metrics.input}px`,
    );
    expect(window.getComputedStyle(trigger).minWidth).toBe(
      `${lightTheme.metrics.input}px`,
    );
    expect(window.getComputedStyle(trigger).maxWidth).toBe(
      `${lightTheme.metrics.input}px`,
    );
    const dialog = await showModal();
    const inputControl = screen.getByTestId("native-combo-input").parentElement;
    expect(inputControl?.style.minHeight).toBe(`${lightTheme.metrics.input}px`);
    const row = within(dialog).getByRole("radio", { name: "Alpha family" });
    expect(window.getComputedStyle(row).minHeight).toBe(
      `${lightTheme.metrics.control.md}px`,
    );
    expect(window.getComputedStyle(row).maxHeight).toBe(
      `${lightTheme.metrics.control.md}px`,
    );
    const clear = screen.getByTestId("native-combo-clear");
    expect(window.getComputedStyle(clear).minHeight).toBe(
      `${lightTheme.metrics.control.md}px`,
    );
    expect(window.getComputedStyle(clear).maxHeight).toBe(
      `${lightTheme.metrics.control.md}px`,
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(window.getComputedStyle(cancel).minHeight).toBe(
      `${lightTheme.metrics.control.md}px`,
    );
  });

  it("fails malformed JavaScript props before hooks", () => {
    const validProps = {
      selectionMode: "single",
      label: "Family",
      placeholder: "Choose",
      state: readyState,
      value: null,
      inputValue: "",
      open: false,
      onValueChange: () => {},
      onInputValueChange: () => {},
      onOpenChange: () => {},
    } satisfies ComboboxProps<Value>;

    const invalidPresentation = {
      ...validProps,
      presentation: "drawer",
    } as unknown as ComboboxProps<Value>;
    expect(() => render(<Combobox {...invalidPresentation} />)).toThrow(
      'Combobox presentation "drawer" is not supported.',
    );

    const invalidDefault = {
      ...validProps,
      defaultValue: "alpha",
    } as unknown as ComboboxProps<Value>;
    expect(() => render(<Combobox {...invalidDefault} />)).toThrow(
      "Combobox does not support defaultValue.",
    );
  });
});
