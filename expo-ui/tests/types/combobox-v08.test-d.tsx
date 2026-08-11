import { describe, expectTypeOf, it } from "vitest";

import { Combobox } from "../../src/index";
import type {
  ComboboxFilterDetails,
  ComboboxInputValueChangeDetails,
  ComboboxItem,
  ComboboxOpenChangeDetails,
  ComboboxProps,
  ComboboxState,
  ComboboxValueChangeDetails,
  MultipleComboboxValueChangeDetails,
  SingleComboboxValueChangeDetails,
} from "../../src/index";

type AlbumValue = "family" | "travel" | "work";

const albumItems = [
  { value: "family", label: "Family", keywords: ["home"] },
  { value: "travel", label: "Travel", disabled: true },
  { value: "work", label: "Work" },
] as const satisfies readonly ComboboxItem<AlbumValue>[];

const readyState = {
  status: "ready",
  items: albumItems,
} as const satisfies ComboboxState<AlbumValue>;

describe("Combobox controlled literal contracts", () => {
  it("preserves the literal union through single state and callbacks", () => {
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        accessibilityLabel="Destination album"
        placeholder="Choose an album"
        state={readyState}
        value="family"
        selectedItem={{ value: "family", label: "Hydrated family" }}
        inputValue="Family"
        open={false}
        onValueChange={(value, details) => {
          expectTypeOf(value).toEqualTypeOf<AlbumValue | null>();
          expectTypeOf(details).toEqualTypeOf<
            SingleComboboxValueChangeDetails<AlbumValue>
          >();
          expectTypeOf(
            details.previousValue
          ).toEqualTypeOf<AlbumValue | null>();
        }}
        onInputValueChange={(_inputValue, details) => {
          expectTypeOf(details).toEqualTypeOf<
            ComboboxInputValueChangeDetails<AlbumValue>
          >();
        }}
        onOpenChange={(_open, details) => {
          expectTypeOf(details).toEqualTypeOf<
            ComboboxOpenChangeDetails<AlbumValue>
          >();
        }}
      />
    );

    void (
      <Combobox
        selectionMode="single"
        accessibilityLabel="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        open={false}
        onValueChange={() => undefined}
        onInputValueChange={() => undefined}
        onOpenChange={() => undefined}
      />
    );
  });

  it("preserves selection order and exact multiple callback details", () => {
    const selected = [
      "travel",
      "family",
    ] as const satisfies readonly AlbumValue[];
    void (
      <Combobox
        selectionMode="multiple"
        label="Albums"
        placeholder="Search albums"
        state={readyState}
        value={selected}
        selectedItems={[
          { value: "travel", label: "Travel" },
          { value: "family", label: "Family" },
        ]}
        inputValue=""
        open
        maxSelected={3}
        selectionLimitLabel="Choose up to three albums"
        getSelectionSummary={(resolved) => {
          expectTypeOf(resolved).toEqualTypeOf<
            readonly ComboboxItem<AlbumValue>[]
          >();
          return `${resolved.length} selected`;
        }}
        onValueChange={(value, details) => {
          expectTypeOf(value).toEqualTypeOf<readonly AlbumValue[]>();
          expectTypeOf(details).toEqualTypeOf<
            MultipleComboboxValueChangeDetails<AlbumValue>
          >();
          expectTypeOf(details.previousValue).toEqualTypeOf<
            readonly AlbumValue[]
          >();
        }}
        onInputValueChange={() => undefined}
        onOpenChange={() => undefined}
      />
    );

    void (
      <Combobox
        selectionMode="multiple"
        label="Albums"
        placeholder="Search"
        state={readyState}
        value={[]}
        inputValue=""
        open={false}
        onValueChange={() => undefined}
        onInputValueChange={() => undefined}
        onOpenChange={() => undefined}
      />
    );
  });

  it("types built-in, custom, and manual filtering without widening values", () => {
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Search"
        state={readyState}
        value={null}
        inputValue="fam"
        open
        filter={(item, query, details) => {
          expectTypeOf(item.value).toEqualTypeOf<AlbumValue>();
          expectTypeOf(query).toEqualTypeOf<string>();
          expectTypeOf(details).toEqualTypeOf<ComboboxFilterDetails>();
          return item.label.includes(query);
        }}
        filterLocale={["ko", "en"]}
        onValueChange={() => undefined}
        onInputValueChange={() => undefined}
        onOpenChange={() => undefined}
      />
    );
    void (
      <Combobox
        selectionMode="single"
        label="Remote album"
        placeholder="Search"
        state={{
          status: "loading",
          items: albumItems,
          statusLabel: "Refreshing albums",
        }}
        value={null}
        inputValue="f"
        open
        filter={null}
        onValueChange={() => undefined}
        onInputValueChange={() => undefined}
        onOpenChange={() => undefined}
      />
    );
  });

  it("keeps combined value details discriminated by selectionMode", () => {
    const inspect = (details: ComboboxValueChangeDetails<AlbumValue>): void => {
      if (details.selectionMode === "single") {
        expectTypeOf(details.previousValue).toEqualTypeOf<AlbumValue | null>();
      } else {
        expectTypeOf(details.previousValue).toEqualTypeOf<
          readonly AlbumValue[]
        >();
      }
    };
    void inspect;
  });
});

