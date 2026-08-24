/**
 * Round E2 — renderTrigger 주입 계약 + 네이티브 anchored 프레젠테이션.
 *
 * 주입 ref 강제, expanded 상태의 커스텀 트리거 도달, 웹 aria id 배선,
 * anchored 위치 반영, outside-press/Escape/back dismissal, 그리고 owned
 * 트리거 기본 경로가 그대로인지 고정한다.
 */
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform, Pressable, Text as RNText, View } from "react-native";
import { Menu as NativeMenu } from "../../src/components/menu.native";
import { Menu as WebMenu } from "../../src/components/menu.web";
import type {
  MenuItem,
  MenuOpenChangeDetails,
} from "../../src/components/menu.types";
import { Select as NativeSelect } from "../../src/components/select.native";
import { Select as WebSelect } from "../../src/components/select.web";
import type { SelectOpenChangeDetails } from "../../src/components/select.types";
import type { TriggerRenderProps } from "../../src/components/trigger-render";
import { OverlayProvider } from "../../src/components/overlay/provider";
import { UiProvider } from "../../src/components/provider";

const menuItems = [
  { kind: "action", value: "archive", label: "Archive" },
  { kind: "checkbox", value: "starred", label: "Starred", checked: false },
] as const satisfies readonly MenuItem<string>[];

const selectItems = [
  { value: "recent", label: "Most recent" },
  { value: "oldest", label: "Oldest first" },
] as const;

function finishModalAnimationFrom(element: HTMLElement): void {
  let current: HTMLElement | null = element;
  while (current !== null && current !== document.body) {
    fireEvent.animationEnd(current);
    current = current.parentElement;
  }
}

/** RNW onLayout은 jsdom에 ResizeObserver가 없어 자동 발화하지 않는다 — 노드에 저장된 핸들러를 직접 부른다. */
function firePanelLayout(
  element: HTMLElement,
  layout: { width: number; height: number }
): void {
  const handler = (
    element as unknown as {
      __reactLayoutHandler?: (event: unknown) => void;
    }
  ).__reactLayoutHandler;
  expect(typeof handler).toBe("function");
  act(() => {
    handler?.({ nativeEvent: { layout: { x: 0, y: 0, ...layout } } });
  });
}

function stubMeasureInWindow(
  element: HTMLElement,
  frame: { x: number; y: number; width: number; height: number }
): void {
  Object.assign(element, {
    measureInWindow: (
      callback: (x: number, y: number, width: number, height: number) => void
    ) => callback(frame.x, frame.y, frame.width, frame.height),
  });
}

interface NativeMenuHarnessProps {
  readonly initialOpen?: boolean;
  readonly presentation?: "auto" | "bottom" | "center" | "anchored";
  readonly renderTrigger?: (trigger: TriggerRenderProps) => React.ReactElement;
  readonly sideOffset?: number;
  readonly collisionPadding?: number;
  readonly dismissDisabled?: boolean;
  readonly onOpenChange?: (
    open: boolean,
    details: MenuOpenChangeDetails<string>
  ) => void;
}

function NativeMenuHarness({
  initialOpen = false,
  presentation,
  renderTrigger,
  sideOffset,
  collisionPadding,
  dismissDisabled,
  onOpenChange,
}: NativeMenuHarnessProps) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <UiProvider>
      <OverlayProvider>
        <NativeMenu
          triggerLabel="Actions"
          items={menuItems}
          open={open}
          presentation={presentation}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          triggerTestID="custom-trigger"
          dismissDisabled={dismissDisabled}
          onOpenChange={(nextOpen, details) => {
            onOpenChange?.(nextOpen, details);
            setOpen(nextOpen);
          }}
          onSelect={() => {}}
          testID="native-menu"
          {...(renderTrigger === undefined ? {} : { renderTrigger })}
        />
      </OverlayProvider>
    </UiProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 웹 WebPopover는 anchor rect가 0이면 detached로 판정해 즉시 닫는다 — 측정 가능한 레이아웃을 목킹한다. */
function installMeasuredLayout(): void {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute("data-gj-web-popover")) {
        return { x: 0, y: 0, width: 160, height: 220 } as DOMRect;
      }
      const role = this.getAttribute("role");
      if (role === "button" || role === "combobox") {
        return { x: 24, y: 24, width: 100, height: 44 } as DOMRect;
      }
      return { x: 0, y: 0, width: 0, height: 0 } as DOMRect;
    }
  );
}

