// 클라이언트측 읽기 페이서 (설계 §5.2 · 채택 #24 · f102).
//
// 왜 `./core`인가 — 예산 정책(거절하되 **절대 블로킹하지 않는다**), 슬라이딩 윈도, `retryAfterMs`
// 산술이 전부 Node에서 테스트 가능해야 하기 때문이다. 세 후보안은 이것을 Kotlin에 뒀고,
// 그러면 `pnpm test`가 닿지 못한다.

import { WorkoutsError } from './errors';

/** 15분 창의 한도. 측정 상수 1000의 90 % — 그 값은 서버 푸시라 Mainline 업데이트로 움직인다. */
const SHORT_WINDOW_MS = 900_000;
const SHORT_WINDOW_LIMIT = 900;
/** 24시간 창의 한도. 측정 상수 5000의 90 %. */
const LONG_WINDOW_MS = 86_400_000;
const LONG_WINDOW_LIMIT = 4_500;

export interface ReadBudgetOptions {
  /** 주입 클록. 테스트가 시간을 소유한다. */
  readonly now?: (() => number) | undefined;
}

/**
 * The client-side read pacer.
 *
 * Budgets: 900 / 15 min and 4 500 / 24 h — 10 % under the measured device constants (1000 / 5000),
 * because those are server-pushed and a Mainline update can move them.
 *
 * It NEVER blocks: it refuses an over-budget call BEFORE the platform call with `rateLimited` and a
 * computed `retryAfterMs`. Sleeping inside a 60-second poll would stall the consumer's whole
 * single-flight pipeline.
 *
 * ⚠ Process-local and blind to another health library in the same app: Health Connect's own limiter
 *   is per-uid, so during a migration off another library our accounting is optimistic.
 */
export class ReadBudget {
  private readonly now: () => number;
  private readonly spends: number[] = [];

  constructor(options?: ReadBudgetOptions) {
    this.now = options?.now ?? ((): number => Date.now());
  }

  private prune(at: number): void {
    while (this.spends.length > 0) {
      const oldest = this.spends[0];
      if (oldest === undefined || at - oldest < LONG_WINDOW_MS) break;
      this.spends.shift();
    }
  }

  private countSince(at: number, spanMs: number): number {
    let count = 0;
    for (let i = this.spends.length - 1; i >= 0; i -= 1) {
      const spend = this.spends[i];
      if (spend === undefined || at - spend >= spanMs) break;
      count += 1;
    }
    return count;
  }

  /**
   * `null` when `count` more reads fit right now; otherwise the milliseconds to wait before the
   * oldest blocking spend leaves its window. NEVER blocks and NEVER throws.
   */
  retryAfterMs(count = 1): number | null {
    const at = this.now();
    this.prune(at);
    let wait = 0;
    for (const [spanMs, limit] of [
      [SHORT_WINDOW_MS, SHORT_WINDOW_LIMIT],
      [LONG_WINDOW_MS, LONG_WINDOW_LIMIT],
    ] as const) {
      const used = this.countSince(at, spanMs);
      if (used + count <= limit) continue;
      // 가장 오래된 "막고 있는" 항목이 창을 벗어나야 자리가 난다.
      const index = this.spends.length - used + (count - (limit - used)) - 1;
      const blocking = this.spends[Math.max(0, index)];
      if (blocking === undefined) return spanMs;
      wait = Math.max(wait, spanMs - (at - blocking));
    }
    return wait > 0 ? wait : null;
  }

  /**
   * Charge `count` reads, or refuse with `rateLimited` + `retryAfterMs` BEFORE the platform call.
   * Nothing is charged when it refuses.
   */
  spend(count = 1): void {
    const wait = this.retryAfterMs(count);
    if (wait !== null) {
      throw new WorkoutsError(
        'rateLimited',
        'The client-side read budget for this process is exhausted. Wait for retryAfterMs.',
        { retryAfterMs: wait },
      );
    }
    const at = this.now();
    for (let i = 0; i < count; i += 1) this.spends.push(at);
  }

  /** 진단용 — 두 창의 현재 사용량. */
  usage(): { readonly shortWindow: number; readonly longWindow: number } {
    const at = this.now();
    this.prune(at);
    return {
      shortWindow: this.countSince(at, SHORT_WINDOW_MS),
      longWindow: this.countSince(at, LONG_WINDOW_MS),
    };
  }
}
