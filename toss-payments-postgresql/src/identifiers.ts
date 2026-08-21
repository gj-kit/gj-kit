/**
 * SQL 식별자 검증 — 설정 문자열이 SQL에 보간되는 **유일한 지점**의 봉쇄 (설계 §3 서두).
 *
 * 이 패키지의 SQL은 값 전부를 `$n` 파라미터로 보내고, 문자열 보간은 스키마 식별자
 * 하나뿐이다. 그 하나를 여기서 정규식으로 잠그면 SQL 주입 표면이 0이 된다.
 * 테이블 이름은 고정(옵션 없음)이므로 검증 대상조차 아니다.
 */
import { TossPostgresError } from './errors';

/** PostgreSQL 비인용 식별자 규칙의 보수적 부분집합 — 소문자·숫자·언더스코어, 최대 63자. */
export const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

/** 기본 스키마 이름 (설계 §3). */
export const DEFAULT_SCHEMA = 'toss_payments';

/**
 * 검증 후 원본을 그대로 반환한다. 위반 시 즉시 throw — 지연 실패(첫 쿼리에서야 드라이버
 * 에러)보다 조립 시점 실패가 원인 추적이 빠르다.
 */
export function assertSqlIdentifier(value: string, label: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) {
    // 식별자는 운영자 설정값이라 메시지 포함이 안전하다(secret 아님) — 디버깅 우선
    throw new TossPostgresError(
      'invalid-identifier',
      `${label} '${value}'이(가) 허용 형식(${IDENTIFIER_PATTERN.source})이 아닙니다.`,
    );
  }
  return value;
}

/**
 * 검증 + 큰따옴표 인용. 패턴상 `"`가 포함될 수 없으므로 인용 탈출이 불가능하고,
 * `user` 같은 예약어 스키마 이름도 안전하게 통과한다(소문자 전용이라 대소문자
 * 접힘 차이도 없다).
 */
export function quoteSqlIdentifier(value: string, label: string): string {
  return `"${assertSqlIdentifier(value, label)}"`;
}

/** 스토어·마이그레이션 공용: `schema` 옵션 → 검증·인용된 스키마 참조 문자열. */
export function schemaRef(schema: string | undefined): string {
  return quoteSqlIdentifier(schema ?? DEFAULT_SCHEMA, 'schema');
}
