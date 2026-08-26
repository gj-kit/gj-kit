# @gj-kit/nest-notifications

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

트랜잭션 알림 relay, dispatch, presentation, Expo push 경계를 위한 NestJS 조합 패키지입니다.

## 설치

```sh
pnpm add @gj-kit/nest-notifications
```

## 사용할 때

제품 이벤트를 delivery 정책을 제품 도메인에 섞지 않고 내구성 있고 dedupe된 알림 작업으로 전환해야 할 때 사용합니다.

## 사용하지 않을 때

제품 문구, 수신자 정책, 사용자 선호 결정을 범용 relay로 옮기지 마세요.

## Golden path

앱 store와 presentation 정책을 제공하고 Nest module을 등록한 뒤 일반 운영 경계에서 relay와 dispatch worker를 실행합니다.

```ts
import * as gjKit from '@gj-kit/nest-notifications';

void gjKit;
```

## 런타임과 peer 조건

| Peer | 지원 범위 |
| --- | --- |
| `@nestjs/common` | `^10 || ^11` |
| `reflect-metadata` | `^0.1.13 || ^0.2` |
| `rxjs` | `^7` |

## 공개 entry point

- `@gj-kit/nest-notifications`
- `@gj-kit/nest-notifications/core`
- `@gj-kit/nest-notifications/expo`
- `@gj-kit/nest-notifications/testing`

## 안전 경계

credential, endpoint 소유권, 사용자 노출 제품 문구는 앱에 둡니다. 원본 provider 실패 대신 typed error와 delivery outcome을 사용하세요.

## 오류 코드

provider 또는 native 예외 문자열 대신 다음의 안정된 공개 코드를 처리하세요.

- `ERR_NOTIFICATION_COMMAND_INVALID`
- `ERR_NOTIFICATION_APPLICATION_KEY_INVALID`
- `ERR_NOTIFICATION_RECIPIENT_KEY_INPUT`
- `ERR_NOTIFICATION_POLICY_INVALID`
- `ERR_NOTIFICATION_TIMEZONE_INVALID`
- `ERR_NOTIFICATION_PRIORITY_UNSUPPORTED`
- `ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED`
- `ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE`
- `ERR_NOTIFICATION_CONFIG_INVALID`

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/nest-notifications/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/nest-notifications/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/nest-notifications.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


내구성 알림 파이프라인. 소스 도메인은 **자기 트랜잭션 안에서 명령 하나를 stage**하고, 그 뒤의 모든 것 — 조용시간 홀드, 배치 병합, 카테고리 선호도, 재시도, inbox 메시지, 푸시 fan-out — 은 파이프라인이 소유한다.

순수 코어(`./core`)는 프레임워크·전송·저장소·언어를 모른다. 런타임 의존성은 0이고, `@nestjs/common`·`reflect-metadata`·`rxjs`만 peer다.

---

## 배달 계약을 먼저 읽는다

> **`(applicationKey, recipientRef, eventKey)`를 멱등 키로 하는 at-least-once 파이프라인이다. inbox 메시지는 배달당 정확히 하나(exactly-once), 푸시 핸드오프는 최소 한 번(중복 가능), 순서는 보장하지 않는다.**

**중복 푸시는 버그가 아니라 명시된 비용이다.** 전송은 트랜잭션 밖에서 일어나므로, 전송에 성공하고 완료 기록에 실패한 배달은 다음 패스에서 다시 전송된다. 라이브러리가 할 수 있는 완화는 두 가지이고 둘 다 한다.

1. `NotificationPushPayload.idempotencyKey`(= 배달 id)를 전송 포트에 넘긴다. provider의 dedupe/collapse에 그대로 매핑하면 된다.
2. **inbox는 절대 중복되지 않는다.** 사용자가 두 번 보는 것은 배너뿐이고, 앱을 열면 하나다.

**순서도 보장하지 않는다.** 조용시간 홀드(NORMAL만), 배치 창, `SCHEDULED` 타이밍, 병렬 워커, 항목별 재시도 — 다섯 가지가 전부 순서를 바꾼다. 22:05에 stage된 NORMAL은 다음 날 아침에, 22:06에 stage된 ESSENTIAL은 즉시 나간다. 순서에 의미가 있는 도메인은 **본문에 순번을 넣어야 한다.**

**빠른 경로만 배선하면 배치·예약·조용시간 알림이 영원히 안 나간다.** `NotificationPipelineWakeup.request()`는 지연을 줄이는 힌트일 뿐이고, 정확성의 소유자는 **주기 실행자**다. 이 사실은 반환 타입(`void`)·JSDoc·이 문단 세 곳에 같은 문장으로 실려 있다.

### 단계별 보장

