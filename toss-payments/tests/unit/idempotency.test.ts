import { describe, expect, it } from 'vitest';

import {
  CLASSIFIED_TOSS_ERROR_CODES,
  DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS,
  OUTCOME_QUERY_FIRST_ERROR_CODES,
  TOSS_IDEMPOTENCY_KEY_TTL_MS,
  classifyTossErrorCode,
  deriveIdempotencyKey,
  idempotencyKey,
  isErr,
  isOk,
  isWithinIdempotencyReplayWindow,
  mustQueryOutcomeBeforeRetry,
} from '../../src/index';
import type { TossApiFailure, TransportFailure } from '../../src/index';

const DAY_MS = 24 * 60 * 60 * 1000;

function tossFailure(code: string, httpStatus = 400): TossApiFailure {
  const { category, retryable } = classifyTossErrorCode(code);
  return { source: 'toss', code, message: '', httpStatus, category, retryable, traceId: null };
}

function transportFailure(code: TransportFailure['code']): TransportFailure {
  return { source: 'network', code, retryable: true, cause: new Error('boom') };
}

describe('TTL 상수 — 문서(15일) / 기본 재생 창(14일, 하루 여유)', () => {
  it('TOSS_IDEMPOTENCY_KEY_TTL_MS = 15일', () => {
    expect(TOSS_IDEMPOTENCY_KEY_TTL_MS).toBe(15 * DAY_MS);
  });

  it('DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS = 14일 — provider TTL보다 정확히 하루 짧다', () => {
    expect(DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS).toBe(14 * DAY_MS);
    expect(TOSS_IDEMPOTENCY_KEY_TTL_MS - DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS).toBe(DAY_MS);
  });
});