describe("renderTrigger — injected contract on the native Menu", () => {
  it("renders only the custom trigger, injects press/testID, and keeps expanded state in sync", async () => {
    const onOpenChange = vi.fn();
    render(
      <NativeMenuHarness
        onOpenChange={onOpenChange}
        renderTrigger={(trigger) => (
          <Pressable {...trigger}>
            <RNText>모두 보기</RNText>
          </Pressable>
        )}
      />
    );
    const trigger = screen.getByTestId("custom-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // 커스텀 트리거가 유일한 Actions 버튼이다 — owned 트리거는 렌더되지 않는다.
    expect(screen.getAllByRole("button", { name: "Actions" })).toHaveLength(1);

    fireEvent.click(trigger);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "trigger-press" })
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    finishModalAnimationFrom(screen.getByTestId("native-menu-sheet"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Archive" })).toBeTruthy();
  });

  it("throws when the injected ref never attaches before open", () => {
    expect(() =>
      render(
        <NativeMenuHarness
          initialOpen
          renderTrigger={() => (
            <View>
              <RNText>ref를 버린 트리거</RNText>
            </View>
          )}
        />
      )
    ).toThrow(/Menu renderTrigger did not attach the injected ref/);
  });

  it("rejects owned trigger-visual props at render for JS callers", () => {
    expect(() =>
      render(
        <UiProvider>
          <OverlayProvider>
            <NativeMenu
              triggerLabel="Actions"
              items={menuItems}
              open={false}
              onOpenChange={() => {}}
              onSelect={() => {}}
              renderTrigger={(trigger) => <Pressable {...trigger} />}
              variant={"outlined" as never}
            />
          </OverlayProvider>
        </UiProvider>
      )
    ).toThrow(
      "Menu variant cannot be combined with renderTrigger — the custom trigger owns all trigger visuals; remove variant."
    );
  });
});

describe("renderTrigger — web aria id wiring", () => {
  it("wires menu haspopup/controls/expanded onto the custom web trigger", () => {
    installMeasuredLayout();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebMenu
              triggerLabel="Actions"
              items={menuItems}
              open={open}
              onOpenChange={(next) => setOpen(next)}
              onSelect={() => {}}
              triggerTestID="web-menu-trigger"
              renderTrigger={(trigger) => (
                <Pressable {...trigger}>
                  <RNText>정렬</RNText>
                </Pressable>
              )}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    const trigger = screen.getByTestId("web-menu-trigger");
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Actions" });
    expect(menu.id.length).toBeGreaterThan(0);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    // 주입 onKeyDown이 붙었으니 키보드 오픈 경로도 커스텀 트리거에서 동작한다.
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Archive" })
    );
  });

  it("wires combobox listbox ids onto the custom web Select trigger", () => {
    installMeasuredLayout();
    function Harness() {
      const [open, setOpen] = useState(false);
      const [value, setValue] = useState<"recent" | "oldest" | null>(null);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebSelect
              label="Sort order"
              placeholder="Choose order"
              items={selectItems}
              value={value}
              onValueChange={setValue}
              open={open}
              onOpenChange={(next) => setOpen(next)}
              testID="web-select"
              renderTrigger={(trigger) => (
                <Pressable {...trigger}>
                  <RNText>{trigger.accessibilityValue?.text}</RNText>
                </Pressable>
              )}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    // triggerTestID가 없으면 파생 `${testID}-trigger`가 주입된다.
    const trigger = screen.getByTestId("web-select-trigger");
    expect(trigger.getAttribute("role")).toBe("combobox");
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-label")).toBe("Sort order");
    expect(trigger.textContent).toBe("Choose order");

    fireEvent.click(trigger);
    const listbox = screen.getByRole("listbox", { name: "Sort order" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(listbox.id);
  });
});

/** RNW useWindowDimensions는 jsdom에서 documentElement.client* (기본 0)을 읽는다 — 결정적 창 크기를 고정한다. */
function withWindowSize(width: number, height: number): () => void {
  const originalWidth = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "clientWidth"
  );
  const originalHeight = Object.getOwnPropertyDescriptor(
    document.documentElement,
    "clientHeight"
  );
  Object.defineProperty(document.documentElement, "clientWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
  return () => {
    for (const [name, descriptor] of [
      ["clientWidth", originalWidth],
      ["clientHeight", originalHeight],
    ] as const) {
      if (descriptor === undefined) {
        delete (document.documentElement as unknown as Record<string, unknown>)[
          name
        ];
      } else {
        Object.defineProperty(document.documentElement, name, descriptor);
      }
    }
    window.dispatchEvent(new Event("resize"));
  };
}

describe("native anchored presentation", () => {
  it("positions the panel by the measured trigger, paints no backdrop, and has no cancel action", async () => {
    const restoreWindowSize = withWindowSize(390, 640);
    try {
      const onOpenChange = vi.fn();
      render(
        <NativeMenuHarness presentation="anchored" onOpenChange={onOpenChange} />
      );
      const trigger = screen.getByTestId("custom-trigger");
      stubMeasureInWindow(trigger, { x: 20, y: 30, width: 100, height: 40 });

      fireEvent.click(trigger);
      finishModalAnimationFrom(screen.getByTestId("native-menu-anchored"));
      const dialog = await screen.findByRole("dialog");

      // 시트 전용 표면이 아니라 anchored 표면이 뜬다 — 취소 액션이 없다.
      expect(
        within(dialog).queryByRole("button", { name: "Cancel" })
      ).toBeNull();
      expect(screen.queryByTestId("native-menu-sheet")).toBeNull();

      const backdrop = screen.getByTestId("native-menu-anchored-backdrop");
      // 딤 없는 백드롭 — theme.colors.overlay 대신 완전 투명을 칠한다.
      expect(window.getComputedStyle(backdrop).backgroundColor).toBe(
        "rgba(0, 0, 0, 0)"
      );

      const panel = screen.getByTestId("native-menu-anchored-panel");
      firePanelLayout(panel, { width: 160, height: 200 });
      const content = screen.getByTestId("native-menu-anchored-content");
      // bottom-start: 트리거 왼쪽 정렬, 트리거 하단 아래.
      expect(content.style.left).toBe("20px");
      expect(content.style.top).toBe("70px");
      // 패널은 남은 아래 공간으로 clamp된다 — 내용은 내부 스크롤로 넘긴다.
      expect(content.style.maxHeight).toBe(`${640 - 70}px`);
      expect(
        within(dialog).getByRole("button", { name: "Archive" })
      ).toBeTruthy();

      fireEvent.pointerDown(backdrop);
      expect(onOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: "outside-press" })
      );
    } finally {
      cleanup();
      restoreWindowSize();
    }
  });

  it("keeps Escape and Android hardware back dismissal in anchored mode", async () => {
    const onOpenChange = vi.fn();
    render(
      <NativeMenuHarness
        initialOpen
        presentation="anchored"
        onOpenChange={onOpenChange}
      />
    );
    finishModalAnimationFrom(screen.getByTestId("native-menu-anchored"));
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenLastCalledWith(
      false,
      expect.objectContaining({ reason: "escape-key" })
    );

    cleanup();
    const originalOS = Platform.OS;
    Platform.OS = "android";
    const backOpenChange = vi.fn();
    try {
      render(
        <NativeMenuHarness
          initialOpen
          presentation="anchored"
          onOpenChange={backOpenChange}
        />
      );
      finishModalAnimationFrom(screen.getByTestId("native-menu-anchored"));
      fireEvent.keyUp(document, { key: "Escape" });
      expect(backOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: "hardware-back" })
      );
    } finally {
      cleanup();
      Platform.OS = originalOS;
    }
  });

  it("renders the Select radiogroup in the anchored panel and commits an option", async () => {
    const events: string[] = [];
    function Harness() {
      const [open, setOpen] = useState(true);
      const [value, setValue] = useState<"recent" | "oldest" | null>(null);
      return (
        <UiProvider>
          <OverlayProvider>
            <NativeSelect
              label="Sort order"
              placeholder="Choose order"
              items={selectItems}
              value={value}
              open={open}
              presentation="anchored"
              onOpenChange={(
                next,
                details: SelectOpenChangeDetails<"recent" | "oldest">
              ) => {
                events.push(`open:${details.reason}`);
                setOpen(next);
              }}
              onValueChange={(next) => {
                events.push(`value:${next}`);
                setValue(next);
              }}
              testID="native-select"
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    finishModalAnimationFrom(screen.getByTestId("native-select-anchored"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("radiogroup", { name: "Sort order" })
    ).toBeTruthy();
    expect(screen.queryByTestId("native-select-sheet")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();

    fireEvent.click(within(dialog).getByRole("radio", { name: "Most recent" }));
    expect(events).toEqual(["value:recent", "open:option-select"]);
  });

  it("keeps the owned trigger and sheet path byte-identical by default", async () => {
    render(<NativeMenuHarness initialOpen />);
    // 기본 경로: anchored 표면이 아니라 기존 시트가 뜨고 취소 액션이 있다.
    expect(screen.queryByTestId("native-menu-anchored")).toBeNull();
    finishModalAnimationFrom(screen.getByTestId("native-menu-sheet"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeTruthy();
    const trigger = screen.getByTestId("custom-trigger");
    // owned 네이티브 트리거는 기존처럼 accessibilityState만 실어 나른다 —
    // aria-expanded 병기는 renderTrigger 주입 계약에만 있다(byte-identical).
    expect(trigger.getAttribute("aria-expanded")).toBeNull();
    expect(trigger.getAttribute("role")).toBe("button");
  });
});
describe("renderTrigger — web wiring enforcement on the open transition", () => {
  it("throws when a web Menu consumer forwards only {ref, onPress} — the a11y wiring never reached the node", () => {
    installMeasuredLayout();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebMenu
              triggerLabel="Actions"
              items={menuItems}
              open={open}
              onOpenChange={(next) => setOpen(next)}
              onSelect={() => {}}
              renderTrigger={(trigger) => (
                <Pressable
                  ref={trigger.ref as never}
                  onPress={trigger.onPress}
                  testID="partial-menu-trigger"
                >
                  <RNText>정렬</RNText>
                </Pressable>
              )}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    const trigger = screen.getByTestId("partial-menu-trigger");
    // ref는 붙었으므로 ref-attach 강제만으로는 조용히 통과하던 오용이다.
    expect(trigger.getAttribute("role")).toBeNull();
    expect(() => fireEvent.click(trigger)).toThrow(
      /Menu renderTrigger attached the injected ref, but the injected accessibility wiring did not reach that element/
    );
  });

  it("throws when a web Select consumer forwards only {ref, onPress}", () => {
    installMeasuredLayout();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebSelect
              label="Sort order"
              placeholder="Choose order"
              items={selectItems}
              value={null}
              onValueChange={() => {}}
              open={open}
              onOpenChange={(next) => setOpen(next)}
              renderTrigger={(trigger) => (
                <Pressable
                  ref={trigger.ref as never}
                  onPress={trigger.onPress}
                  testID="partial-select-trigger"
                >
                  <RNText>pick</RNText>
                </Pressable>
              )}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    expect(() =>
      fireEvent.click(screen.getByTestId("partial-select-trigger"))
    ).toThrow(
      /Select renderTrigger attached the injected ref, but the injected accessibility wiring did not reach that element/
    );
  });

  it("throws when the ref is parked on a non-interactive wrapper around the real trigger", () => {
    installMeasuredLayout();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebMenu
              triggerLabel="Actions"
              items={menuItems}
              open={open}
              onOpenChange={(next) => setOpen(next)}
              onSelect={() => {}}
              renderTrigger={(trigger) => {
                const { ref, ...rest } = trigger;
                return (
                  <View ref={ref as never}>
                    <Pressable
                      {...(rest as Record<string, unknown>)}
                      testID="inner-trigger"
                    >
                      <RNText>정렬</RNText>
                    </Pressable>
                  </View>
                );
              }}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    // 래퍼가 측정·포커스 복원 대상이 되는 조용한 오용 — 이제 시끄럽게 죽는다.
    expect(() =>
      fireEvent.click(screen.getByTestId("inner-trigger"))
    ).toThrow(/parking the ref on a wrapper/);
  });
});

describe("web Menu trigger — kit-owned Enter/Space activation", () => {
  it("opens once on Enter via the injected handler and suppresses the Pressable keyboard press", () => {
    installMeasuredLayout();
    const onOpenChange = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebMenu
              triggerLabel="Actions"
              items={menuItems}
              open={open}
              onOpenChange={(next, details) => {
                onOpenChange(next, details);
                setOpen(next);
              }}
              onSelect={() => {}}
              triggerTestID="kbd-menu-trigger"
              renderTrigger={(trigger) => (
                <Pressable {...trigger}>
                  <RNText>정렬</RNText>
                </Pressable>
              )}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    const trigger = screen.getByTestId("kbd-menu-trigger");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "trigger-press" })
    );
    // Pressable의 role=button press 에뮬레이션이 같은 키 시퀀스에서 두 번째
    // 토글(닫기)을 만들지 않는다.
    fireEvent.keyUp(trigger, { key: "Enter" });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menu", { name: "Actions" })).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("menuitem", { name: "Archive" })
    );
  });

  it("opens on Space even when the host lacks Pressable keyboard emulation", () => {
    installMeasuredLayout();
    const onOpenChange = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <UiProvider>
          <OverlayProvider>
            <WebMenu
              triggerLabel="Actions"
              items={menuItems}
              open={open}
              onOpenChange={(next, details) => {
                onOpenChange(next, details);
                setOpen(next);
              }}
              onSelect={() => {}}
              renderTrigger={(trigger) => (
                // 계약 밖 호스트(일반 View) — 클릭은 죽지만, 이제 키보드
                // 활성화만큼은 주입 onKeyDown이 직접 소유해 살아 있다.
                <View
                  {...(trigger as unknown as Record<string, unknown>)}
                  testID="probe-view-host"
                >
                  <RNText>정렬</RNText>
                </View>
              )}
            />
          </OverlayProvider>
        </UiProvider>
      );
    }
    render(<Harness />);
    fireEvent.keyDown(screen.getByTestId("probe-view-host"), { key: " " });
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenLastCalledWith(
      true,
      expect.objectContaining({ reason: "trigger-press" })
    );
  });
});

