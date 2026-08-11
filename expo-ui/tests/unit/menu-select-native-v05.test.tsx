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
import { Menu } from "../../src/components/menu.native";
import type {
  MenuItem,
  MenuOpenChangeDetails,
  MenuSelectDetails,
} from "../../src/components/menu.types";
import { OverlayProvider } from "../../src/components/overlay/provider";
import { UiProvider } from "../../src/components/provider";
import { Select } from "../../src/components/select.native";
import type { SelectOpenChangeDetails } from "../../src/components/select.types";
import { enStrings } from "../../src/strings/strings";
import { lightTheme } from "../../src/theme/createTheme";

const menuItems = [
  { kind: "action", value: "disabled", label: "Unavailable", disabled: true },
  { kind: "action", value: "archive", label: "Archive" },
  { kind: "checkbox", value: "mixed", label: "Mixed option", checked: "mixed" },
  { kind: "checkbox", value: "starred", label: "Starred", checked: false },
] as const satisfies readonly MenuItem<string>[];

const selectItems = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
  { value: "hidden", label: "Unavailable order", disabled: true },
] as const;

function finishModalAnimationFrom(element: HTMLElement): void {
  let current: HTMLElement | null = element;
  while (current !== null && current !== document.body) {
    fireEvent.animationEnd(current);
    current = current.parentElement;
  }
}

async function showModal(testID: string): Promise<HTMLElement> {
  const modalRoot = screen.getByTestId(testID);
  finishModalAnimationFrom(modalRoot);
  return screen.findByRole("dialog");
}

interface MenuHarnessProps {
  readonly initialOpen?: boolean;
  readonly items?: readonly MenuItem<string>[];
  readonly busy?: boolean;
  readonly dismissDisabled?: boolean;
  readonly presentation?: "auto" | "bottom" | "center";
  readonly bottomInset?: number;
  readonly keyboardOverlap?: number;
  readonly contentStyle?: { readonly paddingBottom?: number };
  readonly onOpenChange?: (
    open: boolean,
    details: MenuOpenChangeDetails<string>
  ) => void;
  readonly onSelect?: (details: MenuSelectDetails<string>) => void;
  readonly eventOrder?: string[];
}

function MenuHarness({
  initialOpen = false,
  items = menuItems,
  busy = false,
  dismissDisabled = false,
  presentation,
  bottomInset,
  keyboardOverlap,
  contentStyle,
  onOpenChange,
  onSelect,
  eventOrder,
}: MenuHarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <UiProvider>
      <OverlayProvider>
        <Menu
          triggerLabel="Actions"
          variant="outlined"
          items={items}
          open={open}
          busy={busy}
          dismissDisabled={dismissDisabled}
          presentation={presentation}
          bottomInset={bottomInset}
          keyboardOverlap={keyboardOverlap}
          contentStyle={contentStyle}
          onOpenChange={(nextOpen, details) => {
            eventOrder?.push(`open:${details.reason}`);
            onOpenChange?.(nextOpen, details);
            setOpen(nextOpen);
          }}
          onSelect={(details) => {
            eventOrder?.push(`select:${details.value}`);
            onSelect?.(details);
          }}
          testID="native-menu"
        />
      </OverlayProvider>
    </UiProvider>
  );
}

interface SelectHarnessProps {
  readonly initialOpen?: boolean;
  readonly initialValue?: "recent" | "oldest" | "hidden" | null;
  readonly onOpenChange?: (
    open: boolean,
    details: SelectOpenChangeDetails<"recent" | "oldest" | "hidden">
  ) => void;
  readonly onValueChange?: (value: "recent" | "oldest" | "hidden") => void;
  readonly eventOrder?: string[];
}

