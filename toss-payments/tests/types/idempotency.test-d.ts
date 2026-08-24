import { describe, expectTypeOf, it } from 'vitest';

import {
  CARD_ISSUER_NAMES_KO,
  CLASSIFIED_TOSS_ERROR_CODES,
  DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS,
  OUTCOME_QUERY_FIRST_ERROR_CODES,
  TOSS_IDEMPOTENCY_KEY_TTL_MS,
  cardIssuerName,
  deriveIdempotencyKey,
  isWithinIdempotencyReplayWindow,
  mustQueryOutcomeBeforeRetry,
} from '../../src/index';
import type {
  DeriveIdempotencyKeyInput,
  IdempotencyKey,
  InvalidInput,
  KnownCardIssuerCode,
  Result,
  TossApiFailure,
  TransportFailure,
} from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('deriveIdempotencyKey — Result 내로잉 + InvalidInput 필드 리터럴', () => {
  it('반환 타입은 Result<IdempotencyKey, InvalidInput<"idempotencyKey">>', () => {
    expectTypeOf(deriveIdempotencyKey).returns.toEqualTypeOf<
      Result<IdempotencyKey, InvalidInput<'idempotencyKey'>>
    >();
  });

  it('ok 내로잉 → 브랜드 IdempotencyKey (raw string 아님)', () => {
    const r = deriveIdempotencyKey({ operation: 'op', parts: ['a'] });
    if (r.ok) {
      expectTypeOf(r.value).toEqualTypeOf<IdempotencyKey>();
      const s: string = r.value; // 상향은 안전
      void s;
    } else {
      expectTypeOf(r.error.field).toEqualTypeOf<'idempotencyKey'>();
      expectTypeOf(r.error.reason).toEqualTypeOf<'too-short' | 'too-long' | 'bad-charset' | 'empty'>();
      expectTypeOf(r.error.source).toEqualTypeOf<'library'>();
    }
  });

  it('InvalidInput 필드 리터럴이 다른 파서와 섞이지 않는다', () => {
    const r = deriveIdempotencyKey({ operation: 'op', parts: ['a'] });
    if (!r.ok) {
      // @ts-expect-error field는 'idempotencyKey' 리터럴 — 'orderId'가 아니다
      const wrong: InvalidInput<'orderId'> = r.error;
      void wrong;
    }
  });

  it('parts는 readonly string[] — 불변 튜플/배열 모두 수용, 변이 메서드 기대 불가', () => {
    const frozen = ['a', 'b'] as const;
    deriveIdempotencyKey({ operation: 'op', parts: frozen }); // readonly 튜플 OK
    const mutable: string[] = ['a'];
    deriveIdempotencyKey({ operation: 'op', parts: mutable }); // mutable 배열도 OK (상향)
    expectTypeOf<DeriveIdempotencyKeyInput['parts']>().toEqualTypeOf<readonly string[]>();
    // @ts-expect-error readonly string[]에는 push가 없다
    forge<DeriveIdempotencyKeyInput>().parts.push('x');
  });

  it('parts 원소는 string만 — number/Date는 호출부가 직접 문자열화해야 한다', () => {
    // @ts-expect-error number 원소 불가
    deriveIdempotencyKey({ operation: 'op', parts: [1700000000000] });
    // @ts-expect-error Date 원소 불가
    deriveIdempotencyKey({ operation: 'op', parts: [new Date()] });
  });

  it('attempt는 string | undefined — exactOptionalPropertyTypes에서 undefined 명시 허용', () => {
    deriveIdempotencyKey({ operation: 'op', parts: ['a'], attempt: undefined });
    deriveIdempotencyKey({ operation: 'op', parts: ['a'], attempt: 'u' });
    // @ts-expect-error attempt는 number가 아니다
    deriveIdempotencyKey({ operation: 'op', parts: ['a'], attempt: 2 });
  });

  it('필수 필드 누락은 컴파일 에러', () => {
    // @ts-expect-error parts 누락
    deriveIdempotencyKey({ operation: 'op' });
    // @ts-expect-error operation 누락
    deriveIdempotencyKey({ parts: ['a'] });
  });

  it('산출 키는 브랜드라 raw string으로는 위조할 수 없다', () => {
    // @ts-expect-error raw string은 IdempotencyKey가 아니다
    const k: IdempotencyKey = 'op_a';
    void k;
  });
});

