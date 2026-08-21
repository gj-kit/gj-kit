/**
 * §3 서두 — SQL 식별자 봉쇄. 설정 문자열이 SQL에 보간되는 유일한 지점이므로,
 * 이 정규식 하나가 이 패키지의 SQL 주입 표면 전체다.
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import {
  DEFAULT_SCHEMA,
  IDENTIFIER_PATTERN,
  assertSqlIdentifier,
  quoteSqlIdentifier,
  schemaRef,
} from '../../src/identifiers';
import { createPgOrderStore } from '../../src/stores/orders';
import { createFakeSql } from './helpers/fake-sql';

describe('§3 assertSqlIdentifier — 허용 형식', () => {
  it.each([
    'toss_payments',
    'a',
    '_leading_underscore',
    'a1_b2_c3',
    'user', // 예약어도 허용 — 인용(quote)이 처리한다
    'a'.repeat(63), // 최대 63자
  ])("유효 식별자 '%s'는 원본 그대로 반환된다", (value) => {
    expect(assertSqlIdentifier(value, 'schema')).toBe(value);
  });

  it.each([
    ['', '빈 문자열'],
    ['Toss', '대문자'],
    ['1abc', '숫자 시작'],
    ['a-b', '하이픈'],
    ['a b', '공백'],
    ['a"b', '큰따옴표 — 인용 탈출 시도'],
    ['a;DROP TABLE x', 'SQL 주입 시도'],
    ['스키마', '비ASCII'],
    ['a'.repeat(64), '64자 초과'],
  ])("무효 식별자 '%s'(%s)는 invalid-identifier로 throw한다", (value) => {
    let thrown: unknown;
    try {
      assertSqlIdentifier(value, 'schema');
    } catch (error) {
      thrown = error;
    }
    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-identifier');
  });
});

describe('§3 quoteSqlIdentifier / schemaRef', () => {
  it('검증 통과 식별자를 큰따옴표로 인용한다', () => {
    expect(quoteSqlIdentifier('my_schema', 'schema')).toBe('"my_schema"');
  });

  it('schemaRef는 미지정 시 기본 스키마를 인용해 반환한다', () => {
    expect(DEFAULT_SCHEMA).toBe('toss_payments');
    expect(schemaRef(undefined)).toBe('"toss_payments"');
    expect(schemaRef('custom_schema')).toBe('"custom_schema"');
  });

  it('IDENTIFIER_PATTERN은 공개 계약 정규식 그대로다', () => {
    expect(IDENTIFIER_PATTERN.source).toBe('^[a-z_][a-z0-9_]{0,62}$');
  });
});

describe('§3 스토어 조립 시점 검증 — 지연 실패가 아니라 즉시 throw', () => {
  it('잘못된 스키마로 스토어를 만들면 쿼리 전에 throw한다(fail-fast)', () => {
    const fake = createFakeSql();
    let thrown: unknown;
    try {
      createPgOrderStore(fake, { schema: 'Bad-Schema' });
    } catch (error) {
      thrown = error;
    }
    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-identifier');
    expect(fake.calls).toHaveLength(0); // DB 접점 없이 조립 시점에 실패했다
  });
});
