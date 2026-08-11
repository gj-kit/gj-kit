import { describe, expect, it, vi } from "vitest";
import {
  filterComboboxItems,
  normalizeComboboxText,
  resolveComboboxSelectedItems,
} from "../../src/components/combobox-filter";
import { assertComboboxProps } from "../../src/components/combobox-validation";
import type {
  ComboboxItem,
  ComboboxProps,
} from "../../src/components/combobox.types";

const items = [
  {
    value: "family",
    label: "Álbum familiar",
    textValue: "가족 사진",
    keywords: ["memories", "서울"],
  },
  {
    value: "travel",
    label: "Travel log",
    keywords: ["album", "서울 trip"],
    disabled: true,
  },
  {
    value: "work",
    label: "Work archive",
    textValue: "Project records",
    keywords: ["album"],
  },
] as const satisfies readonly ComboboxItem<"family" | "travel" | "work">[];

describe("Combobox Unicode filtering", () => {
  it("lowercases before NFKD and strips marks only from Latin bases", () => {
    expect(normalizeComboboxText("Crème BRÛLÉE")).toBe("creme brulee");
    expect(normalizeComboboxText("İSTANBUL", "tr")).toBe("istanbul");

    const devanagariLongA = normalizeComboboxText("का");
    const devanagariShortI = normalizeComboboxText("कि");
    expect(devanagariLongA).toBe("का");
    expect(devanagariShortI).toBe("कि");
    expect(devanagariLongA).not.toBe(devanagariShortI);
  });

  it("AND-matches whitespace tokens across label, textValue, and keywords", () => {
    expect(
      filterComboboxItems(items, "album familia").map((item) => item.value)
    ).toEqual(["family"]);
    expect(
      filterComboboxItems(items, "서울 trip").map((item) => item.value)
    ).toEqual(["travel"]);
    expect(
      filterComboboxItems(items, "project album").map((item) => item.value)
    ).toEqual(["work"]);
    expect(
      filterComboboxItems(items, "가족 memories").map((item) => item.value)
    ).toEqual(["family"]);
  });

  it("preserves source order, includes disabled matches, and returns blank input by identity", () => {
    expect(
      filterComboboxItems(items, "album").map((item) => item.value)
    ).toEqual(["family", "travel", "work"]);
    expect(filterComboboxItems(items, " \n\t ")).toBe(items);
  });

  it("passes a stable normalized detail to a custom predicate", () => {
    const predicate = vi.fn(
      (
        item: ComboboxItem<string>,
        query: string,
        details: {
          readonly normalizedQuery: string;
          readonly tokens: readonly string[];
        }
      ) =>
        item.value !== "travel" &&
        query === " FÁM  앨범 " &&
        details.tokens[0] === "fam"
    );

    const result = filterComboboxItems(items, " FÁM  앨범 ", predicate);
    expect(result.map((item) => item.value)).toEqual(["family", "work"]);
    expect(predicate).toHaveBeenCalledTimes(items.length);
    expect(predicate.mock.calls[0]?.[2]).toMatchObject({
      normalizedQuery: " fam  앨범 ",
      tokens: ["fam", "앨범"],
    });
  });

  it("treats null as already-filtered manual results", () => {
    const remoteOrder = [items[2], items[0]] as const;
    expect(filterComboboxItems(remoteOrder, "does not matter", null)).toBe(
      remoteOrder
    );
  });

  it("rejects malformed pure-filter inputs deterministically", () => {
    expect(() => filterComboboxItems(items, "query", "bad" as never)).toThrow(
      "Combobox filter must be a function, null, or undefined."
    );
    expect(() => normalizeComboboxText("query", [])).toThrow(
      "Combobox filter locale must be a non-empty string or string array."
    );
  });
});

describe("Combobox selected-item hydration", () => {
  const current = [
    { value: "b", label: "Current B" },
  ] as const satisfies readonly ComboboxItem<"a" | "b" | "c">[];

  it("uses current results first and hydration only for absent selected values", () => {
    expect(
      resolveComboboxSelectedItems(current, "b", {
        value: "b",
        label: "Stale B",
      })
    ).toEqual([{ value: "b", label: "Current B" }]);
    expect(
      resolveComboboxSelectedItems(current, "a", {
        value: "a",
        label: "Hydrated A",
      })
    ).toEqual([{ value: "a", label: "Hydrated A" }]);
  });

  it("returns multiple selections in controlled selection order", () => {
    expect(
      resolveComboboxSelectedItems(
        current,
        ["c", "b", "a"],
        [
          { value: "a", label: "Hydrated A" },
          { value: "c", label: "Hydrated C" },
        ]
      )
    ).toEqual([
      { value: "c", label: "Hydrated C" },
      { value: "b", label: "Current B" },
      { value: "a", label: "Hydrated A" },
    ]);
  });

  it("rejects unresolved, unselected, and duplicate identity states", () => {
    expect(() => resolveComboboxSelectedItems(current, "a")).toThrow(
      'Combobox selected value "a" cannot be resolved'
    );
    expect(() =>
      resolveComboboxSelectedItems(current, null, {
        value: "a",
        label: "A",
      })
    ).toThrow('Combobox hydrated item value "a" is not selected.');
    expect(() =>
      resolveComboboxSelectedItems(
        current,
        ["a", "a"],
        [{ value: "a", label: "A" }]
      )
    ).toThrow('Combobox selected value "a" is duplicated.');
    expect(() =>
      resolveComboboxSelectedItems(
        current,
        ["a"],
        [
          { value: "a", label: "A" },
          { value: "a", label: "A again" },
        ]
      )
    ).toThrow('Combobox hydrated item value "a" is duplicated.');
    expect(() =>
      resolveComboboxSelectedItems(
        [
          { value: "b", label: "B" },
          { value: "b", label: "B duplicate" },
        ],
        "b"
      )
    ).toThrow('Combobox item value "b" is duplicated.');
  });
});

