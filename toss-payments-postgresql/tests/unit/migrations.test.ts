/**
 * §4 migrate — 라이브러리 소유 마이그레이션.
 *
 * 검증 대상: BEGIN → advisory lock → 스키마/버전 테이블 → 미적용만 실행 → COMMIT의
 * 절차 순서, 전 과정 단일 커넥션(withConnection 1회) 실행, 이미 적용된 id의 skip
 * 멱등, 실패 시 ROLLBACK + migration-failed(cause 보존). advisory lock 키는 문서화된
 * 고정 알고리즘(FNV-1a 64bit)이므로 독립 재계산 값으로 고정한다 — 알고리즘이 바뀌면
 * 다른 언어/도구로 재계산한 락 키와 어긋나는 breaking change다.
 */
import { describe, expect, it } from 'vitest';

import { isTossPostgresError } from '../../src/errors';
import { advisoryLockKey, migrate, renderMigrationSql } from '../../src/migrations';
import { createFakeSql, normTexts } from './helpers/fake-sql';

/** 테스트 파일 안에서 독립 재계산한 FNV-1a 64bit 기대값 (2026-08-20 고정). */
const EXPECTED_LOCK_KEYS = {
  toss_payments: -150534779005964253n,
  custom_schema: 7673909630585048507n,
} as const;

describe('§4 advisoryLockKey — 문서화된 고정 알고리즘', () => {
  it('FNV-1a 64bit 독립 재계산 값과 일치한다(알고리즘 변경 = breaking)', () => {
    expect(advisoryLockKey('toss_payments')).toBe(EXPECTED_LOCK_KEYS.toss_payments);
    expect(advisoryLockKey('custom_schema')).toBe(EXPECTED_LOCK_KEYS.custom_schema);
  });

  it('signed int8 범위 안의 값을 낸다(pg_advisory_xact_lock 파라미터 요건)', () => {
    for (const schema of ['toss_payments', 'a', '_x', 'z'.repeat(63)]) {
      const key = advisoryLockKey(schema);
      expect(key >= -(2n ** 63n)).toBe(true);
      expect(key < 2n ** 63n).toBe(true);
    }
  });
});

describe('§4 migrate — 신규 적용 절차', () => {
  it('BEGIN → lock → 스키마/버전 테이블 → 문 실행 → 버전 INSERT → COMMIT 순서를 지킨다', async () => {
    const fake = createFakeSql();
    const result = await migrate(fake);

    expect(result).toEqual({
      applied: ['0001_init', '0002_billing_key_operation_fingerprint'],
      skipped: [],
    });
    expect(fake.connections).toBe(1); // 전 과정 단일 커넥션

    const texts = normTexts(fake);
    expect(texts[0]).toBe('BEGIN');
    expect(texts[1]).toBe('SELECT pg_advisory_xact_lock($1)');
    // BigInt는 드라이버 직렬화 편차 때문에 문자열로 보낸다(소스 TSDoc)
    expect(fake.calls[1]?.params).toEqual([EXPECTED_LOCK_KEYS.toss_payments.toString()]);
    expect(texts[2]).toBe('CREATE SCHEMA IF NOT EXISTS "toss_payments"');
    expect(texts[3]).toContain('CREATE TABLE IF NOT EXISTS "toss_payments".toss_pg_migrations');
    expect(texts[4]).toBe('SELECT id FROM "toss_payments".toss_pg_migrations');
    // 마지막 두 문: 버전 테이블 INSERT → COMMIT
    expect(texts.at(-2)).toBe('INSERT INTO "toss_payments".toss_pg_migrations (id) VALUES ($1)');
    expect(fake.calls.at(-2)?.params).toEqual(['0002_billing_key_operation_fingerprint']);
    expect(texts.at(-1)).toBe('COMMIT');
    // 모든 문이 세션(withConnection) 경유다 — 풀 직행이 하나라도 있으면 원자성이 깨진다
    expect(fake.calls.every((call) => call.via === 'session')).toBe(true);
  });

  it('0001_init은 테이블 7종 + 인덱스 2종을 스키마 한정으로 생성하고 0002가 lifecycle fingerprint를 추가한다', async () => {
    const fake = createFakeSql();
    await migrate(fake, { schema: 'custom_schema' });

    const all = normTexts(fake).join('\n');
    for (const table of [
      'orders',
      'deposit_secrets',
      'billing_keys',
      'cancel_retries',
      'webhook_dedupe',
      'audit_entries',
      'webhook_inbox',
    ]) {
      expect(all).toContain(`CREATE TABLE "custom_schema".${table}`);
    }
    expect(all).toContain('CREATE INDEX audit_entries_trace_id_idx');
    expect(all).toContain('CREATE INDEX audit_entries_recorded_at_idx');
    expect(all).toContain('ALTER TABLE "custom_schema".billing_keys ADD COLUMN operation_fingerprint text');
    expect(fake.calls[1]?.params).toEqual([EXPECTED_LOCK_KEYS.custom_schema.toString()]);
  });

  it('이미 적용된 id는 skip하고 DDL을 다시 실행하지 않는다(멱등 재실행)', async () => {
    const fake = createFakeSql((text) =>
      text.includes('SELECT id FROM')
        ? [{ id: '0001_init' }, { id: '0002_billing_key_operation_fingerprint' }]
        : [],
    );

    const result = await migrate(fake);

    expect(result).toEqual({
      applied: [],
      skipped: ['0001_init', '0002_billing_key_operation_fingerprint'],
    });
    const texts = normTexts(fake);
    expect(texts).toHaveLength(6); // BEGIN, lock, 스키마, 버전 테이블, SELECT, COMMIT
    expect(texts.at(-1)).toBe('COMMIT');
    expect(texts.join('\n')).not.toContain('CREATE TABLE "toss_payments".orders');
  });
});