function SelectHarness({
  initialOpen = false,
  initialValue = "oldest",
  onOpenChange,
  onValueChange,
  eventOrder,
}: SelectHarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const [value, setValue] = useState<"recent" | "oldest" | "hidden" | null>(
    initialValue
  );
  return (
    <UiProvider>
      <OverlayProvider>
        <Select
          label="Sort order"
          placeholder="Choose order"
          items={selectItems}
          value={value}
          open={open}
          onOpenChange={(nextOpen, details) => {
            eventOrder?.push(`open:${details.reason}`);
            onOpenChange?.(nextOpen, details);
            setOpen(nextOpen);
          }}
          onValueChange={(nextValue) => {
            eventOrder?.push(`value:${nextValue}`);
            onValueChange?.(nextValue);
            setValue(nextValue);
          }}
          testID="native-select"
        />
      </OverlayProvider>
    </UiProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Menu native/default adaptive surface", () => {
  it("owns a 44px trigger, focuses the first enabled item, and keeps cancel pinned", async () => {
    render(<MenuHarness initialOpen />);
    const trigger = screen.getByRole("button", { name: "Actions" });
    expect(window.getComputedStyle(trigger).minHeight).toBe(
      `${lightTheme.metrics.control.md}px`
    );
    expect(trigger.style.borderTopColor).toBe("rgb(102, 112, 133)");

    const dialog = await showModal("native-menu-sheet");
    const archive = within(dialog).getByRole("button", { name: "Archive" });
    await waitFor(() => expect(document.activeElement).toBe(archive));
    expect(window.getComputedStyle(archive).minHeight).toBe(
      `${lightTheme.metrics.control.md}px`
    );
    expect(archive.style.borderTopColor).toBe("rgb(102, 112, 133)");

    const itemsScroll = screen.getByTestId("native-menu-sheet-items");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(itemsScroll.contains(cancel)).toBe(false);
    expect(cancel.parentElement).toBe(itemsScroll.parentElement);
    expect(window.getComputedStyle(cancel).minHeight).toBe(
      `${lightTheme.metrics.control.md}px`
    );
    expect(cancel.style.borderTopColor).toBe("rgb(102, 112, 133)");
  });

  it("uses button/checkbox roles, maps mixed to true, and preserves callback order/default close policy", async () => {
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    const eventOrder: string[] = [];
    render(
      <MenuHarness
        initialOpen
        onOpenChange={onOpenChange}
        onSelect={onSelect}
        eventOrder={eventOrder}
      />
    );
    const dialog = await showModal("native-menu-sheet");
    const mixed = within(dialog).getByRole("checkbox", {
      name: "Mixed option",
    });
    expect(mixed.getAttribute("aria-checked")).toBe("mixed");
    fireEvent.click(mixed);
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "checkbox",
        value: "mixed",
        checked: true,
      })
    );
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
    expect(eventOrder).toEqual([
      "select:mixed",
      "select:archive",
      "open:action-select",
    ]);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "action-select", value: "archive" })
    );
  });

  it("lets busy sheets dismiss, while dismissDisabled blocks cancel/backdrop/Escape but not selection", async () => {
    const busyOpenChange = vi.fn();
    const busySelect = vi.fn();
    render(
      <MenuHarness
        initialOpen
        busy
        onOpenChange={busyOpenChange}
        onSelect={busySelect}
      />
    );
    let dialog = await showModal("native-menu-sheet");
    fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
    expect(busySelect).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(busyOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "cancel-action" })
    );

    cleanup();
    const guardedOpenChange = vi.fn();
    const guardedSelect = vi.fn();
    render(
      <MenuHarness
        initialOpen
        dismissDisabled
        onOpenChange={guardedOpenChange}
        onSelect={guardedSelect}
      />
    );
    dialog = await showModal("native-menu-sheet");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancel.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(cancel);
    fireEvent.pointerDown(screen.getByTestId("native-menu-sheet-backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(guardedOpenChange).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Archive" }));
    expect(guardedSelect).toHaveBeenCalledTimes(1);
    expect(guardedOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "action-select" })
    );
  });

  it("uses keyboard overlap instead of bottom inset and constrains a long bottom list", async () => {
    const clientHeight = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientHeight"
    );
    const clientWidth = Object.getOwnPropertyDescriptor(
      document.documentElement,
      "clientWidth"
    );
    Object.defineProperty(document.documentElement, "clientHeight", {
      configurable: true,
      value: 260,
    });
    Object.defineProperty(document.documentElement, "clientWidth", {
      configurable: true,
      value: 390,
    });
    window.dispatchEvent(new Event("resize"));
    try {
      const items = Array.from({ length: 20 }, (_, index) => ({
        kind: "action" as const,
        value: `action-${index}`,
        label: `Action ${index}`,
      }));
      render(
        <MenuHarness
          initialOpen
          items={items}
          presentation="bottom"
          bottomInset={7}
          keyboardOverlap={11}
          contentStyle={{ paddingBottom: 1 }}
        />
      );
      await showModal("native-menu-sheet");
      const panel = screen.getByTestId("native-menu-sheet-panel");
      expect(panel.style.paddingBottom).toBe(
        `${lightTheme.spacing.xxl + 11}px`
      );
      expect(panel.style.maxHeight).toBe(
        `${260 - lightTheme.spacing.xl * 2}px`
      );
      expect(
        window.getComputedStyle(screen.getByTestId("native-menu-sheet-items"))
          .overflowY
      ).toBe("auto");
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
          clientHeight
        );
      }
      if (clientWidth === undefined) {
        delete (document.documentElement as unknown as { clientWidth?: number })
          .clientWidth;
      } else {
        Object.defineProperty(
          document.documentElement,
          "clientWidth",
          clientWidth
        );
      }
      window.dispatchEvent(new Event("resize"));
    }
  });

  it("routes RN Modal Escape through the provider stack and restores final trigger focus", async () => {
    const onOpenChange = vi.fn();
    render(<MenuHarness initialOpen onOpenChange={onOpenChange} />);
    const modalRoot = screen.getByTestId("native-menu-sheet");
    await showModal("native-menu-sheet");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "escape-key" })
    );
    finishModalAnimationFrom(modalRoot);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Actions" })
      )
    );
  });

  it("maps Android onRequestClose to hardware-back", async () => {
    const originalOS = Platform.OS;
    Platform.OS = "android";
    const onOpenChange = vi.fn();
    try {
      render(<MenuHarness initialOpen onOpenChange={onOpenChange} />);
      finishModalAnimationFrom(screen.getByTestId("native-menu-sheet"));
      fireEvent.keyUp(document, { key: "Escape" });
      expect(onOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: "hardware-back" })
      );
    } finally {
      cleanup();
      Platform.OS = originalOS;
    }
  });
});

