/**
 * §2 fromPgPool — pg Pool 구조적 어댑터.
 *
 * 검증 대상은 두 가지 계약이다:
 * - query 위임: params 미지정 시 pool.query를 **1인자**로 호출한다(pg는 두 번째 인자
 *   undefined를 빈 파라미터 배열과 다르게 다룰 수 있다 — 그대로 전달하지 않는 것이 계약).
 * - withConnection: connect → fn → release 정확히 1회. fn throw 시 release(err)로
 *   커넥션 **폐기**(BEGIN 잔존 세션이 풀로 돌아가는 사고 방지).
 */
import { describe, expect, it, vi } from 'vitest';

import { fromPgPool } from '../../src/sql';
import type { PgPoolClientLike, PgPoolLike, PgQueryResultLike } from '../../src/sql';

function makeFakePool(rows: PgQueryResultLike['rows'] = []) {
  const clientQuery = vi.fn(
    async (..._args: readonly unknown[]): Promise<PgQueryResultLike> => ({ rows }),
  );
  const release = vi.fn((_err?: unknown): void => undefined);
  const client: PgPoolClientLike = {
    query: clientQuery as unknown as PgPoolClientLike['query'],
    release,
  };
  const poolQuery = vi.fn(
    async (..._args: readonly unknown[]): Promise<PgQueryResultLike> => ({ rows }),
  );
  const connect = vi.fn(async (): Promise<PgPoolClientLike> => client);
  const pool: PgPoolLike = {
    query: poolQuery as unknown as PgPoolLike['query'],
    connect,
  };
  return { pool, poolQuery, connect, clientQuery, release };
}

describe('§2 fromPgPool.query — 풀 직행 위임', () => {
  it('params가 있으면 (text, params) 2인자로 위임하고 rows만 매핑해 반환한다', async () => {
    const { pool, poolQuery } = makeFakePool([{ answer: 42 }]);
    const sql = fromPgPool(pool);

    const result = await sql.query('SELECT $1::int AS answer', [42]);

    expect(poolQuery).toHaveBeenCalledTimes(1);
    expect(poolQuery).toHaveBeenCalledWith('SELECT $1::int AS answer', [42]);
    expect(result).toEqual({ rows: [{ answer: 42 }] });
  });

  it('params 미지정 시 1인자로 위임한다(undefined를 전달하지 않는다)', async () => {
    const { pool, poolQuery } = makeFakePool();
    const sql = fromPgPool(pool);

    await sql.query('SELECT 1');

    expect(poolQuery.mock.calls[0]).toEqual(['SELECT 1']); // 인자 개수까지 계약이다
  });
});

describe('§2 fromPgPool.withConnection — connect/release 수명', () => {
  it('성공 경로: 세션 쿼리는 커넥션으로 가고, release()는 인자 없이 정확히 1회', async () => {
    const { pool, connect, clientQuery, release, poolQuery } = makeFakePool([{ ok: true }]);
    const sql = fromPgPool(pool);

    const value = await sql.withConnection(async (session) => {
      const first = await session.query('BEGIN');
      await session.query('SELECT $1', ['a']);
      expect(first.rows).toEqual([{ ok: true }]);
      return 'done';
    });

    expect(value).toBe('done');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled(); // 세션 쿼리는 풀 직행 경로를 쓰지 않는다
    expect(clientQuery.mock.calls).toEqual([['BEGIN'], ['SELECT $1', ['a']]]);
    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]).toEqual([]); // 성공 시 폐기 아님 — 인자 없는 반납
  });

  it('fn throw 시 release(err)로 커넥션을 폐기하고 원인 그대로 rethrow한다', async () => {
    const { pool, release } = makeFakePool();
    const sql = fromPgPool(pool);
    const boom = new Error('트랜잭션 중 실패');

    await expect(
      sql.withConnection(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    expect(release).toHaveBeenCalledTimes(1);
    expect(release.mock.calls[0]).toEqual([boom]); // truthy err 전달 = pg 커넥션 폐기 시맨틱
  });

  it('세션 쿼리도 params 미지정 시 1인자로 위임한다', async () => {
    const { pool, clientQuery } = makeFakePool();
    const sql = fromPgPool(pool);

    await sql.withConnection((session) => session.query('COMMIT'));

    expect(clientQuery.mock.calls[0]).toEqual(['COMMIT']);
  });
});
