/**
 * SqlClient seam — 이 패키지의 유일한 드라이버 접점 (설계 §2).
 *
 * `pg`는 peer조차 아니다: 타입 import까지 금지하고 구조적 타입 {@link PgPoolLike}만
 * 소비한다. TypeORM/Prisma/postgres.js 사용자는 {@link SqlClient}를 직접 구현한다.
 *
 * 계약 요점:
 * - `$1, $2` 위치 파라미터 규약(PostgreSQL 프로토콜). 실패는 그대로 throw —
 *   드라이버 에러를 감싸지 않는다(errors.ts 원칙).
 * - `rowCount`에 의존하지 않는다 — 존재 판정은 전부 RETURNING/SELECT의 rows로 한다
 *   (드라이버 간 이식성: rowCount 노출 형태가 제각각이다).
 * - `withConnection`은 migrate()와 PostgreSQL billing-key mutation lock의 트랜잭션·
 *   advisory lock이 풀의 서로 다른 커넥션으로 흩어지지 않게 한다. 일반 스토어 경로는
 *   단일 문이지만 `PgBillingKeyStore.withMutationLock` callback은 이 세션을 유지한다.
 */

export interface SqlRow {
  readonly [column: string]: unknown;
}

export interface SqlResult {
  readonly rows: readonly SqlRow[];
}

export interface SqlExecutor {
  /** `$1, $2` 위치 파라미터 규약(PostgreSQL 프로토콜). 실패는 그대로 throw. */
  query(text: string, params?: readonly unknown[]): Promise<SqlResult>;
}

export interface SqlClient extends SqlExecutor {
  /**
   * 단일 세션에 고정된 실행기로 fn을 실행한다 — migrate()와 billing-key mutation lock의
   * 트랜잭션·advisory lock이 풀의 서로 다른 커넥션으로 흩어지지 않기 위한 요구다.
   */
  withConnection<T>(fn: (session: SqlExecutor) => Promise<T>): Promise<T>;
}

// ── pg Pool 구조적 어댑터 ──────────────────────────────────────────────────

/** pg QueryResult의 필요 부분만 — `rows: any[]`가 그대로 구조 대입된다. */
export interface PgQueryResultLike {
  readonly rows: readonly SqlRow[];
}

/** `pool.connect()`가 내주는 커넥션의 필요 부분만 — pg.PoolClient가 구조 대입된다. */
export interface PgPoolClientLike {
  query(text: string, values?: readonly unknown[]): Promise<PgQueryResultLike>;
  /** truthy err 전달 시 커넥션 폐기(pg 시맨틱) — 트랜잭션 잔존 상태 재사용 방지. */
  release(err?: unknown): void;
}

/**
 * `pg.Pool`이 그대로 대입되는 구조적 타입 — `query(text, values)`와
 * `connect()`만 요구한다. pg를 import하지 않으므로 런타임·타입 의존성 모두 0.
 */
export interface PgPoolLike {
  query(text: string, values?: readonly unknown[]): Promise<PgQueryResultLike>;
  connect(): Promise<PgPoolClientLike>;
}

/**
 * pg Pool → SqlClient 어댑터 (설계 §2).
 *
 * `withConnection`은 connect → fn → release를 정확히 1회 보장한다. fn이 throw하면
 * `release(err)`로 커넥션을 **폐기**한다 — 실패한 트랜잭션·advisory lock이 걸린 세션이
 * 풀로 되돌아가 다음 사용자를 오염시키는 사고를 막는다(BEGIN 잔존이 대표 사례).
 */
export function fromPgPool(pool: PgPoolLike): SqlClient {
  return {
    async query(text, params) {
      const result = params === undefined ? await pool.query(text) : await pool.query(text, params);
      return { rows: result.rows };
    },
    async withConnection(fn) {
      const client = await pool.connect();
      try {
        const session: SqlExecutor = {
          async query(text, params) {
            const result =
              params === undefined ? await client.query(text) : await client.query(text, params);
            return { rows: result.rows };
          },
        };
        const value = await fn(session);
        client.release();
        return value;
      } catch (cause) {
        // 폐기 경로 — 성공 경로의 release()와 상호 배타(정확히 1회 호출)
        client.release(cause);
        throw cause;
      }
    },
  };
}
