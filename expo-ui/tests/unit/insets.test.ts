/**
 * "./insets" 순수 함수 unit 테스트 — 설계 문서 §7.
 *
 * memorylog2 원명 보존 함수들(sed 이관 대상). computeKeyboardRevealOffset는
 * apps/mobile/src/utils/keyboardReveal.ts 원본과 공식이 동일해야 한다 —
 * 유일한 차이는 KEYBOARD_REVEAL_MARGIN(16) 상수의 margin 옵션화(기본 16).
 *
 * 순수 함수만 검증하므로 훅 배럴(src/insets.ts) 대신 모듈을 직접 import한다
 * (safe-area-context peer 비의존 경로 — §7).
 */
import { describe, expect, it } from 'vitest';
import { nativeBottomInset, nativeBottomPadding } from '../../src/insets/safeArea';
import { computeKeyboardRevealOffset } from '../../src/insets/keyboardReveal';

// ─── §7 nativeBottomInset ──────────────────────────────────────────────────

describe('§7 nativeBottomInset', () => {
  it('web이면 inset이 있어도 항상 0', () => {
    expect(nativeBottomInset(34, 'web')).toBe(0);
    expect(nativeBottomInset(0, 'web')).toBe(0);
  });

  it('native면 max(0, inset) — 양수 inset 보존', () => {
    expect(nativeBottomInset(34, 'ios')).toBe(34);
    expect(nativeBottomInset(24, 'android')).toBe(24);
    expect(nativeBottomInset(0, 'ios')).toBe(0);
  });

  it('음수 inset 방어 — 0으로 클램프', () => {
    expect(nativeBottomInset(-10, 'ios')).toBe(0);
    expect(nativeBottomInset(-1, 'android')).toBe(0);
  });

  it('platformOS 기본값은 Platform.OS — RNW alias 테스트 환경에서는 web이라 0', () => {
    expect(nativeBottomInset(34)).toBe(0);
  });
});

// ─── §7 nativeBottomPadding ────────────────────────────────────────────────

describe('§7 nativeBottomPadding', () => {
  it('합산 규칙 — 디자인 패딩 + 실제 하단 inset (native)', () => {
    expect(nativeBottomPadding(16, 34, 'ios')).toBe(50);
    expect(nativeBottomPadding(0, 24, 'android')).toBe(24);
  });

  it('web이면 basePadding만 남는다', () => {
    expect(nativeBottomPadding(16, 34, 'web')).toBe(16);
  });

  it('음수 inset은 합산에서 제외된다(0 클램프) — basePadding을 깎지 않는다', () => {
    expect(nativeBottomPadding(16, -8, 'android')).toBe(16);
  });
});

// ─── §7 computeKeyboardRevealOffset — memorylog2 원본 의미 보존 ────────────

describe('§7 computeKeyboardRevealOffset — memorylog2 원본 의미 보존', () => {
  /** 대표 시나리오: 800pt 뷰포트, 300pt 키보드, 하단 바 없음. */
  const base = {
    currentOffset: 0,
    inputHeight: 40,
    inputTop: 600,
    keyboardInset: 300,
    reservedBottomHeight: 0,
    viewportHeight: 800,
  };

  it('키보드가 없으면(keyboardInset ≤ 0) null', () => {
    expect(computeKeyboardRevealOffset({ ...base, keyboardInset: 0 })).toBeNull();
    expect(computeKeyboardRevealOffset({ ...base, keyboardInset: -1 })).toBeNull();
  });

  it('가시 뷰포트가 0 이하로 붕괴하면 null (키보드+고정 바 ≥ 뷰포트)', () => {
    expect(
      computeKeyboardRevealOffset({ ...base, keyboardInset: 800 }),
    ).toBeNull();
    expect(
      computeKeyboardRevealOffset({ ...base, keyboardInset: 500, reservedBottomHeight: 300 }),
    ).toBeNull();
  });

  it('이미 충분히 보이는 입력이면 null — 위로 되끌어올리지 않는다', () => {
    // 입력이 뷰포트 상단부에 있음: target = 100+40+16-500 = -344 ≤ currentOffset+1
    expect(computeKeyboardRevealOffset({ ...base, inputTop: 100 })).toBeNull();
  });

  it('가려진 입력의 목표 오프셋 — 원본 공식 inputTop+inputHeight+margin−visibleViewport', () => {
    // visible = 800-300-0 = 500, target = 600+40+16-500 = 156
    expect(computeKeyboardRevealOffset(base)).toBe(156);
    // 고정 하단 바가 있으면 그만큼 더 올린다: visible = 800-300-60 = 440 → target = 216
    expect(computeKeyboardRevealOffset({ ...base, reservedBottomHeight: 60 })).toBe(216);
  });

  it('경계 규칙 — target ≤ currentOffset+1이면 null, 그 초과부터 반환 (원본 +1 여유 보존)', () => {
    // target = 156. currentOffset 155 → 156 ≤ 156 → null (1pt 이내 미세 차이는 무시)
    expect(computeKeyboardRevealOffset({ ...base, currentOffset: 155 })).toBeNull();
    // currentOffset 154 → 156 > 155 → 156 반환
    expect(computeKeyboardRevealOffset({ ...base, currentOffset: 154 })).toBe(156);
  });

  it('margin 옵션 반영 — 기본 16은 원본 KEYBOARD_REVEAL_MARGIN 상수와 동일', () => {
    // margin 명시 16 = 미명시(기본)와 동일 결과 — 원본 공식과의 등가 대조.
    expect(computeKeyboardRevealOffset({ ...base, margin: 16 })).toBe(156);
    // margin 0 → target = 640-500 = 140
    expect(computeKeyboardRevealOffset({ ...base, margin: 0 })).toBe(140);
    // margin 32 → target = 672-500 = 172
    expect(computeKeyboardRevealOffset({ ...base, margin: 32 })).toBe(172);
  });

  it('음수 목표 오프셋 방어 — max(0, …) (iOS 바운스 등 음수 currentOffset 상황)', () => {
    // visible = 500-100 = 400, target = 200+84+16-400 = -100.
    // currentOffset -200(오버스크롤) → -100 > -199이므로 반환 경로 진입 → max(0, -100) = 0.
    expect(
      computeKeyboardRevealOffset({
        currentOffset: -200,
        inputHeight: 84,
        inputTop: 200,
        keyboardInset: 100,
        reservedBottomHeight: 0,
        viewportHeight: 500,
      }),
    ).toBe(0);
  });
});