describe("native anchored presentation — anchor-detached parity", () => {
  it("closes with reason anchor-detached when the re-measured trigger leaves the collision boundary", async () => {
    const restoreWindowSize = withWindowSize(390, 640);
    try {
      const onOpenChange = vi.fn();
      render(
        <NativeMenuHarness presentation="anchored" onOpenChange={onOpenChange} />
      );
      const trigger = screen.getByTestId("custom-trigger");
      stubMeasureInWindow(trigger, { x: 20, y: 30, width: 100, height: 40 });

      fireEvent.click(trigger);
      finishModalAnimationFrom(screen.getByTestId("native-menu-anchored"));
      await screen.findByRole("dialog");
      firePanelLayout(screen.getByTestId("native-menu-anchored-panel"), {
        width: 160,
        height: 200,
      });
      expect(onOpenChange).toHaveBeenLastCalledWith(
        true,
        expect.objectContaining({ reason: "trigger-press" })
      );

      // 회전/리사이즈 후 재측정된 트리거가 창(collision boundary) 밖으로 나갔다.
      stubMeasureInWindow(trigger, { x: 20, y: 900, width: 100, height: 40 });
      act(() => {
        Object.defineProperty(document.documentElement, "clientHeight", {
          configurable: true,
          value: 620,
        });
        window.dispatchEvent(new Event("resize"));
      });

      expect(onOpenChange).toHaveBeenLastCalledWith(
        false,
        expect.objectContaining({ reason: "anchor-detached" })
      );
      // 정확히 한 번의 open(true)과 한 번의 close(false) — dismiss 루프 없음.
      expect(onOpenChange).toHaveBeenCalledTimes(2);
    } finally {
      cleanup();
      restoreWindowSize();
    }
  });

  it("keeps a detached panel clamped open while dismissDisabled vetoes the cleanup, like the web", async () => {
    const restoreWindowSize = withWindowSize(390, 640);
    try {
      const onOpenChange = vi.fn();
      render(
        <NativeMenuHarness
          presentation="anchored"
          dismissDisabled
          onOpenChange={onOpenChange}
        />
      );
      const trigger = screen.getByTestId("custom-trigger");
      stubMeasureInWindow(trigger, { x: 20, y: 30, width: 100, height: 40 });
      fireEvent.click(trigger);
      finishModalAnimationFrom(screen.getByTestId("native-menu-anchored"));
      await screen.findByRole("dialog");
      firePanelLayout(screen.getByTestId("native-menu-anchored-panel"), {
        width: 160,
        height: 200,
      });

      stubMeasureInWindow(trigger, { x: 20, y: 900, width: 100, height: 40 });
      act(() => {
        Object.defineProperty(document.documentElement, "clientHeight", {
          configurable: true,
          value: 620,
        });
        window.dispatchEvent(new Event("resize"));
      });

      expect(onOpenChange).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenLastCalledWith(
        true,
        expect.objectContaining({ reason: "trigger-press" })
      );
      expect(screen.getByTestId("native-menu-anchored-panel")).toBeTruthy();
    } finally {
      cleanup();
      restoreWindowSize();
    }
  });
});
