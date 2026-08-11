import { describe, expect, it, vi } from 'vitest';
import { computeOverlayPosition, overlayPlacements } from '../../src/components/overlay/position';
import { createPresenceState, presenceReducer } from '../../src/components/overlay/presence';
import { createOverlayStack } from '../../src/components/overlay/stack';
import { createTypeaheadState, findTypeaheadMatch } from '../../src/components/overlay/typeahead';
import type {
  OverlayDismissReason,
  OverlayPlacement,
  PresenceState,
  TypeaheadItem,
} from '../../src/components/overlay/types';

describe('v0.5 pure overlay stack', () => {
  it('Provider별 인스턴스를 격리하고 mount 순서·부모 관계를 보존한다', () => {
    const first = createOverlayStack();
    const second = createOverlayStack();
    const root = first.mount({ id: 'root', onDismiss: () => {} });
    const child = first.mount({ id: 'child', parentId: 'root', onDismiss: () => {} });

    expect(first.getSnapshot()).toEqual({
      entries: [
        { id: 'root', dismissible: true, mountOrder: 1 },
        { id: 'child', parentId: 'root', dismissible: true, mountOrder: 2 },
      ],
      topmost: { id: 'child', parentId: 'root', dismissible: true, mountOrder: 2 },
    });
    expect(second.getSnapshot()).toEqual({ entries: [], topmost: null });
    expect(first.isTopmost('child')).toBe(true);
    expect(first.isDescendant('child', 'root')).toBe(true);
    expect(first.isDescendant('root', 'root')).toBe(false);

    child.update({ parentId: null, dismissible: false });
    expect(first.isDescendant('child', 'root')).toBe(false);
    expect(first.getSnapshot().entries[1]).toEqual({
      id: 'child',
      dismissible: false,
      mountOrder: 2,
    });

    root.unmount();
    expect(first.getSnapshot().entries.map((entry) => entry.id)).toEqual(['child']);
  });

  it('topmost가 아닌 dismiss 요청을 막고 nondismissible 최상단에서 절대 fall through하지 않는다', () => {
    const stack = createOverlayStack();
    const parentDismiss = vi.fn();
    const blockerDismiss = vi.fn();
    stack.mount({ id: 'parent', onDismiss: parentDismiss });
    const blocker = stack.mount({
      id: 'blocker',
      parentId: 'parent',
      dismissible: false,
      onDismiss: blockerDismiss,
    });

    expect(stack.requestDismiss('parent', 'outside-press')).toEqual({
      status: 'blocked',
      overlayId: 'parent',
      blockerId: 'blocker',
      blockReason: 'not-topmost',
    });
    expect(stack.requestTopmostDismiss('hardware-back')).toEqual({
      status: 'blocked',
      overlayId: 'blocker',
      blockerId: 'blocker',
      blockReason: 'not-dismissible',
    });
    expect(parentDismiss).not.toHaveBeenCalled();
    expect(blockerDismiss).not.toHaveBeenCalled();

    blocker.unmount();
    expect(stack.requestTopmostDismiss('hardware-back')).toEqual({
      status: 'dismissed',
      overlayId: 'parent',
    });
    expect(parentDismiss).toHaveBeenCalledWith({
      overlayId: 'parent',
      reason: 'hardware-back',
    });
  });

  it('초기 open 자식이 부모보다 먼저 등록돼도 ancestry가 자식을 topmost로 유지한다', () => {
    const stack = createOverlayStack();
    const childDismiss = vi.fn();
    const parentDismiss = vi.fn();
    const unrelatedDismiss = vi.fn();

    // React child layout effects can run before the Dialog parent effect.
    stack.mount({ id: 'child', parentId: 'parent', onDismiss: childDismiss });
    stack.mount({ id: 'unrelated', onDismiss: unrelatedDismiss });
    stack.mount({ id: 'parent', onDismiss: parentDismiss });

    expect(stack.getSnapshot().entries.map((entry) => entry.id)).toEqual([
      'unrelated',
      'parent',
      'child',
    ]);
    expect(stack.getSnapshot().topmost?.id).toBe('child');
    expect(stack.requestDismiss('parent', 'escape-key')).toMatchObject({
      status: 'blocked',
      blockerId: 'child',
    });
    expect(stack.requestTopmostDismiss('escape-key')).toEqual({
      status: 'dismissed',
      overlayId: 'child',
    });
    expect(childDismiss).toHaveBeenCalledTimes(1);
    expect(parentDismiss).not.toHaveBeenCalled();
    expect(unrelatedDismiss).not.toHaveBeenCalled();
  });

  it('dismiss reason과 opaque 원본 이벤트를 topmost callback에 전달한다', () => {
    const stack = createOverlayStack();
    const onDismiss = vi.fn();
    const event = { platform: 'test' };
    const reasons = [
      'backdrop-press',
      'outside-press',
      'escape-key',
      'hardware-back',
      'accessibility-escape',
      'close-action',
      'cancel-action',
      'action-select',
      'tab-key',
      'focus-out',
      'anchor-detached',
      'programmatic',
    ] as const satisfies readonly OverlayDismissReason[];
    stack.mount({ id: 'menu', onDismiss });

    for (const reason of reasons) {
      expect(stack.requestDismiss('menu', reason, event).status).toBe('dismissed');
    }
    expect(onDismiss).toHaveBeenNthCalledWith(1, {
      overlayId: 'menu',
      reason: 'backdrop-press',
      originalEvent: event,
    });
    expect(onDismiss).toHaveBeenCalledTimes(reasons.length);
  });

  it('부모 unmount가 전체 descendant branch를 원자적으로 제거한다', () => {
    const stack = createOverlayStack();
    const root = stack.mount({ id: 'root', onDismiss: () => {} });
    stack.mount({ id: 'child', parentId: 'root', onDismiss: () => {} });
    stack.mount({ id: 'grandchild', parentId: 'child', onDismiss: () => {} });
    stack.mount({ id: 'sibling', onDismiss: () => {} });

    root.unmount();
    expect(stack.getSnapshot().entries.map((entry) => entry.id)).toEqual(['sibling']);
    expect(stack.getSnapshot().topmost?.id).toBe('sibling');
  });

  it('cycle·중복 id를 거부하고 stale handle이 재등록 항목을 지우지 않는다', () => {
    const stack = createOverlayStack();
    const stale = stack.mount({ id: 'first', parentId: 'later', onDismiss: () => {} });
    expect(() =>
      stack.mount({ id: 'later', parentId: 'first', onDismiss: () => {} }),
    ).toThrow(/cycle/);
    expect(() => stack.mount({ id: 'first', onDismiss: () => {} })).toThrow(/already mounted/);

    stale.unmount();
    stack.mount({ id: 'first', onDismiss: () => {} });
    stale.unmount();
    stale.update({ dismissible: false });
    expect(stack.getSnapshot().topmost).toMatchObject({ id: 'first', dismissible: true });
  });

  it('snapshot 변경만 구독자에게 알리고 empty/not-found 결과를 구분한다', () => {
    const stack = createOverlayStack();
    const listener = vi.fn();
    const unsubscribe = stack.subscribe(listener);
    const handle = stack.mount({ id: 'dialog', onDismiss: () => {} });
    const beforeCallbackUpdate = stack.getSnapshot();
    handle.update({ onDismiss: () => {} });
    expect(stack.getSnapshot()).toBe(beforeCallbackUpdate);
    expect(listener).toHaveBeenCalledTimes(1);

    handle.update({ dismissible: false });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(stack.requestDismiss('missing', 'programmatic')).toEqual({
      status: 'not-found',
      overlayId: 'missing',
    });
    handle.unmount();
    expect(stack.requestTopmostDismiss('programmatic')).toEqual({ status: 'empty' });
    unsubscribe();
  });
});