| # | 보장 |
|---|---|
| G1 | ingress: 같은 멱등 키로 몇 번을 stage해도 outbox 행은 하나 |
| G2 | relay: outbox 행 하나는 delivery item 정확히 하나를 만든다 |
| G3 | batch: 하나의 `(수신자, batchKey, 창, policyKey)`는 배달 하나 |
| G4 | inbox: 배달 하나는 inbox 메시지 정확히 하나 |
| G5 | push: 배달 하나는 최소 한 번 전송 시도. 완료 기록 실패 시 재전송 |
| G6 | presentation: dispatch가 claim한 순간 표시 내용이 불변이 된다 |
| G7 | lifecycle: 수신자 tombstone 이후에는 어떤 배달·메시지도 새로 생기지 않는다 |
| G8 | ordering: **없음** |

---

## 설치와 서브패스

```sh
corepack pnpm add @gj-kit/nest-notifications
```

| 서브패스 | 내용 |
|---|---|
| `.` | Nest 어댑터 — `NestNotificationsModule`·DI 토큰 11종·러너 2종·로거 어댑터 |
| `./core` | 프레임워크·전송 free 파이프라인 — 릴레이·디스패처·정책·포트 전량 |
| `./expo` | Expo 지식(청킹·토큰 형태·ticket 분류). `expo-server-sdk` 비의존 |
| `./testing` | 인메모리 저장소 스위트·가짜 런타임·적합성 케이스 |

