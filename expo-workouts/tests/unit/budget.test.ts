// ReadBudget — 슬라이딩 윈도, 주입 클록, **절대 블로킹하지 않음** (설계 §5.2 · f102).

import { describe, expect, it } from 'vitest';

import { ReadBudget, workoutsErrorCode, type WorkoutsError } from '../../src/core';

function budgetAt(clock: { ms: number }): ReadBudget {
  return new ReadBudget({ now: () => clock.ms });
}

describe('ReadBudget — 15분 창 900건', () => {
  it('900건까지 통과하고 901번째를 거절한다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    for (let i = 0; i < 900; i += 1) budget.spend();
    expect(budget.usage().shortWindow).toBe(900);
    expect(workoutsErrorCode(catchOf(() => budget.spend()))).toBe('rateLimited');
  });

  it('거절된 호출은 아무것도 소비하지 않는다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    for (let i = 0; i < 900; i += 1) budget.spend();
    catchOf(() => budget.spend());
    catchOf(() => budget.spend());
    expect(budget.usage().shortWindow).toBe(900);
  });

  it('retryAfterMs가 가장 오래된 항목의 만료까지다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    for (let i = 0; i < 900; i += 1) budget.spend();
    clock.ms += 100_000;
    const error = catchOf(() => budget.spend()) as WorkoutsError;
    expect(error.code).toBe('rateLimited');
    expect(error.retryAfterMs).toBe(900_000 - 100_000);
  });

  it('창이 지나면 자리가 난다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    for (let i = 0; i < 900; i += 1) budget.spend();
    clock.ms += 900_000;
    expect(budget.retryAfterMs()).toBeNull();
    expect(() => budget.spend()).not.toThrow();
  });
});

describe('ReadBudget — 24시간 창 4500건', () => {
  it('짧은 창을 피해가도 긴 창이 잡는다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    // 15분마다 900건 = 5회면 4500건. 짧은 창은 매번 비어 있다.
    for (let round = 0; round < 5; round += 1) {
      for (let i = 0; i < 900; i += 1) budget.spend();
      clock.ms += 900_001;
    }
    expect(budget.usage().shortWindow).toBe(0);
    expect(budget.usage().longWindow).toBe(4500);
    expect(workoutsErrorCode(catchOf(() => budget.spend()))).toBe('rateLimited');
  });
});

describe('ReadBudget — 60초 폴링 시뮬레이션 (f102가 지목한 실제 사고)', () => {
  it('480회 폴링(8시간)을 견디고, 소진되면 소비자 어댑터가 계속 살아 있다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    let served = 0;
    let refused = 0;
    for (let poll = 0; poll < 480; poll += 1) {
      try {
        // 폴링 1회 = 워크아웃 페이지 1 + 심박 1.
        budget.spend(2);
        served += 1;
      } catch (error) {
        expect(workoutsErrorCode(error)).toBe('rateLimited');
        refused += 1;
      }
      clock.ms += 60_000;
    }
    expect(served).toBe(480);
    expect(refused).toBe(0);
    // 그리고 예산은 아직 남아 있다 — 8시간 폴링이 하루 예산의 5분의 1이다.
    expect(budget.usage().longWindow).toBe(960);
  });

  it('폭주하는 루프는 즉시 거절되고 **블로킹되지 않는다**', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    const started = Date.now();
    let refused = 0;
    for (let i = 0; i < 2000; i += 1) {
      try {
        budget.spend();
      } catch {
        refused += 1;
      }
    }
    expect(refused).toBe(1100);
    // 진짜 벽시계로 잰다 — 잠들었다면 여기서 드러난다.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('ReadBudget — retryAfterMs는 던지지 않는 프로브다', () => {
  it('자리가 있으면 null이다', () => {
    expect(new ReadBudget({ now: () => 0 }).retryAfterMs()).toBeNull();
  });

  it('count를 함께 물을 수 있다', () => {
    const clock = { ms: 1_755_000_000_000 };
    const budget = budgetAt(clock);
    for (let i = 0; i < 899; i += 1) budget.spend();
    expect(budget.retryAfterMs(1)).toBeNull();
    expect(budget.retryAfterMs(2)).not.toBeNull();
  });
});

function catchOf(run: () => unknown): unknown {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}