describe('v0.5 pure anchor positioning', () => {
  const anchor = { x: 100, y: 100, width: 40, height: 20 };
  const floating = { width: 30, height: 10 };
  const viewport = { x: 0, y: 0, width: 400, height: 300 };
  const expected: Record<OverlayPlacement, readonly [number, number]> = {
    'top-start': [100, 90],
    'top-center': [105, 90],
    'top-end': [110, 90],
    'right-start': [140, 100],
    'right-center': [140, 105],
    'right-end': [140, 110],
    'bottom-start': [100, 120],
    'bottom-center': [105, 120],
    'bottom-end': [110, 120],
    'left-start': [70, 100],
    'left-center': [70, 105],
    'left-end': [70, 110],
  };

  it('side × align 12개 placement의 기하를 모두 계산한다', () => {
    expect(overlayPlacements).toHaveLength(12);
    for (const placement of overlayPlacements) {
      const result = computeOverlayPosition({
        anchor,
        floating,
        viewport,
        placement,
        flip: false,
        shift: false,
      });
      expect([result.x, result.y], placement).toEqual(expected[placement]);
      expect(result.placement).toBe(placement);
      expect(result.flipped).toBe(false);
      expect(result.shifted).toBe(false);
    }
  });

  it('RTL에서 vertical side의 start/end와 logical alignOffset을 뒤집는다', () => {
    const start = computeOverlayPosition({
      anchor,
      floating,
      viewport,
      placement: 'bottom-start',
      direction: 'rtl',
      alignOffset: 7,
      flip: false,
      shift: false,
    });
    const end = computeOverlayPosition({
      anchor,
      floating,
      viewport,
      placement: 'bottom-end',
      direction: 'rtl',
      flip: false,
      shift: false,
    });
    const sideStart = computeOverlayPosition({
      anchor,
      floating,
      viewport,
      placement: 'right-start',
      direction: 'rtl',
      flip: false,
      shift: false,
    });

    expect([start.x, start.y]).toEqual([103, 120]);
    expect([end.x, end.y]).toEqual([100, 120]);
    expect([sideStart.x, sideStart.y]).toEqual([140, 100]);
  });

  it('주축 충돌이 더 작은 반대 side로 flip한다', () => {
    const result = computeOverlayPosition({
      anchor: { x: 80, y: 130, width: 40, height: 10 },
      floating: { width: 60, height: 30 },
      viewport: { x: 0, y: 0, width: 200, height: 150 },
      placement: 'bottom-start',
      sideOffset: 4,
    });

    expect(result).toMatchObject({
      x: 80,
      y: 96,
      placement: 'top-start',
      side: 'top',
      align: 'start',
      flipped: true,
      shifted: false,
    });
  });

  it('collisionInsets 경계 안으로 shift하고 resolved side의 available size를 낸다', () => {
    const shifted = computeOverlayPosition({
      anchor: { x: 0, y: 60, width: 20, height: 20 },
      floating: { width: 80, height: 30 },
      viewport: { x: 10, y: 20, width: 200, height: 120 },
      placement: 'left-start',
      sideOffset: 4,
      collisionInsets: { top: 5, right: 10, bottom: 15, left: 8 },
      flip: false,
    });
    const available = computeOverlayPosition({
      anchor: { x: 100, y: 70, width: 40, height: 20 },
      floating,
      viewport: { x: 0, y: 0, width: 300, height: 200 },
      placement: 'bottom-center',
      sideOffset: 5,
      collisionInsets: 10,
      flip: false,
    });

    expect(shifted).toMatchObject({
      x: 18,
      y: 60,
      shifted: true,
      availableWidth: 0,
      availableHeight: 100,
      overflow: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    expect(available.availableWidth).toBe(280);
    expect(available.availableHeight).toBe(95);
  });

  it('collision boundary 밖 anchor를 detached로 표시하고 잔여 overflow를 보고한다', () => {
    const result = computeOverlayPosition({
      anchor: { x: 400, y: 80, width: 20, height: 20 },
      floating: { width: 240, height: 80 },
      viewport: { x: 0, y: 0, width: 200, height: 100 },
      placement: 'right-start',
      collisionInsets: 10,
      flip: false,
    });

    expect(result.detached).toBe(true);
    expect(result.shifted).toBe(true);
    expect(result.overflow.right).toBe(60);
  });

  it('비정상 geometry를 조용히 전파하지 않는다', () => {
    expect(() =>
      computeOverlayPosition({
        anchor,
        floating: { width: -1, height: 10 },
        viewport,
        placement: 'top-start',
      }),
    ).toThrow(/floating.width/);
    expect(() =>
      computeOverlayPosition({
        anchor,
        floating,
        viewport,
        placement: 'top-start',
        collisionInsets: Number.NaN,
      }),
    ).toThrow(/collisionInsets/);
  });
});

describe('v0.5 Unicode typeahead', () => {
  const items = [
    { id: 'disabled', textValue: 'École', disabled: true },
    { id: 'eclair', textValue: 'Éclair' },
    { id: 'cream', textValue: 'Crème brûlée' },
    { id: 'korean', textValue: '한국어' },
  ] as const satisfies readonly TypeaheadItem[];

  it('대소문자·결합 부호를 정규화하고 disabled 항목을 건너뛴다', () => {
    const result = findTypeaheadMatch({
      items,
      state: createTypeaheadState(),
      input: 'E',
      now: 100,
    });

    expect(result.match?.id).toBe('eclair');
    expect(result.matchIndex).toBe(1);
    expect(result.state).toEqual({ query: 'e', lastTypedAt: 100, lastMatchId: 'eclair' });
  });

  it('timeout 안의 연속 Unicode 입력을 누적한다', () => {
    const first = findTypeaheadMatch({
      items,
      state: createTypeaheadState(),
      input: 'C',
      now: 0,
    });
    const second = findTypeaheadMatch({
      items,
      state: first.state,
      input: 'R',
      now: 100,
    });
    const korean = findTypeaheadMatch({
      items,
      state: createTypeaheadState(),
      input: '한',
      now: 200,
    });

    expect(second.state.query).toBe('cr');
    expect(second.match?.id).toBe('cream');
    expect(korean.match?.id).toBe('korean');
  });

  it('같은 문자를 반복하면 활성 항목 다음부터 순환한다', () => {
    const cyclingItems = [
      { id: 'apple', textValue: 'Apple' },
      { id: 'disabled', textValue: 'Almond', disabled: true },
      { id: 'apricot', textValue: 'Apricot' },
      { id: 'avocado', textValue: 'Avocado' },
    ];
    const first = findTypeaheadMatch({
      items: cyclingItems,
      state: createTypeaheadState(),
      activeId: 'apple',
      input: 'a',
      now: 0,
    });
    const second = findTypeaheadMatch({
      items: cyclingItems,
      state: first.state,
      input: 'a',
      now: 100,
    });
    const third = findTypeaheadMatch({
      items: cyclingItems,
      state: second.state,
      input: 'a',
      now: 200,
    });

    expect([first.match?.id, second.match?.id, third.match?.id]).toEqual([
      'apricot',
      'avocado',
      'apple',
    ]);
    expect(second.state.query).toBe('a');

    const emojiItems = [
      { id: 'apple-emoji', textValue: '👩‍💻 Apple' },
      { id: 'apricot-emoji', textValue: '👩‍💻 Apricot' },
    ];
    const emojiFirst = findTypeaheadMatch({
      items: emojiItems,
      state: createTypeaheadState(),
      activeId: 'apple-emoji',
      input: '👩‍💻',
      now: 300,
    });
    const emojiSecond = findTypeaheadMatch({
      items: emojiItems,
      state: emojiFirst.state,
      input: '👩‍💻',
      now: 400,
    });
    expect([emojiFirst.match?.id, emojiSecond.match?.id]).toEqual([
      'apricot-emoji',
      'apple-emoji',
    ]);
    expect(emojiSecond.state.query).toBe('👩‍💻');
  });

  it('timeout 뒤 query를 초기화하고 빈 입력·no match를 안전하게 처리한다', () => {
    const initial = findTypeaheadMatch({
      items,
      state: createTypeaheadState(),
      input: 'c',
      now: 0,
    });
    const expired = findTypeaheadMatch({
      items,
      state: initial.state,
      input: 'e',
      now: 701,
    });
    const empty = findTypeaheadMatch({
      items,
      state: expired.state,
      input: '',
      now: 702,
    });
    const missing = findTypeaheadMatch({
      items,
      state: createTypeaheadState(),
      input: 'z',
      now: 800,
    });

    expect(expired.state.query).toBe('e');
    expect(expired.match?.id).toBe('eclair');
    expect(empty.state).toBe(expired.state);
    expect(empty.matchIndex).toBe(-1);
    expect(missing.match).toBeNull();
    expect(missing.state.lastMatchId).toBeNull();
  });

  it('locale casing을 분해 전에 적용하고 의미 있는 비라틴 결합 문자를 보존한다', () => {
    const turkish = findTypeaheadMatch({
      items: [{ id: 'istanbul', textValue: 'İstanbul' }],
      state: createTypeaheadState(),
      input: 'i',
      now: 0,
      locale: 'tr',
    });
    const devanagari = [
      { id: 'short-i', textValue: 'कि' },
      { id: 'short-u', textValue: 'कु' },
    ] as const;
    const shortU = findTypeaheadMatch({
      items: devanagari,
      state: createTypeaheadState(),
      input: 'कु',
      now: 0,
    });

    expect(turkish.match?.id).toBe('istanbul');
    expect(shortU.match?.id).toBe('short-u');
  });
});

describe('v0.5 pure presence reducer', () => {
  it('enter motion 동안 mount·stack 참여를 유지하고 완료 후 present가 된다', () => {
    const unmounted = createPresenceState(false);
    const entering = presenceReducer(unmounted, {
      type: 'set-present',
      present: true,
      hasMotion: true,
    });

    expect(entering).toEqual({
      phase: 'entering',
      transitionId: 1,
      isMounted: true,
      isInteractive: true,
      participatesInOverlayStack: true,
    });
    expect(
      presenceReducer(entering, {
        type: 'animation-complete',
        phase: 'entering',
        transitionId: entering.transitionId,
      }),
    ).toEqual({ ...createPresenceState(true), transitionId: entering.transitionId });
  });

  it('exit motion 동안 시각 mount만 유지하고 interaction·stack에서 즉시 제외한다', () => {
    const exiting = presenceReducer(createPresenceState(true), {
      type: 'set-present',
      present: false,
      hasMotion: true,
    });

    expect(exiting).toEqual({
      phase: 'exiting',
      transitionId: 1,
      isMounted: true,
      isInteractive: false,
      participatesInOverlayStack: false,
    });
    expect(
      presenceReducer(exiting, {
        type: 'animation-complete',
        phase: 'exiting',
        transitionId: exiting.transitionId,
      }),
    ).toEqual({ ...createPresenceState(false), transitionId: exiting.transitionId });
  });

  it('exit 중 재open과 stale completion을 안전하게 처리한다', () => {
    const exiting = presenceReducer(createPresenceState(true), {
      type: 'set-present',
      present: false,
      hasMotion: true,
    });
    const reopening = presenceReducer(exiting, {
      type: 'set-present',
      present: true,
      hasMotion: true,
    });
    const afterStaleExit = presenceReducer(reopening, {
      type: 'animation-complete',
      phase: 'exiting',
      transitionId: exiting.transitionId,
    });

    expect(reopening.phase).toBe('entering');
    expect(afterStaleExit).toBe(reopening);
  });

  it('같은 phase가 다시 시작돼도 이전 animation completion을 거부한다', () => {
    const firstEnter = presenceReducer(createPresenceState(false), {
      type: 'set-present',
      present: true,
      hasMotion: true,
    });
    const exit = presenceReducer(firstEnter, {
      type: 'set-present',
      present: false,
      hasMotion: true,
    });
    const secondEnter = presenceReducer(exit, {
      type: 'set-present',
      present: true,
      hasMotion: true,
    });
    const staleFirstEnter = presenceReducer(secondEnter, {
      type: 'animation-complete',
      phase: 'entering',
      transitionId: firstEnter.transitionId,
    });

    expect(firstEnter.transitionId).not.toBe(secondEnter.transitionId);
    expect(staleFirstEnter).toBe(secondEnter);
  });

  it('motion이 없으면 동기적으로 mount/unmount한다', () => {
    const open = presenceReducer(createPresenceState(false), {
      type: 'set-present',
      present: true,
      hasMotion: false,
    });
    const closed = presenceReducer(open, {
      type: 'set-present',
      present: false,
      hasMotion: false,
    });

    expect(open.phase).toBe('present');
    expect(closed).toEqual({ ...createPresenceState(false), transitionId: 2 });
  });

  it('PresenceState 계약에 불일치 상태가 들어가지 않는다', () => {
    const states: PresenceState[] = [
      createPresenceState(false),
      createPresenceState(true),
      presenceReducer(createPresenceState(false), {
        type: 'set-present',
        present: true,
        hasMotion: true,
      }),
      presenceReducer(createPresenceState(true), {
        type: 'set-present',
        present: false,
        hasMotion: true,
      }),
    ];

    for (const state of states) {
      expect(state.participatesInOverlayStack).toBe(state.isInteractive);
      if (!state.isMounted) expect(state.isInteractive).toBe(false);
    }
  });
});
