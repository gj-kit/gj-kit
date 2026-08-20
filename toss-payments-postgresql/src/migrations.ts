/**
 * migrate() — 라이브러리 소유 마이그레이션 (설계 §4).
 *
 * 원칙:
 * - 부팅 시 자동 DDL 실행 없음 — `migrate()`는 항상 명시 호출이다(프로덕션 DB 임의
 *   DDL 위험 차단, 설계 §0 불변 제약).
 * - 마이그레이션은 TS 모듈 내 SQL 문자열이다 — dist 동봉이 자동이고 별도 파일 복사가
 *   필요 없다. 향후 변경은 **새 id 추가로만** 한다(기존 id의 SQL 수정 = breaking, 금지).
 * - 전 과정이 단일 커넥션(withConnection) + 단일 트랜잭션이다 — PostgreSQL DDL은
 *   트랜잭셔널이므로 중간 실패가 반쪽 스키마를 남기지 않는다.
 * - 동시 부팅 인스턴스는 `pg_advisory_xact_lock`으로 직렬화한다. 락 키는
 *   `'@gj-kit/toss-payments-postgresql:' + schema`의 FNV-1a 64bit 해시 — 문서화된
 *   고정 알고리즘이라 어떤 언어/도구에서도 같은 키를 재계산할 수 있다.
 */
import { TossPostgresError } from './errors';
import { DEFAULT_SCHEMA, assertSqlIdentifier, quoteSqlIdentifier } from './identifiers';
import type { SqlClient, SqlExecutor } from './sql';

export interface MigrateOptions {
  /** 기본 'toss_payments'. `/^[a-z_][a-z0-9_]{0,62}$/` 위반 시 즉시 throw. */
  readonly schema?: string;
}

export interface MigrationResult {
  /** 이번 호출이 실제 적용한 마이그레이션 id (적용 순서). */
  readonly applied: readonly string[];
  /** 버전 테이블에 이미 기록돼 있어 건너뛴 id — 멱등 재실행의 증거. */
  readonly skipped: readonly string[];
}

interface MigrationDef {
  readonly id: string;
  /** qs = 검증·인용 완료된 스키마 참조(`"toss_payments"` 형태). */
  statements(qs: string): readonly string[];
}

/**
 * v1 = 0001_init 1건: 스키마 + 테이블 7종 + 인덱스 (설계 §3 DDL 정본).
 *
 * 컬럼 원칙: 코어가 string으로 준 시각(createdAt, issuedAt, at)은 **원문 text 보존** —
 * 계약이 string 왕복이므로 timestamptz 재직렬화 손실을 금지한다. 운영 관측용
 * timestamptz(recorded_at 등)는 DB가 찍는다.
 */
const MIGRATIONS: readonly MigrationDef[] = [
  {
    id: '0001_init',
    statements: (qs) => [
      `CREATE SCHEMA IF NOT EXISTS ${qs}`,
      // OrderStore — 금액 대조의 단일 진실 공급원. insert-only 시맨틱은 스토어 계층이 강제.
      `CREATE TABLE ${qs}.orders (
  order_id    text PRIMARY KEY,
  amount      bigint NOT NULL CHECK (amount >= 0),
  currency    text NOT NULL CHECK (currency IN ('KRW','USD','JPY')),
  order_name  text NOT NULL,
  created_at  text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
)`,
      // DepositSecretStore — upsert 계약(코어 TSDoc). secret은 어떤 로그에도 싣지 않는다.
      `CREATE TABLE ${qs}.deposit_secrets (
  order_id   text PRIMARY KEY,
  secret     text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
)`,
      // BillingKeyStore — 토스에 조회 API가 없다: 이 테이블이 유일한 보관 수단.
      `CREATE TABLE ${qs}.billing_keys (
  customer_key text PRIMARY KEY,
  billing_key  text NOT NULL,
  method       text NOT NULL,
  issued_at    text NOT NULL,
  card         jsonb,
  transfers    jsonb,
  updated_at   timestamptz NOT NULL DEFAULT now()
)`,
      // CancelRetryStore — record_json은 의도적으로 text다(jsonb 금지): bodyJson은 멱등
      // 재생의 바이트 계약이라 jsonb 정규화(NUL 거부·이스케이프/키 정렬) 위험을 원천 배제.
      `CREATE TABLE ${qs}.cancel_retries (
  ticket_id   text PRIMARY KEY,
  record_json text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
)`,
      // WebhookDedupeStore — claim은 스토어 계층의 단일 문 CTE로 원자 전이한다.
      `CREATE TABLE ${qs}.webhook_dedupe (
  dedupe_key       text PRIMARY KEY,
  state            text NOT NULL CHECK (state IN ('processing','completed')),
  lease_expires_at timestamptz,
  completed_at     timestamptz
)`,
      // AuditSink — createFileAuditSink의 다중 프로세스 한계 대체(동시 insert 안전).
      `CREATE TABLE ${qs}.audit_entries (
  id              text PRIMARY KEY,
  at              text NOT NULL,
  env             text NOT NULL,
  method          text NOT NULL,
  path            text NOT NULL,
  attempt         integer NOT NULL,
  idempotency_key text,
  trace_id        text,
  duration_ms     integer NOT NULL,
  outcome_kind    text NOT NULL,
  entry           jsonb NOT NULL,
  recorded_at     timestamptz NOT NULL DEFAULT now()
)`,
      `CREATE INDEX audit_entries_trace_id_idx ON ${qs}.audit_entries (trace_id) WHERE trace_id IS NOT NULL`,
      `CREATE INDEX audit_entries_recorded_at_idx ON ${qs}.audit_entries (recorded_at)`,
      // 웹훅 inbox — 코어 seam이 없어 핸들러 래퍼가 기록하는 이벤트 원문 보존 테이블 (§3.7).
      `CREATE TABLE ${qs}.webhook_inbox (
  dedupe_key        text PRIMARY KEY,
  transmission_id   text NOT NULL,
  transmission_time text,
  retried_count     integer NOT NULL,
  trust             text NOT NULL,
  event_type        text NOT NULL,
  event             jsonb NOT NULL,
  deliveries        integer NOT NULL DEFAULT 1,
  first_received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at  timestamptz NOT NULL DEFAULT now()
)`,
    ],
  },
];

