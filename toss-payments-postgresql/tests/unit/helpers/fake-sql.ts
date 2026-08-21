/**
 * 스크립트드 fake SqlClient — unit 계층 전체가 공유하는 유일한 드라이버 대역 (설계 §8).
 *
 * 왜 이런 형태인가:
 * - 실행된 SQL·파라미터를 **순서대로 기록**한다 — 스토어의 계약은 "어떤 SQL을 어떤
 *   파라미터로 보내는가"이므로, 기록이 곧 검증 표면이다.
 * - 준비된 rows를 FIFO 큐(enqueue*)로 반환한다 — saveOrder의 insert→select 2단계처럼
 *   호출 순서별로 다른 응답이 필요한 시나리오를 선언적으로 스크립트한다.
 * - 큐가 비면 fallback responder(기본: 빈 rows)로 응답한다 — migrate처럼 특정 문에만
 *   조건부 응답이 필요한 시나리오용.
 * - `via` 필드로 pool 직행/withConnection 세션 경유를 구분 기록한다 — migrate가
 *   전 과정을 단일 세션에서 실행한다는 불변식(설계 §4)을 검증 가능하게 한다.
 */
import type { SqlClient, SqlExecutor, SqlResult, SqlRow } from '../../../src/sql';

export interface RecordedQuery {
  readonly text: string;
  readonly params: readonly unknown[] | undefined;
  /** 'pool' = client.query 직행, 'session' = withConnection 세션 경유. */
  readonly via: 'pool' | 'session';
}

export type Responder = (
  text: string,
  params: readonly unknown[] | undefined,
) => readonly SqlRow[] | Promise<readonly SqlRow[]>;

type Scripted =
  | { readonly kind: 'rows'; readonly rows: readonly SqlRow[] }
  | { readonly kind: 'error'; readonly error: unknown }
  | { readonly kind: 'promise'; readonly promise: Promise<readonly SqlRow[]> };

export interface FakeSql extends SqlClient {
  /** 실행 순서 그대로의 기록 — 테스트의 단일 검증 표면. */
  readonly calls: RecordedQuery[];
  /** withConnection 호출 횟수 — migrate의 "단일 커넥션 1회" 검증용. */
  connections: number;
  /** 다음 쿼리 1건의 rows를 예약한다(FIFO). */
  enqueueRows(rows: readonly SqlRow[]): void;
  /** 다음 쿼리 1건을 실패시킨다(FIFO) — 드라이버 에러 통과 경로 검증용. */
  enqueueError(error: unknown): void;
  /** 다음 쿼리 1건의 완료를 외부 Promise에 건다 — audit flush 대기 검증용. */
  enqueuePromise(promise: Promise<readonly SqlRow[]>): void;
  /** 큐가 비었을 때의 fallback responder 교체(기본: 빈 rows). */
  respond(responder: Responder): void;
}

export function createFakeSql(responder?: Responder): FakeSql {
  const calls: RecordedQuery[] = [];
  const queue: Scripted[] = [];
  let fallback: Responder = responder ?? (() => []);

  async function run(
    text: string,
    params: readonly unknown[] | undefined,
    via: RecordedQuery['via'],
  ): Promise<SqlResult> {
    calls.push({ text, params, via });
    const next = queue.shift();
    if (next !== undefined) {
      if (next.kind === 'error') throw next.error;
      if (next.kind === 'promise') return { rows: await next.promise };
      return { rows: next.rows };
    }
    return { rows: await fallback(text, params) };
  }

  const fake: FakeSql = {
    calls,
    connections: 0,
    async query(text, params) {
      return run(text, params, 'pool');
    },
    async withConnection(fn) {
      fake.connections += 1;
      const session: SqlExecutor = {
        query: (text, params) => run(text, params, 'session'),
      };
      return fn(session);
    },
    enqueueRows(rows) {
      queue.push({ kind: 'rows', rows });
    },
    enqueueError(error) {
      queue.push({ kind: 'error', error });
    },
    enqueuePromise(promise) {
      queue.push({ kind: 'promise', promise });
    },
    respond(next) {
      fallback = next;
    },
  };
  return fake;
}

/** SQL 텍스트 비교용 정규화 — 공백/개행 차이가 계약이 아니므로 접는다. */
export function norm(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** 실행된 SQL 텍스트(정규화)를 순서대로 — 시퀀스 검증용. */
export function normTexts(fake: FakeSql): readonly string[] {
  return fake.calls.map((call) => norm(call.text));
}

/** 수동 해소 가능한 Promise — in-flight 완료 대기(flush) 시나리오용. */
export function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