describe('§4 migrate — 실패 경로', () => {
  it('문 실행 실패 시 ROLLBACK 후 migration-failed로 감싸 throw한다(cause 보존)', async () => {
    const ddlFailure = new Error('permission denied for schema');
    const fake = createFakeSql((text) => {
      if (text.includes('CREATE TABLE "toss_payments".orders')) throw ddlFailure;
      return [];
    });

    let thrown: unknown;
    try {
      await migrate(fake);
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('migration-failed');
      expect(thrown.cause).toBe(ddlFailure);
    }
    const texts = normTexts(fake);
    expect(texts.at(-1)).toBe('ROLLBACK');
    expect(texts).not.toContain('COMMIT');
  });

  it('ROLLBACK마저 실패해도(커넥션 사망) 원인 에러가 우선한다', async () => {
    const ddlFailure = new Error('connection terminated');
    const fake = createFakeSql((text) => {
      if (text.includes('CREATE TABLE "toss_payments".orders')) throw ddlFailure;
      if (text === 'ROLLBACK') throw new Error('no connection');
      return [];
    });

    let thrown: unknown;
    try {
      await migrate(fake);
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) {
      expect(thrown.code).toBe('migration-failed');
      expect(thrown.cause).toBe(ddlFailure); // ROLLBACK 실패가 원인을 가리지 않는다
    }
  });

  it('잘못된 스키마는 커넥션을 잡기 전에 invalid-identifier로 거부한다', async () => {
    const fake = createFakeSql();

    let thrown: unknown;
    try {
      await migrate(fake, { schema: 'Bad;Schema' });
    } catch (error) {
      thrown = error;
    }

    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-identifier');
    expect(fake.connections).toBe(0);
    expect(fake.calls).toHaveLength(0);
  });
});

describe('§4 renderMigrationSql — 외부 도구용 전체 스크립트', () => {
  it('스키마 이름이 반영된 전체 스크립트를 스냅샷으로 고정한다', () => {
    expect(renderMigrationSql()).toMatchSnapshot('default-schema');
    expect(renderMigrationSql({ schema: 'my_service' })).toMatchSnapshot('custom-schema');
  });

  it('버전 테이블 관리 문은 포함하지 않는다(버전 관리는 외부 도구 소관)', () => {
    const script = renderMigrationSql();
    expect(script).not.toContain('toss_pg_migrations');
    expect(script).toContain('CREATE SCHEMA IF NOT EXISTS "toss_payments"');
    expect(script).toContain('CREATE TABLE "toss_payments".orders');
  });

  it('스키마 옵션이 모든 문에 반영되고 기본 스키마는 등장하지 않는다', () => {
    const script = renderMigrationSql({ schema: 'my_service' });
    expect(script).toContain('CREATE TABLE "my_service".webhook_inbox');
    expect(script).not.toContain('"toss_payments"');
  });

  it('잘못된 스키마는 invalid-identifier로 거부한다', () => {
    let thrown: unknown;
    try {
      renderMigrationSql({ schema: 'BadSchema' });
    } catch (error) {
      thrown = error;
    }
    expect(isTossPostgresError(thrown)).toBe(true);
    if (isTossPostgresError(thrown)) expect(thrown.code).toBe('invalid-identifier');
  });
});
