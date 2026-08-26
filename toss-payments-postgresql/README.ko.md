# @gj-kit/toss-payments-postgresql

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

@gj-kit/toss-payments를 위한 PostgreSQL store, migration, inbox, 암호화 seam입니다.

## 설치

```sh
pnpm add @gj-kit/toss-payments-postgresql
```

## 사용할 때

앱이 connection lifecycle과 key custody를 유지하면서 Toss payment store에 검증된 PostgreSQL 구현이 필요할 때 사용합니다.

## 사용하지 않을 때

migration을 request 또는 앱 시작 시 실행하거나 production에서 plaintext protector를 사용하지 마세요.

## Golden path

SqlClient 또는 pg pool을 제공하고 배포 중 migration을 명시적으로 실행한 뒤 앱 소유 sensitive-value protector로 store factory를 조합합니다.

```ts
import * as gjKit from '@gj-kit/toss-payments-postgresql';

void gjKit;
```

## 런타임과 peer 조건

| Peer | 지원 범위 |
| --- | --- |
| `@gj-kit/toss-payments` | `^0.5.0 || ^0.6.0` |
| `@nestjs/common` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## 공개 entry point

- `@gj-kit/toss-payments-postgresql`
- `@gj-kit/toss-payments-postgresql/nestjs`
- `@gj-kit/toss-payments-postgresql/testing`

## 안전 경계

민감값에는 앱 소유 KMS 또는 key-management 경계를 사용하고, 명시적 migration은 한 번 실행하며, 정리 작업은 멱등적으로 유지하세요.

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/toss-payments-postgresql/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/toss-payments-postgresql/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/toss-payments-postgresql.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


[`@gj-kit/toss-payments`](../toss-payments/README.md)가 공개한 저장소 주입 seam 6종 — 주문 금액 원본(`OrderStore`), 가상계좌 secret(`DepositSecretStore`), 빌링키(`BillingKeyStore`), 취소 재시도 티켓(`CancelRetryStore`), 웹훅 중복 제거(`WebhookDedupeStore`), 감사 로그(`AuditSink`) — 의 PostgreSQL 구현입니다. 테이블 7종과 마이그레이션을 이 패키지가 소유하므로 프로덕션 채택이 "테이블을 설계하는 일"이 아니라 "설정하는 일"이 됩니다. billing key 레코드 전체·deposit secret·cancel retry 레코드는 앱이 제공한 비동기 `SensitiveValueProtector`를 거쳐서만 저장됩니다. 즉, 암호 알고리즘/KMS는 앱이 소유하되 평문 저장은 기본값으로 존재하지 않습니다. 웹훅 dedupe의 `claim`은 단일 문 CTE로 원자적으로 전이해 동시 재전송 N건 중 정확히 1건만 처리권을 얻고, 코어에 seam이 없는 이벤트 원문 보존은 웹훅 inbox 헬퍼(`withWebhookInbox`)로 제공합니다.

> **원칙 경계**: direct runtime dependency 0 — **`pg`조차 peer가 아닙니다.** `fromPgPool`은 구조적 타입 `PgPoolLike`만 소비하므로 `pg.Pool`이 그대로 대입되고, TypeORM 등 다른 드라이버 사용자는 `SqlClient`를 직접 구현하면 됩니다. `@nestjs/common`·`reflect-metadata`·`rxjs`는 `./nestjs` 서브패스 전용 optional peer이며, 루트 엔트리 `.`는 Nest 없이 동작합니다. 코어 `BillingKeyStore`에는 그대로 대입되며, stale webhook·projection 경쟁 방어는 PostgreSQL 전용 `PgBillingKeyStore` 확장으로 별도 제공됩니다. `./testing` 서브패스는 같은 aggregate 표면을 **DB 없이** 재현하는 인메모리 대역(`createMemoryTossPaymentsPostgres`)을 제공하고, 루트 엔트리의 `createAes256GcmSensitiveValueProtector`는 `node:crypto`만 쓰는 레퍼런스 보호기입니다 — 키 custody/rotation은 여전히 앱 소유입니다.

## 설치

```sh
pnpm add @gj-kit/toss-payments @gj-kit/toss-payments-postgresql
pnpm add pg   # 앱이 선택한 드라이버 — 이 패키지의 peer가 아닙니다
```

NestJS 배선(`./nestjs`)까지 쓰려면 [`@gj-kit/toss-payments-nestjs`](../toss-payments-nestjs/README.md)를 함께 설치하세요. Nest 앱에는 보통 이미 `@nestjs/common`, `reflect-metadata`, `rxjs`가 있습니다. 모든 주입은 명시적 토큰이므로 `emitDecoratorMetadata` 없이 SWC·esbuild에서도 동작합니다. `./testing` 서브패스는 추가 설치 없이 Node 내장 모듈만 씁니다.

## 골든 패스 — Pool 하나로 저장소 6종 + 파사드 배선

`createTossPaymentsPostgres`는 **순수 조립**입니다: 즉시 DB에 접속하지 않고 첫 쿼리가 첫 접점이며, 조립 시점에는 스키마 식별자 검증만 수행합니다(`/^[a-z_][a-z0-9_]{0,62}$/` 위반 시 즉시 throw — 설정 문자열이 SQL에 보간되는 유일한 지점의 봉쇄).

```ts
// payments/toss.ts — Pool → SqlClient → 집합체 → 코어 파사드
import { Pool } from 'pg';
import { orThrow } from '@gj-kit/toss-payments';
import {
  createTossPayments,
  defineTossPaymentsConfig,
  parseApiSecretKey,
} from '@gj-kit/toss-payments/server';
import { createTossPaymentsPostgres, fromPgPool } from '@gj-kit/toss-payments-postgresql';
import type {
  SensitiveValueContext,
  SensitiveValueProtector,
} from '@gj-kit/toss-payments-postgresql';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// 앱의 실제 KMS/AEAD 어댑터를 주입한다. 이 패키지는 crypto dependency를 소유하지 않는다.
const paymentEnvelopeCrypto = undefined as unknown as {
  encrypt(plaintext: string, options: { aad: string }): Promise<string>;
  decrypt(ciphertext: string, options: { aad: string }): Promise<string>;
};

// 앱이 키 관리·알고리즘을 소유한다. encrypt/decrypt 양쪽에서 purpose + recordId를
// 같은 AAD로 결속해야, 암호문 행 교체/다른 용도 재사용을 AEAD가 거부한다.
const aad = ({ purpose, recordId }: SensitiveValueContext) =>
  `gj-kit/toss-payments-postgresql:v1:${purpose}:${recordId}`;
const sensitiveValueProtector: SensitiveValueProtector = {
  encrypt: (plaintext, context) => paymentEnvelopeCrypto.encrypt(plaintext, { aad: aad(context) }),
  decrypt: (ciphertext, context) => paymentEnvelopeCrypto.decrypt(ciphertext, { aad: aad(context) }),
};

// 순수 조립 — 즉시 DB 접속 없음, 자동 DDL 없음, 자동 cleanup 타이머 없음.
export const pg = createTossPaymentsPostgres({
  sql: fromPgPool(pool),
  sensitiveValueProtector, // 필수 — billing/deposit/cancel 평문 fallback 없음
  // schema: 'toss_payments',                                  // 기본값
  // dedupe: { leaseSeconds: 60, completedTtlSeconds: 432_000 }, // 기본값 (5일)
  // retention: { cancelRetryDays: 15 },                       // 기본값 — 토스 멱등키 유효기간
});

export const tossConfig = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
  orders: pg.orders,                 // 금액 대조의 단일 진실 공급원 — insert-only, 동일값 재저장만 멱등
  depositSecrets: pg.depositSecrets, // 1회 배선 → confirm측 자동 저장 + 웹훅측 대조 양쪽 커버
  billingKeys: pg.billingKeys,
  cancelRetries: pg.cancelRetries,
  webhook: { dedupe: pg.webhookDedupe, autoRefetch: true },
  audit: { sink: pg.audit },
});

export const toss = createTossPayments(tossConfig);
```

## 민감값 보호 — 필수 설정, AAD binding, 개발 DB opt-in