peer 3종(`@nestjs/common`·`reflect-metadata`·`rxjs`)은 **required**다. `./core`만 쓰는 비-Nest 소비자도 설치는 하게 된다(로드는 하지 않는다 — 아래 [코어만 쓰기](#nest-없이-코어만-쓰기) 참고).

---

## 5분 배선

```ts
import { Module } from '@nestjs/common';
import { NestNotificationsModule } from '@gj-kit/nest-notifications';
import { createQuietHoursPolicy } from '@gj-kit/nest-notifications/core';
import { createExpoPushGateway } from '@gj-kit/nest-notifications/expo';
import type { ExpoPushMessage, ExpoPushTicket } from '@gj-kit/nest-notifications/expo';
import type { NotificationPresenter } from '@gj-kit/nest-notifications/core';

// 호스트가 소유하는 것들 — 저장소 3종과 presenter는 아래 절에서 만든다.
declare const relayStore: import('@gj-kit/nest-notifications/core').NotificationRelayStore;
declare const deliveryStore: import('@gj-kit/nest-notifications/core').NotificationDeliveryStore;
declare const endpointStore: import('@gj-kit/nest-notifications/core').NotificationEndpointStore;
declare const presenter: NotificationPresenter;
declare const expo: {
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
};

@Module({
  imports: [
    NestNotificationsModule.forRoot({
      // 서버 소유 설정이다. API 호출자가 정하게 두면 안 된다.
      applicationKey: 'my-app-production',
      relayStore,
      deliveryStore,
      endpointStore,
      presenter,
      policy: createQuietHoursPolicy({
        timeZone: 'Asia/Seoul',
        quietHours: { startHour: 22, endHour: 8 },
        batchWindowMs: 600_000,
      }),
      pushGateway: createExpoPushGateway({
        // `.bind`가 필요하다 — SDK 메서드는 `this`를 쓴다(아래 전송 절).
        send: expo.sendPushNotificationsAsync.bind(expo),
        defaultTitle: 'MyApp',
      }),
      providers: ['EXPO'],
      // 운영 시작 전에 **자기 숫자로** 정한다(배선 체크리스트). 아래는 예시일 뿐이다.
      // `attempts`는 claim 횟수이지 경과 시간이 아니다: 재시도 창 ≈ maxAttempts ÷ (주기
      // 실행 빈도 + wakeup 패스 빈도)이고, 소진된 행은 due에서 빠진 뒤 **되돌아오지 않는다**.
      relay: { maxAttempts: 10 },
      dispatch: { maxAttempts: 10 },
    }),
  ],
})
export class NotificationsModule {}
```

`applicationKey`가 비어 있거나 `providers`가 빈 배열이면 **부팅에서** `ERR_NOTIFICATION_CONFIG_INVALID`로 죽는다. 스케줄러의 첫 호출까지 살아남는 설정 오류를 만들지 않는다.

### 명령 stage — 소스 도메인이 하는 일 전부

```ts
import type {
  NotificationCommand,
  NotificationPublisher,
} from '@gj-kit/nest-notifications/core';

declare const publisher: NotificationPublisher<{ readonly tx: unknown }>;
declare const tx: { readonly tx: unknown };

const command: NotificationCommand = {
  applicationKey: 'my-app-production',
  recipientRef: 'user-42',
  actorRef: 'user-7',
  category: 'comment.created',
  priority: 'NORMAL',
  body: '누군가 회원님의 글에 댓글을 남겼습니다',
  // 같은 이벤트를 몇 번 stage해도 outbox 행은 하나다(G1).
  eventKey: 'comment:9001',
  batch: { key: 'post:123', label: '내 글', itemCount: 1 },
  action: { href: '/posts/123' },
};

const result = await publisher.stage(tx, command);
// result.discarded === true 면 수신자가 이미 삭제된 것이다.
void result.id;
```

---

## 저장소 구현 가이드

라이브러리는 테이블도 마이그레이션도 소유하지 않는다. 대신 저장소가 **무엇을 원자적으로 해야 하는지**를 의무로 못 박고, `./testing`의 적합성 케이스가 그 문장을 실행 가능한 검사로 바꾼다.

### 릴레이 저장소 의무 R1–R13

| # | 의무 |
|---|---|
| R1 | **원자적 claim** — 조건부 UPDATE의 영향 행 수가 1인 행만 반환한다. 조회 후 갱신은 두 워커가 같은 행을 처리하게 만든다 |
| R2 | **stale 회수** — 임계보다 오래된 claim은 다른 워커가 가져간다. R1과 같은 한 문장이어야 한다 |
| R3 | **ingress 멱등** — 소유자는 이 포트가 아니라 호스트 publisher다(I1) |
| R4 | **소스 항목 멱등** — `(applicationKey, sourceOutboxId)` 유니크. 충돌 시 **던지지 않고** `false` |
| R5 | **배치 유일성** — `(applicationKey, recipientRef, batchKey, batchWindowStartedAt, batchPolicyKey)` 유니크 |
| R6 | **조건부 병합** — `deliveredAt IS NULL AND dispatchClaimToken IS NULL AND presentationLockedAt IS NULL`이 UPDATE 조건에 들어간다 |
| R7 | **트랜잭션이 소스 행 잠금을 잡는다** — `work` 실행 전에. 그래야 계정 삭제가 앞뒤 중 하나로 직렬화된다 |
| R8 | **멱등 완료** — `claimToken` 일치 + `relayedAt IS NULL`일 때만 쓰고 `true` |
| R9 | **기록 시각 원문 보존** — `at`을 `relayedAt`·`suppressedAt`에 그대로 쓴다 |
| R10 | **순서는 의무가 아니다** — `createdAt ASC` 정렬은 권장일 뿐 |
| R11 | **배달 생성의 충돌 계약** — 충돌 시 던지지 않고 `{ id: 기존행, created: false }`. `batchCount`를 건드리지 않는다 |
| R12 | **claim 신선도는 저장소 시계 하나로** — 요청은 순간이 아니라 `claimStaleMs` 기간을 나른다 |
| R13 | **시도 누적과 소진 필터** — claim UPDATE가 `attempts`를 올리고, `maxAttempts`가 오면 due 조건에 넣는다. `createdAt`은 staging에서 한 번만 쓴다 |

### 디스패치 저장소 의무 D1–D9

| # | 의무 |
|---|---|
| D1 | **claim과 presentation lock은 한 문장이다** — 나누면 그 사이에 병합된 항목을 사용자가 못 본다 |
| D2 | **inbox 메시지 유일성** — `(applicationKey, deliveryId)` 유니크 + conflict-safe 삽입 |
| D3 | **멱등 완료** — `deliveredAt IS NULL`일 때만 |
| D4 | **stale 회수** — R2와 동일 |
| D5 | **due 필터** — `deliverAfter <= at AND deliveredAt IS NULL`. 미래 배달은 절대 반환하지 않는다 |
| D6 | **endpoint 비활성화의 stale 안전성** — `listEnabled`가 관측한 리비전과 일치할 때만 끈다. 불일치는 오류가 아니라 no-op |
| D7 | **시각 원문 보존 · JSON 왕복** |
| D8 | **claim 신선도는 저장소 시계 하나로** — R12와 동일 |
| D9 | **시도 누적과 소진 필터** — R13과 동일 |

### ingress 의무 I1–I3 (호스트 publisher)

- **I1** — `(applicationKey, recipientRef, eventKey)` 유니크 + conflict-safe 삽입 후 조회. 중복 stage는 **예외 없이** `staged: false`. PostgreSQL은 유니크 위반 후 대화형 트랜잭션을 abort시키므로 캐치-후-재조회는 **불가능하다**.
- **I2** — `stage`는 삽입 **전에** 같은 트랜잭션에서 `ensureLive`를 부르고, false면 아무것도 쓰지 않고 `{ id: null, staged: false, discarded: true }`를 반환한다. 게이트는 읽기가 아니라 **획득**이어야 한다.
- **I3** — `createdAt`은 삽입 시점에 정해지고 이후 갱신되지 않는다. 이 값이 배치 버킷의 유일한 입력이다.

### PostgreSQL DDL (핵심 제약만)

```sql
CREATE TABLE notification_ingress_outbox (
  id                  text PRIMARY KEY,
  application_key     text NOT NULL,
  recipient_ref       text NOT NULL,
  event_key           text NOT NULL,
  category            text NOT NULL,
  priority            text NOT NULL,
  title               text,
  body                text NOT NULL,
  action              jsonb,
  actor_ref           text,
  target_ref          text,
  batch_key           text,
  batch_label         text,
  batch_item_count    integer NOT NULL DEFAULT 1,
  timing              jsonb NOT NULL,
  -- I3 · R13: 한 번만 쓰고 갱신하지 않는다. 배치 버킷의 유일한 입력이다.
  created_at          timestamptz NOT NULL DEFAULT now(),
  attempts            integer NOT NULL DEFAULT 0,
  claim_token         text,
  claimed_at          timestamptz,
  relayed_at          timestamptz,
  suppressed_at       timestamptz,
  last_error_code     text,
  -- G1 · I1
  UNIQUE (application_key, recipient_ref, event_key)
);

CREATE TABLE notification_delivery (
  id                       text PRIMARY KEY,
  application_key          text NOT NULL,
  recipient_ref            text NOT NULL,
  batch_key                text,
  batch_window_started_at  timestamptz,
  batch_policy_key         text,
  batch_count              integer NOT NULL DEFAULT 1,
  batch_item_count         integer NOT NULL DEFAULT 1,
  deliver_after            timestamptz NOT NULL,
  attempts                 integer NOT NULL DEFAULT 0,
  dispatch_claim_token     text,
  dispatch_claimed_at      timestamptz,
  presentation_locked_at   timestamptz,
  delivered_at             timestamptz,
  -- G3 · R5
  UNIQUE (application_key, recipient_ref, batch_key, batch_window_started_at, batch_policy_key)
);

CREATE TABLE notification_delivery_item (
  id               text PRIMARY KEY,
  application_key  text NOT NULL,
  delivery_id      text NOT NULL REFERENCES notification_delivery(id) ON DELETE CASCADE,
  source_outbox_id text NOT NULL,
  -- G2 · R4
  UNIQUE (application_key, source_outbox_id)
);

CREATE TABLE notification_message (
  id               text PRIMARY KEY,
  application_key  text NOT NULL,
  delivery_id      text NOT NULL,
  recipient_ref    text NOT NULL,
  actor_ref        text,
  -- G4 · D2
  UNIQUE (application_key, delivery_id)
);

CREATE TABLE notification_endpoint (
  id               text PRIMARY KEY,
  application_key  text NOT NULL,
  recipient_ref    text NOT NULL,
  provider         text NOT NULL,
  address          text NOT NULL,
  enabled          boolean NOT NULL DEFAULT true,
  -- D6: 재등록 때마다 반드시 바뀌어야 한다. xmin·버전 카운터·last_seen_at 무엇이든 좋다.
  revision         bigint NOT NULL DEFAULT 1,
  UNIQUE (application_key, provider, address)
);
```

R1·R2·R12·R13을 만족하는 claim은 **UPDATE 한 문장**이다.

```sql
UPDATE notification_ingress_outbox
   SET claim_token = $2, claimed_at = now(), attempts = attempts + 1
 WHERE id IN (
   SELECT id FROM notification_ingress_outbox
    WHERE application_key = $1
      AND relayed_at IS NULL AND suppressed_at IS NULL
      AND ($5::int IS NULL OR attempts < $5)
      AND (claim_token IS NULL
           OR claimed_at < now() - ($4::bigint * interval '1 millisecond'))
    ORDER BY created_at
    LIMIT $3
    FOR UPDATE SKIP LOCKED
 )
RETURNING *;
```

`$4`가 `claimStaleMs`다. **호출자의 시각은 이 문장에 들어가지 않는다** — 워커가 N개면 프로세스 시계도 N개이고, 두 시계가 임계보다 벌어지면 신선한 claim이 상시 탈취된다(R12).

디스패치 claim은 같은 형태에 `presentation_locked_at = now()`를 **같은 SET 절에** 넣는다(D1).

### 적합성 케이스 — 이 6줄이 호스트 구현의 인수 조건이다

```ts
import { notificationStoreContractCases } from '@gj-kit/nest-notifications/testing';

declare function createMyStores(): Promise<
  import('@gj-kit/nest-notifications/testing').NotificationStoreSuite
>;

for (const testCase of notificationStoreContractCases({ concurrency: 8 })) {
  it(testCase.name, async () => {
    await testCase.run(() => createMyStores());
  });
}
```

`NotificationStoreSuite`는 저장소 3종에 `stage`·`tombstoneRecipient`·`registerEndpoint`·`setCategoryEnabled`를 더한 것이다. 그 넷이 있어야 I1–I3과 L1–L4 — 즉 G1과 G7 — 이 **호스트 구현에 대해** 검사된다. 커넥션 풀은 2 이상이어야 한다: 단일 커넥션 클라이언트는 동시 claim 버스트를 직렬화해 비원자적 claim을 숨긴다.

---

## 정책 레시피

```ts
import { createQuietHoursPolicy } from '@gj-kit/nest-notifications/core';
import type {
  NotificationSchedulingPolicy,
  ResolveDeliveryInput,
} from '@gj-kit/nest-notifications/core';

// 한 지역, 22–08 조용시간, 10분 배치 창.
const seoul = createQuietHoursPolicy({
  timeZone: 'Asia/Seoul',
  quietHours: { startHour: 22, endHour: 8 },
  batchWindowMs: 600_000,
});

// 조용시간 없이 UTC 6시간 digest.
const digest = createQuietHoursPolicy({
  timeZone: 'UTC',
  quietHours: null,
  batchWindowMs: 21_600_000,
});

// 수신자별 시간대 — 새 필드가 아니라 **다른 구현체**로 들어온다.
declare function zoneOf(recipientRef: string): string;
const perRecipient: NotificationSchedulingPolicy = {
  isQuietHours: (at) => seoul.isQuietHours(at),
  batchWindow: (at) => seoul.batchWindow(at),
  resolveDeliveryAt: (input: ResolveDeliveryInput) =>
    createQuietHoursPolicy({
      timeZone: zoneOf(input.recipientRef),
      quietHours: { startHour: 22, endHour: 8 },
    }).resolveDeliveryAt(input),
};

void [seoul, digest, perRecipient];
```

DST 해석 규칙 3종이 **계약**이다.

| 상황 | 규칙 |
|---|---|
| 조용시간 종료 시각이 존재하지 않는다(봄 갭) | 갭 직후 첫 존재하는 순간으로 릴리스 |
| 종료 시각이 두 번 존재한다(가을 중복) | **이른 쪽** |
| 계산된 릴리스가 `now` 이하 | 하루 전진 후 재계산. 48시간 안에 해가 없으면 즉시 배달 |

`batchWindowMs`는 24시간을 나누어떨어져야 한다(조립 시점 검증). 창 경계는 **로컬 자정** 기준이라 하루를 넘지 않고, DST로 23시간이 된 날의 마지막 창만 짧아진다.

**배치와 조용시간이 만나는 지점.** 배치 배달의 `deliverAfter`는 창이 끝난 뒤이고, 홀드는 stage 시각이 아니라 **그 창 끝 시각에 대해** 판정된다. 그래서 21:55에 stage된 10분 창(끝 22:00)도, 18:05에 stage된 6시간 digest(끝 자정)도 조용시간에 걸려 아침 `endHour`까지 밀린다 — 창이 클수록 새면 깊이 새는 자리라 여기만 두 번 본다.

---

## presenter — 사용자가 읽는 문장은 제품 카피다

라이브러리는 어떤 언어의 문장도 만들지 않는다. 기본값을 주면 영어권 소비자가 남의 언어를 배포하고, 중립 폴백을 주면 5건짜리 배치가 첫 항목의 문장으로 나간다. 그래서 `presenter`는 **필수 옵션**이고, 컴파일 에러가 결정을 강제한다.

```ts
import type { NotificationPresenter } from '@gj-kit/nest-notifications/core';

const korean: NotificationPresenter = {
  present: (input) => {
    if (input.batchCount <= 1) {
      return { title: input.title, body: input.body, action: input.action };
    }
    const label = input.aggregationLabel ?? '알림';
    return {
      title: label,
      body: `새 알림 ${input.batchItemCount}건`,
      action: input.action,
    };
  },
};

const english: NotificationPresenter = {
  present: (input) => {
    if (input.batchCount <= 1) {
      return { title: input.title, body: input.body, action: input.action };
    }
    const count = input.batchItemCount;
    return {
      title: input.aggregationLabel ?? 'Notifications',
      body: `${count} new notification${count === 1 ? '' : 's'}`,
      action: input.action,
    };
  },
};

void [korean, english];
```

빈 본문을 돌려주면 그 배달은 `ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE`로 실패한다 — 보이지 않는 카드를 쓰느니 실패하는 편이 낫다.

---

## 전송 — Expo와 그 밖

`expo-server-sdk`는 dependency도 peer도 optional peer도 아니다. 값어치 있는 부분(청킹·토큰 형태 검사·ticket 분류)은 SDK 타입이 아니라 wire shape에 대한 순수 함수라 라이브러리가 소유하고, 남는 HTTP 호출 하나만 호스트가 콜백으로 공급한다.

```ts
import { createExpoPushGateway } from '@gj-kit/nest-notifications/expo';
import type { ExpoPushMessage, ExpoPushTicket } from '@gj-kit/nest-notifications/expo';

// SDK를 쓰는 호스트. 메서드 문법이라 **타입은** 그대로 대입되지만, 대입만으로는 안 된다 —
// `sendPushNotificationsAsync`는 `this`를 읽는 프로토타입 메서드다(`this.limitConcurrentRequests`).
// 게이트웨이는 콜백을 수신자 없이 부르므로, 떼어 낸 메서드는 첫 호출에서 TypeError를 낸다.
// 그 예외는 `accepted: false`로 흡수되어 **푸시가 조용히 전부 실패한다**. 반드시 감싸거나 bind한다.
declare const expo: {
  sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]>;
};
const withSdk = createExpoPushGateway({
  send: expo.sendPushNotificationsAsync.bind(expo),
  // 또는: send: (messages) => expo.sendPushNotificationsAsync([...messages])
  defaultTitle: 'MyApp',
});

// fetch를 쓰는 호스트 — 15줄이다.
declare const accessToken: string;
const withFetch = createExpoPushGateway({
  defaultTitle: 'MyApp',
  async send(messages) {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) throw new Error(`expo push failed: ${response.status}`);
    const payload = (await response.json()) as { data: ExpoPushTicket[] };
    return payload.data;
  },
});

void [withSdk, withFetch];
```

다른 provider(FCM·APNs·웹푸시)는 `NotificationPushGateway` 두 메서드를 직접 구현하면 된다. `providers` 옵션이 어떤 endpoint를 이 게이트웨이에 넘길지 고른다.

**로컬 형태 검사 실패는 provider 확인과 다르다.** 결과 타입이 `invalidEndpointIds`(provider가 확인)와 `rejectedEndpointIds`(로컬 거부)로 분리돼 있고, 기본 정책은 provider 확인분만 비활성화한다. 우리 정규식이 provider보다 엄격해지는 날 살아 있는 기기를 영구히 어둡게 만들지 않기 위해서다.

---

## 주기 실행자 배선 — 정확성의 소유자

세 가지 형태 전부 **호스트 코드**다. 이 패키지는 어떤 스케줄러에도 의존하지 않는다.

```ts
import { Injectable } from '@nestjs/common';
import { NotificationRelayRunner } from '@gj-kit/nest-notifications';

// @gj-kit/nest-operations-jobs의 데코레이터를 import하지 않고 형태만 세운다.
// 두 패키지 사이에는 import가 한 줄도 없다 — 잡 어댑터가 12줄이 되는 것은
// 의존이 아니라 요약 타입이 Record<string, unknown>에 구조적으로 대입되는 결과다.
declare function OperationsJobDefinition(): ClassDecorator;

@Injectable()
@OperationsJobDefinition()
export class NotificationsRelayJob {
  readonly key = 'notifications.relay';
  readonly description = 'Relay staged notification commands into deliveries';
  readonly schedule = { cron: '* * * * *', timeZone: 'Asia/Seoul' } as const;
  constructor(private readonly relay: NotificationRelayRunner) {}
  run() {
    return this.relay.run();
  }
}
```

```ts
import { Injectable } from '@nestjs/common';
import { NotificationDispatchRunner } from '@gj-kit/nest-notifications';

// @nestjs/schedule도 마찬가지로 형태만 세운다.
declare function Cron(expression: string): MethodDecorator;

@Injectable()
export class NotificationsCron {
  constructor(private readonly dispatch: NotificationDispatchRunner) {}

  @Cron('* * * * *')
  async dispatchDue(): Promise<void> {
    const summary = await this.dispatch.run();
    if (!summary.ok) throw new Error(`dispatch failed: ${summary.failed}`);
  }
}
```

```ts
import { Controller, Post } from '@nestjs/common';
import { NotificationRelayRunner } from '@gj-kit/nest-notifications';
import type { NotificationRelaySummary } from '@gj-kit/nest-notifications';

// 외부 HTTP 스케줄러(Cloud Scheduler 등)를 쓰는 호스트. 인증은 호스트의 가드가 한다.
@Controller('internal/notifications')
export class NotificationsTriggerController {
  constructor(private readonly relay: NotificationRelayRunner) {}

  @Post('relay')
  run(): Promise<NotificationRelaySummary> {
    return this.relay.run();
  }
}
```

---

## 계정 삭제 배선 — 권장이 아니라 의무다

삭제 순서를 어긴 호스트는 **모든 저장소 의무를 만족하면서도** 삭제된 계정에 푸시를 보낸다. 그래서 이것은 권장 사항이 아니라 번호 붙은 의무 L1–L4다.

- **L1** — `tombstone`과 모든 삭제문이 계정 삭제와 **같은 하나의** 트랜잭션에서 실행된다. tombstone만 먼저 커밋되면 그 사이 relay가 만든 배달이 남고, purge만 먼저면 늦은 stage가 새 outbox를 만든다.
- **L2** — **ingress를 배달보다 먼저 지운다.** ingress `DELETE`가 릴레이 트랜잭션의 행 잠금(R7)에서 블록되므로, 그 릴레이는 이 문장 앞이나 뒤 중 하나로 직렬화되고, 뒤라면 이어지는 delivery·message 삭제가 그 릴레이가 방금 커밋한 것을 마저 지운다.
- **L3** — **tombstone 행은 purge에서 살아남는다.** 지우면 늦게 도착한 `ensureLive`가 true를 돌려주고, 삭제된 계정이 다시 알림을 받기 시작한다.
- **L4** — `anonymizeActor`는 **다른 수신자의** 메시지에 남은 actor 참조를 지운다. 수신자 purge가 이것을 대신하지 않는다.

전체 순서: `tombstone → ingress → delivery → message → endpoint → preference`.

```ts
import { notificationRecipientKey } from '@gj-kit/nest-notifications/core';
import type {
  NotificationAccountLifecycle,
  NotificationRecipientLiveness,
} from '@gj-kit/nest-notifications/core';

interface TxLike {
  run(sql: string, ...params: readonly unknown[]): Promise<number>;
  one(sql: string, ...params: readonly unknown[]): Promise<{ readonly n: number }>;
}

const liveness: NotificationRecipientLiveness<TxLike> = {
  // 읽기가 아니라 **획득**이다 — 그래야 stage와 purge가 직렬화된다(I2).
  async ensureLive(tx, applicationKey, recipientRef) {
    const key = notificationRecipientKey(applicationKey, recipientRef);
    const row = await tx.one(
      `INSERT INTO notification_recipient_state (key, tombstoned)
       VALUES ($1, false) ON CONFLICT (key) DO UPDATE SET key = EXCLUDED.key
       RETURNING CASE WHEN tombstoned THEN 0 ELSE 1 END AS n`,
      key,
    );
    return row.n === 1;
  },
  async tombstone(tx, applicationKey, recipientRef) {
    await tx.run(
      `INSERT INTO notification_recipient_state (key, tombstoned) VALUES ($1, true)
       ON CONFLICT (key) DO UPDATE SET tombstoned = true`,
      notificationRecipientKey(applicationKey, recipientRef),
    );
  },
};

const lifecycle: NotificationAccountLifecycle<TxLike> = {
  async purgeRecipient(tx, applicationKey, recipientRef) {
    // L1: 호출자가 이 전부를 계정 삭제와 같은 트랜잭션에서 부른다.
    await liveness.tombstone(tx, applicationKey, recipientRef);
    // L2: ingress가 먼저다.
    await tx.run(
      'DELETE FROM notification_ingress_outbox WHERE application_key = $1 AND recipient_ref = $2',
      applicationKey,
      recipientRef,
    );
    await tx.run(
      'DELETE FROM notification_delivery WHERE application_key = $1 AND recipient_ref = $2',
      applicationKey,
      recipientRef,
    );
    await tx.run(
      'DELETE FROM notification_message WHERE application_key = $1 AND recipient_ref = $2',
      applicationKey,
      recipientRef,
    );
    await tx.run(
      'DELETE FROM notification_endpoint WHERE application_key = $1 AND recipient_ref = $2',
      applicationKey,
      recipientRef,
    );
    // L3: notification_recipient_state는 남긴다.
  },
  async anonymizeActor(tx, applicationKey, actorRef) {
    // L4: 다른 수신자의 메시지에 남은 참조를 지운다.
    await tx.run(
      'UPDATE notification_message SET actor_ref = NULL WHERE application_key = $1 AND actor_ref = $2',
      applicationKey,
      actorRef,
    );
  },
};

void [liveness, lifecycle];
```

---

## Nest 없이 코어만 쓰기

`./core`는 `@nestjs/*`·`rxjs`·`reflect-metadata`를 **한 줄도** import하지 않는다. 가드 테스트가 소스와 `dist` 양쪽에서 그것을 기계적으로 확인하고, packed consumer가 peer 디렉토리를 지운 채 이 엔트리를 실제로 로드한다.

```ts
import {
  createNotificationDispatcher,
  createNotificationRelay,
  createQuietHoursPolicy,
} from '@gj-kit/nest-notifications/core';
import type {
  NotificationDeliveryStore,
  NotificationEndpointStore,
  NotificationPresenter,
  NotificationPushGateway,
  NotificationRelayStore,
} from '@gj-kit/nest-notifications/core';

declare const relayStore: NotificationRelayStore;
declare const deliveryStore: NotificationDeliveryStore;
declare const endpointStore: NotificationEndpointStore;
declare const pushGateway: NotificationPushGateway;
declare const presenter: NotificationPresenter;

const policy = createQuietHoursPolicy({ timeZone: 'UTC', quietHours: null });
const relay = createNotificationRelay({ applicationKey: 'worker', store: relayStore, policy });
const dispatcher = createNotificationDispatcher({
  applicationKey: 'worker',
  store: deliveryStore,
  endpoints: endpointStore,
  pushGateway,
  presenter,
  providers: ['EXPO'],
});

const relayed = await relay.relayDue();
if (relayed.relayed > 0) await dispatcher.dispatchDue();
```

**정직한 각주.** peer 3종은 required이므로 `./core`만 쓰는 프로젝트도 그것들을 **설치**하게 된다(npm 7+는 자동 설치, pnpm은 unmet peer를 경고한다). 모듈 그래프에서는 참이고 `node_modules`에서는 참이 아닌 비대칭이며, 요구가 생기면 optional 전환은 완화 방향이라 minor로 낼 수 있다.

---

## 테스트

`./testing`은 인메모리 저장소 스위트·결정적 런타임·기록 로거·적합성 케이스를 준다. **프로덕션에서 쓰면 안 된다** — 내구성도, 프로세스 간 원자성도 없다.

```ts
import {
  fakeNotificationRuntime,
  memoryNotificationStores,
  passthroughPresenter,
  recordingNotificationLogger,
} from '@gj-kit/nest-notifications/testing';
import {
  createNotificationRelay,
  createQuietHoursPolicy,
} from '@gj-kit/nest-notifications/core';

const runtime = fakeNotificationRuntime({ now: new Date('2026-08-18T13:00:00Z') });
const stores = memoryNotificationStores(runtime);
const logger = recordingNotificationLogger();

await stores.stage({
  applicationKey: 'test-app',
  recipientRef: 'user-1',
  category: 'general',
  priority: 'NORMAL',
  body: 'hello',
  eventKey: 'e1',
});

const relay = createNotificationRelay({
  applicationKey: 'test-app',
  store: stores.relayStore,
  policy: createQuietHoursPolicy({
    timeZone: 'Asia/Seoul',
    quietHours: { startHour: 22, endHour: 8 },
  }),
  runtime,
  logger,
});

const summary = await relay.relayDue();
void summary.relayed;
// 조용시간에 걸린 NORMAL이므로 아침까지 배달되지 않는다.
void stores.snapshot().deliveries[0]?.deliverAfter;
void passthroughPresenter();
```

시계를 고정하면 조용시간 홀드와 배치 창 경로가 결정적으로 테스트된다. `runtime.advance(ms)`로 시각을 옮기고 `runtime.flush()`로 `defer`된 작업을 동기 실행한다.

---

## 에러

```ts
import { isNotificationsError } from '@gj-kit/nest-notifications/core';

declare const error: unknown;

if (isNotificationsError(error)) {
  // `instanceof`가 아니라 이 가드가 정본이다 — CJS/ESM 이중 로드에서 클래스가 둘이 될 수 있다.
  void error.code;
}
```

| 코드 | 언제 |
|---|---|
| `ERR_NOTIFICATION_COMMAND_INVALID` | `assertNotificationCommand` 실패 |
| `ERR_NOTIFICATION_APPLICATION_KEY_INVALID` | application key 형태 오류 |
| `ERR_NOTIFICATION_RECIPIENT_KEY_INPUT` | 수신자 키 입력에 U+0000 포함 |
| `ERR_NOTIFICATION_POLICY_INVALID` | 조용시간·배치 창 옵션 위반 |
| `ERR_NOTIFICATION_TIMEZONE_INVALID` | 알 수 없거나 사용할 수 없는 IANA 시간대 |
| `ERR_NOTIFICATION_PRIORITY_UNSUPPORTED` | 저장소가 돌려준 우선순위 문자열이 유니언 밖 |
| `ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED` | 전송 핸드오프 거부 → 배달 재시도 |
| `ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE` | presenter가 빈 본문을 돌려줌 |
| `ERR_NOTIFICATION_CONFIG_INVALID` | 모듈 조립 시점 설정 오류 |

예외 메시지는 저장소에도 로그에도 **절대** 들어가지 않는다. `safeErrorCode()`가 안정적인 짧은 코드로 축약한다.

---

## 배선 체크리스트

- [ ] `applicationKey`가 환경마다 다르다(스테이징이 프로덕션 사용자에게 보내지 않도록).
- [ ] 주기 실행자를 붙였다. wakeup 힌트만으로는 배치·예약·조용시간 알림이 나가지 않는다.
- [ ] `maxAttempts`와 소진 행 알림을 정했다. 이것은 **양쪽 다 나쁜 선택지 사이의 저울질**이다 — 안 주면 영구 실패 행이 due 페이지를 점유해 건강한 알림이 굶고(F12), 주면 그 횟수를 넘긴 행이 조용히 사라진다. 라이브러리는 백오프를 소유하지 않으므로 `attempts`는 **claim 횟수**이지 경과 시간이 아니다: 재시도 창은 `maxAttempts ÷ 패스 빈도`이고, `wakeup.enabled`가 켜져 있으면 staging 버스트가 같은 예산을 태운다(초 단위로 소진될 수 있다). 소진되는 **순간**은 로거가 알려 준다 — 마지막 시도를 태운 패스가 `{ exhausted: true, attempts, maxAttempts }` 필드를 실은 `error` 한 줄을 남기므로, 알림은 거기에 건다. 소진 **상태**의 조회는 여전히 호스트의 것이다(`attempts >= maxAttempts AND relayed_at IS NULL` / `... AND delivered_at IS NULL`).
- [ ] claim 판정 쿼리를 primary에서 실행한다(읽기 복제본 지연은 stale 판정을 흔든다).
- [ ] 적합성 케이스를 자기 저장소에 돌렸고, 커넥션 풀이 2 이상이다.
- [ ] 계정 삭제가 L1–L4 순서를 지킨다.
- [ ] endpoint 등록 경로가 재등록 때 `revision`을 반드시 바꾼다(D6).
- [ ] Node가 **full-icu**다. 조립 시점 자기시험은 *알 수 없는 이름*·비상식적 offset·왕복 실패를 부팅에서 거부하지만, 런타임이 **유효한 이름을 조용히 UTC로 바꿔치기하는** 경우는 잡지 못한다 — 그때는 모든 프로브가 UTC로 읽혀 두 관문이 구조적으로 통과한다. full-icu는 라이브러리가 검증하는 것이 아니라 배포의 전제다.

## 라이선스

MIT
