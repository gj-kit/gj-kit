/**
 * §8 type — `pg.Pool`이 `PgPoolLike`에 **구조적으로** 대입된다 (설계 §2).
 *
 * "pg peer 없이 동작"의 소스 호환성 증거다: 이 패키지는 pg를 import하지 않고
 * 구조적 타입만 소비하므로, 실제 @types/pg의 Pool/PoolClient/QueryResult가 seam에
 * 캐스팅 없이 들어가는지는 **이 테스트만이** 지킨다(런타임·peer 의존 0 유지의 대가).
 * pg는 devDependency로만 존재한다 — 여기서의 `import type`은 배포 표면에 남지 않는다.
 */
import { describe, expectTypeOf, it } from 'vitest';
import type { Pool, PoolClient, QueryResult } from 'pg';

import { fromPgPool } from '../../src/index';
import type { PgPoolClientLike, PgPoolLike, PgQueryResultLike, SqlClient } from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('§2 PgPoolLike — @types/pg 실물과의 구조 호환', () => {
  it('Pool/PoolClient/QueryResult가 각각의 Like 타입을 충족한다', () => {
    expectTypeOf<Pool>().toExtend<PgPoolLike>();
    expectTypeOf<PoolClient>().toExtend<PgPoolClientLike>();
    expectTypeOf<QueryResult>().toExtend<PgQueryResultLike>();
  });

  it('fromPgPool(실제 Pool) 호출이 그대로 컴파일된다 — 캐스팅 0', () => {
    const pool = forge<Pool>();
    const client: SqlClient = fromPgPool(pool);
    void client;
  });

  it('connect() 없는 객체는 PgPoolLike가 아니다', () => {
    // @ts-expect-error connect 부재 — withConnection의 단일 세션 고정(migrate 요건)이 불가능한 형태
    fromPgPool({ query: forge<Pool['query']>() });
  });
});