describe('deriveIdempotencyKey — 결정적 유도 + 기존 파서 1회 검증', () => {
  const keyOf = (input: Parameters<typeof deriveIdempotencyKey>[0]): string | null => {
    const r = deriveIdempotencyKey(input);
    return isOk(r) ? r.value : null;
  };

  it('같은 입력 → 같은 키 (결정성)', () => {
    const a = deriveIdempotencyKey({ operation: 'subscription_renewal', parts: ['sub_1', '1700000000000'] });
    const b = deriveIdempotencyKey({ operation: 'subscription_renewal', parts: ['sub_1', '1700000000000'] });
    expect(isOk(a) && isOk(b)).toBe(true);
    if (isOk(a) && isOk(b)) expect(a.value).toBe(b.value);
  });

  it('형식 — <operation>:<parts…>, attempt가 있으면 #<attempt> 접미사', () => {
    expect(keyOf({ operation: 'billing_initial_charge', parts: ['intent-42'] })).toBe(
      'billing_initial_charge:intent-42',
    );
    expect(keyOf({ operation: 'billing_initial_charge', parts: ['intent-42'], attempt: 'a1b2c3' })).toBe(
      'billing_initial_charge:intent-42#a1b2c3',
    );
    expect(keyOf({ operation: 'subscription_renewal', parts: ['sub_01', '1756652400000'] })).toBe(
      'subscription_renewal:sub_01:1756652400000',
    );
  });

  it('attempt가 다르면 키가 다르고, attempt 없음 ≠ attempt 있음', () => {
    const values = [
      keyOf({ operation: 'op', parts: ['x'] }),
      keyOf({ operation: 'op', parts: ['x'], attempt: '1' }),
      keyOf({ operation: 'op', parts: ['x'], attempt: '2' }),
    ];
    expect(new Set(values).size).toBe(3);
    expect(values).not.toContain(null);
  });

  it('parts가 비어 있으면 키는 operation 그대로 (꼬리 구분자 없음)', () => {
    expect(keyOf({ operation: 'solo', parts: [] })).toBe('solo');
    expect(keyOf({ operation: 'solo', parts: [], attempt: 'u' })).toBe('solo#u');
  });

  it('attempt: undefined는 생략과 동일하다', () => {
    expect(keyOf({ operation: 'op', parts: ['x'], attempt: undefined })).toBe(keyOf({ operation: 'op', parts: ['x'] }));
  });

  it('산출 키는 공개 idempotencyKey 파서를 그대로 통과한다', () => {
    const r = deriveIdempotencyKey({ operation: 'sub', parts: ['id', 'renewal', '1', '2'], attempt: 'u' });
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(isOk(idempotencyKey(r.value))).toBe(true);
  });

  it('단사성 — 세그먼트 안의 밑줄은 구분자와 충돌하지 않는다 (리뷰 프로브 입력 전부 상이)', () => {
    // 이전 설계(`_` 구분자 + `__attempt_` 마커)에서 전부 같은 키로 뭉치던 입력들
    const probes = [
      keyOf({ operation: 'renewal', parts: ['sub1'], attempt: 'k' }),
      keyOf({ operation: 'renewal', parts: ['sub1', '_attempt_k'] }),
      keyOf({ operation: 'renewal', parts: ['sub1_', 'attempt_k'] }),
      keyOf({ operation: 'renewal', parts: ['sub1__attempt_k'] }),
      keyOf({ operation: 'renewal_sub1', parts: [], attempt: 'k' }),
    ];
    expect(probes).not.toContain(null);
    expect(new Set(probes).size).toBe(probes.length);

    const underscoreSplits = [
      keyOf({ operation: 'op', parts: ['sub_12', '3'] }),
      keyOf({ operation: 'op', parts: ['sub', '12_3'] }),
      keyOf({ operation: 'op', parts: ['sub_12_3'] }),
      keyOf({ operation: 'op', parts: ['a_', 'b'] }),
      keyOf({ operation: 'op', parts: ['a', '_b'] }),
    ];
    expect(underscoreSplits).not.toContain(null);
    expect(new Set(underscoreSplits).size).toBe(underscoreSplits.length);

    // ['x_', 'attempt_abc'] (attempt 없음) vs attempt: 'abc' — 리뷰에서 지목한 정확한 쌍
    expect(keyOf({ operation: 'op', parts: ['x_', 'attempt_abc'] })).not.toBe(
      keyOf({ operation: 'op', parts: ['x'], attempt: 'abc' }),
    );
  });

  it('구분자(`:`/`#`)가 세그먼트에 들어오면 bad-charset — 단사성의 근거', () => {
    for (const input of [
      { operation: 'op:x', parts: ['a'] },
      { operation: 'op', parts: ['a:b'] },
      { operation: 'op', parts: ['a#b'] },
      { operation: 'op', parts: ['a'], attempt: 'u#1' },
      { operation: 'op', parts: ['a'], attempt: 'u:1' },
      { operation: 'op', parts: ['2026-09-01T00:00:00+09:00'] }, // ISO 타임스탬프 — epoch/날짜만 쓰라는 규칙
    ]) {
      const r = deriveIdempotencyKey(input);
      expect(isErr(r) ? r.error.reason : null, JSON.stringify(input)).toBe('bad-charset');
    }
  });

  it('헤더 안전 문자셋 — 한글·CR/LF·공백은 bad-charset (Ok ⇒ 전송 가능)', () => {
    for (const input of [
      { operation: 'subscription_renewal', parts: ['구독-01', '1700000000000'] },
      { operation: 'op', parts: ['a\r\nb'] },
      { operation: 'op', parts: ['a\nb'] },
      { operation: 'op', parts: ['a b'] },
      { operation: 'op', parts: ['a\tb'] },
      { operation: 'op', parts: ['café'] },
      { operation: '주문', parts: ['a'] },
      { operation: 'op', parts: ['a'], attempt: '시도1' },
    ]) {
      const r = deriveIdempotencyKey(input);
      expect(isErr(r) ? r.error.reason : null, JSON.stringify(input)).toBe('bad-charset');
    }
  });

  it('라이브러리가 이미 검증하는 id 문자셋(orderId/customerKey/cancelRequestId/UUID)은 그대로 통과한다', () => {
    expect(
      keyOf({
        operation: 'refund',
        parts: ['order_2026-08_x', 'user@example.com', 'req=01.a', '1a2b3c4d-0000-4000-8000-000000000000'],
        attempt: '7f3e2d1c-aaaa-4bbb-8ccc-dddddddddddd',
      }),
    ).toBe(
      'refund:order_2026-08_x:user@example.com:req=01.a:1a2b3c4d-0000-4000-8000-000000000000#7f3e2d1c-aaaa-4bbb-8ccc-dddddddddddd',
    );
  });

  it('빈 세그먼트(operation/part/attempt) → reason empty', () => {
    const emptyOp = deriveIdempotencyKey({ operation: '', parts: ['x'] });
    const emptyPart = deriveIdempotencyKey({ operation: 'op', parts: ['x', ''] });
    const emptyAttempt = deriveIdempotencyKey({ operation: 'op', parts: ['x'], attempt: '' });
    for (const r of [emptyOp, emptyPart, emptyAttempt]) {
      expect(isErr(r)).toBe(true);
      if (isErr(r)) {
        expect(r.error).toEqual({
          source: 'library',
          kind: 'invalid-input',
          field: 'idempotencyKey',
          reason: 'empty',
        });
      }
    }
  });

  it('300자 초과 → too-long (파서 규칙이 단일 출처)', () => {
    const r = deriveIdempotencyKey({ operation: 'op', parts: ['p'.repeat(300)] });
    expect(isErr(r) ? r.error.reason : null).toBe('too-long');
    // 경계: 정확히 300자는 통과
    const exact = deriveIdempotencyKey({ operation: 'op', parts: ['p'.repeat(297)] }); // 'op:' + 297 = 300
    expect(isOk(exact)).toBe(true);
    if (isOk(exact)) expect(exact.value.length).toBe(300);
  });
});