`createTossPaymentsPostgres`와 세 개의 개별 스토어 팩토리(`createPgBillingKeyStore`,
`createPgDepositSecretStore`, `createPgCancelRetryStore`)는 모두
`sensitiveValueProtector`를 **필수**로 받습니다. seam 자체는 특정 KMS·암호 라이브러리에
의존하지 않습니다 — 앱의 AEAD/envelope-encryption/KMS 어댑터가 아래 contract를 구현하거나,
KMS 없이 키 하나로 충분하다면 바로 다음 절의 [레퍼런스 AES-256-GCM 보호기](#레퍼런스-aes-256-gcm-보호기--키만-넘기면-seam-context를-aad로-결속한다)를
씁니다.

```ts
import type {
  SensitiveValueContext,
  SensitiveValueProtector,
} from '@gj-kit/toss-payments-postgresql';

const appKeyService = undefined as unknown as {
  encrypt(plaintext: string, options: { aad: string }): Promise<string>;
  decrypt(ciphertext: string, options: { aad: string }): Promise<string>;
};

const sensitiveValueProtector: SensitiveValueProtector = {
  async encrypt(plaintext, context) {
    // random nonce/IV + authenticated encryption. context 두 필드를 AAD에 모두 넣는다.
    return appKeyService.encrypt(plaintext, {
      aad: `toss-pg:v1:${context.purpose}:${context.recordId}`,
    });
  },
  async decrypt(ciphertext, context) {
    return appKeyService.decrypt(ciphertext, {
      aad: `toss-pg:v1:${context.purpose}:${context.recordId}`,
    });
  },
};
```

스토어가 전달하는 고정 context는 다음과 같습니다. `purpose`와 DB lookup key를 AAD에
함께 넣어야 동일 암호문을 다른 행/용도로 옮기는 공격을 막을 수 있습니다.

| 저장소 | 보호 범위 | context |
|---|---|---|
| `billing_keys` | `BillingKeyRecord` 전체 (billing key·card/account metadata 포함) | `{ purpose: 'billing-key', recordId: customerKey }` |
| `deposit_secrets` | secret 문자열 | `{ purpose: 'deposit-secret', recordId: orderId }` |
| `cancel_retries` | JSON 직렬화된 `CancelRetryRecord` 전체 | `{ purpose: 'cancel-retry-record', recordId: ticketId }` |

`encrypt`/`decrypt` 실패는 숨기거나 평문으로 재시도하지 않고 그대로 호출자에게 전달됩니다.
보호기 구현도 오류 메시지·telemetry에 입력값을 넣지 않아야 합니다. `cancelRetries`의
`bodyJson`은 여전히 코드 유닛 단위로 무손실 복원되므로 동일 멱등키+동일 요청 바이트
재생 계약이 유지됩니다.

로컬 테스트/일회성 개발 DB에서만 아래처럼 의도적으로 평문으로 열 수 있습니다. 이
상수는 이름대로 unsafe이며 프로덕션 설정에 두지 마세요.

```ts
import {
  createTossPaymentsPostgres,
  unsafePlaintextSensitiveValueProtector,
} from '@gj-kit/toss-payments-postgresql';

const sql = undefined as never;

const pg = createTossPaymentsPostgres({
  sql,
  sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
});
```

이전 `0.1.x`가 만든 평문 행은 새 안전 모드에서 자동으로 읽거나 재암호화하지 않습니다.
배포 전 서비스라면 해당 개발 schema를 비우고 다시 만들고, 이미 운영 중인 소비자는
이전 버전으로 레코드를 안전하게 export한 뒤 새 보호기를 통해 다시 저장하는 명시적
cutover를 수행하세요. `0001_init`은 변경하지 않았으며 이 보안 변경은 런타임 저장
형식 변경이므로 release notes의 breaking migration 안내를 따릅니다. 현재 release의
`0002_billing_key_operation_fingerprint`도 append-only로 적용됩니다. 이것은 raw key나
operationId를 저장하지 않고 lifecycle fence용 SHA-256 fingerprint만 추가합니다.

## 레퍼런스 AES-256-GCM 보호기 — 키만 넘기면 seam context를 AAD로 결속한다

`createAes256GcmSensitiveValueProtector({ key, keyId? })`는 `node:crypto`만으로
`SensitiveValueProtector`를 만드는 레퍼런스 구현입니다. 앱이 contract를 직접 구현하면서 AAD를
빠뜨리거나 IV를 재사용하는 실수를 없애기 위한 것이고, 설계 §10의 경계는 그대로입니다:
**키 생성·보관·회전·폐기는 앱 소유**이며 이 패키지는 키를 만들거나 어디에도 저장하지 않습니다.
KMS envelope encryption이 필요한 조직은 이 구현 대신 자기 어댑터를 씁니다.

```ts
// payments/protector.ts — 키는 secret manager에서, 보호기는 프로세스당 1회 조립
import { createAes256GcmSensitiveValueProtector } from '@gj-kit/toss-payments-postgresql';

// `openssl rand -hex 32`로 만든 64자 hex(또는 32-byte Uint8Array). 로그·에러 어디에도 찍히지 않는다.
export const sensitiveValueProtector = createAes256GcmSensitiveValueProtector({
  key: process.env.TOSS_PG_SENSITIVE_VALUE_KEY!,
  keyId: '2026-08', // 선택 — 봉투 kid + AAD에 결속. 회전 시 어느 키로 봉했는지 식별한다.
});
```

계약:

- **알고리즘/봉투**: AES-256-GCM, `encrypt`마다 새 random 12-byte IV, 16-byte tag. 저장 문자열은 JSON
  `{ "v": 1, "alg": "A256GCM", "kid"?: string, "iv": base64, "tag": base64, "value": base64 }`이며
  키 순서가 고정된 공개 형식이라 다른 언어/도구에서 재구현할 수 있습니다.
- **AAD** — 아래 바이트열이 정본이며, ECMAScript 없이도 그대로 재현할 수 있습니다. 스토어가
  전달하는 `purpose`와 `recordId`(customerKey/orderId/ticketId)가 모두 결속되므로 암호문을 다른
  행·다른 용도로 옮기면 복호화가 거부됩니다.
  1. ASCII namespace `@gj-kit/toss-payments-postgresql:sensitive-value:A256GCM:v1`
  2. 단일 바이트 `0x00`
  3. 다음 규칙의 JSON 객체를 UTF-8로: **공백 없음** · **키 순서 고정** `purpose`, `recordId`,
     `kid`(keyId가 없으면 JSON `null`) · 문자열 escaping은 `"`→`\"`, `\`→`\\`,
     U+0008/0009/000A/000C/000D→`\b` `\t` `\n` `\f` `\r`, 그 외 U+0000–U+001F→`\u00XX`(소문자
     hex), 비페어 서로게이트→`\uDXXX`(소문자 hex)뿐이고, **그 밖의 모든 문자**(비ASCII·`/`·
     U+007F·U+2028/2029 포함)는 escape 없이 UTF-8 원문 그대로입니다.

  예: purpose `billing-key`, recordId `cust_é`, keyId 없음 →
  `{"purpose":"billing-key","recordId":"cust_é","kid":null}` (é는 `0xC3 0xA9` 두 바이트).
  이 규칙은 ECMAScript `JSON.stringify`의 출력과 바이트 단위로 일치하지만, 다른 언어의 기본
  직렬화(구분자 뒤 공백, 비ASCII `\uXXXX` escaping — 예: Python `json.dumps` 기본값)는 다른
  바이트를 만들어 **모든 복호화가 진단 없는 `'authentication-failed'`가 됩니다**. 고정
  test vector와 독립 재구현 상호 운용 검증은 `tests/unit/aes-gcm-protector.test.ts`에 있습니다.
- **평문**: well-formed UTF-16만 받습니다 — 비페어 서로게이트가 있으면 UTF-8 인코딩이 U+FFFD로
  치환해 **원문과 다른 값을 조용히 봉인**하게 되므로, `encrypt`가 `TypeError`로 거부합니다
  (메시지에 평문은 실리지 않습니다).
- **키**: 정확히 32 bytes — `Uint8Array`/`Buffer` 또는 64자 hex. 아니면 조립 시점에 `TypeError`.
  bytes는 조립 시 복사되어 호출자 버퍼를 지워도 영향이 없습니다. `keyId`는 1~128자 문자열입니다.
- **실패**: `decrypt`는 `SensitiveValueProtectorError`로 거부하고 `code`가 공개 계약입니다
  (`isSensitiveValueProtectorError`로 판별 — `instanceof`는 ESM/CJS 이중 로드에서 불안정).
  메시지·`cause` 어디에도 키·평문·암호문이 없습니다.

| `code` | 뜻 |
|---|---|
| `'invalid-envelope'` | 저장 문자열이 v1 A256GCM 봉투가 아님 — 0.1.x 평문 행, 손상, 다른 구현의 포맷 |
| `'key-id-mismatch'` | 봉투 `kid`와 보호기 `keyId`가 다름(한쪽만 있는 경우 포함). 암호 연산 전에 판정 |
| `'authentication-failed'` | 잘못된 키·다른 purpose/recordId·변조 — **원인을 구분하지 않는 단일 code** |

회전은 앱이 합니다. 새 `keyId`의 보호기를 `sensitiveValueProtector`로 배선하고, 옛 행은
`'key-id-mismatch'`를 받으면 옛 키 보호기로 복호화해 다시 저장하는 cutover를 앱이 수행합니다.
`kid`가 AAD에도 들어가므로 `keyId`를 바꾸는 것은 키를 바꾸는 것과 같이 재암호화가 필요합니다.
회전 시점에는 **키별 encrypt 예산**도 포함하세요: 이 구현은 `encrypt`마다 random 96-bit IV를
쓰므로 NIST SP 800-38D §8.3에 따라 **한 키로 2^32회의 `encrypt` 호출을 넘기기 전에** 새 키로
회전해야 합니다(IV 충돌 확률 한계). 라이브러리는 호출 횟수를 세지 않습니다 — 카운팅과 회전
시점 판단(달력 기준이든 호출량 기준이든 먼저 오는 쪽)은 키 custody와 함께 앱 소유입니다.

```ts
// payments/protector-rotation.ts — 옛 키를 읽기 전용으로 두는 앱 소유 합성 예시
import {
  createAes256GcmSensitiveValueProtector,
  isSensitiveValueProtectorError,
} from '@gj-kit/toss-payments-postgresql';
import type { SensitiveValueProtector } from '@gj-kit/toss-payments-postgresql';

const current = createAes256GcmSensitiveValueProtector({ key: process.env.TOSS_PG_KEY_2026_08!, keyId: '2026-08' });
const previous = createAes256GcmSensitiveValueProtector({ key: process.env.TOSS_PG_KEY_2026_02!, keyId: '2026-02' });

// 쓰기는 항상 current, 읽기는 kid가 안 맞을 때만 previous로 — 재저장(재암호화)은 앱의 cutover 작업
export const sensitiveValueProtector: SensitiveValueProtector = {
  encrypt: (plaintext, context) => current.encrypt(plaintext, context),
  async decrypt(ciphertext, context) {
    try {
      return await current.decrypt(ciphertext, context);
    } catch (error) {
      if (isSensitiveValueProtectorError(error) && error.code === 'key-id-mismatch') {
        return previous.decrypt(ciphertext, context);
      }
      throw error;
    }
  },
};
```

부팅 시퀀스는 항상 **migrate → listen** 순서입니다. 이 패키지는 부팅 시 자동 DDL을 실행하지 않습니다 — `migrate()`는 명시 호출 전용입니다.

```ts
// server.ts — migrate가 끝난 뒤에만 트래픽을 받는다
import { pg } from '@/payments/toss';

const result = await pg.migrate();
console.log(`toss migrate — applied: [${result.applied.join(', ')}] skipped: [${result.skipped.join(', ')}]`);
// 이후 서버 listen 시작
```

`migrate()`의 계약:

- **단일 커넥션 + 단일 트랜잭션** — PostgreSQL DDL은 트랜잭셔널이라 중간 실패가 반쪽 스키마를 남기지 않습니다. 실패 시 ROLLBACK 후 `migration-failed`로 감싸 rethrow합니다(원인은 `cause` 체인).
- **동시 부팅 직렬화** — `pg_advisory_xact_lock`으로 여러 인스턴스의 동시 migrate를 직렬화합니다. 락 키는 `'@gj-kit/toss-payments-postgresql:' + schema`의 FNV-1a 64bit 해시이며, `advisoryLockKey(schema)`로 어디서든 재계산할 수 있습니다.
- **멱등** — 적용된 id는 버전 테이블 `toss_pg_migrations`에 기록되고, 두 번째 실행은 전부 `skipped`로 보고됩니다.

Flyway/dbmate 등 자체 마이그레이션 도구를 쓴다면 SQL 원문을 꺼내 저장하세요:

```ts
// scripts/render-toss-sql.ts — 자체 마이그레이션 도구 사용자
import { renderMigrationSql } from '@gj-kit/toss-payments-postgresql';

const script = renderMigrationSql({ schema: 'toss_payments' });
// migrate()와 동일한 SQL(버전 테이블 관리 문 제외) — V0001 init + V0002 fingerprint 등으로 저장
console.log(script);
```

## 빌링키 lifecycle fence — stale 삭제와 projection 경쟁

코어 `BillingKeyStore.delete({ customerKey, expectedBillingKey })` 자체가 **조건부** 연산입니다.
지연된 `BILLING_DELETED`·stale `BillingProfile`은 현재 보호 record의 raw key와 일치할 때만
삭제되고, missing/mismatch면 `false`로 끝나므로 재발급된 더 새 키를 지우지 않습니다.
`createPgBillingKeyStore`와 aggregate의 `billingKeys`는 이 compare/decrypt/delete를 같은
connection transaction에서 수행해야 하므로 `SqlExecutor`가 아니라 `SqlClient`를 요구합니다.
PostgreSQL aggregate의 `billingKeys`는 코어 타입에 대입 가능한 `PgBillingKeyStore`이며, 다음
추가 API를 제공합니다.

```ts
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';
import { pg } from '@/payments/toss';

const customerKey = undefined as unknown as BillingKeyRecord['customerKey'];
const deletedWebhookBillingKey = undefined as unknown as BillingKeyRecord['billingKey'];

// 오래된 BILLING_DELETED가 새 issuance를 지우지 않는다.
// 행이 없거나 현재 key가 다르면 false — 장애가 아니라 안전한 no-op이다.
const deleted = await pg.billingKeys.deleteIfBillingKeyMatches({
  customerKey,
  expectedBillingKey: deletedWebhookBillingKey,
});
```

`deleteIfBillingKeyMatches({ customerKey, expectedBillingKey })`와
`replaceIfBillingKeyMatches(customerKey, expectedKey, replacement)`는
단일 PostgreSQL transaction에서 customerKey advisory lock → `SELECT … FOR UPDATE` → 보호 payload
복호화 → `timingSafeEqual` 비교 → `DELETE` 또는 `UPDATE`를 실행합니다. `replacement: null`은
조건부 삭제입니다. 행 손상·복호화 실패는 숨기지 않고 throw하며, `false`는 **missing/mismatch**만
뜻합니다.

하지만 generic 저장과 앱 projection의 완료 순서까지 맞춰야 한다면 짧은 conditional 메서드만
연결하지 마세요. customerKey만으로 충분한 내부 mutation은 `withMutationLock`을 쓸 수 있지만,
앱 lifecycle HMAC/blind-index gate와 billing-key mutation을 **함께** 잡아야 하는 issuance,
revocation, compensation은 반드시 `withOpaqueMutationLock`을 쓰세요. 이 API는 하나의
PostgreSQL connection/transaction에서 `opaque → customerKey` 순으로 두 advisory lock을 잡고,
둘 다 얻은 뒤에만 기존 mutation handle을 callback에 넘깁니다. lock SQL은 널리 지원되는
`pg_advisory_xact_lock(hashtext($1), hashtext($2))` 두-int 형태이며, 해시 충돌은 unrelated work를
추가 직렬화할 뿐 같은 key의 안전성을 약화하지 않습니다.

```ts
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';
import { createOpaqueAdvisoryLockKey } from '@gj-kit/toss-payments-postgresql';
import { pg } from '@/payments/toss';

const issued = undefined as unknown as BillingKeyRecord;
const writeBillingProjection = undefined as unknown as (record: BillingKeyRecord) => Promise<void>;
const appLifecycleBlindIndex = undefined as unknown as (
  scope: 'billing-credential-lifecycle',
  rawCredentialId: string,
) => string;
const rawCredentialId = undefined as unknown as string;
const opaqueKey = createOpaqueAdvisoryLockKey(
  appLifecycleBlindIndex('billing-credential-lifecycle', rawCredentialId),
);

await pg.billingKeys.withOpaqueMutationLock(opaqueKey, issued.customerKey, async (mutation) => {
  // find() + save()의 외부 gap 없이 직전 snapshot과 새 generic record를 한 transaction에 둔다.
  const previous = await mutation.replaceAndGetPrevious(issued);

  // 예: 같은 customerKey의 Prisma projection transaction. Toss API/네트워크 I/O는 여기서 하지 않는다.
  await writeBillingProjection(issued);

  // 정상 반환하면 generic transaction commit. callback이 throw하면 generic 변경은 ROLLBACK된다.
  // previous는 PgBillingKeySnapshot이다. 원본을 conditional restore에 그대로 넘기면
  // prior operation fingerprint도 보존된다. JSON/spread 복제본은 fingerprint를 잃어 fail-closed다.
  void previous;
});
```

**두 public lock API를 중첩하지 마세요.**

```text
// 금지: `withConnection` 두 개가 생겨 pool max=1에서 self-deadlock하고,
// opaque/customer lock이 같은 transaction이라는 보장도 사라진다.
await pg.opaqueLocks.withLock(opaqueKey, () =>
  pg.billingKeys.withMutationLock(issued.customerKey, async () => undefined),
);
```

반대 순서(`withMutationLock` 안에서 `opaqueLocks.withLock`)도 금지입니다. 결합 경로의 global
order는 라이브러리가 강제하는 **opaque → customerKey** 하나뿐입니다. callback에서는 전달된
`mutation` handle만 사용하고, callback 바깥 `pg.billingKeys`를 다시 호출하지 마세요.

### 발급 후 operation fence — external projection 역완료 방지

core `billing.issue(auth, { idempotencyKey })`는 그 idempotency key를
`store.save(record, { operationId })`로 자동 전달합니다. PostgreSQL은 raw operationId가 아니라
SHA-256 fingerprint만 `billing_keys.operation_fingerprint`에 보관하고, locked mutation에서만
`isCurrentOperationId(operationId)`로 현재 row와 대조합니다. 앱이 별도 intent/subscription
projection을 **발급 반환 뒤** 완료한다면 다음처럼 같은 intent-derived operationId를 다시
확인하세요.

```ts
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';
import { pg } from '@/payments/toss';

const customerKey = undefined as unknown as BillingKeyRecord['customerKey'];
const operationId = undefined as unknown as string; // 해당 issuance의 unique idempotency key; secret/key/card 값 금지
const finishLocalIntentAndSubscription = undefined as unknown as () => Promise<void>;

await pg.billingKeys.withMutationLock(customerKey, async (mutation) => {
  if (!(await mutation.isCurrentOperationId(operationId))) {
    throw new Error('billing issuance is no longer current'); // fail closed; no raw values in the error
  }
  await finishLocalIntentAndSubscription(); // local durable work only
});
```

이 operation fence는 **post-persistence** finalization이 A/B 역순으로 끝나며 A가 B credential을
자기 intent에 붙이는 문제를 막습니다. provider 요청 자체의 순서를 보장하거나 두 auth intent의
제품 정책을 결정하지는 않습니다. 같은 customer의 provider 호출도 직렬화해야 한다면 앱은
provider 호출 전의 durable per-customer gate를 별도로 가져야 합니다. store wrapper는
`save(record, options)`의 options를 반드시 `mutation.save(record, options)`로 전달해야 하며,
idempotencyKey/operationId를 생략한 발급은 이 fence로 확인할 수 없습니다.

중요한 운영 경계:

- callback 안에서는 전달받은 `mutation` handle만 사용하세요. 바깥 `pg.billingKeys`의 변경
  API(`save`/`delete`/`replaceAndGetPrevious`/conditional/lock API)를 다시 호출하면 다른
  connection이 같은 advisory lock을 기다려 deadlock이 납니다. lock을 잡지 않는 바깥
  `pg.billingKeys.find`는 deadlock은 아니지만 **다른 connection의 READ COMMITTED 읽기**라
  callback이 아직 COMMIT하지 않은 값을 보지 못하고(이전 값 또는 `null`), pool `max: 1`에서는
  connection이 없어 멈춥니다 — callback 안의 읽기도 `mutation.find()`를 쓰세요. handle은 해당
  customerKey에 고정되어 다른 customerKey record를 저장하면 throw합니다.
- callback에는 Toss/provider 호출·HTTP·긴 네트워크 I/O를 넣지 마세요. 보호기에 필요한
  encrypt/decrypt만 라이브러리 내부에서 수행되므로 protector는 low-latency로 유지합니다.
- Prisma 등 별도 connection의 projection transaction은 **순서화되지만 generic transaction과
  2PC 원자성은 아닙니다.** callback 반환 뒤 generic `COMMIT`이 실패하면 요청을 fail-closed로
  처리하고, generic row와 projection을 reconciliation/retry 대상으로 남기세요. 성공을 먼저
  응답하거나 민감값을 로그에 남기면 안 됩니다.
- callback이 throw하면 generic billing key 변경은 rollback됩니다. projection도 자체 DB
  transaction으로 rollback되게 만들거나, 외부 side effect는 명시적 reconciliation을 둬야 합니다.

`replaceAndGetPrevious(record)`의 top-level 버전은 generic storage snapshot만 원자화합니다. host
projection lifecycle까지 보호하지 않으므로 위 callback 없이 `find → save → projection` 보상에
사용하지 마세요.

## 앱 lifecycle 순서화 — opaque advisory lock

`pg.opaqueLocks`는 결제 도메인 정책을 추가하지 않는, 앱 소유 lifecycle용 **짧은** PostgreSQL
advisory transaction-lock facility입니다. 예를 들어 같은 구독 credential의 발급/삭제/갱신
finalization이 여러 API 인스턴스·worker에서 역순으로 끝나면 안 되는 경우, 앱이 만든
nonsecret HMAC 또는 blind-index 문자열로 그 작업만 직렬화할 수 있습니다. 원본 customer ID,
email, billing key, authorization secret을 이 API에 직접 넘기지 마세요.

`pg.opaqueLocks.withLock`은 **candidate-null webhook처럼 billing-key mutation handle이 필요 없는
host-only 작업**에 쓰세요. billing-key issuance/delete/compensation처럼 customer mutation도 필요한
경로는 위의 `pg.billingKeys.withOpaqueMutationLock`만 사용합니다.

```ts
// subscriptions/billing-lifecycle.ts
import {
  createOpaqueAdvisoryLockKey,
} from '@gj-kit/toss-payments-postgresql';
import { pg } from '@/payments/toss';

// 앱이 key management + canonicalization을 소유한다. 반환값은 raw 식별자가 아닌
// nonsecret HMAC/blind-index여야 하며, scope/version을 포함해 용도 간 충돌을 막는다.
const appLifecycleBlindIndex = undefined as unknown as (
  scope: 'billing-credential-lifecycle',
  rawCredentialId: string,
) => string;
const rawCredentialId = undefined as unknown as string;
const finishLocalLifecycle = undefined as unknown as () => Promise<void>;

const lockKey = createOpaqueAdvisoryLockKey(
  appLifecycleBlindIndex('billing-credential-lifecycle', rawCredentialId),
);

await pg.opaqueLocks.withLock(lockKey, async () => {
  // Prisma/ORM의 짧은 durable transaction, conditional state transition, outbox enqueue 등.
  // Toss/provider/HTTP 호출처럼 오래 걸리거나 외부 side effect인 작업은 여기에 넣지 않는다.
  await finishLocalLifecycle();
});
```

`createOpaqueAdvisoryLockKey()`는 1~512 UTF-8 byte 문자열만 받고 branded type을 반환합니다.
그래서 raw string은 실수로 `withLock`에 넘길 수 없고, 호출부가 HMAC/blind-index 생성이라는
보안 결정을 명시해야 합니다. 라이브러리는 그 opaque 값도 SQL parameter에 직접 전달하지
않습니다. 고정 namespace와 schema를 포함해 domain-separate한 SHA-256 fingerprint만
`pg_advisory_xact_lock(hashtext($1), hashtext($2))`에 전달합니다. lock hash collision은 서로
다른 작업을 추가로 직렬화할 뿐, 같은 key의 상호 배제를 약화하지 않습니다.

이 facility는 별도 테이블·migration을 만들지 않습니다. aggregate의 `schema`는 lock namespace
분리에만 쓰므로, migration 전에도 short-lived host lifecycle gate로 사용할 수 있습니다. 다만
callback 안에서 **같은 key**로 `pg.opaqueLocks.withLock()`을 다시 호출하면 다른 connection이
바깥 xact lock을 기다려 self-deadlock합니다. billing-key mutation을 함께 해야 한다면 위의
combined API로 바꾸고, 여러 independent key가 필요하면 앱 전체에서 일관된 lock 획득 순서를
정하세요.

이 API는 한 library connection에서 `BEGIN → advisory lock → callback → COMMIT`을 수행하고,
callback/락 획득 실패 시 `ROLLBACK`합니다. PostgreSQL transaction-scoped lock이라
commit/rollback과 함께 자동 해제되어 session lock이 남지 않습니다. 다만 callback 안의
Prisma 등 **다른 connection** transaction과 2PC 원자성을 만들지는 않습니다. 이는 durable
idempotency, conditional write, outbox/reconciliation을 대체하지 않고 오직 cross-process
순서화만 제공합니다. 앱 DB가 commit된 뒤 library connection의 commit이 실패하면 요청을
fail-closed로 처리하고 reconciliation으로 수습하세요.

## NestJS 배선

`TossPaymentsPostgresModule`은 `TOSS_PAYMENTS_POSTGRES` **단일 토큰**으로 `TossPaymentsPostgres` 집합체 전체를 제공·export합니다. 스토어별 토큰 6개로 쪼개지 않습니다 — 배선 누락 여지를 없애고, 미배선 플로우는 코어 파사드의 조건부 타입이 이미 컴파일 에러로 만듭니다.

config는 `defineTossPaymentsConfig`로 정의 시점에 고정하고, kit 타입은 `TossPaymentsFor`로 복원하세요:

```ts
// payments/toss.config.ts — config 정의 시점에 kit 타입을 고정한다
import { orThrow } from '@gj-kit/toss-payments';
import { defineTossPaymentsConfig, parseApiSecretKey } from '@gj-kit/toss-payments/server';
import type { TossPaymentsFor } from '@gj-kit/toss-payments-nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';

export const buildTossConfig = (pg: TossPaymentsPostgres) =>
  defineTossPaymentsConfig({
    secretKey: orThrow(parseApiSecretKey(process.env.TOSS_SECRET_KEY!)),
    orders: pg.orders,
    depositSecrets: pg.depositSecrets,
    billingKeys: pg.billingKeys,
    cancelRetries: pg.cancelRetries,
    webhook: { dedupe: pg.webhookDedupe, autoRefetch: true },
    audit: { sink: pg.audit },
  });

export type AppToss = TossPaymentsFor<ReturnType<typeof buildTossConfig>>;
```

```ts
// app.module.ts — 집합체 모듈 → 코어 파사드 모듈 연쇄
import { Module } from '@nestjs/common';
import { Pool } from 'pg';
import { TossPaymentsModule } from '@gj-kit/toss-payments-nestjs';
import { fromPgPool } from '@gj-kit/toss-payments-postgresql';
import {
  TOSS_PAYMENTS_POSTGRES,
  TossPaymentsPostgresModule,
} from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import { buildTossConfig } from '@/payments/toss.config';

// 앱의 실제 KMS/AEAD protector provider를 import해 사용한다.
const sensitiveValueProtector = undefined as never;
// Pool은 앱 lifecycle이 소유하는 singleton이다. forRootAsync 안에서 매번 만들지 않는다.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

@Module({
  imports: [
    TossPaymentsModule.forRootAsync({
      // useFactory가 주입받을 provider는 이 imports에서 와야 한다 (Nest DynamicModule 규칙)
      imports: [
        TossPaymentsPostgresModule.forRootAsync({
          useFactory: () => ({
            sql: fromPgPool(pool),
            sensitiveValueProtector,
          }),
        }),
      ],
      inject: [TOSS_PAYMENTS_POSTGRES],
      useFactory: (pg: TossPaymentsPostgres) => buildTossConfig(pg),
    }),
  ],
})
export class AppModule {}
```

두 모듈 모두 기본값이 `global: true`입니다. 모듈 경계를 엄격히 유지하려면 `{ global: false }`를 명시하고 필요한 feature module에 직접 import하세요.

migrate는 모듈이 자동 실행하지 않습니다 — `main.ts`에서 `await pg.migrate()` 후 `app.listen`이 골든 패스입니다:

```ts
// main.ts — migrate 후 listen (모듈은 자동 DDL을 실행하지 않는다)
import { NestFactory } from '@nestjs/core';
import { TOSS_PAYMENTS_POSTGRES } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import { AppModule } from '@/app.module';

const app = await NestFactory.create(AppModule, { rawBody: true }); // rawBody — 웹훅 검증 전제
app.enableShutdownHooks(); // SIGTERM/SIGINT에서 app-owned lifecycle provider를 호출
const pg = app.get<TossPaymentsPostgres>(TOSS_PAYMENTS_POSTGRES);
await pg.migrate();
await app.listen(3000);
```

`pg.Pool`은 앱이 소유하는 singleton provider로 만들고, **같은 Pool**을 `fromPgPool`에 전달하세요.
`forRootAsync` factory 안에서 새 Pool을 만들면 종료 때 추적할 수 없고 connection leak가 납니다.
Nest shutdown provider에서는 `await pg.audit.flush()` 후 `await pool.end()`를 정확히 한 번 호출합니다.
`pg.migrate()`는 `app.listen()` 전에 await해야 하며, 실패하면 listen하지 말고 부팅을 실패 처리하세요.
모듈은 migration·cleanup을 자동 실행하지 않습니다.

## 웹훅 — dedupe 배선과 inbox

`pg.webhookDedupe`는 코어 `WebhookDedupeStore` 계약의 원자적 구현입니다:

- `claim`은 **단일 문 CTE**로 전이합니다 — 조회 후 생성 2단계(TOCTOU)가 없으므로, 동시 재전송 N건 중 정확히 1건만 `'claimed'`를 받습니다. 이미 처리 중이면 `'processing'`(어댑터가 503 → 토스 재전송), 처리 완료면 `'completed'`(어댑터가 200 ack 후 스킵)입니다.
- 처리 중 크래시에 대비한 lease(기본 60초)가 만료되면 다음 수신이 재점유합니다.
- `completed` 행은 기본 5일(코어 권장 — 토스 최장 재전송 기간보다 길게) 보존되어 재전송을 계속 걸러내고, 삭제는 `cleanup()` 호출 시에만 일어납니다.

웹훅 **inbox**는 스토어 seam이 아니라 `WebhookHandlers`를 감싸는 헬퍼입니다(코어 `claim`에는 이벤트 메타가 전달되지 않으므로 — 코어 계약 무변경). 사업 이벤트 1건 = 1행(`dedupe_key` PK)이고 재전송은 `deliveries` 증가로 관측됩니다. record는 핸들러 **앞**에서 실행되어 핸들러가 실패해도 수신 사실은 남습니다(감사·재처리 목적). 저장본에는 두 가지 정화가 적용됩니다: ① 모든 깊이의 `secret`, `billingKey`, `authKey`, token, password, credential, API/private/security key, card/account number 계열 키는 `'[REDACTED]'`로 마스킹됩니다. 새 provider 필드·중첩 `raw`에도 같은 규칙이 재귀 적용되고, **핸들러가 받는 이벤트 객체는 절대 변형하지 않습니다.** ② jsonb가 저장을 거부하는 U+0000·비페어 서로게이트는 U+FFFD로 치환됩니다 — `failOnRecordError: true`에서 특정 웹훅이 영구 재전송 실패 루프(poison message)가 되는 것을 막습니다.

```ts
// app/api/webhooks/toss/route.ts — Next.js Route Handler (Fetch 표준 어댑터)
import { withWebhookInbox } from '@gj-kit/toss-payments-postgresql';
import { pg, toss } from '@/payments/toss';

export const POST = toss.webhook.fetchHandler(
  withWebhookInbox(pg.inbox, {
    onDepositCallback: async (webhook) => {
      // trust: 'secret' — 저장된 secret 대조 통과. 가상계좌 입금 반영은 여기서.
    },
    onPaymentStatusChanged: async (webhook) => {
      if (webhook.prefetched?.ok) {
        // payload가 아니라 조회 재확인 결과(prefetched.value)로 상태를 갱신한다
      }
    },
  }),
);
```

Nest 컨트롤러에서는 [`toNestWebhookHandler`](../toss-payments-nestjs/README.md#웹훅을-추가한다면-rawbody부터)에 감싼 handlers를 그대로 넘깁니다(부트스트랩의 `rawBody: true` 전제):

```ts
// webhooks/toss-webhook.controller.ts
import { Controller, Post, Req, Res } from '@nestjs/common';
import type { NodeServerResponseLike } from '@gj-kit/toss-payments/webhook';
import { InjectTossPayments, toNestWebhookHandler } from '@gj-kit/toss-payments-nestjs';
import type { NestWebhookRequest } from '@gj-kit/toss-payments-nestjs';
import { withWebhookInbox } from '@gj-kit/toss-payments-postgresql';
import { InjectTossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { AppToss } from '@/payments/toss.config';

@Controller('webhooks')
export class TossWebhookController {
  private readonly handle;

  constructor(
    @InjectTossPayments() toss: AppToss,
    @InjectTossPaymentsPostgres() pg: TossPaymentsPostgres,
  ) {
    this.handle = toNestWebhookHandler(
      toss.webhook,
      withWebhookInbox(pg.inbox, {
        onDepositCallback: async (webhook) => {
          // trust: 'secret' — 입금 주문 반영
        },
      }),
    );
  }

  @Post('toss')
  async receive(@Req() req: NestWebhookRequest, @Res() res: NodeServerResponseLike) {
    await this.handle(req, res);
  }
}
```

record 실패의 기본 동작은 **삼키고 통지**입니다 — 관측 계층이 웹훅 가용성을 볼모로 잡지 않습니다(코어 `AuditOptions.onSinkError` 선례). inbox를 내구 계약으로 쓰려면 `failOnRecordError: true`로 바꾸세요:

```ts
import { withWebhookInbox } from '@gj-kit/toss-payments-postgresql';
import { pg } from '@/payments/toss';

const handlers = withWebhookInbox(
  pg.inbox,
  {
    onPaymentStatusChanged: async (webhook) => {
      /* ... */
    },
  },
  {
    // 기본: record 실패는 삼키고 meta만 통지한다(이벤트 payload가 로그로 새지 않게)
    onRecordError: (cause, meta) => {
      console.error(`[toss-inbox] record 실패 transmissionId=${meta.transmissionId}`, cause);
    },
    // inbox를 내구 계약으로 쓸 때: record 실패 = throw → 어댑터 500 → 토스 재전송
    // failOnRecordError: true,
  },
);
```

래퍼를 거치지 않는 지점에서는 수동으로 기록할 수 있습니다:

```ts
import { pg } from '@/payments/toss';

await pg.inbox.record(webhook); // upsert — 같은 dedupe_key 재수신은 deliveries 증가로 관측
```

## 운영

### cleanup — TTL 행 정리는 명시 호출 전용

`cleanup()`은 자동 타이머가 없습니다(모든 옵션 기본 꺼짐). 삭제 대상은 두 가지뿐입니다: `webhook_dedupe`의 만료된 `completed` 행(기본 5일)과 `cancel_retries`의 만료 행(기본 15일 — 토스 멱등키 유효기간). 주기 실행은 앱이 소유합니다.

```ts
// payments/toss-maintenance.service.ts — @nestjs/schedule 예시
import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectTossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';
import type { TossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/nestjs';

@Injectable()
export class TossMaintenanceService {
  constructor(@InjectTossPaymentsPostgres() private readonly pg: TossPaymentsPostgres) {}

  @Cron('17 4 * * *')
  async cleanup() {
    const { dedupeDeleted, cancelRetriesDeleted } = await this.pg.cleanup();
    console.log(`toss cleanup — dedupe: ${dedupeDeleted}, cancelRetries: ${cancelRetriesDeleted}`);
  }
}
```

DB 쪽에서 돌리려면 pg_cron으로 동일한 삭제를 스케줄합니다. **interval은 팩토리 옵션(`dedupe.completedTtlSeconds`, `retention.cancelRetryDays`)과 반드시 일치**시키세요:

```sql
SELECT cron.schedule('toss-payments-cleanup', '17 4 * * *', $$
  DELETE FROM toss_payments.webhook_dedupe
    WHERE state = 'completed' AND completed_at < now() - interval '5 days';
  DELETE FROM toss_payments.cancel_retries
    WHERE recorded_at < now() - interval '15 days';
$$);
```

graceful shutdown에서는 `pg.audit.flush()`를 호출하세요 — 코어는 audit `record`를 await하지 않으므로(fire-and-forget), flush가 in-flight insert의 정착을 기다립니다(예: Nest `onApplicationShutdown`).

```ts
import { pg } from '@/payments/toss';

await pg.audit.flush(); // 시작된 모든 audit insert의 정착 대기 — 실패는 삼킨다
```

### 보관 책임 — cleanup이 지우지 않는 테이블

`audit_entries`, `webhook_inbox`, `orders`, `deposit_secrets`는 **어떤 경로로도 이 패키지가 삭제하지 않습니다.** `billing_keys`도 `cleanup()`은 지우지 않습니다 — 단 코어 계약 메서드 `BillingKeyStore.delete({ customerKey, expectedBillingKey })`가 현재 key와 일치할 때만 해당 고객의 행 1건을 삭제합니다. 보관 기간·아카이빙·접근 통제는 소비자 책임입니다 — 특히 `audit_entries`(요청/응답 증거)와 `webhook_inbox`(이벤트 원문)는 분쟁 대응 근거이므로 조직의 감사 보존 정책에 따라 관리하세요.

### cancel_retries는 보호된 text다 — DB 경계도 계속 방어하라

`cancel_retries.record_json`에는 `SensitiveValueProtector`가 만든 opaque 문자열만 저장됩니다. 복호화 뒤의 `CancelRetryRecord.bodyJson`은 멱등 재생의 바이트 계약 때문에 text → JSON parse 경로로 코드 유닛 단위 복원됩니다. jsonb 정규화(NUL 거부, 이스케이프/키 정렬)로 원문이 변형될 위험을 원천 배제합니다.

앱 보호기 외에도 DB 접속 권한 최소화, TLS, 디스크/백업 암호화, KMS 키 회전과 테이블 감사는 계속 필요합니다. 이 패키지는 key material·KMS 권한·retention policy를 소유하지 않으며, `unsafePlaintextSensitiveValueProtector`는 이 방어를 대체하지 못하는 개발 전용 escape hatch입니다.

### 스토어는 반드시 primary를 본다 — 리드 레플리카 금지

모든 스토어의 계약은 "저장 성공 반환 = 커밋 완료"(read-after-write 일관성)입니다. `SqlClient`가 리드 레플리카를 향하면 `loadOrder` 금액 대조·`getSecret` 대조가 복제 지연만큼 뒤처진 값을 읽고, `claim`의 원자성 전제도 깨집니다. **`fromPgPool`에 넘기는 Pool(또는 직접 구현한 `SqlClient`)은 반드시 primary 접속이어야 합니다.**

### 다른 드라이버 — TypeORM DataSource로 SqlClient 직접 구현

`SqlClient`가 이 패키지의 유일한 드라이버 접점입니다. 요구는 세 가지뿐입니다: `$1, $2` 위치 파라미터, 실패는 그대로 throw, `withConnection`은 단일 세션 고정(`migrate()`와 `billingKeys.withMutationLock()`의 transaction·advisory lock용)입니다.

```ts
// payments/typeorm-sql-client.ts — SqlClient 직접 구현 예시 (TypeORM DataSource)
import type { DataSource } from 'typeorm';
import type { SqlClient, SqlRow } from '@gj-kit/toss-payments-postgresql';

export function fromTypeOrmDataSource(dataSource: DataSource): SqlClient {
  return {
    async query(text, params) {
      // TypeORM raw query는 pg 드라이버의 rows 배열을 그대로 반환한다
      const rows: SqlRow[] = await dataSource.query(text, params === undefined ? undefined : [...params]);
      return { rows };
    },
    async withConnection(fn) {
      // migrate()/billingKeys.withMutationLock()의 BEGIN·advisory lock이 한 connection에
      // 고정되도록 QueryRunner 1개를 전용한다
      const runner = dataSource.createQueryRunner();
      try {
        return await fn({
          async query(text, params) {
            const rows: SqlRow[] = await runner.query(text, params === undefined ? undefined : [...params]);
            return { rows };
          },
        });
      } finally {
        // migrate()/billing mutation lock은 실패 경로에서 스스로 ROLLBACK을 시도한 뒤 throw한다
        await runner.release();
      }
    },
  };
}
```

이 DataSource 역시 primary를 향해야 합니다. Prisma/postgres.js도 같은 방식으로 `SqlClient` 두 메서드만 구현하면 됩니다.

## PostgreSQL 없이 테스트하기 — `./testing`

`createMemoryTossPaymentsPostgres(options?)`는 `TossPaymentsPostgres` 표면 전체(`orders`·
`depositSecrets`·`billingKeys`·`cancelRetries`·`webhookDedupe`·`audit.flush()`·`inbox`·`opaqueLocks`·
`migrate()`·`cleanup()`)를 **DB 없이** 재현하는 인메모리 대역입니다. 소비 앱이 lock·rollback·
protector 계약을 `jest.fn()`으로 다시 흉내 내지 않도록, "빠른 Map"이 아니라 계약을 그대로 따르는
구현입니다:

- `billingKeys.withMutationLock` / `withOpaqueMutationLock` / `opaqueLocks.withLock`은 customerKey별·
  opaque key별 **실제 in-process mutex**(promise chain)로 직렬화됩니다. 같은 키의 두 번째 callback은
  첫 번째가 끝나기 전에 시작되지 않고, combined API는 PostgreSQL과 같은 **opaque → customer** 순서로
  잡아 역순으로 풉니다. handle의 쓰기는 callback이 성공적으로 끝날 때까지 **transaction
  overlay**에 머뭅니다(READ COMMITTED 재현): handle의 읽기만 자기 쓰기를 보고(read-your-writes),
  lock 없는 바깥 `billingKeys.find`는 진행 중 callback의 미커밋 쓰기가 아니라 **committed 상태만**
  봅니다 — PostgreSQL에서 통과할 수 없는 dirty read에 의존하는 테스트는 이 대역에서도 통과할 수
  없습니다. callback이 반환하면 lock을 풀기 전에 overlay가 적용되고(COMMIT), throw하면 통째로
  버려집니다(ROLLBACK — 되돌려질 값이 다른 읽기에 한 번도 보이지 않습니다).
- PostgreSQL에서 self-deadlock이 되는 **같은 키 재진입**(`'reentrant-lock'`)과 README가 금지한 **public
  lock API 중첩**(`'nested-lock-api'`)은 테스트를 멈추게 두지 않고 `MemoryLockContractError`로 즉시
  드러냅니다(`isMemoryLockContractError`). callback 밖으로 빠져나간 handle 사용도 쓰기가 조용히
  버려지는 대신 `'handle-outside-callback'`으로 거부됩니다. 중첩 판정은 lock API 호출이 **시작된
  위치** 기준이라 callback 안에서 await 없이 띄운 lock 호출도 같은 이유로 거부됩니다 — 경쟁
  호출자는 아래 contention 예시처럼 callback 밖에서 "started" gate 뒤에 시작하세요. lock 없는
  `billingKeys.find`·다른 스토어 호출은 callback 안에서도 허용됩니다. PostgreSQL의 deadlock
  detection(서로 다른 두 키를 역순으로 잡는 경우)은 재현하지 않습니다.
- billing key 레코드·deposit secret·cancel retry 레코드는 PostgreSQL 스토어와 **같은 codec**으로
  `sensitiveValueProtector`를 통과합니다(같은 purpose/recordId context, 같은 `invalid-row` 판정).
  기본값은 `unsafePlaintextSensitiveValueProtector`입니다 — 이 대역은 DB에 닿지 않는 테스트 더블이라
  허용되며, AAD 결속까지 검증하려면 프로덕션에 배선한 보호기(예: AES-256-GCM)를 그대로 넘기세요.
- `orders`는 insert-only + 동일값 멱등 + `order-conflict`이고 `loadOrder`도 PostgreSQL과 같은
  5필드 투영·검증(`invalid-row`/`unsafe-amount`, 여분 필드 버림)을 거칩니다. `audit.record`는 같은
  id 재호출이 행을 늘리지 않는 멱등입니다(`ON CONFLICT (id) DO NOTHING` 동일). `webhookDedupe`는
  lease 만료 재점유·`completed` 보존, `inbox`는 동일 마스킹 + `deliveries` 증가, `migrate()`는 실제
  migration id를 첫 호출에 `applied`, 이후 `skipped`로 보고하고, `cleanup()`은
  `dedupe.completedTtlSeconds`·`retention.cancelRetryDays` 보존 기간을 `now()`로 적용합니다.
- 모든 동작은 `recorded.events`에 호출 순서대로 남습니다 — lock 요청/획득/해제(`api`·`lock`·`key`·
  `outcome`), 스토어 호출(`store`·`operation`·`recordId`·조건부 결과), migrate/cleanup. 값에는 lookup key만
  있고 billing key·secret·operationId 원문은 없습니다. `recorded.auditEntries`·`recorded.inbox`는 PostgreSQL에
  읽기 API가 없는 두 테이블의 관측용 view입니다. `reset()`은 테이블·migration 기록·recorded를 모두
  비웁니다(lock을 쥔 채 호출하지 마세요).

옵션은 PostgreSQL aggregate에서 `sql`을 뺀 형태(`sensitiveValueProtector?`·`schema?`·`dedupe?`·`retention?`)에
테스트용 시계 `now?: () => number`(epoch ms, 기본 `Date.now`)를 더한 것입니다. 한 인스턴스가 "DB 하나"이므로
여러 앱 인스턴스의 경쟁은 같은 인스턴스에 대한 동시 호출로 모델링합니다. 프로덕션 사용 금지 —
프로세스 생존 기간만 상태를 유지합니다.

```ts
// test/toss-memory.ts — 소비 앱 테스트가 공유하는 aggregate 대역. 프로덕션 배선과 같은 보호기를 넘긴다.
import { createAes256GcmSensitiveValueProtector } from '@gj-kit/toss-payments-postgresql';
import { createMemoryTossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/testing';
import type { MemoryTossPaymentsPostgres } from '@gj-kit/toss-payments-postgresql/testing';

export const pg: MemoryTossPaymentsPostgres = createMemoryTossPaymentsPostgres({
  sensitiveValueProtector: createAes256GcmSensitiveValueProtector({ key: 'ab'.repeat(32), keyId: 'test' }),
  now: () => Date.now(),
});
```

lock contention 시나리오 — 발급 callback이 host projection을 끝내기 전에는 늦게 도착한
`BILLING_DELETED`가 같은 customerKey의 generic record에 닿지 못한다는 것을 이벤트 로그로 단언합니다:

```ts
import assert from 'node:assert/strict';
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';
import { createOpaqueAdvisoryLockKey } from '@gj-kit/toss-payments-postgresql/testing';
import { pg } from '@/test/toss-memory';

const issued = undefined as unknown as BillingKeyRecord;
const opaqueKey = createOpaqueAdvisoryLockKey('v1:billing-credential-lifecycle:blind-index');

pg.reset();
let issuanceStarted!: () => void;
const started = new Promise<void>((resolve) => {
  issuanceStarted = resolve;
});
let finishProjection!: () => void;
const projection = new Promise<void>((resolve) => {
  finishProjection = resolve;
});

// 발급: opaque → customer lock을 쥔 채 host projection이 끝날 때까지 머문다.
const issuance = pg.billingKeys.withOpaqueMutationLock(opaqueKey, issued.customerKey, async (mutation) => {
  issuanceStarted();
  await mutation.replaceAndGetPrevious(issued, { operationId: 'billing_auth_intent-1' });
  await projection;
});
// 같은 customerKey의 늦은 webhook — callback이 COMMIT하기 전에는 customer lock을 얻지 못한다.
// (lock 요청은 FIFO다 — 발급이 lock을 잡기도 전에 보내면 PostgreSQL처럼 webhook이 먼저 잡을 수 있다.)
await started;
const lateWebhook = pg.billingKeys.deleteIfBillingKeyMatches({
  customerKey: issued.customerKey,
  expectedBillingKey: issued.billingKey,
});

finishProjection();
const [, deleted] = await Promise.all([issuance, lateWebhook]);
assert.equal(deleted, true);

const order = pg.recorded.events
  .filter((event) => event.type === 'lock-acquired' || event.type === 'lock-released')
  .map((event) => `${event.type}:${event.api}:${event.lock}`);
assert.deepEqual(order, [
  'lock-acquired:billingKeys.withOpaqueMutationLock:opaque',
  'lock-acquired:billingKeys.withOpaqueMutationLock:customer',
  'lock-released:billingKeys.withOpaqueMutationLock:customer',
  'lock-released:billingKeys.withOpaqueMutationLock:opaque',
  'lock-acquired:billingKeys.withMutationLock:customer',
  'lock-released:billingKeys.withMutationLock:customer',
]);
```

금지된 중첩은 hang 대신 즉시 실패하므로 unit 테스트가 프로덕션 deadlock을 먼저 잡습니다:

```ts
import assert from 'node:assert/strict';
import type { BillingKeyRecord } from '@gj-kit/toss-payments/server';
import { createOpaqueAdvisoryLockKey, isMemoryLockContractError } from '@gj-kit/toss-payments-postgresql/testing';
import { pg } from '@/test/toss-memory';

const customerKey = undefined as unknown as BillingKeyRecord['customerKey'];
const opaqueKey = createOpaqueAdvisoryLockKey('v1:billing-credential-lifecycle:blind-index');

await assert.rejects(
  pg.opaqueLocks.withLock(opaqueKey, () => pg.billingKeys.withMutationLock(customerKey, async () => undefined)),
  (error: unknown) => isMemoryLockContractError(error) && error.code === 'nested-lock-api',
);
```

## 공개 표면

### `.` (루트)

| export | 설명 |
|---|---|
| `fromPgPool(pool)` | `pg.Pool` → `SqlClient` 구조적 어댑터 — fn throw 시 `release(err)`로 커넥션 폐기 |
| `SqlClient` / `SqlExecutor` / `SqlResult` / `SqlRow` | 드라이버 중립 seam — `$1` 위치 파라미터, `rowCount` 미의존 |
| `PgPoolLike` / `PgPoolClientLike` / `PgQueryResultLike` | `pg`를 import하지 않고 `pg.Pool`이 대입되는 구조적 타입 |
| `SensitiveValueProtector` / `SensitiveValueContext` / `SENSITIVE_VALUE_PURPOSE` | 앱 소유 async at-rest 보호 seam + billing/deposit/cancel AAD context 값 |
| `unsafePlaintextSensitiveValueProtector` | **개발 DB 전용** 명시적 평문 opt-in — 기본값이 아니며 프로덕션 금지 |
| `createAes256GcmSensitiveValueProtector({ key, keyId? })` | `node:crypto` AES-256-GCM 레퍼런스 보호기 — 32-byte 키(`Uint8Array` 또는 64자 hex), random IV, purpose/recordId/kid AAD 결속, v1 JSON 봉투. 키 custody/rotation은 앱 소유 (`Aes256GcmSensitiveValueProtectorOptions`) |
| `SensitiveValueProtectorError` / `isSensitiveValueProtectorError` / `SensitiveValueProtectorErrorCode` | 레퍼런스 보호기의 decrypt 실패 — `'invalid-envelope'` · `'key-id-mismatch'` · `'authentication-failed'`(원인 비구분) |
| `createTossPaymentsPostgres(options)` | 스토어 집합체 팩토리 — 순수 조립, 즉시 DB 접속 없음. `sensitiveValueProtector` 필수 (`TossPaymentsPostgres` / `TossPaymentsPostgresOptions` / `CleanupResult`) |
| `pg.opaqueLocks.withLock(key, callback)` | aggregate가 제공하는 앱 lifecycle 순서화. `key`는 `createOpaqueAdvisoryLockKey(appHmacOrBlindIndex)`로 만든 nonsecret branded value여야 하며, callback에는 짧은 local durable work만 둔다. |
| `createOpaqueAdvisoryLockKey(value)` / `createPgOpaqueAdvisoryLocks(sql, { schema? })` | aggregate 밖에서 같은 facility를 조립할 때의 public factory와 `OpaqueAdvisoryLockKey` / `PgOpaqueAdvisoryLocks` / `PgOpaqueAdvisoryLocksOptions` 타입. raw identifier/HMAC secret 생성은 앱 책임이다. |
| `migrate(sql, { schema? })` | 명시 호출 마이그레이션 — advisory lock 직렬화 + 단일 트랜잭션 + 멱등 (`MigrateOptions` / `MigrationResult`) |
| `renderMigrationSql({ schema? })` | 동일 SQL 전체 스크립트(버전 테이블 관리 문 제외) — Flyway/dbmate 사용자용 |
| `advisoryLockKey(schema)` | migrate가 잡는 FNV-1a 64bit advisory lock 키 재계산 |
| `createPgOrderStore` / `createPgDepositSecretStore` / `createPgBillingKeyStore` / `createPgCancelRetryStore` / `createPgWebhookDedupeStore` / `createPgAuditSink` | 집합체 없이 개별 스토어만 조립할 때. 세 민감 스토어에는 `PgSensitiveStoreOptions`의 필수 `sensitiveValueProtector`가 필요함 |
| `PgBillingKeyStore` / `PgBillingKeyMutation` / `PgBillingKeySnapshot` | `SqlClient` aggregate/direct factory의 PostgreSQL-only lifecycle fence. customer-only path는 `withMutationLock(customerKey, callback)`을, opaque host lifecycle + customer mutation은 **같은 transaction**의 `withOpaqueMutationLock(opaqueKey, customerKey, callback)`을 쓴다. combined API는 opaque → customer 순서를 강제하고 handle로 `replaceAndGetPrevious`, conditional replace/delete, `isCurrentOperationId`를 제공한다. 두 public lock API를 중첩하지 않는다. |
| `createPgWebhookInboxStore(sql, options?)` / `withWebhookInbox(inbox, handlers, options?)` | 웹훅 이벤트 원문 보존 (`WebhookInboxStore` / `WithWebhookInboxOptions`) |
| `TossPostgresError` / `isTossPostgresError` / `TossPostgresErrorCode` | 이 패키지가 직접 판정한 실패 전용 — code가 공개 계약 |
| `DEFAULT_SCHEMA` / `IDENTIFIER_PATTERN` | 기본 스키마 이름(`'toss_payments'`)과 식별자 허용 패턴 |

### `./nestjs`

| export | 설명 |
|---|---|
| `TOSS_PAYMENTS_POSTGRES` | `Symbol.for` 기반 단일 토큰 — 집합체 전체가 바인딩 (ESM/CJS 이중 로드에도 동일) |
| `InjectTossPaymentsPostgres()` | 명시적 `@Inject(토큰)` 위임 데코레이터 — `design:paramtypes` 미사용 |
| `TossPaymentsPostgresModule.forRoot(options)` | 동기 조립 — `global` 기본 true, 필수 `sensitiveValueProtector` 포함 |
| `TossPaymentsPostgresModule.forRootAsync({ imports?, inject?, useFactory, global? })` | Nest provider 기반 비동기 조립 — `useFactory` 반환값에 `sensitiveValueProtector` 필수 |
| `TossPaymentsPostgres` / `TossPaymentsPostgresOptions` / `SensitiveValueProtector` / `PgBillingKeyStore` / `PgBillingKeyMutation` (type 재export) | 주입부 타이핑 — 루트 엔트리 없이 사용 가능 |

### `./testing`

| export | 설명 |
|---|---|
| `createMemoryTossPaymentsPostgres(options?)` | DB 없는 aggregate 대역 — `TossPaymentsPostgres` 전체 + `recorded` + `reset()` (`MemoryTossPaymentsPostgres` / `MemoryTossPaymentsPostgresOptions`). customerKey·opaque key별 실제 mutex, opaque → customer 순서, callback throw rollback, PostgreSQL 동일 protector codec·insert-only·lease/TTL·redaction |
| `pg.recorded.events` / `recorded.auditEntries` / `recorded.inbox` | 호출 순서 그대로의 관측 로그 (`MemoryTossPaymentsPostgresEvent` = lock-requested/acquired/released · store · migrate · cleanup, `MemoryLockApi` / `MemoryLockClass` / `MemoryStoreName` / `MemoryWebhookInboxRow`). secret·billing key·operationId 원문 없음 |
| `MemoryLockContractError` / `isMemoryLockContractError` / `MemoryLockContractErrorCode` | hang 대신 throw — `'reentrant-lock'`(같은 키 재진입 = PostgreSQL self-deadlock) · `'nested-lock-api'`(public lock API 중첩) · `'handle-outside-callback'`(callback 종료 후 handle 사용 — COMMIT/ROLLBACK된 connection에 묶인 handle) |
| `createOpaqueAdvisoryLockKey` / `unsafePlaintextSensitiveValueProtector` + type 재export | 테스트 파일이 루트 엔트리 없이 lock key를 만들고 `TossPaymentsPostgres` / `PgBillingKeyStore` / `PgBillingKeyMutation` / `PgBillingKeySnapshot` / `PgOpaqueAdvisoryLocks` / `OpaqueAdvisoryLockKey` / `SensitiveValueProtector` / `SensitiveValueContext` / `MigrationResult` / `CleanupResult`를 읽을 수 있게 |

에러 모델: `TossPostgresError.code`는 `'invalid-identifier'`(스키마 식별자 위반) · `'order-conflict'`(saveOrder가 다른 값으로 재저장 시도 — 금액 대조 원본 보호) · `'unsafe-amount'`(bigint가 `Number.isSafeInteger` 범위 밖) · `'invalid-row'`(DB 행이 코어 계약 형태로 복원 불가) · `'migration-failed'` 5종입니다. 메시지가 아니라 **code가 공개 계약**이고, 드라이버 에러는 감싸지 않고 그대로 통과합니다(SQLSTATE 등 cause 체인 보존). 어떤 에러 메시지에도 secret·billingKey 값은 포함되지 않습니다. 레퍼런스 AES-256-GCM 보호기의 복호화 실패는 별도 클래스 `SensitiveValueProtectorError`(`code` 3종)이고, `./testing` 대역의 lock 계약 위반은 `MemoryLockContractError`(`code` 3종)입니다 — 둘 다 `TossPostgresErrorCode` 유니언을 넓히지 않습니다.

## 배포 산출물 handoff

이 패키지는 `@gj-kit/toss-payments`(Nest 배선을 쓰면 `@gj-kit/toss-payments-nestjs`까지)와 같은 release handoff 단위입니다. source workspace link나 수정된 `node_modules`를 전달하지 말고, 깨끗한 source commit에서 release gate를 통과한 뒤 immutable `.tgz`를 소비 앱의 `vendor/`에 함께 고정하세요.

```sh
corepack pnpm run verify:release
artifact_dir="$(mktemp -d)"
npm pack ./toss-payments --pack-destination "$artifact_dir"
npm pack ./toss-payments-postgresql --pack-destination "$artifact_dir"
```

각 tarball에는 package-owned `dist/gj-kit-provenance.json`이 포함됩니다. handoff에는 package별 정확한 version, 전체 `sourceCommit`, tarball SHA-256, provenance JSON을 기록하고, consumer의 `package.json`은 exact `file:vendor/...tgz` dependency로 lockfile까지 함께 갱신합니다. 소비 앱은 tarball과 인접 provenance JSON을 재검증해야 하며, **자신의 PostgreSQL 인스턴스에 대한 `migrate()` 실행·복원(리허설 DB에서 선실행 권장)과 primary 접속 검증**은 release gate와 별개로 수행해야 합니다. 자세한 명령과 manifest 예시는 코어 README의 [배포 산출물과 소비 앱 handoff](../toss-payments/README.md#배포-산출물과-소비-앱-handoff)를 참고하세요.

## 라이선스

MIT
