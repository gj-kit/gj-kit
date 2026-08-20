/**
 * 통합 테스트 헬퍼 — 실 PostgreSQL 대상 (설계 §8).
 *
 * 격리 전략: 테스트 파일마다 임의 스키마를 만들어 migrate하고, afterAll에서
 * DROP SCHEMA ... CASCADE로 통째로 지운다. 같은 DB를 공유해도 파일 간 상태가
 * 절대 섞이지 않고, 실패한 실행이 잔존물을 남겨도 다음 실행과 충돌하지 않는다
 * (advisory lock 키도 스키마별로 갈리므로 직렬 실행과 결합해 경합이 없다).
 *
 * 라이브러리는 공개 API('../../src/index')로만 사용한다 — 내부 계층 접근 금지.
 */
import { randomBytes } from 'node:crypto';

import { Pool } from 'pg';

import { fromPgPool } from '../../src/index';
import type { SqlClient } from '../../src/index';

/** setup.ts가 존재를 보장한 접속 URL — 여기서는 읽기만 한다. */
export function databaseUrl(): string {
  const url = process.env['TOSS_PG_TEST_DATABASE_URL'];
  if (url === undefined || url.length === 0) {
    throw new Error('TOSS_PG_TEST_DATABASE_URL이 없습니다 — tests/integration/setup.ts가 먼저 실행돼야 합니다.');
  }
  return url;
}

/**
 * 테스트 파일 전용 임의 스키마 이름 — `/^[a-z_][a-z0-9_]{0,62}$/`를 항상 만족한다
 * (hex 소문자 12자 + 고정 접두사 `it_`).
 */
export function randomSchema(): string {
  return `it_${randomBytes(6).toString('hex')}`;
}

/**
 * pg Pool 생성. 기본 max 10 — 동시 claim 원자성 시나리오가 10개의 실제 커넥션에서
 * 같은 단일 문을 경합시키기 위한 하한이다.
 */
export function createPool(max = 10): Pool {
  return new Pool({ connectionString: databaseUrl(), max });
}

/** afterAll 정리 — 테스트 스키마를 통째로 폐기한다(잔존물 0 보장). */
export async function dropSchema(pool: Pool, schema: string): Promise<void> {
  // schema는 randomSchema() 산출물(패턴 보장)만 받는다 — 보간이 안전한 유일한 이유.
  await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
}

/** 한 파일의 표준 픽스처 — pool + SqlClient + 스키마 이름을 묶어서 만든다. */
export interface PgTestContext {
  readonly pool: Pool;
  readonly sql: SqlClient;
  readonly schema: string;
}

export function createTestContext(max = 10): PgTestContext {
  const pool = createPool(max);
  return { pool, sql: fromPgPool(pool), schema: randomSchema() };
}

/** lease 만료 등 시간 경과 시나리오용. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `SELECT count(*)` 편의 — count는 bigint라 ::int 캐스팅으로 number를 받는다. */
export async function countRows(pool: Pool, schema: string, table: string, where = ''): Promise<number> {
  const result = await pool.query(
    `SELECT count(*)::int AS n FROM "${schema}".${table} ${where}`,
  );
  return (result.rows[0] as { n: number }).n;
}