describe('isWithinIdempotencyReplayWindow — elapsed < windowMs (상한 배타)', () => {
  const issuedAt = Date.UTC(2026, 7, 1, 0, 0, 0);

  it('경계: 14일 - 1ms는 안, 정확히 14일은 밖 (기본 창)', () => {
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt + DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS - 1)).toBe(
      true,
    );
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt + DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS)).toBe(
      false,
    );
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt + 15 * DAY_MS)).toBe(false);
  });

  it('elapsed 0은 안 (방금 발급)', () => {
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt)).toBe(true);
  });

  it('음수 elapsed(issuedAt이 now보다 미래 — 시계 편차)는 안으로 본다', () => {
    expect(isWithinIdempotencyReplayWindow(issuedAt + 60_000, issuedAt)).toBe(true);
  });

  it('Date와 number를 섞어 받는다', () => {
    expect(isWithinIdempotencyReplayWindow(new Date(issuedAt), issuedAt + DAY_MS)).toBe(true);
    expect(isWithinIdempotencyReplayWindow(issuedAt, new Date(issuedAt + 20 * DAY_MS))).toBe(false);
  });

  it('windowMs 명시 — provider TTL 15일을 직접 쓰면 15일 - 1ms까지 안', () => {
    expect(
      isWithinIdempotencyReplayWindow(issuedAt, issuedAt + 15 * DAY_MS - 1, TOSS_IDEMPOTENCY_KEY_TTL_MS),
    ).toBe(true);
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt + 15 * DAY_MS, TOSS_IDEMPOTENCY_KEY_TTL_MS)).toBe(
      false,
    );
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt + 1, 1)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt, 1)).toBe(true);
  });

  it('비유한 입력(Invalid Date / NaN / ±Infinity)은 false — 재전송하지 않는 쪽', () => {
    expect(isWithinIdempotencyReplayWindow(new Date('not-a-date'), issuedAt)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, Number.NaN)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt, Number.NaN)).toBe(false);
    // ±Infinity — 단순 `elapsed < windowMs`라면 "안"으로 새던 케이스
    expect(isWithinIdempotencyReplayWindow(Number.POSITIVE_INFINITY, issuedAt)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt + DAY_MS, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(Number.NEGATIVE_INFINITY, issuedAt)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(issuedAt, issuedAt, Number.NEGATIVE_INFINITY)).toBe(false);
    expect(isWithinIdempotencyReplayWindow(new Date(Number.POSITIVE_INFINITY), issuedAt)).toBe(false);
  });
});

