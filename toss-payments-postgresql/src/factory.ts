/**
 * createTossPaymentsPostgres — 스토어 집합체 팩토리 (설계 §5) + cleanup (설계 §6).
 *
 * 팩토리는 **순수 조립**이다 — 즉시 DB 접속이 없고 첫 쿼리가 첫 접점이다. 스키마
 * 식별자 검증만 조립 시점에 수행해 잘못된 설정을 즉시 드러낸다(fail-fast).
 * 부팅 시 자동 DDL도, 자동 cleanup 타이머도 없다 — 모든 옵션 기본 꺼짐 원칙.
 */
import type { AuditSink } from '@gj-kit/toss-payments';
import type {
  CancelRetryStore,
  DepositSecretStore,
  OrderStore,
} from '@gj-kit/toss-payments/server';
import type { WebhookDedupeStore } from '@gj-kit/toss-payments/webhook';

import { DEFAULT_SCHEMA, assertSqlIdentifier, schemaRef } from './identifiers';
import { migrate } from './migrations';
import type { MigrationResult } from './migrations';
import { requireSensitiveValueProtector } from './sensitive-values';
import type { SensitiveValueProtector } from './sensitive-values';
import type { SqlClient } from './sql';
import { createPgAuditSink } from './stores/audit';
import { createPgBillingKeyStore } from './stores/billing-keys';
import type { PgBillingKeyStore } from './stores/billing-keys';
import { createPgCancelRetryStore } from './stores/cancel-retries';
import { createPgDepositSecretStore } from './stores/deposit-secrets';
import { createPgOrderStore } from './stores/orders';
import { createPgWebhookDedupeStore } from './stores/webhook-dedupe';
import { createPgWebhookInboxStore } from './stores/inbox';
import type { WebhookInboxStore } from './stores/inbox';

export interface TossPaymentsPostgresOptions {
  readonly sql: SqlClient;
  /**
   * billing key·deposit secret·cancel retry record의 필수 at-rest 보호기.
   *
   * 기본값은 없다. 평문 개발 DB를 의도적으로 써야 할 때만
   * `unsafePlaintextSensitiveValueProtector`를 명시해 전달한다. 보호기는 `purpose`와
   * `recordId`를 AAD에 결속해야 한다.
   */
  readonly sensitiveValueProtector: SensitiveValueProtector;
  /** 기본 'toss_payments'. `/^[a-z_][a-z0-9_]{0,62}$/` 위반 시 조립 시점에 throw. */
  readonly schema?: string;
  readonly dedupe?: {
    /** processing 행의 crash-recovery lease(초). 기본 60. */
    readonly leaseSeconds?: number;
    /**
     * completed 행의 TTL(초). 기본 432_000(5일) — 코어 TSDoc "토스 최장 재전송
     * 기간보다 긴 TTL, 권장 5일". 삭제는 cleanup() 호출 시에만 일어난다.
     */
    readonly completedTtlSeconds?: number;
  };
  readonly retention?: {
    /**
     * cancel_retries 보존 일수. 기본 15 — 토스 멱등키 유효기간과 일치.
     * **양의 정수**여야 한다(cleanup SQL의 make_interval days 파라미터가 int) —
     * 소수는 조립 시점에 TypeError로 거부된다.
     */
    readonly cancelRetryDays?: number;
  };
}

export interface CleanupResult {
  /** webhook_dedupe에서 삭제된 completed 행 수. */
  readonly dedupeDeleted: number;
  /** cancel_retries에서 삭제된 만료 행 수. */
  readonly cancelRetriesDeleted: number;
}

