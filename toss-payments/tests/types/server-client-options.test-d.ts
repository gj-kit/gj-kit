/**
 * §3.2/§3.3/§3.4 — TossClientOptions 확장 필드와 봉인 계약의 타입 회귀 고정.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { AuditEntry, AuditOptions, AuditSink } from '../../src/index';
import { createTossEvents } from '../../src/server';
import type { RetryOptions, TossClientOptions, TossEvent, TossEvents } from '../../src/server';

describe('TossClientOptions — v1.1 옵션 3종 (전부 옵셔널·기본 꺼짐, 기존 필드 불변)', () => {
  it('audit/retry/events 옵셔널 추가', () => {
    expectTypeOf<TossClientOptions['audit']>().toEqualTypeOf<AuditOptions | undefined>();
    expectTypeOf<TossClientOptions['retry']>().toEqualTypeOf<RetryOptions | undefined>();
    expectTypeOf<TossClientOptions['events']>().toEqualTypeOf<TossEvents | undefined>();
    // 기존 필드 존치
    expectTypeOf<TossClientOptions['timeoutMs']>().toEqualTypeOf<number | undefined>();
  });

  it('빈 옵션 = 현행 동작 — 아무 필드도 필수가 아니다', () => {
    const empty: TossClientOptions = {};
    expectTypeOf(empty).toMatchTypeOf<TossClientOptions>();
  });
});

describe('RetryOptions — §3.4 봉인 계약', () => {
  it('onRetry reason은 2종 리터럴로 봉인 — toss retryable류 확장은 공개 타입 변경 없인 불가', () => {
    type Info = Parameters<NonNullable<RetryOptions['onRetry']>>[0];
    expectTypeOf<Info['reason']>().toEqualTypeOf<'transport' | 'idempotent-processing'>();
    expectTypeOf<Info['attempt']>().toEqualTypeOf<number>();
    expectTypeOf<Info['nextDelayMs']>().toEqualTypeOf<number>();
    expectTypeOf<Info['path']>().toEqualTypeOf<string>();
    // reason에 'toss-retryable' 같은 값이 끼어들 수 없다
    const seal = (reason: Info['reason']) => reason;
    // @ts-expect-error reason 2종 리터럴 밖 — §7-3 기각(자동 재시도 신호 아님)
    seal('toss-retryable');
  });

  it('maxAttempts는 2|3|4|5 리터럴 유니언 — 폭주/무의미 설정 원천 차단', () => {
    expectTypeOf<NonNullable<RetryOptions['maxAttempts']>>().toEqualTypeOf<2 | 3 | 4 | 5>();
    // @ts-expect-error 1회는 재시도가 아니다
    const one: RetryOptions = { maxAttempts: 1 };
    // @ts-expect-error 6회 이상 폭주 차단
    const six: RetryOptions = { maxAttempts: 6 };
    void one;
    void six;
  });
});

describe('AuditEntry — §3.2 구조 봉인', () => {
  it('키 전수 고정 — Authorization/헤더 필드가 타입에 존재하지 않는다(구조적 부재)', () => {
    expectTypeOf<keyof AuditEntry>().toEqualTypeOf<
      | 'id'
      | 'at'
      | 'env'
      | 'method'
      | 'path'
      | 'attempt'
      | 'idempotencyKey'
      | 'requestBody'
      | 'durationMs'
      | 'traceId'
      | 'outcome'
    >();
  });

  it('outcome kind 3종 유니언 — 시도 1건 = 엔트리 1건(request/response 분리 kind 기각)', () => {
    expectTypeOf<AuditEntry['outcome']['kind']>().toEqualTypeOf<'ok' | 'toss-error' | 'transport'>();
    type Transport = Extract<AuditEntry['outcome'], { kind: 'transport' }>;
    expectTypeOf<Transport['code']>().toEqualTypeOf<'NETWORK_ERROR' | 'TIMEOUT'>();
  });

  it('AuditSink.record는 void | Promise<void> — 반환값이 흐름에 영향을 줄 수 없다', () => {
    expectTypeOf<ReturnType<AuditSink['record']>>().toEqualTypeOf<void | Promise<void>>();
  });
});

describe('TossEvents — §3.3 구독 전용 표면', () => {
  it("on 핸들러 이벤트가 이름별로 정밀 타이핑된다 ('api.call')", () => {
    const events = createTossEvents();
    expectTypeOf(events).toEqualTypeOf<TossEvents>();
    events.on('api.call', (event) => {
      expectTypeOf(event.type).toEqualTypeOf<'api.call'>();
      expectTypeOf(event.at).toEqualTypeOf<string>();
      expectTypeOf(event.outcome).toEqualTypeOf<'ok' | 'toss-error' | 'transport'>();
      expectTypeOf(event.httpStatus).toEqualTypeOf<number | null>();
      expectTypeOf(event.attempts).toEqualTypeOf<number>();
    });
    // 구독 해제 함수 반환
    expectTypeOf(events.on('api.call', () => undefined)).toEqualTypeOf<() => void>();
  });

  it('존재하지 않는 이벤트 이름·emit 접근은 컴파일 에러', () => {
    const events = createTossEvents();
    // @ts-expect-error 존재하지 않는 이벤트 — 웹훅에 없는 이벤트를 만들어내지 않는다(과설계 금지)
    events.on('billing.deleted', () => undefined);
    // @ts-expect-error 공개 표면은 구독 전용 — emit은 내부 인터페이스로만 흐른다
    void events.emit;
  });

  it('TossEvent 판별 유니언 — type으로 내로잉된다', () => {
    const handle = (event: TossEvent) => {
      if (event.type === 'api.call') {
        expectTypeOf(event.attempts).toEqualTypeOf<number>();
      }
    };
    void handle;
  });
});