describe("Combobox rejected mode mixing and legacy escape hatches", () => {
  const callbacks = {
    onValueChange: () => undefined,
    onInputValueChange: () => undefined,
    onOpenChange: () => undefined,
  };

  it("rejects missing names/mode and value-shape mismatches", () => {
    void (
      (
        // @ts-expect-error visible label or accessibilityLabel is required
        <Combobox
          selectionMode="single"
          placeholder="Choose"
          state={readyState}
          value={null}
          inputValue=""
          open={false}
          {...callbacks}
        />
      )
    );
    void (
      (
        // @ts-expect-error selectionMode is a required discriminant
        <Combobox
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={null}
          inputValue=""
          open={false}
          {...callbacks}
        />
      )
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        // @ts-expect-error single mode cannot receive an array value
        value={["family"]}
        inputValue=""
        open={false}
        {...callbacks}
      />
    );
    void (
      (
        // @ts-expect-error multiple mode requires an array value
        <Combobox
          selectionMode="multiple"
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={null}
          inputValue=""
          open={false}
          {...callbacks}
        />
      )
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        // @ts-expect-error values remain limited to state item literals
        value="other"
        inputValue=""
        open={false}
        {...callbacks}
      />
    );
  });

  it("rejects selection-only props on the opposite mode", () => {
    void (
      (
        // @ts-expect-error maxSelected is multiple-only
        <Combobox
          selectionMode="single"
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={null}
          inputValue=""
          open={false}
          maxSelected={2}
          selectionLimitLabel="Two"
          {...callbacks}
        />
      )
    );
    void (
      (
        // @ts-expect-error selectedItems is multiple-only
        <Combobox
          selectionMode="single"
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={null}
          selectedItems={[]}
          inputValue=""
          open={false}
          {...callbacks}
        />
      )
    );
    const selectedItem = { value: "family", label: "Family" } as const;
    void (
      (
        // @ts-expect-error selectedItem is single-only
        <Combobox
          selectionMode="multiple"
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={[]}
          selectedItem={selectedItem}
          inputValue=""
          open={false}
          {...callbacks}
        />
      )
    );
    void (
      (
        // @ts-expect-error selectionLimitLabel cannot exist without maxSelected
        <Combobox
          selectionMode="multiple"
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={[]}
          inputValue=""
          open={false}
          selectionLimitLabel="Two"
          {...callbacks}
        />
      )
    );
    void (
      (
        // @ts-expect-error maxSelected requires a localized selectionLimitLabel
        <Combobox
          selectionMode="multiple"
          label="Album"
          placeholder="Choose"
          state={readyState}
          value={[]}
          inputValue=""
          open={false}
          maxSelected={2}
          {...callbacks}
        />
      )
    );
  });

  it("rejects uncontrolled, free-form, alias, and unstyled props", () => {
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        // @ts-expect-error defaultValue is outside the controlled-only contract
        defaultValue="family"
        inputValue=""
        open={false}
        {...callbacks}
      />
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        // @ts-expect-error defaultInputValue is outside the controlled-only contract
        defaultInputValue="Family"
        open={false}
        {...callbacks}
      />
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        open={false}
        // @ts-expect-error defaultOpen is outside the controlled-only contract
        defaultOpen
        {...callbacks}
      />
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        open={false}
        // @ts-expect-error freeSolo belongs to a future Autocomplete contract
        freeSolo
        {...callbacks}
      />
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        open={false}
        // @ts-expect-error multiple boolean alias cannot replace selectionMode
        multiple
        {...callbacks}
      />
    );
    void (
      <Combobox
        selectionMode="single"
        label="Album"
        placeholder="Choose"
        state={readyState}
        value={null}
        inputValue=""
        open={false}
        // @ts-expect-error legacy unstyled escape hatch is forbidden
        unstyled
        {...callbacks}
      />
    );
  });

  it("rejects invalid discriminated state ownership", () => {
    // @ts-expect-error error state requires a visible statusLabel
    const missingErrorLabel: ComboboxState<AlbumValue> = {
      status: "error",
      items: albumItems,
    };
    void missingErrorLabel;
    // @ts-expect-error ready state cannot own a retry callback
    const retryOnReady: ComboboxState<AlbumValue> = {
      status: "ready",
      items: albumItems,
      onRetry: () => undefined,
    };
    void retryOnReady;
  });

  it("keeps direct props types usable for wrappers", () => {
    const props = {
      selectionMode: "single",
      label: "Album",
      placeholder: "Choose",
      state: readyState,
      value: null,
      inputValue: "",
      open: false,
      ...callbacks,
    } as const satisfies ComboboxProps<AlbumValue>;
    expectTypeOf(props).toMatchTypeOf<ComboboxProps<AlbumValue>>();
  });
});