function validSingle(
  overrides: Record<string, unknown> = {}
): ComboboxProps<"a" | "b"> {
  return {
    selectionMode: "single",
    label: "Album",
    placeholder: "Choose an album",
    inputValue: "",
    state: { status: "ready", items: [] },
    value: null,
    open: false,
    onInputValueChange: () => undefined,
    onValueChange: () => undefined,
    onOpenChange: () => undefined,
    ...overrides,
  } as unknown as ComboboxProps<"a" | "b">;
}

describe("Combobox runtime boundary validation", () => {
  it("accepts empty results, remote hydration, and retained loading results", () => {
    expect(() => assertComboboxProps(validSingle())).not.toThrow();
    expect(() =>
      assertComboboxProps(
        validSingle({
          state: {
            status: "loading",
            items: [{ value: "b", label: "Current B" }],
            statusLabel: "Refreshing albums",
          },
          value: "a",
          selectedItem: { value: "a", label: "Hydrated A" },
        })
      )
    ).not.toThrow();
  });

  it("requires every selected value to resolve and rejects duplicate current values", () => {
    expect(() => assertComboboxProps(validSingle({ value: "a" }))).toThrow(
      'Combobox selected value "a" cannot be resolved'
    );
    expect(() =>
      assertComboboxProps(
        validSingle({
          state: {
            status: "ready",
            items: [
              { value: "a", label: "A" },
              { value: "a", label: "Again" },
            ],
          },
          value: "a",
        })
      )
    ).toThrow('Combobox item value "a" is duplicated.');
  });

  it("validates state shape and retry ownership", () => {
    expect(() =>
      assertComboboxProps(
        validSingle({ state: { status: "error", items: [], statusLabel: " " } })
      )
    ).toThrow("Combobox error state statusLabel must be a non-empty string.");
    expect(() =>
      assertComboboxProps(
        validSingle({
          state: { status: "ready", items: [], onRetry: () => undefined },
        })
      )
    ).toThrow("Combobox ready state cannot define onRetry.");
  });

  it("enforces multiple selection order, hydration, max, and illegal branch props", () => {
    const multiple = validSingle({
      selectionMode: "multiple",
      state: { status: "ready", items: [{ value: "b", label: "B" }] },
      value: ["a", "b"],
      selectedItems: [{ value: "a", label: "A" }],
      selectedItem: undefined,
      maxSelected: 2,
      selectionLimitLabel: "Up to two albums",
    });
    expect(() => assertComboboxProps(multiple)).not.toThrow();
    expect(() =>
      assertComboboxProps(
        validSingle({
          selectionMode: "multiple",
          state: {
            status: "ready",
            items: [
              { value: "a", label: "A" },
              { value: "b", label: "B" },
            ],
          },
          value: ["a", "b"],
          maxSelected: 1,
          selectionLimitLabel: "One new selection maximum",
        })
      )
    ).not.toThrow();
    expect(() =>
      assertComboboxProps(
        validSingle({
          selectionMode: "multiple",
          value: ["a", "a"],
          selectedItems: [{ value: "a", label: "A" }],
        })
      )
    ).toThrow('Combobox selected value "a" is duplicated.');
    expect(() =>
      assertComboboxProps(
        validSingle({
          selectionMode: "multiple",
          value: [],
          selectionLimitLabel: "Limit",
        })
      )
    ).toThrow("Combobox selectionLimitLabel requires maxSelected.");
    expect(() =>
      assertComboboxProps(
        validSingle({
          selectionMode: "multiple",
          value: [],
          maxSelected: 0,
          selectionLimitLabel: "Limit",
        })
      )
    ).toThrow("Combobox maxSelected must be a positive safe integer.");
    expect(() => assertComboboxProps(validSingle({ maxSelected: 2 }))).toThrow(
      "Combobox single mode cannot define maxSelected."
    );
  });

  it.each([
    ["blank placeholder", { placeholder: " " }, "Combobox placeholder"],
    ["bad direction", { direction: "sideways" }, "Combobox direction"],
    ["bad presentation", { presentation: "popover" }, "Combobox presentation"],
    ["negative inset", { bottomInset: -1 }, "Combobox bottomInset"],
    [
      "infinite geometry",
      { sideOffset: Number.POSITIVE_INFINITY },
      "Combobox sideOffset",
    ],
    ["bad callback", { onOpenChange: true }, "Combobox onOpenChange"],
    [
      "legacy default",
      { defaultOpen: false },
      "Combobox does not support defaultOpen",
    ],
  ])("rejects %s", (_name, overrides, message) => {
    expect(() =>
      assertComboboxProps(validSingle(overrides as Record<string, unknown>))
    ).toThrow(message as string);
  });
});