const ADVISORY_LOCK_NAMESPACE = '@gj-kit/toss-payments-postgresql:';

// FNV-1a 64bit 상수 (표준값) — BigInt 연산으로 64bit wrap-around를 재현한다.
const FNV_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/**
 * FNV-1a 64bit — advisory lock 키 파생 (문서화된 고정 알고리즘, 설계 §4).
 *
 * `pg_advisory_xact_lock(bigint)`은 **signed** int8을 받으므로 unsigned 64bit 해시를
 * `BigInt.asIntN(64, ...)`으로 2의 보수 재해석해 int8 범위에 맞춘다 — 값의 비트는
 * 동일하고 표기만 음수가 될 수 있다. 파라미터는 문자열로 보낸다(드라이버들의 BigInt
 * 직렬화 지원이 제각각이고, PostgreSQL이 함수 시그니처로 타입을 추론한다).
 */
export function advisoryLockKey(schema: string): bigint {
  const input = `${ADVISORY_LOCK_NAMESPACE}${schema}`;
  const bytes = new TextEncoder().encode(input);
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return BigInt.asIntN(64, hash);
}

/**
 * 마이그레이션 실행 (설계 §4 절차).
 *
 * 1. BEGIN
 * 2. pg_advisory_xact_lock — 동시 부팅 인스턴스 직렬화 (트랜잭션 종료 시 자동 해제)
 * 3. CREATE SCHEMA IF NOT EXISTS + 버전 테이블 toss_pg_migrations IF NOT EXISTS
 * 4. 미적용 id만 순서대로 실행 + 버전 테이블 INSERT
 * 5. COMMIT (실패 시 ROLLBACK 후 'migration-failed'로 감싸 rethrow — cause 보존)
 */
export async function migrate(sql: SqlClient, options?: MigrateOptions): Promise<MigrationResult> {
  const schema = assertSqlIdentifier(options?.schema ?? DEFAULT_SCHEMA, 'schema');
  const qs = quoteSqlIdentifier(schema, 'schema');

  return sql.withConnection(async (session) => {
    await session.query('BEGIN');
    try {
      await session.query('SELECT pg_advisory_xact_lock($1)', [advisoryLockKey(schema).toString()]);
      await session.query(`CREATE SCHEMA IF NOT EXISTS ${qs}`);
      await session.query(
        `CREATE TABLE IF NOT EXISTS ${qs}.toss_pg_migrations (
  id         text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`,
      );

      const alreadyApplied = await loadAppliedIds(session, qs);
      const applied: string[] = [];
      const skipped: string[] = [];
      for (const migration of MIGRATIONS) {
        if (alreadyApplied.has(migration.id)) {
          skipped.push(migration.id);
          continue;
        }
        for (const statement of migration.statements(qs)) {
          await session.query(statement);
        }
        await session.query(`INSERT INTO ${qs}.toss_pg_migrations (id) VALUES ($1)`, [migration.id]);
        applied.push(migration.id);
      }

      await session.query('COMMIT');
      return { applied, skipped };
    } catch (cause) {
      try {
        await session.query('ROLLBACK');
      } catch {
        // ROLLBACK 실패(커넥션 사망 등)보다 원인 에러가 우선이다 — withConnection이
        // release(err)로 커넥션을 폐기하므로 잔존 트랜잭션 누수도 없다.
      }
      throw new TossPostgresError(
        'migration-failed',
        `migrate(schema: ${schema}) 실패 — 트랜잭션은 롤백됐습니다. 원인은 cause를 확인하세요.`,
        { cause },
      );
    }
  });
}

async function loadAppliedIds(session: SqlExecutor, qs: string): Promise<ReadonlySet<string>> {
  const result = await session.query(`SELECT id FROM ${qs}.toss_pg_migrations`);
  const ids = new Set<string>();
  for (const row of result.rows) {
    if (typeof row['id'] === 'string') ids.add(row['id']);
  }
  return ids;
}

/**
 * 자체 마이그레이션 도구(Flyway/dbmate 등) 사용자용 전체 스크립트 (설계 §4).
 *
 * migrate()와 **동일한 SQL**을 주석 헤더와 함께 이어 붙인 순수 문자열이다 —
 * 단, 버전 테이블(toss_pg_migrations) 관리 문은 제외한다(버전 관리는 외부 도구 소관).
 */
export function renderMigrationSql(options?: MigrateOptions): string {
  const schema = assertSqlIdentifier(options?.schema ?? DEFAULT_SCHEMA, 'schema');
  const qs = quoteSqlIdentifier(schema, 'schema');

  const parts: string[] = [
    `-- @gj-kit/toss-payments-postgresql — 전체 마이그레이션 스크립트`,
    `-- schema: ${schema}`,
    `-- 이 파일은 renderMigrationSql() 산출물이다. 버전 관리는 사용 중인 도구가 담당한다.`,
    '',
  ];
  for (const migration of MIGRATIONS) {
    parts.push(`-- ── ${migration.id} ${'─'.repeat(Math.max(4, 60 - migration.id.length))}`);
    for (const statement of migration.statements(qs)) {
      parts.push(`${statement};`, '');
    }
  }
  return parts.join('\n');
}
