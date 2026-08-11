import { act, useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Combobox } from '../../src/components/combobox.web';
import type {
  ComboboxFilter,
  ComboboxItem,
  ComboboxOpenChangeDetails,
  ComboboxState,
  MultipleComboboxValueChangeDetails,
  SingleComboboxValueChangeDetails,
} from '../../src/components/combobox.types';
import { Popover } from '../../src/components/popover.web';
import { UiProvider } from '../../src/components/provider';

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView',
);
let scrollIntoView = vi.fn();
let anchorDetached = false;

function installWebLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute('data-gj-web-popover')) {
        return { x: 0, y: 0, width: 260, height: 280 } as DOMRect;
      }
      if (this.querySelector?.('[role="combobox"]') !== null) {
        return {
          x: anchorDetached ? 10000 : 24,
          y: 24,
          width: 220,
          height: 44,
        } as DOMRect;
      }
      return { x: 0, y: 0, width: 0, height: 44 } as DOMRect;
    },
  );
  scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
}

function restoreScrollIntoView(): void {
  if (originalScrollIntoView === undefined) {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>)
      .scrollIntoView;
  } else {
    Object.defineProperty(
      HTMLElement.prototype,
      'scrollIntoView',
      originalScrollIntoView,
    );
  }
}

const countries = [
  {
    value: 'kr',
    label: 'South Korea',
    textValue: 'Korea',
    keywords: ['Asia', 'Seoul'],
    leading: <span data-testid="kr-leading">KR</span>,
  },
  { value: 'us', label: 'United States', disabled: true },
  { value: 'jp', label: 'Japan', description: 'Asia Pacific' },
  { value: 'de', label: 'Germany', trailing: <span>DE</span> },
] as const satisfies readonly ComboboxItem<string>[];

const readyState: ComboboxState<string> = {
  status: 'ready',
  items: countries,
};

interface SingleHarnessProps {
  readonly initialOpen?: boolean;
  readonly initialValue?: string | null;
  readonly initialInputValue?: string;
  readonly state?: ComboboxState<string>;
  readonly selectedItem?: ComboboxItem<string>;
  readonly filter?: ComboboxFilter<string> | null;
  readonly presentation?: 'auto' | 'inline';
  readonly openOnFocus?: boolean;
  readonly description?: string;
  readonly error?: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly clearable?: boolean;
  readonly refuseClose?: boolean;
  readonly eventOrder?: string[];
  readonly onValueChange?: (
    value: string | null,
    details: SingleComboboxValueChangeDetails<string>,
  ) => void;
  readonly onInputValueChange?: (
    value: string,
    details: { readonly reason: string; readonly isComposing: boolean },
  ) => void;
  readonly onOpenChange?: (
    open: boolean,
    details: ComboboxOpenChangeDetails<string>,
  ) => void;
  readonly provider?: boolean;
  readonly testID?: string;
}

function SingleHarness({
  initialOpen = false,
  initialValue = 'kr',
  initialInputValue = 'South Korea',
  state = readyState,
  selectedItem,
  filter,
  presentation = 'auto',
  openOnFocus,
  description,
  error,
  required,
  disabled,
  clearable,
  refuseClose = false,
  eventOrder,
  onValueChange,
  onInputValueChange,
  onOpenChange,
  provider = true,
  testID = 'country',
}: SingleHarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const [value, setValue] = useState<string | null>(initialValue);
  const [inputValue, setInputValue] = useState(initialInputValue);
  const content = (
    <>
      <Combobox<string>
        selectionMode="single"
        label="Country"
        placeholder="Find a country"
        state={state}
        value={value}
        selectedItem={selectedItem}
        inputValue={inputValue}
        open={open}
        filter={filter}
        presentation={presentation}
        openOnFocus={openOnFocus}
        description={description}
        error={error}
        required={required}
        disabled={disabled}
        clearable={clearable}
        onValueChange={(nextValue, details) => {
          eventOrder?.push(`value:${String(nextValue)}:${details.reason}`);
          onValueChange?.(nextValue, details);
          setValue(nextValue);
        }}
        onInputValueChange={(nextInputValue, details) => {
          eventOrder?.push(`input:${nextInputValue}:${details.reason}`);
          onInputValueChange?.(nextInputValue, details);
          setInputValue(nextInputValue);
        }}
        onOpenChange={(nextOpen, details) => {
          eventOrder?.push(`open:${String(nextOpen)}:${details.reason}`);
          onOpenChange?.(nextOpen, details);
          if (!(refuseClose && !nextOpen)) setOpen(nextOpen);
        }}
        emptyLabel="No countries yet"
        noResultsLabel="No matching countries"
        loadingLabel="Refreshing countries"
        clearLabel="Clear country"
        retryLabel="Retry countries"
        testID={testID}
      />
      <button type="button" data-testid="after-combobox">After</button>
    </>
  );
  return provider ? <UiProvider>{content}</UiProvider> : content;
}