describe("Select native/default adaptive radio surface", () => {
  it("exposes current text on its owned trigger and focuses the selected radio", async () => {
    render(<SelectHarness initialOpen />);
    const trigger = screen.getByRole("button", { name: "Sort order" });
    expect(trigger.getAttribute("aria-valuetext")).toBe("Oldest first");
    expect(trigger.style.borderTopColor).toBe("rgb(102, 112, 133)");

    const dialog = await showModal("native-select-sheet");
    expect(
      within(dialog).getByRole("radiogroup", { name: "Sort order" })
    ).toBeTruthy();
    const selected = within(dialog).getByRole("radio", {
      name: "Oldest first",
    });
    expect(selected.getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(selected));
    expect(
      within(dialog).getByRole("radio", { name: "Most recent" }).style
        .borderTopColor
    ).toBe("rgb(102, 112, 133)");
  });

  it("skips same-value callback but always closes, and orders a changed value before close", async () => {
    const sameValueChange = vi.fn();
    const sameOpenChange = vi.fn();
    render(
      <SelectHarness
        initialOpen
        onValueChange={sameValueChange}
        onOpenChange={sameOpenChange}
      />
    );
    let dialog = await showModal("native-select-sheet");
    fireEvent.click(
      within(dialog).getByRole("radio", { name: "Oldest first" })
    );
    expect(sameValueChange).not.toHaveBeenCalled();
    expect(sameOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "option-select", value: "oldest" })
    );

    cleanup();
    const eventOrder: string[] = [];
    render(<SelectHarness initialOpen eventOrder={eventOrder} />);
    dialog = await showModal("native-select-sheet");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Most recent" }));
    expect(eventOrder).toEqual(["value:recent", "open:option-select"]);
  });

  it("requires OverlayProvider and uses the shared runtime validation contract", () => {
    expect(() =>
      render(
        <Select
          label="Sort"
          placeholder="Choose"
          items={selectItems}
          value="recent"
          open={false}
          onOpenChange={() => {}}
          onValueChange={() => {}}
        />
      )
    ).toThrow("Select must be rendered inside OverlayProvider.");

    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <Menu
              triggerLabel="Actions"
              items={[
                { kind: "action", value: "same", label: "First" },
                { kind: "action", value: "same", label: "Second" },
              ]}
              open={false}
              onOpenChange={() => {}}
              onSelect={() => {}}
            />
          </OverlayProvider>
        </UiProvider>
      )
    ).toThrow('Menu item value "same" is duplicated.');
  });

  it("rejects a blank resolved strings.cancel for both native Menu and Select", () => {
    const strings = { ...enStrings, cancel: " \t" };
    const message =
      "NativeMenuSelectSheet strings.cancel must be a non-empty string.";

    expect(() =>
      render(
        <UiProvider strings={strings}>
          <Menu
            triggerLabel="Actions"
            items={menuItems}
            open={false}
            onOpenChange={() => {}}
            onSelect={() => {}}
          />
        </UiProvider>
      )
    ).toThrow(message);

    cleanup();

    expect(() =>
      render(
        <UiProvider strings={strings}>
          <Select
            label="Sort order"
            placeholder="Choose order"
            items={selectItems}
            value="recent"
            open={false}
            onOpenChange={() => {}}
            onValueChange={() => {}}
          />
        </UiProvider>
      )
    ).toThrow(message);
  });
});
