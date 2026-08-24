/**
 * computeAnchoredPanelFrame — 네이티브 anchored 프레젠테이션의 순수 위치 수학.
 *
 * 웹 WebPopover와 같은 placement/sideOffset/collisionPadding 어휘를 공유하는지,
 * 충돌 시 flip/shift/clamp가 창 경계 안에서 결정적으로 동작하는지 고정한다.
 */
import { describe, expect, it } from 'vitest';
import { computeAnchoredPanelFrame } from '../../src/components/menu-select-anchored-position';

const WINDOW = { width: 400, height: 800 };

describe('computeAnchoredPanelFrame — anchored native frame math', () => {
  it('places bottom-start below the anchor with sideOffset and reports available space', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { x: 100, y: 100, width: 80, height: 40 },
      panel: { width: 160, height: 200 },
      window: WINDOW,
      sideOffset: 8,
    });
    expect(frame.left).toBe(100);
    expect(frame.top).toBe(148);
    expect(frame.placement).toBe('bottom-start');
    expect(frame.flipped).toBe(false);
    expect(frame.shifted).toBe(false);
    expect(frame.detached).toBe(false);
    // bottom 쪽 가용 높이 = 창 아래 경계 - anchor 하단 - sideOffset.
    expect(frame.maxHeight).toBe(800 - 140 - 8);
    expect(frame.maxWidth).toBe(400);
  });

  it('flips to the top side when the bottom overflows more', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { x: 100, y: 700, width: 80, height: 40 },
      panel: { width: 160, height: 200 },
      window: WINDOW,
    });
    expect(frame.placement).toBe('top-start');
    expect(frame.flipped).toBe(true);
    expect(frame.top).toBe(500);
    // top 쪽 가용 높이 = anchor 상단 - 창 위 경계.
    expect(frame.maxHeight).toBe(700);
  });

  it('shifts into the collision boundary when collisionPadding insets the window', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { x: 380, y: 100, width: 10, height: 40 },
      panel: { width: 100, height: 120 },
      window: WINDOW,
      collisionPadding: 16,
    });
    expect(frame.shifted).toBe(true);
    // 오른쪽 경계 400-16=384에 clamp: left = 384 - 100.
    expect(frame.left).toBe(284);
    expect(frame.maxWidth).toBe(400 - 16 * 2);
    expect(frame.maxHeight).toBe(800 - 16 - 140);
  });

  it('resolves rtl start alignment from the anchor end edge', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { x: 200, y: 100, width: 80, height: 40 },
      panel: { width: 120, height: 100 },
      window: WINDOW,
      direction: 'rtl',
    });
    // rtl에서 start는 anchor 오른쪽 끝 기준으로 왼쪽으로 뻗는다.
    expect(frame.left).toBe(280 - 120);
    expect(frame.top).toBe(140);
  });

  it('reports a detached anchor that left the collision boundary', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { x: 100, y: -100, width: 80, height: 40 },
      panel: { width: 120, height: 100 },
      window: WINDOW,
    });
    expect(frame.detached).toBe(true);
  });

  it('never returns negative max sizes even when the anchor pins the boundary edge', () => {
    const frame = computeAnchoredPanelFrame({
      anchor: { x: 0, y: 780, width: 400, height: 40 },
      panel: { width: 200, height: 100 },
      window: WINDOW,
      placement: 'bottom-start',
    });
    expect(frame.maxHeight).toBeGreaterThanOrEqual(0);
    expect(frame.maxWidth).toBeGreaterThanOrEqual(0);
  });
});
