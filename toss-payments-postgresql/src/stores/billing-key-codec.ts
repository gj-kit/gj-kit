/**
 * @internal billing_keys record codec — PostgreSQL 스토어와 `./testing`의 인메모리 대역이
 * **같은** 보호·복원·fingerprint·snapshot 규칙을 쓰기 위한 순수 헬퍼 모음.
 *
 * 이 모듈은 SQL을 모른다. 보호 payload 문자열·fingerprint·snapshot identity만 다루며,
 * 어느 구현이 어떤 저장 매체를 쓰든 record 계약과 보안 불변식은 여기서 한 번만 강제된다.
 *
 * ⚠ 보안 불변식(코어 stores.ts): 어떤 에러 메시지에도 billing_key 값을 싣지 않고,
 * customerKey와 billingKey를 같은 문자열(로그 한 줄)에 함께 두지 않는다.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';

import { TossPostgresError } from '../errors';
import {
  SENSITIVE_VALUE_PURPOSE,
  createSensitiveValueContext,
  requireProtectedString,
} from '../sensitive-values';
import type { SensitiveValueProtector } from '../sensitive-values';

const METHODS: ReadonlySet<string> = new Set(['카드', '계좌이체']);
const MAX_OPERATION_ID_LENGTH = 512;

/**
 * Opaque previous snapshot returned by `replaceAndGetPrevious`.
 *
 * Only `record` is readable, for recovery or display. Passing the original snapshot object
 * back to `replaceIfBillingKeyMatches` also restores the nonsecret operation fingerprint.
 * The fingerprint and the trusted record are linked only through a module-private
 * `WeakMap`, so JSON copies, spreads, manual reconstructions, or inheriting objects have no
 * registry identity and the lifecycle fence is intentionally false after such a restore.
 */
export interface PgBillingKeySnapshot {
  readonly record: BillingKeyRecord;
}

/** @internal 잠긴 행에서 읽은 record + fingerprint 쌍. */
export interface LockedBillingKeySnapshot {
  readonly record: BillingKeyRecord;
  /** SHA-256 hex only; raw operationId는 저장소/콜백 어느 쪽에도 노출하지 않는다. */
  readonly operationFingerprint: string | null;
}

/**
 * Public snapshot에는 record만 노출한다. 실제 복원에 사용할 record/fingerprint는 이
 * identity registry에서만 꺼내므로 `Object.create(snapshot)`나 symbol reflection으로
 * metadata를 상속/복사해도 trusted snapshot으로 오인하지 않는다.
 */
const billingKeySnapshotRegistry = new WeakMap<object, Readonly<LockedBillingKeySnapshot>>();

export function snapshotFromLoaded(snapshot: LockedBillingKeySnapshot): PgBillingKeySnapshot {
  // Caller가 `snapshot.record`를 mutation하여 다른 record + prior fingerprint 조합을
  // 만들 수 없도록 plain data를 복제해 동결한다. replacement에서는 아래 registry의
  // trusted record를 사용한다.
  const record = freezeBillingKeyRecord(snapshot.record);
  const sealed = Object.freeze({ record }) as PgBillingKeySnapshot;
  billingKeySnapshotRegistry.set(
    sealed,
    Object.freeze({ record, operationFingerprint: snapshot.operationFingerprint }),
  );
  return sealed;
}

function isPgBillingKeySnapshot(
  value: BillingKeyRecord | PgBillingKeySnapshot,
): value is PgBillingKeySnapshot {
  return billingKeySnapshotRegistry.has(value);
}

export function recordFromReplacement(
  replacement: BillingKeyRecord | PgBillingKeySnapshot,
): BillingKeyRecord {
  return isPgBillingKeySnapshot(replacement)
    ? billingKeySnapshotRegistry.get(replacement)?.record ?? replacement.record
    : replacement;
}

export function operationFingerprintFromReplacement(
  replacement: BillingKeyRecord | PgBillingKeySnapshot,
): string | null {
  return isPgBillingKeySnapshot(replacement)
    ? billingKeySnapshotRegistry.get(replacement)?.operationFingerprint ?? null
    : null;
}

export function freezeBillingKeyRecord(record: BillingKeyRecord): BillingKeyRecord {
  const card =
    record.card === null
      ? null
      : Object.freeze({
          issuerCode: record.card.issuerCode,
          number: record.card.number,
          cardType: record.card.cardType,
          ownerType: record.card.ownerType,
        });
  const transfers =
    record.transfers === null
      ? null
      : Object.freeze(
          record.transfers.map((transfer) =>
            Object.freeze({
              bankName: transfer.bankName,
              bankAccountNumber: transfer.bankAccountNumber,
            }),
          ),
        );
  return Object.freeze({
    customerKey: record.customerKey,
    billingKey: record.billingKey,
    method: record.method,
    issuedAt: record.issuedAt,
    card,
    transfers,
  });
}

/** BillingKeyRecord 전체를 JSON 직렬화한 뒤 purpose/customerKey AAD로 보호한 문자열. */
export async function protectBillingKeyRecord(
  record: BillingKeyRecord,
  sensitiveValueProtector: SensitiveValueProtector,
): Promise<string> {
  return requireProtectedString(
    await sensitiveValueProtector.encrypt(
      JSON.stringify(record),
      createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.billingKey, record.customerKey),
    ),
    'encrypt',
  );
}