describe('isWithinIdempotencyReplayWindow — Date | number 혼용, boolean 반환', () => {
  it('시그니처', () => {
    expectTypeOf(isWithinIdempotencyReplayWindow).returns.toEqualTypeOf<boolean>();
    expectTypeOf(isWithinIdempotencyReplayWindow).parameter(0).toEqualTypeOf<Date | number>();
    expectTypeOf(isWithinIdempotencyReplayWindow).parameter(1).toEqualTypeOf<Date | number>();
    expectTypeOf(isWithinIdempotencyReplayWindow).parameter(2).toEqualTypeOf<number | undefined>();
  });

  it('ISO 문자열은 받지 않는다 — 파싱은 호출부 책임', () => {
    // @ts-expect-error string issuedAt 불가
    isWithinIdempotencyReplayWindow('2026-08-01T00:00:00Z', Date.now());
  });

  it('상수는 number', () => {
    expectTypeOf(TOSS_IDEMPOTENCY_KEY_TTL_MS).toEqualTypeOf<number>();
    expectTypeOf(DEFAULT_IDEMPOTENCY_REPLAY_WINDOW_MS).toEqualTypeOf<number>();
  });
});

describe('mustQueryOutcomeBeforeRetry — toss/network 실패만 수용', () => {
  it('TossApiFailure | TransportFailure 유니언을 받는다', () => {
    expectTypeOf(mustQueryOutcomeBeforeRetry).parameter(0).toEqualTypeOf<TossApiFailure | TransportFailure>();
    expectTypeOf(mustQueryOutcomeBeforeRetry).returns.toEqualTypeOf<boolean>();
    mustQueryOutcomeBeforeRetry(forge<TossApiFailure<'PROVIDER_ERROR'>>()); // 코드 제네릭 협착도 OK
    mustQueryOutcomeBeforeRetry(forge<TransportFailure>());
  });

  it('library 계열 에러(InvalidInput)는 받지 않는다 — API 미도달이라 조회할 결과가 없다', () => {
    // @ts-expect-error source: 'library'는 수용 대상이 아니다
    mustQueryOutcomeBeforeRetry(forge<InvalidInput<'idempotencyKey'>>());
    // @ts-expect-error raw code 문자열 불가
    mustQueryOutcomeBeforeRetry('PROVIDER_ERROR');
  });

  it('OUTCOME_QUERY_FIRST_ERROR_CODES는 readonly string[] — 변이 불가', () => {
    expectTypeOf(OUTCOME_QUERY_FIRST_ERROR_CODES).toEqualTypeOf<readonly string[]>();
    // @ts-expect-error readonly 배열에는 push가 없다
    OUTCOME_QUERY_FIRST_ERROR_CODES.push('X');
  });

  it('CLASSIFIED_TOSS_ERROR_CODES(코드 테이블 키)도 readonly string[] — 변이 불가', () => {
    expectTypeOf(CLASSIFIED_TOSS_ERROR_CODES).toEqualTypeOf<readonly string[]>();
    // @ts-expect-error readonly 배열에는 push가 없다
    CLASSIFIED_TOSS_ERROR_CODES.push('X');
  });
});

describe('카드 발급사 코드 표', () => {
  it('CARD_ISSUER_NAMES_KO는 Readonly<Record<KnownCardIssuerCode, string>>', () => {
    expectTypeOf(CARD_ISSUER_NAMES_KO).toEqualTypeOf<Readonly<Record<KnownCardIssuerCode, string>>>();
    expectTypeOf(CARD_ISSUER_NAMES_KO['21']).toEqualTypeOf<string>();
    // @ts-expect-error 동결 테이블 — 대입 불가
    CARD_ISSUER_NAMES_KO['21'] = '다른카드';
    // @ts-expect-error 미등록 코드는 키 타입 밖 (noUncheckedIndexedAccess와 무관하게 리터럴 키 검사)
    CARD_ISSUER_NAMES_KO['99'];
  });

  it('cardIssuerName(code: string, locale?: "ko") → string | undefined', () => {
    expectTypeOf(cardIssuerName).returns.toEqualTypeOf<string | undefined>();
    expectTypeOf(cardIssuerName).parameter(0).toEqualTypeOf<string>();
    expectTypeOf(cardIssuerName).parameter(1).toEqualTypeOf<'ko' | undefined>();
    cardIssuerName(forge<string>()); // 응답의 issuerCode(string)를 그대로 넘길 수 있다
    // @ts-expect-error 지원하지 않는 locale
    cardIssuerName('21', 'en');
    // @ts-expect-error 반환은 undefined 가능 — string에 바로 대입 불가
    const name: string = cardIssuerName('21');
    void name;
  });

  it('KnownCardIssuerCode는 string 서브타입이며 앱이 쓰는 코드를 포함한다', () => {
    expectTypeOf<KnownCardIssuerCode>().toExtend<string>();
    expectTypeOf<'11' | '21' | '3K' | '3A' | '46' | 'W1'>().toExtend<KnownCardIssuerCode>();
    // @ts-expect-error '99'는 문서화된 코드가 아니다
    const code: KnownCardIssuerCode = '99';
    void code;
  });
});