export interface TossPaymentsPostgres {
  readonly orders: OrderStore;
  readonly depositSecrets: DepositSecretStore;
  /**
   * 코어 BillingKeyStore + PostgreSQL conditional compare-and-mutate 확장.
   *
   * `deleteIfBillingKeyMatches`/`replaceIfBillingKeyMatches`는 stale BILLING_DELETED와
   * projection 보상 경합에서 무조건 delete/save 대신 사용하는 원자적 API다.
   */
  readonly billingKeys: PgBillingKeyStore;
  readonly cancelRetries: CancelRetryStore;
  readonly webhookDedupe: WebhookDedupeStore;
  readonly audit: AuditSink & { flush(): Promise<void> };
  readonly inbox: WebhookInboxStore;
  /** 명시 호출 전용 — 부팅 시 자동 실행 없음. `app.listen` 전에 await하는 것이 골든 패스. */
  migrate(): Promise<MigrationResult>;
  /**
   * TTL 행 정리 — 명시 호출 전용(자동 타이머 없음). audit_entries·webhook_inbox·
   * orders·deposit_secrets는 지우지 않는다 — 보관 정책은 소비자 책임.
   */
  cleanup(): Promise<CleanupResult>;
}

const DEFAULT_COMPLETED_TTL_SECONDS = 432_000; // 5일
const DEFAULT_CANCEL_RETRY_DAYS = 15; // 토스 멱등키 유효기간

export function createTossPaymentsPostgres(
  options: TossPaymentsPostgresOptions,
): TossPaymentsPostgres {
  const { sql } = options;
  const sensitiveValueProtector = requireSensitiveValueProtector(options.sensitiveValueProtector);
  const schema = assertSqlIdentifier(options.schema ?? DEFAULT_SCHEMA, 'schema');
  const qs = schemaRef(schema);

  const completedTtlSeconds =
    options.dedupe?.completedTtlSeconds ?? DEFAULT_COMPLETED_TTL_SECONDS;
  const cancelRetryDays = options.retention?.cancelRetryDays ?? DEFAULT_CANCEL_RETRY_DAYS;
  assertPositiveFinite(completedTtlSeconds, 'dedupe.completedTtlSeconds');
  assertPositiveInteger(cancelRetryDays, 'retention.cancelRetryDays');

  const storeOptions = { schema, sensitiveValueProtector } as const;

  // 존재/건수 판정은 전부 RETURNING rows로 한다(rowCount 미의존 — 설계 §2).
  const cleanupDedupeSql = `DELETE FROM ${qs}.webhook_dedupe
WHERE state = 'completed' AND completed_at < now() - make_interval(secs => $1)
RETURNING 1 AS deleted`;
  const cleanupCancelRetriesSql = `DELETE FROM ${qs}.cancel_retries
WHERE recorded_at < now() - make_interval(days => $1)
RETURNING 1 AS deleted`;

  return {
    orders: createPgOrderStore(sql, storeOptions),
    depositSecrets: createPgDepositSecretStore(sql, storeOptions),
    billingKeys: createPgBillingKeyStore(sql, storeOptions),
    cancelRetries: createPgCancelRetryStore(sql, storeOptions),
    webhookDedupe: createPgWebhookDedupeStore(sql, {
      schema,
      // exactOptionalPropertyTypes — 미지정 시 프로퍼티 자체를 만들지 않는다
      ...(options.dedupe?.leaseSeconds !== undefined
        ? { leaseSeconds: options.dedupe.leaseSeconds }
        : {}),
    }),
    audit: createPgAuditSink(sql, storeOptions),
    inbox: createPgWebhookInboxStore(sql, storeOptions),

    migrate() {
      return migrate(sql, { schema });
    },

    async cleanup() {
      const dedupe = await sql.query(cleanupDedupeSql, [completedTtlSeconds]);
      const cancelRetries = await sql.query(cleanupCancelRetriesSql, [cancelRetryDays]);
      return {
        dedupeDeleted: dedupe.rows.length,
        cancelRetriesDeleted: cancelRetries.rows.length,
      };
    },
  };
}

function assertPositiveFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`[@gj-kit/toss-payments-postgresql] ${label}은(는) 양의 유한 숫자여야 합니다.`);
  }
}

/**
 * `make_interval(days => $1)`의 days 파라미터는 PostgreSQL **integer**다 —
 * secs(double precision)와 달리 소수(예: 0.5)를 주면 조립 시점이 아니라 첫
 * cleanup() 호출에서야 드라이버 캐스트 에러로 터진다. fail-fast 원칙대로
 * 조립 시점에 정수를 강제한다.
 */
function assertPositiveInteger(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`[@gj-kit/toss-payments-postgresql] ${label}은(는) 양의 정수여야 합니다.`);
  }
}