interface MultipleHarnessProps {
  readonly initialOpen?: boolean;
  readonly initialValue?: readonly string[];
  readonly initialInputValue?: string;
  readonly state?: ComboboxState<string>;
  readonly selectedItems?: readonly ComboboxItem<string>[];
  readonly maxSelected?: number;
  readonly eventOrder?: string[];
  readonly getSelectionSummary?: (
    items: readonly ComboboxItem<string>[],
  ) => string;
  readonly onValueChange?: (
    value: readonly string[],
    details: MultipleComboboxValueChangeDetails<string>,
  ) => void;
  readonly onInputValueChange?: (value: string, details: { readonly reason: string }) => void;
  readonly onOpenChange?: (
    open: boolean,
    details: ComboboxOpenChangeDetails<string>,
  ) => void;
  readonly testID?: string;
}

function MultipleHarness({
  initialOpen = true,
  initialValue = ['kr', 'jp'],
  initialInputValue = '',
  state = readyState,
  selectedItems,
  maxSelected,
  eventOrder,
  getSelectionSummary,
  onValueChange,
  onInputValueChange,
  onOpenChange,
  testID = 'countries',
}: MultipleHarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  const [value, setValue] = useState<readonly string[]>(initialValue);
  const [inputValue, setInputValue] = useState(initialInputValue);
  return (
    <UiProvider>
      <Combobox<string>
        selectionMode="multiple"
        label="Countries"
        placeholder="Find countries"
        state={state}
        value={value}
        selectedItems={selectedItems}
        inputValue={inputValue}
        open={open}
        onValueChange={(nextValue, details) => {
          eventOrder?.push(`value:${nextValue.join(',')}:${details.reason}`);
          onValueChange?.(nextValue, details);
          setValue(nextValue);
        }}
        onInputValueChange={(nextInputValue, details) => {
          eventOrder?.push(`input:${nextInputValue}:${details.reason}`);
          onInputValueChange?.(nextInputValue, details);
          setInputValue(nextInputValue);
        }}
        onOpenChange={(nextOpen, details) => {
          eventOrder?.push(`open:${String(nextOpen)}:${details.reason}`);
          onOpenChange?.(nextOpen, details);
          setOpen(nextOpen);
        }}
        {...(maxSelected === undefined
          ? {}
          : {
              maxSelected,
              selectionLimitLabel: `Choose at most ${maxSelected}`,
            })}
        getSelectionSummary={getSelectionSummary}
        emptyLabel="No countries yet"
        noResultsLabel="No matching countries"
        clearLabel="Clear countries"
        testID={testID}
      />
      <button type="button" data-testid="after-combobox">After</button>
    </UiProvider>
  );
}

function combobox(name = 'Country'): HTMLInputElement {
  return screen.getByRole('combobox', { name }) as HTMLInputElement;
}

function activeOption(input = combobox()): HTMLElement | null {
  const id = input.getAttribute('aria-activedescendant');
  return id === null ? null : document.getElementById(id);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  restoreScrollIntoView();
  anchorDetached = false;
});

beforeEach(() => {
  installWebLayout();
});

