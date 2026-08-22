/**
 * §8 type — 스토어 6종 구현이 코어 계약에 대입되고, PostgreSQL 고유 hardening 표면도
 * 타입으로 고정한다 (설계 §3·§5).
 *
 * 이 패키지는 코어 공개 계약을 **구현만** 한다(재정의·확장 금지 — 설계 §0 불변 제약).
 * 반환 타입을 코어 인터페이스로 회귀 고정해 두면, 코어 마이너 업데이트로 계약이
 * 달라지거나 구현이 어긋나는 순간 이 파일이 먼저 컴파일 실패한다 — 런타임보다 싼 경보.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { AuditEntry, AuditSink } from '@gj-kit/toss-payments';
import type {
  BillingKeyDeleteRequest,
  BillingKeyRecord,
  BillingKeySaveOptions,
  BillingKeyStore,
  CancelRetryStore,
  DepositSecretStore,
  OrderStore,
} from '@gj-kit/toss-payments/server';
import type {
  AcceptedWebhook,
  WebhookDedupeStore,
  WebhookHandlers,
  WebhookMeta,
} from '@gj-kit/toss-payments/webhook';

import {
  createOpaqueAdvisoryLockKey,
  createPgAuditSink,
  createPgBillingKeyStore,
  createPgCancelRetryStore,
  createPgDepositSecretStore,
  createPgOrderStore,
  createPgWebhookDedupeStore,
  createPgWebhookInboxStore,
  isTossPostgresError,
  withWebhookInbox,
} from '../../src/index';
import type {
  PgAuditSink,
  PgBillingKeyStore,
  PgBillingKeyMutation,
  PgBillingKeySnapshot,
  PgSensitiveStoreOptions,
  SensitiveValueProtector,
  SqlClient,
  SqlExecutor,
  TossPostgresError,
  TossPostgresErrorCode,
  WebhookInboxStore,
} from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

const sql = forge<SqlClient>();
const sensitiveValueProtector = forge<SensitiveValueProtector>();
const sensitiveStoreOptions: PgSensitiveStoreOptions = { sensitiveValueProtector };

describe('§3 개별 팩토리 — 코어 계약 + PostgreSQL 고유 hardening 표면', () => {
  it('스토어 5종 + AuditSink가 코어 인터페이스에 어노테이션 대입된다', () => {
    // 어노테이션 대입 = 구조 호환의 컴파일 증거("구현만 한다" 계약의 회귀 고정)
    const orders: OrderStore = createPgOrderStore(sql);
    const depositSecrets: DepositSecretStore = createPgDepositSecretStore(sql, sensitiveStoreOptions);
    const billingKeys: BillingKeyStore = createPgBillingKeyStore(sql, sensitiveStoreOptions);
    const cancelRetries: CancelRetryStore = createPgCancelRetryStore(sql, sensitiveStoreOptions);
    const webhookDedupe: WebhookDedupeStore = createPgWebhookDedupeStore(sql);
    const audit: AuditSink = createPgAuditSink(sql);
    void [orders, depositSecrets, billingKeys, cancelRetries, webhookDedupe, audit];

    // 일반 스토어는 코어 계약과 동일하다. BillingKeyStore는 raw key 조건부 삭제와
    // lifecycle fingerprint를 안전하게 구현하려 SqlClient에서만 PostgreSQL 확장을 제공한다.
    expectTypeOf(createPgOrderStore).returns.toEqualTypeOf<OrderStore>();
    expectTypeOf(createPgDepositSecretStore).returns.toEqualTypeOf<DepositSecretStore>();
    expectTypeOf(createPgCancelRetryStore).returns.toEqualTypeOf<CancelRetryStore>();
    expectTypeOf(createPgWebhookDedupeStore).returns.toEqualTypeOf<WebhookDedupeStore>();

    const pgBillingKeys: PgBillingKeyStore = createPgBillingKeyStore(sql, sensitiveStoreOptions);
    expectTypeOf(pgBillingKeys).toExtend<BillingKeyStore>();
    expectTypeOf(pgBillingKeys.replaceAndGetPrevious).toEqualTypeOf<
      (
        record: import('@gj-kit/toss-payments/server').BillingKeyRecord,
        options?: import('@gj-kit/toss-payments/server').BillingKeySaveOptions,
      ) => Promise<
        PgBillingKeySnapshot | null
      >
    >();
    expectTypeOf(pgBillingKeys.delete).returns.toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(pgBillingKeys.deleteIfBillingKeyMatches).returns.toEqualTypeOf<Promise<boolean>>();
    expectTypeOf(pgBillingKeys.replaceIfBillingKeyMatches).returns.toEqualTypeOf<Promise<boolean>>();

    const record = forge<BillingKeyRecord>();
    const deleteRequest = forge<BillingKeyDeleteRequest>();
    const saveOptions = forge<BillingKeySaveOptions>();
    void pgBillingKeys.delete(deleteRequest);
    void pgBillingKeys.deleteIfBillingKeyMatches(deleteRequest);
    // @ts-expect-error old positional delete must not let an adapter omit expectedBillingKey
    void pgBillingKeys.delete(record.customerKey, record.billingKey);
    void pgBillingKeys.withMutationLock(record.customerKey, async (mutation) => {
      expectTypeOf(mutation).toEqualTypeOf<PgBillingKeyMutation>();
      expectTypeOf(mutation.customerKey).toEqualTypeOf<
        import('@gj-kit/toss-payments/server').BillingKeyRecord['customerKey']
      >();
      const previous = await mutation.replaceAndGetPrevious(record, saveOptions);
      await mutation.replaceIfBillingKeyMatches(record.billingKey, previous);
      await mutation.save(record, saveOptions);
      expectTypeOf(mutation.isCurrentOperationId).returns.toEqualTypeOf<Promise<boolean>>();
      return mutation.deleteIfBillingKeyMatches(record.billingKey);
    });
    void pgBillingKeys.withOpaqueMutationLock(
      createOpaqueAdvisoryLockKey('v1:billing-credential:blind-index'),
      record.customerKey,
      async (mutation) => mutation.replaceAndGetPrevious(record, saveOptions),
    );
    // @ts-expect-error raw string으로 opaque + customer locks를 임의 조합할 수 없다
    void pgBillingKeys.withOpaqueMutationLock('raw-customer-id', record.customerKey, () => undefined);
  });

  it('일반 스토어는 SqlExecutor로 충분하지만 billing store는 SqlClient가 필수다', () => {
    const executor = forge<SqlExecutor>();
    void createPgOrderStore(executor);
    void createPgDepositSecretStore(executor, sensitiveStoreOptions);
    // @ts-expect-error protected raw-key compare/delete + callback fence는 단일 connection transaction이 필요하다
    void createPgBillingKeyStore(executor, sensitiveStoreOptions);
    void createPgCancelRetryStore(executor, sensitiveStoreOptions);
    void createPgWebhookDedupeStore(executor);
    void createPgAuditSink(executor);
    void createPgWebhookInboxStore(executor);
  });

  it('PgAuditSink = AuditSink + flush — 계약 확장이 아니라 셧다운 훅 추가다', () => {
    expectTypeOf<PgAuditSink>().toExtend<AuditSink>();
    const sink = createPgAuditSink(sql);
    expectTypeOf(sink.record).parameter(0).toEqualTypeOf<AuditEntry>();
    expectTypeOf(sink.flush).toEqualTypeOf<() => Promise<void>>();
  });

  it('스토어 팩토리 옵션 오용 = 컴파일 에러', () => {
    // @ts-expect-error 테이블 이름은 고정(옵션 없음, 설계 §3) — PgStoreOptions에 없는 키
    createPgOrderStore(sql, { table: 'orders' });
    // @ts-expect-error schema는 string
    createPgOrderStore(sql, { schema: 123 });
    // @ts-expect-error leaseSeconds에 string — 숫자만
    createPgWebhookDedupeStore(sql, { leaseSeconds: '60' });
    // @ts-expect-error sensitiveValueProtector 누락 — direct store도 raw fallback이 없다
    createPgDepositSecretStore(sql);
    // @ts-expect-error incomplete protector — encrypt/decrypt 양쪽 async 메서드가 필요하다
    createPgBillingKeyStore(sql, { sensitiveValueProtector: { encrypt: async () => 'x' } });
  });
});

describe('§3.7 inbox — 스토어 seam이 아니라 핸들러 래퍼다(코어 계약 무변경)', () => {
  it('record는 AcceptedWebhook 1개를 받는 단일 표면이다', () => {
    const inbox: WebhookInboxStore = createPgWebhookInboxStore(sql);
    expectTypeOf(inbox.record).parameter(0).toEqualTypeOf<AcceptedWebhook>();
    expectTypeOf(inbox.record).returns.toEqualTypeOf<Promise<void>>();
  });

  it('withWebhookInbox는 WebhookHandlers를 받아 같은 타입을 돌려준다 — 키 집합 불변', () => {
    const inbox = createPgWebhookInboxStore(sql);
    const handlers = forge<WebhookHandlers>();
    expectTypeOf(withWebhookInbox(inbox, handlers)).toEqualTypeOf<WebhookHandlers>();

    void withWebhookInbox(inbox, handlers, {
      failOnRecordError: true,
      onRecordError: (cause, meta) => {
        expectTypeOf(cause).toEqualTypeOf<unknown>();
        // 이벤트 본문 대신 meta만 — 통지 콜백이 로그로 흘러도 payload가 함께 새지 않는 설계의 타입 증거
        expectTypeOf(meta).toEqualTypeOf<WebhookMeta>();
      },
    });

    // @ts-expect-error failOnRecordError는 boolean — 문자열 'true'로 켤 수 없다
    withWebhookInbox(inbox, handlers, { failOnRecordError: 'true' });
    // @ts-expect-error 알 수 없는 옵션 키 — 오타가 침묵으로 기본 동작(삼킴)이 되는 사고 차단
    withWebhookInbox(inbox, handlers, { onRecordFailure: () => {} });
  });
});

describe('§5 에러 모델 — code가 공개 계약이다(메시지는 아니다)', () => {
  it('isTossPostgresError는 TossPostgresError로 협착하는 타입 가드다', () => {
    expectTypeOf(isTossPostgresError).guards.toEqualTypeOf<TossPostgresError>();
  });

  it('code 유니언은 닫혀 있다 — 미등록 코드는 컴파일 에러', () => {
    const code: TossPostgresErrorCode = 'order-conflict';
    void code;
    // @ts-expect-error 등록되지 않은 코드 — 유니언이 공개 계약이라 소비자 분기 exhaustiveness가 지켜진다
    const bad: TossPostgresErrorCode = 'connection-lost';
    void bad;
  });
});