/**
 * 보호 payload(컬럼 값 또는 인메모리 슬롯) → BillingKeyRecord 복원.
 * 문자열이 아닌 값은 저장소 손상이므로 숨기지 않는다(`invalid-row`).
 */
export async function unprotectBillingKeyRecord(
  protectedRecord: unknown,
  customerKey: BillingKeyRecord['customerKey'],
  sensitiveValueProtector: SensitiveValueProtector,
): Promise<BillingKeyRecord> {
  if (typeof protectedRecord !== 'string') {
    // 보안 불변식 — 메시지에 billingKey/customerKey 어느 쪽도 싣지 않는다.
    throw new TossPostgresError(
      'invalid-row',
      'billing_keys 행의 보호된 레코드가 문자열이 아닙니다.',
    );
  }
  const serialized = requireProtectedString(
    await sensitiveValueProtector.decrypt(
      protectedRecord,
      createSensitiveValueContext(SENSITIVE_VALUE_PURPOSE.billingKey, customerKey),
    ),
    'decrypt',
  );
  return parseBillingKeyRecord(serialized, customerKey);
}

/**
 * `0002` 이후 operation_fingerprint는 nullable text다. migration 전 fixture나 과거 행의
 * undefined/null은 fence 미지원(false)으로 취급한다. 다른 타입은 손상 행이므로 숨기지 않는다.
 */
export function readOperationFingerprint(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TossPostgresError(
      'invalid-row',
      'billing_keys 행의 operation fingerprint가 올바른 SHA-256 hex가 아닙니다.',
    );
  }
  return value;
}

/**
 * raw operationId는 저장하지 않는다. SHA-256은 authorization secret가 아니라 correlation
 * identifier의 DB 노출 면적을 줄이는 fingerprint이며, 일치 판정은 아래 constant-time 비교로
 * 다시 수행한다.
 */
export function fingerprintOperationId(operationId: string | undefined): string | null {
  if (operationId === undefined) return null;
  if (
    typeof operationId !== 'string' ||
    operationId.length === 0 ||
    operationId.length > MAX_OPERATION_ID_LENGTH
  ) {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] operationId는 1~512자 문자열이어야 합니다.',
    );
  }
  return createHash('sha256').update(operationId, 'utf8').digest('hex');
}

export function operationFingerprintsEqual(left: string, right: string | null): boolean {
  if (right === null) return false;
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function assertRecordCustomerKey(
  record: BillingKeyRecord,
  customerKey: BillingKeyRecord['customerKey'],
  label: 'record' | 'replacement',
): void {
  if (typeof record !== 'object' || record === null || record.customerKey !== customerKey) {
    // customerKey·billingKey를 에러에 싣지 않는다.
    throw new TypeError(
      `[@gj-kit/toss-payments-postgresql] ${label}의 customerKey는 대상 customerKey와 같아야 합니다.`,
    );
  }
}

/**
 * Node crypto의 timingSafeEqual은 길이가 같아야 한다. billing key의 실제 비교는 raw
 * `===`가 아니라 UTF-8 바이트의 상수 시간 비교로 하고, 길이만 별도 판정한다.
 */
export function billingKeysEqualConstantTime(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * 보호된 payload 복원. 암호문이 다른 customerKey의 행으로 옮겨졌다면 제대로 AAD를 쓴
 * 보호기는 decrypt 단계에서 먼저 거부한다. 그 구현 실수를 방어하고 data corruption을
 * 조용히 전파하지 않기 위해 payload 안의 customerKey도 조회 키와 일치시킨다.
 */
export function parseBillingKeyRecord(serialized: string, customerKey: string): BillingKeyRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    // 복호화 평문은 민감하다. JSON 파서 cause는 런타임에 따라 입력 일부를 포함할 수 있어
    // 의도적으로 cause 체인에 보존하지 않는다.
    throw new TossPostgresError(
      'invalid-row',
      'billing_keys 보호된 레코드의 JSON 파싱에 실패했습니다.',
    );
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TossPostgresError('invalid-row', 'billing_keys 행이 BillingKeyRecord 계약 형태가 아닙니다.');
  }
  const record = parsed as Record<string, unknown>;
  const billingKey = record['billingKey'];
  const method = record['method'];
  const issuedAt = record['issuedAt'];
  const storedCustomerKey = record['customerKey'];
  const card = record['card'];
  const transfers = record['transfers'];
  if (
    typeof billingKey !== 'string' ||
    typeof method !== 'string' ||
    !METHODS.has(method) ||
    typeof issuedAt !== 'string' ||
    storedCustomerKey !== customerKey ||
    (card !== null && (typeof card !== 'object' || Array.isArray(card))) ||
    (transfers !== null && !Array.isArray(transfers))
  ) {
    throw new TossPostgresError('invalid-row', 'billing_keys 행이 BillingKeyRecord 계약 형태가 아닙니다.');
  }
  return {
    customerKey,
    billingKey,
    method: method as BillingKeyRecord['method'],
    issuedAt,
    card: card as BillingKeyRecord['card'],
    transfers: transfers as BillingKeyRecord['transfers'],
  };
}