describe('OUTCOME_QUERY_FIRST_ERROR_CODES — 문서화된 집합 고정', () => {
  it('확정 표 그대로 (추가·삭제는 changeset 대상)', () => {
    expect([...OUTCOME_QUERY_FIRST_ERROR_CODES]).toEqual([
      'ALREADY_PROCESSED_PAYMENT',
      'IDEMPOTENT_REQUEST_PROCESSING',
      'FORBIDDEN_CONSECUTIVE_REQUEST',
      'PROVIDER_ERROR',
      'FAILED_INTERNAL_SYSTEM_PROCESSING',
      'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
      'COMMON_ERROR',
      'FAILED_REFUND_PROCESS',
      'FAILED_METHOD_HANDLING_CANCEL',
      'FAILED_PARTIAL_REFUND',
      'FAILED_BILLING_AUTO_CANCEL',
      'FAILED_BILL_KEY_AUTH_CREATION',
    ]);
    expect(Object.isFrozen(OUTCOME_QUERY_FIRST_ERROR_CODES)).toBe(true);
  });

  it('불변식: 집합의 모든 코드는 retryable이거나 ALREADY_PROCESSED_PAYMENT다', () => {
    for (const code of OUTCOME_QUERY_FIRST_ERROR_CODES) {
      const { retryable } = classifyTossErrorCode(code);
      expect(retryable || code === 'ALREADY_PROCESSED_PAYMENT', code).toBe(true);
    }
  });

  it('불변식 역방향: 코드 테이블(CLASSIFIED_TOSS_ERROR_CODES)의 retryable 코드 전부가 집합에 있다', () => {
    // 단일 출처에서 유도 — errors.ts에 RETRY 항목을 추가하면서 집합에 빠뜨리면 여기서 실패한다
    const retryableCodes = CLASSIFIED_TOSS_ERROR_CODES.filter((code) => classifyTossErrorCode(code).retryable);
    expect(retryableCodes.length).toBe(11); // CONCURRENCY 2 + TRANSIENT 9 — 바뀌면 changeset 대상
    for (const code of retryableCodes) {
      expect(OUTCOME_QUERY_FIRST_ERROR_CODES, code).toContain(code);
    }
    // 집합 쪽 초과분은 ALREADY_PROCESSED_PAYMENT 하나뿐
    const extras = OUTCOME_QUERY_FIRST_ERROR_CODES.filter((code) => !retryableCodes.includes(code));
    expect(extras).toEqual(['ALREADY_PROCESSED_PAYMENT']);
  });

  it('CLASSIFIED_TOSS_ERROR_CODES — 동결, 전부 non-UNKNOWN, 미등록 코드는 UNKNOWN', () => {
    expect(Object.isFrozen(CLASSIFIED_TOSS_ERROR_CODES)).toBe(true);
    expect(CLASSIFIED_TOSS_ERROR_CODES.length).toBeGreaterThan(0);
    for (const code of CLASSIFIED_TOSS_ERROR_CODES) {
      expect(classifyTossErrorCode(code).category, code).not.toBe('UNKNOWN');
    }
    expect(CLASSIFIED_TOSS_ERROR_CODES).not.toContain('SOME_FUTURE_CODE');
    expect(classifyTossErrorCode('SOME_FUTURE_CODE').category).toBe('UNKNOWN');
  });
});