describe('Combobox web — controlled editable selection', () => {
  it('opens from the real input, mounts exact single-select ARIA, keeps focus, and matches anchor width', () => {
    render(
      <SingleHarness
        initialOpen={false}
        initialValue="kr"
        initialInputValue="South Korea"
        description="Used for delivery"
        required
      />,
    );
    const input = combobox();
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-autocomplete')).toBe('list');
    expect(input.getAttribute('aria-expanded')).toBe('false');
    expect(input.hasAttribute('aria-controls')).toBe(false);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toContain(
      screen.getByText('Used for delivery').id,
    );

    act(() => input.focus());
    const listbox = screen.getByRole('listbox', { name: 'Country' });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(input.getAttribute('aria-controls')).toBe(listbox.id);
    expect(listbox.hasAttribute('aria-multiselectable')).toBe(false);
    expect(screen.getByRole('option', { name: 'South Korea' }).getAttribute('aria-selected')).toBe('true');
    expect(activeOption()).toBe(screen.getByRole('option', { name: 'South Korea' }));
    expect(document.activeElement).toBe(input);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    const popover = screen.getByTestId('country-content').parentElement;
    expect(popover?.style.width).toBe('220px');
    expect(input.style.minHeight).toBe('44px');
    expect(screen.getByRole('button', { name: 'Clear country' }).style.minHeight).toBe('44px');
  });

  it('exposes multi membership, compact bounded summary, and hydrated values absent from results', () => {
    const hydrated = {
      value: 'fr',
      label: 'France',
    } satisfies ComboboxItem<string>;
    render(
      <MultipleHarness
        initialValue={['kr', 'jp', 'fr']}
        selectedItems={[hydrated]}
      />,
    );
    const input = combobox('Countries');
    const listbox = screen.getByRole('listbox', { name: 'Countries' });
    expect(listbox.getAttribute('aria-multiselectable')).toBe('true');
    expect(screen.getByRole('option', { name: 'South Korea' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'Japan' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByRole('option', { name: 'France' })).toBeNull();
    const summary = screen.getByTestId('countries-summary');
    expect(summary.textContent).toBe('South Korea, Japan +1');
    expect(summary.style.maxWidth).toBe('50%');
    expect(input.style.minHeight).toBe('44px');
    expect(input.getAttribute('aria-describedby')).toContain(summary.id);
  });

  it('supports built-in token filtering, custom filtering, and null manual results', () => {
    const rendered = render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue="seoul asia"
      />,
    );
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      expect.stringContaining('South Korea'),
    ]);

    const onlyGermany: ComboboxFilter<string> = (item) => item.value === 'de';
    rendered.rerender(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue="unmatched"
        filter={onlyGermany}
      />,
    );
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: 'Germany' })).toBeTruthy();

    rendered.rerender(
      <SingleHarness
        key="empty"
        initialOpen
        initialValue={null}
        initialInputValue="unmatched"
        filter={null}
      />,
    );
    expect(screen.getAllByRole('option')).toHaveLength(countries.length);
  });

  it('commits single selection in value → input → close order and only reports changed states', () => {
    const order: string[] = [];
    const onValueChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <SingleHarness
        initialOpen
        initialValue="kr"
        initialInputValue="Jap"
        eventOrder={order}
        onValueChange={onValueChange}
        onOpenChange={onOpenChange}
      />,
    );
    const input = combobox();
    expect(activeOption()?.textContent).toContain('Japan');
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(order).toEqual([
      'value:jp:option-select',
      'input:Japan:option-select',
      'open:false:option-select',
    ]);
    expect(onValueChange).toHaveBeenCalledWith(
      'jp',
      expect.objectContaining({
        selectionMode: 'single',
        reason: 'option-select',
        previousValue: 'kr',
        item: expect.objectContaining({ value: 'jp' }),
      }),
    );
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: 'option-select' }),
    );
  });

  it('never commits on Tab, Escape, or blur and deduplicates outside-press with blur', () => {
    const order: string[] = [];
    const onValueChange = vi.fn();
    render(
      <SingleHarness
        initialOpen
        initialValue="kr"
        initialInputValue="Jap"
        eventOrder={order}
        onValueChange={onValueChange}
      />,
    );
    const input = combobox();
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(input, tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
    expect(onValueChange).not.toHaveBeenCalled();
    expect(order).toEqual([
      'input:South Korea:dismiss-restore',
      'open:false:tab-key',
    ]);

    cleanup();
    order.length = 0;
    render(
      <SingleHarness
        initialOpen
        initialValue="kr"
        initialInputValue="Jap"
        eventOrder={order}
        onValueChange={onValueChange}
      />,
    );
    const outsideInput = combobox();
    act(() => {
      fireEvent.pointerDown(document.body);
      fireEvent.blur(outsideInput);
    });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(order.filter((entry) => entry.includes('dismiss-restore'))).toHaveLength(1);
    expect(order.filter((entry) => entry.startsWith('open:false'))).toEqual([
      'open:false:outside-press',
    ]);
  });

  it('allows a controlled parent to refuse close and retry without stale request leakage', async () => {
    const order: string[] = [];
    render(
      <SingleHarness
        initialOpen
        initialValue="kr"
        initialInputValue="Jap"
        eventOrder={order}
        refuseClose
      />,
    );
    const input = combobox();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.getAttribute('aria-expanded')).toBe('true');
    expect(order).toEqual([
      'input:South Korea:dismiss-restore',
      'open:false:escape-key',
    ]);

    await act(async () => Promise.resolve());
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(order.filter((entry) => entry === 'open:false:escape-key')).toHaveLength(2);
    expect(document.activeElement).toBe(input);
  });

  it('preserves active value across async reorder and reconciles stale active IDs', () => {
    const firstState: ComboboxState<string> = {
      status: 'ready',
      items: [countries[0], countries[2], countries[3]],
    };
    const rendered = render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        state={firstState}
      />,
    );
    const input = combobox();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(activeOption()?.textContent).toContain('Japan');
    const priorId = input.getAttribute('aria-activedescendant');

    rendered.rerender(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        state={{ status: 'ready', items: [countries[3], countries[2]] }}
      />,
    );
    expect(activeOption()?.textContent).toContain('Japan');
    expect(combobox().getAttribute('aria-activedescendant')).toBe(priorId);

    rendered.rerender(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        state={{ status: 'ready', items: [countries[3]] }}
      />,
    );
    expect(activeOption()?.textContent).toContain('Germany');
    expect(document.getElementById(combobox().getAttribute('aria-activedescendant') ?? '')).toBe(activeOption());
  });

  it('keeps retained loading/error items selectable and exposes status, retry, and distinct empty copy outside options', () => {
    const onValueChange = vi.fn();
    const retry = vi.fn();
    const rendered = render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        state={{ status: 'loading', items: countries }}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByTestId('country-status').textContent).toBe('Refreshing countries');
    fireEvent.click(screen.getByRole('option', { name: 'Japan' }));
    expect(onValueChange).toHaveBeenCalledWith(
      'jp',
      expect.objectContaining({ reason: 'option-select' }),
    );

    rendered.rerender(
      <SingleHarness
        key="error"
        initialOpen
        initialValue={null}
        initialInputValue=""
        state={{
          status: 'error',
          statusLabel: 'Countries failed',
          items: [countries[3]],
          onRetry: retry,
        }}
      />,
    );
    const retryButton = screen.getByRole('button', { name: 'Retry countries' });
    expect(screen.getByTestId('country-status').textContent).toBe('Countries failed');
    expect(within(screen.getByRole('listbox')).queryByRole('button')).toBeNull();
    expect(screen.getByTestId('country-content').contains(retryButton)).toBe(false);
    fireEvent.click(retryButton);
    expect(retry).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <SingleHarness
        key="empty"
        initialOpen
        initialValue={null}
        initialInputValue=""
        state={{ status: 'ready', items: [] }}
      />,
    );
    expect(screen.getByTestId('country-empty').textContent).toBe('No countries yet');
    expect(within(screen.getByRole('listbox')).queryByText('No countries yet')).toBeNull();

    rendered.rerender(
      <SingleHarness
        key="no-results"
        initialOpen
        initialValue={null}
        initialInputValue="missing"
        state={{ status: 'ready', items: [] }}
      />,
    );
    expect(screen.getByTestId('country-empty').textContent).toBe('No matching countries');
  });

  it('toggles multi values in order, keeps the popup open, and only blocks unselected rows at the limit', () => {
    const order: string[] = [];
    const onOpenChange = vi.fn();
    render(
      <MultipleHarness
        initialValue={['kr', 'jp']}
        maxSelected={2}
        eventOrder={order}
        onOpenChange={onOpenChange}
      />,
    );
    const germany = screen.getByRole('option', { name: 'Germany' });
    const japan = screen.getByRole('option', { name: 'Japan' });
    expect(germany.getAttribute('aria-disabled')).toBe('true');
    expect(japan.getAttribute('aria-disabled')).not.toBe('true');
    expect(screen.getByTestId('countries-limit').textContent).toBe('Choose at most 2');

    fireEvent.click(japan);
    expect(order).toEqual([
      'value:kr:option-remove',
    ]);
    expect(combobox('Countries').getAttribute('aria-expanded')).toBe('true');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'Germany' }).getAttribute('aria-disabled')).not.toBe('true');

    fireEvent.click(screen.getByRole('option', { name: 'Germany' }));
    expect(order.at(-1)).toBe('value:kr,de:option-select');
  });

  it('clears value then query, remains focused/open, and keeps clear keyboard reachable', () => {
    const order: string[] = [];
    render(
      <MultipleHarness
        initialValue={['kr', 'jp']}
        initialInputValue="Ger"
        eventOrder={order}
      />,
    );
    const input = combobox('Countries');
    act(() => input.focus());
    const clear = screen.getByRole('button', { name: 'Clear countries' });
    expect(clear.tabIndex).toBe(0);
    fireEvent.pointerDown(clear);
    fireEvent.click(clear);
    expect(order).toEqual([
      'value::clear-action',
      'input::clear-action',
    ]);
    expect(document.activeElement).toBe(input);
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('restores a hydrated single label on dismissal when the result is absent', () => {
    const order: string[] = [];
    const selectedItem = {
      value: 'fr',
      label: 'France',
    } satisfies ComboboxItem<string>;
    render(
      <SingleHarness
        initialOpen
        initialValue="fr"
        initialInputValue="query"
        state={{ status: 'ready', items: [countries[3]] }}
        selectedItem={selectedItem}
        eventOrder={order}
      />,
    );
    fireEvent.keyDown(combobox(), { key: 'Escape' });
    expect(order).toEqual([
      'input:France:dismiss-restore',
      'open:false:escape-key',
    ]);
  });

  it('renders inline without an OverlayProvider and nests an overlay instance under a parent Popover', () => {
    render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        presentation="inline"
        provider={false}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Country' })).toBeTruthy();
    expect(screen.queryByTestId('country-content')?.parentElement?.hasAttribute('data-gj-web-popover')).toBe(false);

    cleanup();
    expect(() => render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        provider={false}
      />,
    )).toThrow('Combobox overlay presentations must be rendered inside OverlayProvider.');

    cleanup();
    render(
      <UiProvider>
        <Popover
          triggerLabel="Parent"
          title="Parent"
          open
          onOpenChange={() => {}}
          overlayId="combobox-parent"
        >
          <Combobox<string>
            selectionMode="single"
            label="Nested country"
            placeholder="Find"
            state={readyState}
            value={null}
            inputValue=""
            open
            onValueChange={() => {}}
            onInputValueChange={() => {}}
            onOpenChange={() => {}}
          />
        </Popover>
      </UiProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'Nested country' })).toBeTruthy();
    expect(screen.getByRole('listbox', { name: 'Nested country' })).toBeTruthy();
  });

  it('leaves Korean/Japanese IME keys untouched, reports composition, and honors keyCode 229', () => {
    const onValueChange = vi.fn();
    const onInputValueChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue=""
        onValueChange={onValueChange}
        onInputValueChange={onInputValueChange}
        onOpenChange={onOpenChange}
      />,
    );
    const input = combobox();
    fireEvent.compositionStart(input, { data: 'ㅎ' });
    fireEvent.change(input, { target: { value: '한' } });
    expect(onInputValueChange).toHaveBeenLastCalledWith(
      '한',
      expect.objectContaining({ reason: 'input-change', isComposing: true }),
    );

    for (const key of ['ArrowDown', 'Enter', 'Escape']) {
      fireEvent.keyPress(input, { key, isComposing: true });
    }
    fireEvent.keyPress(input, { key: 'Enter', keyCode: 229 });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(
      false,
      expect.anything(),
    );

    fireEvent.change(input, { target: { value: '日本' } });
    expect(onInputValueChange).toHaveBeenLastCalledWith(
      '日本',
      expect.objectContaining({ isComposing: true }),
    );
    fireEvent.compositionEnd(input, { data: '日本' });
    expect(onInputValueChange).toHaveBeenLastCalledWith(
      '日本',
      expect.objectContaining({ isComposing: false }),
    );
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    fireEvent(input, arrow);
    expect(arrow.defaultPrevented).toBe(true);
  });

  it('does not capture standard input editing keys or Enter with no active option', () => {
    const onValueChange = vi.fn();
    render(
      <SingleHarness
        initialOpen
        initialValue={null}
        initialInputValue="missing"
        state={{ status: 'ready', items: [] }}
        onValueChange={onValueChange}
      />,
    );
    const input = combobox();
    for (const key of ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Enter']) {
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(input, event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('fails fast for invalid custom summaries and keeps invariant geometry after style overrides', () => {
    expect(() => render(
      <MultipleHarness getSelectionSummary={() => ''} />,
    )).toThrow('Combobox getSelectionSummary must return a non-empty string.');

    cleanup();
    render(
      <UiProvider>
        <Combobox<string>
          selectionMode="single"
          label="Styled country"
          placeholder="Find"
          state={readyState}
          value={null}
          inputValue=""
          open
          onValueChange={() => {}}
          onInputValueChange={() => {}}
          onOpenChange={() => {}}
          controlStyle={{ minHeight: 1 }}
          inputStyle={{ minHeight: 1 }}
          itemStyle={{ minHeight: 1 }}
          clearable={false}
        />
      </UiProvider>,
    );
    const input = combobox('Styled country');
    expect(input.style.minHeight).toBe('44px');
    expect(screen.getByRole('option', { name: 'South Korea' }).style.minHeight).toBe('44px');
  });
});
