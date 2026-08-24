// 결정성 — 설계 문서 §1-2 · §5.1 마지막 항목.
//
// 초판 설계의 결정성 테스트는 "인스턴트 기반 검증"이라며 문자열 경로를 스스로 회피했고,
// 그래서 `assumeNoOffset` 구멍이 골든·결정성 양쪽에서 관측되지 않았다. 여기서는 문자열
// 입력까지 포함해 두 방향을 모두 고정한다:
//   - 기기 비의존 경로는 TZ가 바뀌어도 **같아야 한다**.
//   - `'device'` 경로는 TZ가 바뀌면 **달라져야 한다** — 그 의존성 자체가 계약이다.
import { describe, expect, it } from 'vitest';

import { formatDateTime, formatRelativeKo, parseIsoInstant } from '../../src/index';
import { restoreTz, underTz, useTzRestore } from '../tz';

useTzRestore();

const ZONES = ['Asia/Seoul', 'America/New_York', 'UTC'];

// 파일 최상단 — 아직 아무도 TZ를 건드리지 않은 시점의 진짜 기기 시간대.
const SYSTEM_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

describe('하네스 자신의 TZ 복원 — 이 파일의 모든 device 단언이 여기 걸려 있다', () => {
  it("복원은 문자열 'undefined'가 아니라 원래 상태다", () => {
    underTz('America/New_York', () => undefined);
    restoreTz();
    // `process.env.TZ = undefined`는 `'undefined'`를 대입한다. TZ가 export되지 않은
    // 머신(CI 포함)에서 그러면 이후의 `'device'`는 기기가 아니라 날조된 존이 된다.
    expect(process.env.TZ).not.toBe('undefined');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe(SYSTEM_ZONE);
  });
});

describe('기기 비의존 경로는 TZ에 불변', () => {
  it('명시 시간대의 날짜 렌더', () => {
    const epochMs = Date.UTC(2026, 5, 8, 9, 5, 0);
    const rendered = ZONES.map((tz) =>
      underTz(tz, () => formatDateTime(epochMs, { timeZone: 'Asia/Seoul', separator: '-' })),
    );
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toBe('2026-06-08 18:05');
  });

  it("문자열 입력도 포함 — parseIsoInstant(assumeNoOffset:'utc')", () => {
    const parsed = ZONES.map((tz) =>
      underTz(tz, () =>
        parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'utc' })?.getTime(),
      ),
    );
    expect(new Set(parsed).size).toBe(1);
    expect(parsed[0]).toBe(Date.UTC(2026, 5, 8, 9, 5, 0));
  });

  it('offset이 붙은 문자열도 TZ와 무관', () => {
    const parsed = ZONES.map((tz) =>
      underTz(tz, () =>
        parseIsoInstant('2026-06-08T09:05:00+09:00', { assumeNoOffset: 'device' })?.getTime(),
      ),
    );
    expect(new Set(parsed).size).toBe(1);
  });

  it('상대시간은 명시 now만 읽는다', () => {
    const now = new Date(Date.UTC(2026, 5, 8, 11, 24, 43));
    const value = new Date(now.getTime() - 5 * 60_000);
    const rendered = ZONES.map((tz) =>
      underTz(tz, () =>
        formatRelativeKo(value, { now, suffixSpace: true, fallback: '-', onFuture: 'empty' }),
      ),
    );
    expect(new Set(rendered).size).toBe(1);
    expect(rendered[0]).toBe('5분 전');
  });
});

describe("'device' 경로는 TZ에 따라 달라진다 — 그것이 계약이다", () => {
  it('렌더 시간대', () => {
    const epochMs = Date.UTC(2026, 5, 8, 9, 5, 0);
    const seoul = underTz('Asia/Seoul', () =>
      formatDateTime(epochMs, { timeZone: 'device', separator: '-' }),
    );
    const newYork = underTz('America/New_York', () =>
      formatDateTime(epochMs, { timeZone: 'device', separator: '-' }),
    );
    expect(seoul).toBe('2026-06-08 18:05');
    expect(newYork).toBe('2026-06-08 05:05');
    expect(seoul).not.toBe(newYork);
  });

  it("파싱 시간대 — assumeNoOffset:'device'", () => {
    const seoul = underTz('Asia/Seoul', () =>
      parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'device' })?.getTime(),
    );
    const newYork = underTz('America/New_York', () =>
      parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'device' })?.getTime(),
    );
    expect(seoul).toBe(Date.UTC(2026, 5, 8, 0, 5, 0));
    expect(newYork).toBe(Date.UTC(2026, 5, 8, 13, 5, 0));
  });
});