describe('mustQueryOutcomeBeforeRetry — source/code 판정, HTTP status 무관', () => {
  it('transport 실패(NETWORK_ERROR/TIMEOUT)는 항상 true', () => {
    expect(mustQueryOutcomeBeforeRetry(transportFailure('NETWORK_ERROR'))).toBe(true);
    expect(mustQueryOutcomeBeforeRetry(transportFailure('TIMEOUT'))).toBe(true);
  });

  it('앱이 손으로 굴리던 3종(ALREADY_PROCESSED_PAYMENT/IDEMPOTENT_REQUEST_PROCESSING/FORBIDDEN_CONSECUTIVE_REQUEST) → true', () => {
    expect(mustQueryOutcomeBeforeRetry(tossFailure('ALREADY_PROCESSED_PAYMENT', 400))).toBe(true);
    expect(mustQueryOutcomeBeforeRetry(tossFailure('IDEMPOTENT_REQUEST_PROCESSING', 409))).toBe(true);
    expect(mustQueryOutcomeBeforeRetry(tossFailure('FORBIDDEN_CONSECUTIVE_REQUEST', 403))).toBe(true);
  });

  it('PROVIDER_ERROR는 400이어도 true — status가 아닌 코드 판정', () => {
    expect(mustQueryOutcomeBeforeRetry(tossFailure('PROVIDER_ERROR', 400))).toBe(true);
  });

  it('TRANSIENT 500 계열 전부 true', () => {
    for (const code of [
      'FAILED_INTERNAL_SYSTEM_PROCESSING',
      'FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING',
      'COMMON_ERROR',
      'FAILED_REFUND_PROCESS',
      'FAILED_METHOD_HANDLING_CANCEL',
      'FAILED_PARTIAL_REFUND',
      'FAILED_BILLING_AUTO_CANCEL',
      'FAILED_BILL_KEY_AUTH_CREATION',
    ]) {
      expect(mustQueryOutcomeBeforeRetry(tossFailure(code, 500)), code).toBe(true);
    }
  });

  it('확정 거절(REJECTED/AUTH/REQUEST/AMOUNT/STATE/DEADLINE)은 false', () => {
    for (const [code, status] of [
      ['REFUND_REJECTED', 400],
      ['REJECT_CARD_PAYMENT', 400],
      ['PAY_PROCESS_ABORTED', 400],
      ['UNAUTHORIZED_KEY', 401],
      ['INVALID_API_KEY', 400],
      ['INVALID_REQUEST', 400],
      ['INVALID_IDEMPOTENCY_KEY', 400],
      ['NOT_CANCELABLE_AMOUNT', 403],
      ['ALREADY_CANCELED_PAYMENT', 400],
      ['NOT_FOUND_PAYMENT', 404],
      ['NOT_FOUND_PAYMENT_SESSION', 404],
      ['ALREADY_REMOVED_BILLING_KEY', 400],
    ] as const) {
      expect(mustQueryOutcomeBeforeRetry(tossFailure(code, status)), code).toBe(false);
    }
  });

  it('NOT_MATCHES_REFUNDABLE_AMOUNT는 false — 실측상 취소 미실행(재조회는 금액 재계산용)', () => {
    expect(mustQueryOutcomeBeforeRetry(tossFailure('NOT_MATCHES_REFUNDABLE_AMOUNT', 400))).toBe(false);
  });

  it('미등록 코드는 false — 5xx여도 status로 판정하지 않는다', () => {
    expect(mustQueryOutcomeBeforeRetry(tossFailure('SOME_FUTURE_CODE', 500))).toBe(false);
    expect(mustQueryOutcomeBeforeRetry(tossFailure('FAILED_DB_PROCESSING', 500))).toBe(false);
  });

  it('failure 객체의 retryable/category 필드가 아닌 code로만 판정한다', () => {
    // 잘못 각인된 객체(retryable: true인데 확정 거절 코드)도 코드 기준으로 false
    const forged: TossApiFailure = {
      source: 'toss',
      code: 'REFUND_REJECTED',
      message: '',
      httpStatus: 500,
      category: 'TRANSIENT',
      retryable: true,
      traceId: null,
    };
    expect(mustQueryOutcomeBeforeRetry(forged)).toBe(false);
  });
});
