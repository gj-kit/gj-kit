# @gj-kit/nest-notifications — 공개 API 표면 설계

> 작성: 2026-08-24. 형식·깊이 기준: `docs/design/nest-operations-jobs-api-surface.md` · `docs/design/format-api-surface.md` · `docs/design/toss-payments-postgresql-v1.md`. 한국어 산문 + 영어 식별자/JSDoc.
>
> **소스 정본** (memorylog2 `apps/server`, 이 세션에서 전문 판독 — 줄 수는 `wc -l` 실측 `[소스]`):
>
> | 파일 | 줄 | 이 문서에서의 역할 |
> |---|---|---|
> | `src/notifications/core/notification-contracts.ts` | 112 | 명령 계약 — 스스로 "Nest·Prisma·Expo·도메인 free"를 선언한 유일한 파일. 승격의 씨앗 |
> | `src/notifications/core/notification-scheduling-policy.ts` | 102 | KST 하드코딩(offset 9h · quiet 22–08 · 10분 창) · batch policy key · follow-up key |
> | `src/notifications/core/notification-recipient-key.ts` | 16 | `sha256(applicationKey ‖ NUL ‖ recipientRef)` 불투명 liveness 키 |
> | `src/notifications/core/notification-push-gateway.ts` | 41 | 전송 포트 — provider 중립 endpoint/payload/result |
> | `src/notifications/core/notification-presentation.ts` | 32 | 한국어 폴백 카피 `새 알림 N건` — **제품 카피, 포트로 승격**(§0.2-②) |
> | `src/notifications/expo-push.service.ts` | 114 | Expo chunk·ticket·DeviceNotRegistered 정리·undersized 응답 가드·`expoOptionsFromEnv` |
> | `src/notifications/notification-relay.service.ts` | 341 | outbox claim/release·stale 회수·P2002 멱등·페이징·배치 병합·follow-up 라우팅 |
> | `src/notifications/notification-dispatch.service.ts` | 214 | due 배달 claim → presentation lock → inbox 메시지 → endpoint fan-out |
> | `src/notifications/notification-pipeline-wakeup.service.ts` | 53 | best-effort unref `setTimeout(0)` 빠른 경로. 정확성은 잡이 소유 |
> | `src/notifications/notification-{publisher,recipient-liveness,account-lifecycle,pipeline-wakeup}.port.ts` · `notification-endpoint.repository.ts` · `notification-application-key.token.ts` | 13·22·11·10·10·5 | DI 토큰 6종과 포트 5종 |
> | `src/notifications/adapters/prisma-*.ts` | 79·61·59·28 | Prisma 어댑터 4종 — **제품 고유, 제외**(§0.4-①) |
> | `src/notifications/notifications.module.ts` | 92 | 배선. 주석이 이미 "코어는 나중에 추출 가능"이라고 적고 있다 |
> | `src/notifications/notifications-v2.service.ts` · `notifications.controller.ts` · `notifications-{relay,dispatch}.job.ts` | 312·79·23·23 | inbox 조회 API·HTTP 표면·잡 배선 — **제외**(§0.4-②③) |
> | `prisma/schema.prisma:513-672` | — | 알림 테이블 7종의 유니크·인덱스 전량. §3.3 저장소 계약의 실측 근거 |
> | `test/notifications/**` (14파일) · `test/notifications/core/**` (3파일) | 2,336 | 소스가 **무엇을 보장하려 했는지**의 정본. §5의 이식 대상 |
>
> 표기 규약: `[소스]` = 위 파일을 이 세션에서 직접 읽어 확인. `[형제]` = gj-kit 형제 패키지 소스에서 직접 확인. `[실측]` = 이 개정에서 실제로 컴파일·판독해 확인. `[unverified]` = 근거를 확보하지 못한 주장. 표기 없는 문장은 소스 코드 또는 AGENTS.md/CLAUDE.md에서 직접 나온 것이다.
>
> **개정 이력 (2026-08-24, 리뷰 반영).** 초안에 대한 지적 16건을 반영했다. 계약이 바뀐 것만 추리면:
>
> | 무엇 | 어디 |
> |---|---|
> | `createDelivery`가 던지지 않고 `{ id, created }`를 반환한다. `conflictRetries` 옵션 삭제 | §0.2-⑯ · R11 · §3.6 f-bis · F11 |
> | claim 신선도 판정이 저장소 시계로 이동. 요청은 순간이 아니라 `claimStaleMs` 기간을 나른다 | §0.2-⑰ · R12 · D8 · §3.3.5 |
> | `listEnabled`가 등록 리비전을 동반 반송하고 `disable`이 그것을 조건으로 쓴다 | §0.2-⑱ · D6 · F5 |
> | 계정 삭제 순서가 README 권장에서 **번호 붙은 의무 L1–L4**로 승격. liveness·lifecycle 포트 시그니처를 §3에 실었다 | §3.3.6 · G7 |
> | ingress 멱등(G1)이 저장소 의무에서 **I1–I3**으로 분리되고, 적합성 스위트가 호스트 publisher에 닿는다 | §3.3.6 · §3.9 `NotificationStoreSuite` |
> | 시도 횟수(`attempts`)와 소진 필터(`maxAttempts`)를 포트에 노출 — 굶김 방지 | R13 · D9 · F12 · §7-16 |
> | 두 요약 타입을 `interface` → **`type` alias**, `ExpoPushGatewayOptions.send`를 화살표 프로퍼티 → **메서드 문법**. 둘 다 초안 형태로는 컴파일되지 않음을 실측 | §3.6 · §3.7 · §3.5 · §4-27·28 |
> | peer required 결정에 논증 절과 잔존 리스크 행을 붙이고, 잘못 인용한 형제 선례를 정정 | §1-7 · §2.4.1 · §7-13 |
> | README 레시피는 외부 패키지를 import하지 않고 `declare`로 세운다(devDependency 추가 금지) | §5.6 · §3.8.2 · §2.4 |
> | DI 토큰 11종으로 확정(+`NOTIFICATION_RUNTIME`·`NOTIFICATION_LOGGER`), `NestNotificationsOptions.runtime` 추가, `process.env` 규칙 통일, `HostStores` → `NotificationStoreSuite`, AGENTS.md §1 sync/outbox 조항에 대한 답 | §3.8.2 · §5.3 · §3.9 · §0.4-⑩ |

---

## 0. 채택 맵

### 0.1 소스 심볼 전수 → 목적지

소스 12파일의 **export 전수**다. 하나도 암묵적으로 떨어뜨리지 않는다. 비고의 ⚠는 소스와 동작이 달라지는 의도적 변경이며 전량이 §0.2 변경표에 다시 나온다.

| # | 소스 심볼 | 목적지 서브패스 | 라이브러리 이름 | 비고 |
|---|---|---|---|---|
| 1 | `NotificationPriority` | `./core` | `NotificationPriority` | 동일 닫힌 유니언 `'NORMAL' \| 'ESSENTIAL'` |
| 2 | `NotificationJsonPrimitive` · `NotificationJsonValue` | `./core` | 동일 | 재귀 JSON 타입 그대로 |
| 3 | `NotificationAction` | `./core` | `NotificationAction` | 동일 (`href?` + 임의 JSON 키) |
| 4 | `NotificationTiming` | `./core` | `NotificationTiming` | 동일 판별 유니언 (ISO 문자열 유지 — 직렬화 가능성이 outbox의 전제) |
| 5 | `NotificationBatch` | `./core` | `NotificationBatch` | 동일 |
| 6 | `NotificationCommand` | `./core` | `NotificationCommand` | 동일. `applicationKey`가 서버 소유라는 규약도 JSDoc으로 이관 |
| 7 | `NotificationStageResult` | `./core` | `NotificationStageResult` | 동일 |
| 8 | `NotificationPublisher<Tx>` | `./core` | `NotificationPublisher<Tx>` | 동일 — **호스트 소스 트랜잭션**을 받는 유일한 포트 |
| 9 | `assertNotificationCommand` | `./core` | `assertNotificationCommand` | ⚠ `Error` → `NotificationsError('ERR_NOTIFICATION_COMMAND_INVALID')`(§0.2-⑧) |
| 10 | `KST_OFFSET_MS` · `KST_QUIET_HOUR_START` · `KST_QUIET_HOUR_END` | — | **제외** | 한국 상수. 정책 입력으로 대체(§0.2-①) |
| 11 | `KST_BATCH_WINDOW_MS` | `./core` | `DEFAULT_BATCH_WINDOW_MS` | 값 600_000은 유지하되 **이름에서 KST 제거** |
| 12 | `NotificationBatchWindow` | `./core` | `NotificationBatchWindow` | 동일 (`startedAt`/`endsAt`) |
| 13 | `notificationBatchPolicyKey` | `./core` | `notificationBatchPolicyKey` | 동일 JSON 배열 인코딩 (구분자 충돌 회피 근거도 이관) |
| 14 | `notificationFollowUpBatchPolicyKey` | `./core` | `notificationFollowUpBatchPolicyKey` | 동일 |
| 15 | `NotificationSchedulingPolicy` (클래스) | `./core` | `NotificationSchedulingPolicy` (**인터페이스**) + `createQuietHoursPolicy()` | ⚠ 클래스 → 포트+팩토리. 수신자별 정책을 minor 없이 가능하게(§0.2-③) |
| 16 | `.isKstQuietHours()` | `./core` | `.isQuietHours(at)` | ⚠ 고정 offset 산술 → IANA 벽시계(§0.2-①) |
| 17 | `.nextKstNormalDeliveryAt()` | `./core` | (내부) `.resolveDeliveryAt`에 흡수 | 공개 표면을 줄인다. DST 갭/중복 규칙은 §3.2 |
| 18 | `.resolveDeliveryAt()` | `./core` | `.resolveDeliveryAt(input)` | ⚠ 위치 인자 3개 → 명명 입력 객체(수신자·카테고리 전달용) |
| 19 | `.batchWindow()` | `./core` | `.batchWindow(at)` | ⚠ epoch 격자 → **로컬 자정 기준 버킷**(§0.2-⑪) |
| 20 | `notificationRecipientKey` | `./core` | `notificationRecipientKey` | ⚠ digest는 **비트 동일**, NUL 포함 입력만 거부(§0.2-⑤) |
| 21 | `NotificationPushEndpoint` · `NotificationPushPayload` | `./core` | 동일 | payload에 `idempotencyKey` 추가(§0.2-⑨) |
| 22 | `NotificationPushResult` | `./core` | `NotificationPushResult` | ⚠ `invalidEndpointIds`를 provider 확인분과 로컬 거부분으로 분리(§0.2-⑥) |
| 23 | `NotificationPushGateway` | `./core` | `NotificationPushGateway` | 동일 2메서드. **전송은 영원히 포트다**(§0.4-④) |
| 24 | `NotificationDeliveryPresentation` | `./core` | `NotificationPresentation` | 동일 형태, 이름만 정리 |
| 25 | `presentNotificationDelivery` | — | `NotificationPresenter` **포트만** | ⚠ 한국어 기본 카피 제거. 기본 구현 없음 = 필수 옵션(§0.2-②) |
| 26 | `ExpoNotificationPushGateway` | `./expo` | `createExpoPushGateway({ send })` | ⚠ SDK 인스턴스 소유 → **전송 콜백 주입**. expo-server-sdk 미탑재(§0.4-④) |
| 27 | `expoOptionsFromEnv` | — | **제외** | `process.env.EXPO_ACCESS_TOKEN` 읽기는 호스트 설정. README 3줄 레시피 |
| 28 | `Expo.isExpoPushToken` (SDK) | `./expo` | `isExpoPushToken(address)` | 순수 형태 검사. SDK 없이 구현하고 케이스 표로 고정(§3.5) |
| 29 | `Expo.chunkPushNotifications` (SDK) | `./expo` | `chunkExpoPushMessages(entries, { chunkSize })` | ⚠ 청크 경계를 라이브러리가 소유 — 순서 결합 결함 제거(§0.3-④) |
| 30 | `handleTickets` (private) | `./expo` | `classifyExpoPushTickets(entries, tickets)` | undersized 응답 가드 포함. 순수 함수로 공개 |
| 31 | `NotificationRelayService` | `./core` + `.` | `createNotificationRelay()` + `NotificationRelayRunner` | ⚠ Prisma 직접 호출 → `NotificationRelayStore` 포트(§3.3) |
| 32 | `CLAIM_STALE_MS` · `RELAY_PAGE_SIZE` · `DISPATCH_PAGE_SIZE` | `./core` | `DEFAULT_CLAIM_STALE_MS` · `DEFAULT_RELAY_PAGE_SIZE` · `DEFAULT_DISPATCH_PAGE_SIZE` | 상수 → 옵션 기본값 |
| 33 | `RelayOutcome` (비-export) | `./core` | `NotificationRelayOutcome` | 공개 (`'relayed' \| 'suppressed' \| 'already-relayed' \| 'no-longer-live'`) |
| 34 | `isUniqueConstraint` · `safeErrorCode` · `actionToInput` · `actionFromJson` | — | 대부분 **제외** | Prisma 고유. 에러 코드 축약만 `safeErrorCode()`로 `./core`에 남되 Prisma 분기 없음 |
| 35 | `priorityFrom` | `./core` | `notificationPriorityFrom(value)` | 저장소가 문자열을 돌려주므로 여전히 필요. throw → 타입드 에러 |
| 36 | `NotificationDispatchService` | `./core` + `.` | `createNotificationDispatcher()` + `NotificationDispatchRunner` | ⚠ 동 |
| 37 | `EXPO_PROVIDER` 상수 | — | **제외** | provider 문자열은 호스트 설정(`providers: readonly string[]`) |
| 38 | `NotificationPipelineWakeup` (포트) | `./core` | `NotificationPipelineWakeup` | 동일 `request(): void` |
| 39 | `NotificationPipelineWakeupService` | `./core` + `.` | `createNotificationWakeup()` | ⚠ 전역 타이머 → 주입 가능 스케줄러 + `enabled` 플래그(§0.2-⑫) |
| 40 | `NotificationEndpointRepository` | `./core` | `NotificationEndpointStore` | 이름만 정리 (repository → store, 형제 관행 `[형제]`) |
| 41 | `NotificationRecipientLiveness<Tx>` | `./core` | `NotificationRecipientLiveness<Tx>` | 동일 2메서드. **시그니처는 §3.3.6**에 싣고 의무 I1–I3을 붙인다. 구현은 호스트 |
| 42 | `NotificationAccountLifecycle<Tx>` | `./core` | `NotificationAccountLifecycle<Tx>` | 동일. 구현은 호스트(테이블을 아는 쪽). **시그니처는 §3.3.6**, 의무는 L1–L4 — G7의 실제 근거는 이 네 문장이다 |
| 43 | DI 심볼 6종(`NOTIFICATION_*`) | `.` | `Symbol.for('@gj-kit/nest-notifications:*')` **11종** | ⚠ `Symbol()` → `Symbol.for()`(§0.2-⑬). 11종의 정확한 이름 집합은 §3.8.2이고, `release-artifact.test.ts`가 exports·peer와 **같은 등급**으로 그 집합을 고정한다(§5.5) |
| 44 | `NotificationsModule` | `.` | `NestNotificationsModule.forRoot/forRootAsync` | `@Global()` 제거 — 전역 오염은 호스트가 선택 |
| 45 | Prisma 어댑터 4종 | — | **제외**(§0.4-①) | 대신 `./testing`의 인메모리 구현 + README DDL + 적합성 케이스 |
| 46 | `NotificationsV2Service`(312) · `NotificationsController`(79) | — | **제외**(§0.4-②) | inbox 조회·선호도 CRUD·엔드포인트 등록 = 호스트 HTTP/도메인 |
| 47 | `NotificationsRelayJob` · `NotificationsDispatchJob` | — | **제외**(§0.4-③) | 잡 배선은 호스트. README에 `@gj-kit/nest-operations-jobs` 어댑터 12줄 레시피 |

### 0.2 의도적 동작 변경표 — "소스와 동일"의 예외 전수

| # | 항목 | 소스 동작 | 라이브러리 동작 | 사유 |
|---|---|---|---|---|
| ① | 시간대·조용시간 | `KST_OFFSET_MS = 9h` 고정 offset 산술, quiet 22–08 상수 | `createQuietHoursPolicy({ timeZone, quietHours, batchWindowMs, holdPriorities })` — IANA 이름을 받아 **벽시계**로 판정 | 미션 요구이자 계약 요구다. 고정 offset은 DST가 있는 지역에서 1시간 틀리고, `+05:45`(Asia/Kathmandu)·`+08:45`(Australia/Eucla) 지역에서는 10분 격자와 벽시계가 어긋난다. 한국을 모르는 라이브러리가 "Asia/Seoul의 22–08"을 정확히 표현하는 유일한 방법은 IANA 벽시계 산술이다(§3.2) |
| ② | 배치 카피 | `새 알림 ${count}건` 하드코딩 | `NotificationPresenter` **필수 옵션**, 기본 구현 없음 | 사용자가 실제로 읽는 문장은 제품 카피다. 기본값을 주면 영어권 소비자가 한국어를 배포하고, 중립 폴백을 주면 5건짜리 배치가 첫 항목의 문장으로 나간다(둘 다 거짓말). 필수 옵션이면 **컴파일 에러**가 결정을 강제한다 |
| ③ | 정책 형태 | `class NotificationSchedulingPolicy` | `interface NotificationSchedulingPolicy` + `createQuietHoursPolicy()` | 클래스를 공개하면 "수신자별 시간대"가 breaking change가 된다. 인터페이스 + 전체 명령 컨텍스트를 넘기는 시그니처면 호스트가 자기 구현을 끼워 추가 릴리스 없이 확장한다 |
| ④ | 영속화 | Prisma 직접 호출 (`this.prisma.*`) | `NotificationRelayStore` · `NotificationDeliveryStore` · `NotificationEndpointStore` 포트 + 호스트 포트 2종(`NotificationPublisher`·`NotificationAccountLifecycle`/`RecipientLiveness`) | 라이브러리는 테이블·ORM·마이그레이션을 모른다(§3.3). 계약은 문장(R1–R13·D1–D9·I1–I3·L1–L4)이고, 그 문장은 `./testing`의 적합성 케이스가 실행 가능한 검사로 바꾼다 |
| ⑤ | recipient key | `sha256(app ‖ NUL ‖ ref)`, 입력 검증 없음 | **digest 동일**, 단 두 입력 중 하나라도 U+0000을 포함하면 `ERR_NOTIFICATION_RECIPIENT_KEY_INPUT` | NUL 구분자는 입력에 NUL이 없을 때만 단사(injective)다. 길이 접두로 바꾸면 완전 단사가 되지만 **digest가 바뀌어 기존 호스트가 tombstone 테이블을 마이그레이션해야 한다**. 거부로 구멍을 닫으면 마이그레이션 0 + 구멍 0이다 |
| ⑥ | 무효 endpoint | `invalidEndpointIds`에 로컬 정규식 실패분과 provider 확인분을 **합쳐서** 반환 | `invalidEndpointIds`(provider 확인) · `rejectedEndpointIds`(로컬 형태 거부)로 분리. 기본 정책은 **provider 확인분만 비활성화** | 우리 정규식이 provider보다 엄격해지는 날(Expo 토큰 형식 확장 등) 소스 동작은 살아 있는 기기를 영구 비활성화한다. 되돌릴 방법도 없다(사용자가 앱을 재설치해야 한다) |
| ⑦ | 시각 | 한 패스의 모든 행이 페이지 시작 시각 `now` 하나를 공유 | 행마다 주입된 시계에서 새로 읽는다 | 100행 패스가 20초 걸리면 마지막 행의 `claimedAt`이 20초 과거로 기록되어 그만큼 일찍 stale로 회수되고, `relayedAt`도 실제 완료 시각이 아니다(§0.3-⑥) |
| ⑧ | 에러 | `new Error(문자열)` · Nest 예외 | `NotificationsError` + 닫힌 `code` 유니언 + `isNotificationsError()` | AGENTS.md §2 — 안정적인 typed error code와 type guard 제공. `instanceof` 대신 가드를 정본으로 두는 이유는 §2.5 |
| ⑨ | push payload | `notificationId`(= inbox message id) | `notificationId` 유지 + `idempotencyKey`(= deliveryId) + `collapseKey?` | 재시도가 at-least-once인 이상(§3.1) 중복을 줄일 수 있는 유일한 지점은 provider의 dedupe/collapse다. 값을 안 주면 provider가 도울 방법이 없다 |
| ⑩ | Expo 청킹 | SDK `chunkPushNotifications` 결과를 `cursor += messages.length`로 입력과 재대응 | 라이브러리가 순수 함수로 청킹 + 각 청크가 자기 endpoint를 **동반 반송** | 소스는 "SDK가 입력 순서를 보존하고 연속 분할한다"는 **문서화되지 않은 불변식**에 티켓→endpoint 대응을 걸었다. 어긋나면 엉뚱한 기기가 비활성화된다(§0.3-④) |
| ⑪ | 배치 창 | epoch 격자 (`floor(t/600000)`, KST가 10분 배수라 우연히 로컬 정렬) | **로컬 자정 기준** 버킷. 하루 경계에서 잘린다 | 10분 창은 우연히 맞았지만 6시간 digest·일일 요약은 안 맞는다. 자정 기준이면 창 길이가 커져도 계약이 유지되고, DST로 23시간이 된 날의 마지막 버킷만 짧아진다(경계가 뒤로 가지 않는다) |
| ⑫ | wakeup | 전역 `setTimeout` + `unref`, 항상 켜짐 | `scheduler` 주입 가능 + `enabled` 옵션 + 실패 시 로거 포트에만 `error.name` | 전역 타이머는 테스트에서 실시간 대기를 강요하고(소스 스펙이 실제로 `realSetTimeout(5ms)`로 기다린다 `[소스]`), 서버리스에서는 응답 후 실행이 보장되지 않아 켜 두면 오해를 부른다 |
| ⑬ | DI 토큰 | `Symbol("NOTIFICATION_*")` | `Symbol.for('@gj-kit/nest-notifications:*')` | ESM/CJS 이중 로드에서 `Symbol()`은 서로 다른 토큰이 되어 주입이 조용히 실패한다. 전역 심볼 레지스트리는 그 실패를 구조적으로 없앤다 `[형제 — toss-payments-nestjs inject.ts 관행 확장]` |
| ⑭ | 모듈 스코프 | `@Global()` | 일반 모듈. `exports`로 필요한 것만 노출 | 전역 모듈은 호스트의 결정이지 라이브러리의 결정이 아니다 |
| ⑮ | 로깅 | `PinoLogger`(nestjs-pino) 직접 의존 | `NotificationLogger` 구조적 포트 (`info/warn/error(fields, message)`) | 형제 `nest-operations-jobs`의 `JobLogger`와 같은 형태 — pino 인스턴스가 그대로 대입되고, Nest 내장 `Logger`는 `.` 서브패스의 어댑터가 흡수한다 |
| ⑯ | 배달 행 생성 충돌 | `notificationDelivery.create()`가 P2002을 **던지고**, `persistClaimed`가 트랜잭션 전체를 최대 3회 재시도한다 `[소스 notification-relay.service.ts:259-275 — 실측]` | `createDelivery`가 **던지지 않고** `{ id, created }`를 반환한다. `created: false`면 릴레이가 병합/follow-up 경로로 되돌아간다(R11). 옵션 `conflictRetries`는 **없앤다** | 이 패키지의 다른 모든 삽입은 이미 conflict-safe non-throwing이다(R3·R4·D2, §4-5 "포트 시그니처가 애초에 예외를 요구하지 않는다"). 배달 삽입 하나만 예외를 요구하면 저장소 구현자는 그 사실을 문서 어디에서도 읽을 수 없고, 교과서대로 `ON CONFLICT DO NOTHING` + `SELECT`로 구현한 순간 **잠긴 배달에 항목이 붙어 알림이 조용히 사라진다**(§0.3-⑦). 재시도 소유자를 하나로 두라는 §0.4-⑦도 같은 방향이다 |
| ⑰ | claim 신선도 판정의 시간축 | `staleClaimAt = new Date(now - CLAIM_STALE_MS)`를 **워커 프로세스 시계**로 만들어 `relayClaimedAt`(다른 워커의 프로세스 시계로 쓰인 값)과 한 `WHERE`에서 비교한다 `[소스 notification-relay.service.ts:56-80 — 실측]` | 요청이 **순간이 아니라 기간**을 나른다: `claimStaleMs`. `claimedAt` 기록과 stale 비교는 **저장소 자기 시계** 하나에서만 나온다(R12) | 앱 서버가 N대면 프로세스 시계도 N개다. 두 워커의 시계가 `claimStaleMs`(기본 5분)보다 벌어지면 **신선한 claim이 상시 탈취**되어 두 워커가 늘 겹쳐 돈다. 스큐는 비교식을 한쪽 축으로 옮기는 것 말고 완화 수단이 없다 — 형제 `nest-operations-jobs`가 같은 결함에 같은 처방을 내렸다(S6 `[형제 §0.2-⑰·§3.2 S6]`) |
| ⑱ | 무효 endpoint 비활성화 | ticket에서 얻은 endpoint id를 **무조건** 비활성화한다 `[소스 notification-dispatch.service.ts:107]` | `listEnabled`가 관측한 **등록 리비전**을 함께 돌려주고, `disable`은 리비전이 일치할 때만 쓴다(D6) | endpoint 유일성이 `(applicationKey, provider, address)`이므로 `DeviceNotRegistered`를 받은 뒤 사용자가 앱을 다시 열어 **같은 토큰을 같은 행에 재등록**하면, 뒤늦게 도착한 무조건 `disable`이 그 행을 다시 꺼 버린다 `[소스 prisma/schema.prisma model NotificationEndpoint — 실측]`. 클라이언트는 보통 토큰이 바뀔 때만 upsert하므로 그 기기는 **무기한** 어두워진다. §0.2-⑥이 로컬 거부분에 대해 막은 것과 정확히 같은 결과가 provider 확인분 경로에 남아 있었다 |
| ⑲ | `createdAt` 소유권 | Prisma `@default(now())` = **DB 시계**가 쓴다. staging 어댑터는 이 필드를 보내지 않는다 `[소스 prisma/schema.prisma · prisma-notification.publisher.ts — 실측]` | **그대로 둔다**. 다만 라이브러리가 이 값을 소유하지 않는다는 사실을 계약으로 적는다(R13) — 배치 버킷의 유일한 입력이기 때문이다 | 정직성 문제다. 저장소 포트에 staging 메서드가 없으므로(§3.4.1 — staging은 호스트 publisher의 것) 라이브러리는 `createdAt`을 쓸 수도 검증할 수도 없다. §1-2의 결정성 주장은 **정책 시간**으로 좁히고, 배치 버킷이 staging 시계를 상속한다는 사실은 §7-14 잔존 리스크로 공시한다 |

### 0.3 소스에서 발견한 결함 10건 — 이관이 고쳐야 하는 것

전부 "소스를 그대로 옮기면 따라오는" 문제다. 승격의 목적이 복제가 아니라는 근거이기도 하다.

1. **wakeup만 배선한 호스트는 배치·예약 알림을 영원히 못 받는다.** `NotificationPipelineWakeupService.request()`는 **명령이 staging될 때만** 호출된다 `[소스 — 호출자는 소스 도메인의 커밋 직후]`. 그런데 배치 배달의 `deliverAfter`는 창이 끝난 뒤, 조용시간에 걸린 NORMAL은 아침 08:00, `SCHEDULED`는 요청 시각이다. 그 시점에 새 명령이 staging되지 않으면 **아무도 dispatch를 부르지 않는다**. memorylog2는 분당 잡이 있어 드러나지 않았지만, 라이브러리 소비자가 "빠른 경로가 있으니 잡은 나중에"라고 판단하면 조용히 깨진다. → wakeup의 JSDoc·README·반환 타입 세 곳이 "주기 실행자가 정확성의 소유자"를 말하고, §4-1이 이것을 오용 1순위로 올린다.
2. **Expo `DeviceNotRegistered`의 상당수는 ticket이 아니라 receipt로 온다.** 소스는 `sendPushNotificationsAsync`의 ticket만 검사하고 `getPushNotificationReceiptsAsync`를 **한 번도 호출하지 않는다** `[소스 — expo-push.service.ts 전문에 receipt 호출 없음]`. Expo는 push를 접수한 뒤(ticket=ok) 실제 전송 결과를 receipt로 돌려주며, 기기 등록 해제는 대개 그쪽에서 관측된다 `[unverified — Expo 문서 재확인 필요]`. 결과적으로 죽은 토큰이 계속 남아 매 dispatch가 비용을 낸다. → 라이브러리는 receipt 폴링을 0.1에서 만들지 않되(§6-7), `./expo`의 ticket 분류기가 **성공 ticket의 id를 반환**하게 해서 호스트가 receipt 폴링을 직접 붙일 수 있게 한다.
3. **부분 성공한 청크가 전량 재전송된다.** 청크 1이 접수되고 청크 2가 throw하면 `accepted=false`가 되어 배달 전체가 재시도되고, 다음 패스에서 청크 1의 기기들이 **같은 알림을 다시 받는다** `[소스 expo-push.service.ts:60-75]`. at-least-once의 실제 비용이 여기 있다. → §3.1 F4에 명시하고, endpoint 단위 재개는 §6-6의 additive 경로로 남긴다.
4. **ticket→endpoint 대응이 SDK의 문서화되지 않은 불변식에 걸려 있다.** 소스는 `chunkPushNotifications(messages)`의 각 청크 길이만큼 `cursor`를 전진시켜 원본 entries를 잘라 쓴다. SDK가 입력 순서를 바꾸거나 비연속 분할을 하면 **엉뚱한 endpoint가 DeviceNotRegistered로 비활성화된다**. → 청킹을 라이브러리 순수 함수로 가져오고, 청크가 `{ messages, endpoints }`를 함께 들고 다니게 해서 대응을 자료구조로 못 박는다(§3.5).
5. **로컬 형태 검사 실패가 provider 확인과 같은 취급을 받는다.** `send()`는 `isValidEndpoint`가 거부한 endpoint id를 그대로 `invalidEndpointIds`에 넣고, dispatch는 그것을 `endpoints.disable()`로 넘긴다 `[소스 expo-push.service.ts:37-40 → notification-dispatch.service.ts:107]`. 우리 정규식이 provider보다 엄격해지는 순간 살아 있는 기기가 영구 비활성화된다. → §0.2-⑥.
6. **패스 전체가 시각 하나를 공유한다.** `relayDue(now = new Date())`의 `now`가 페이지 조회·claim·완료 기록에 모두 쓰인다 `[소스 notification-relay.service.ts:56-108]`. 느린 패스에서는 뒤쪽 행의 `relayClaimedAt`이 실제보다 과거로 남아 stale 판정이 앞당겨지고, `relayedAt`이 완료 시각과 다르다. → 시계 포트에서 행마다 읽는다(§0.2-⑦).
7. **배달 생성이 예외에 걸려 있고, 그 예외는 계약으로 적힌 적이 없다.** `persistInTransaction`은 배치 정체성으로 `findUnique` → 없으면 `create`를 부르고, `create`가 P2002을 던지면 `persistClaimed`가 **트랜잭션 전체를 3회 재시도**한다 `[소스 notification-relay.service.ts:259-275, 285-310 — 실측]`. 즉 이 파이프라인에서 유일하게 "예외를 던져야 정상 동작하는" 삽입이다. 이관하면서 이 사실을 적지 않으면, 다른 삽입 전부가 non-throwing인 계약을 읽은 저장소 구현자는 배달 삽입도 `ON CONFLICT DO NOTHING` + `SELECT`로 만든다. 그러면 **이미 presentation 잠긴 배달의 id가 돌아오고** 그 위에 `appendItem`이 붙어, 항목은 relayed로 마감되는데 사용자는 영원히 못 본다 — D1·G6·F10이 막으려던 바로 그 유실이다(F10의 follow-up 경로는 `mergeIntoBatch === false`에서만 발화하므로 이 경로에서는 열리지 않는다). → `createDelivery`가 `{ id, created }`를 반환하고 릴레이가 `created: false`를 병합/follow-up으로 되돌린다(§0.2-⑯ · R11).
8. **stale 판정이 두 시간축을 섞는다.** `staleClaimAt`은 이 워커의 프로세스 시계에서 만들어지고 `relayClaimedAt`은 **다른 워커의** 프로세스 시계로 쓰인 값이다 `[소스 notification-relay.service.ts:56-80 — 실측]`. 앱 서버 두 대의 시계가 5분 이상 벌어지면 신선한 claim이 매 패스 탈취되어 두 워커가 상시 겹친다. §3.3.5는 이 겹침을 "죽지 않고 멈춰 있던 프로세스"로만 설명하고 있었는데, 스큐는 **정상 동작하는 워커에서도** 같은 창을 연다. → claim 요청이 기간(`claimStaleMs`)만 나르고 판정은 저장소 시계가 한다(§0.2-⑰ · R12).
9. **provider가 확인한 무효 endpoint를 무조건 끈다.** ticket 분류 결과를 `endpoints.disable()`에 그대로 넘긴다 `[소스 notification-dispatch.service.ts:107]`. endpoint 유일성이 `(applicationKey, provider, address)`이므로 사용자가 그 사이에 앱을 열어 같은 토큰을 재등록하면 **같은 행이** 다시 켜졌다가 늦은 `disable`에 다시 꺼진다 `[소스 prisma/schema.prisma model NotificationEndpoint — 실측]`. → `listEnabled`가 리비전을 동반 반송하고 `disable`이 그것을 조건으로 쓴다(§0.2-⑱ · D6).
10. **시도 상한도 종착 상태도 없다.** 두 테이블에 `relayAttemptCount`·`dispatchAttemptCount`가 있지만 **어떤 쿼리도 읽지 않는다** `[소스 prisma/schema.prisma · relay:81 · dispatch:80 — 실측]`. due 필터는 `relayedAt IS NULL` / `deliveredAt IS NULL`뿐이라 영구 실패하는 행이 매 패스 다시 claim된다. 페이지 크기가 100인데 그런 행이 100개면 **건강한 알림이 영원히 페이지에 들어오지 못한다** — 유실인데 에러가 하나도 안 난다. → 시도 횟수를 포트에 노출하고(`attempts`) 소진 행을 due에서 뺄 수단(`maxAttempts`)을 준다. 백오프 정책은 여전히 라이브러리가 소유하지 않는다(§0.4-⑦ · R13 · §7-16).

### 0.4 기각 결정 (재론 금지)

| # | 기각한 것 | 근거 |
|---|---|---|
| ① | Prisma 어댑터 4종 승격 또는 스키마 소유 | 두 가지를 구분한다. **어댑터**는 `PrismaService`·`Prisma.TransactionClient`·모델명에 전면 결합돼 있어 이관 대상이 아니다. **스키마 소유**(toss-payments-postgresql 방식)는 매력적이지만 — 테이블 7종이 전부 알림 전용이므로 정당성이 있다 — 이 패키지에 넣으면 SQL 방언·마이그레이션 러너·통합 테스트용 DB가 전부 들어와 "프레임워크 free 코어"라는 정체성과 릴리스 게이트를 동시에 무겁게 만든다. **정답은 형제 패키지 분리다**: `@gj-kit/toss-payments` ↔ `@gj-kit/toss-payments-postgresql`와 똑같이, 미래의 `@gj-kit/nest-notifications-postgresql`이 이 패키지의 포트를 구현하고 DDL을 소유한다. 0.1에서는 README DDL + `./testing` 적합성 케이스가 그 자리를 지킨다(§6-1) |
| ② | inbox 조회 API(`NotificationsV2Service` 312줄 + 컨트롤러 79줄) 승격 | 커서 페이징·읽음 처리·선호도 CRUD·엔드포인트 등록까지는 일반적이지만, 그 안에 **actor 하이드레이션**(`actorMap()`이 호스트 `User` 테이블을 조인한다 `[소스]`)과 HTTP DTO·인증 컨텍스트가 섞여 있다. 조회 표면을 올리면 저장소 포트가 6메서드에서 20메서드로 커지고 그 절반은 파이프라인이 쓰지 않는다. 형제 `nest-operations-jobs`가 관리자 조회 API를 뺀 것과 같은 판정 `[형제 §6.2-3]` |
| ③ | `@gj-kit/nest-operations-jobs`에 대한 dependency·peer·타입 import | **미션 지시이자 옳은 설계다.** 두 패키지는 지금 동시에 만들어지고 있고, 어느 쪽도 상대의 버전에 묶이면 안 된다. 대신 `NotificationRelayRunner.run()`이 `Promise<NotificationRelaySummary>`를 돌려주고 그 타입이 `Record<string, unknown>`에 **구조적으로** 대입 가능하도록 설계한다 — 잡 어댑터가 12줄이 되는 것은 의존이 아니라 구조적 호환의 결과다(§3.8) |
| ④ | `expo-server-sdk`를 dependency 또는 optional peer로 | §2.2에서 3안을 표로 전개한다. 요약: 전송 HTTP 호출은 20줄이고, 값어치 있는 부분(청킹·ticket 분류·undersized 가드)은 **SDK 타입이 아니라 wire shape에 대한 순수 함수**다. optional peer로 두면 packed consumer 매트릭스가 2배가 되고 SDK 메이저 bump마다 peer 범위 변경(= breaking)이 필요하다 |
| ⑤ | `@gj-kit/format`을 dependency 또는 peer로 (시간대 헬퍼 재사용) | 정직한 답: **비용이 이득보다 크고, 애초에 필요한 함수가 공개돼 있지도 않다.** `wallClockIn(epochMs, timeZone)`은 `format/src/zone.ts`에 있지만 `src/index.ts`가 **export하지 않는다** — 공개 표면은 `canFormatTimeZone` 하나뿐이다 `[형제 — format/src/index.ts 실측]`. 즉 peer를 걸어도 우리가 필요한 것을 얻지 못한다. 게다가 `toss-payments-postgresql → toss-payments` peer가 정당한 이유는 **저장소 seam이라는 공유 타입 계약**이 있어서인데, 여기엔 그런 계약이 없다(내부 헬퍼 하나를 공유하고 싶을 뿐이다). 서버 패키지의 릴리스 케이던스를 RN/Hermes 대상 포매팅 패키지에 묶는 것도 비용이다. → `src/core/zone.ts` 약 80줄을 자체 구현한다(§3.2) |
| ⑥ | 한국어(또는 어떤 언어든) 기본 카피 | §0.2-② |
| ⑦ | 라이브러리 소유 재시도 백오프·큐·우선순위 스케줄러 | 재시도 소유자는 하나여야 한다. 이 파이프라인의 재시도는 **claim 해제 + 다음 주기 실행**이고 주기의 소유자는 호스트의 스케줄러다. 두 번째 백오프 정책을 넣으면 두 정책이 곱해진다 `[형제 §0.4-⑧ 동일 논리]` |
| ⑧ | provider 종류를 닫힌 유니언으로 고정 (`'EXPO' \| 'FCM' \| …`) | provider 문자열은 호스트가 만드는 값이다. `NotificationPushEndpoint.provider`는 `string`으로 두고, dispatcher는 `providers: readonly string[]` 옵션으로 어떤 provider를 이 게이트웨이에 넘길지 호스트가 정한다 |
| ⑨ | 배달 순서 보장 | §3.1에서 **명시적으로 보장하지 않는다**고 선언한다. 순서를 보장하려면 수신자별 직렬 큐가 필요하고, 그것은 조용시간 홀드·배치 창·병렬 워커와 정면으로 충돌한다 |
| ⑩ | (기각이 아니라 **관계 정리**) AGENTS.md §1의 "sync/outbox는 소비 앱에 남긴다" 조항 | 리뷰어가 가장 먼저 집을 조항이므로 여기서 정면으로 답한다. **(a) 승격되는 것은 outbox의 일반 메커니즘이다** — claim/stale 회수/멱등 완료/배달 의미론·실패 행렬. 어느 것도 제품을 모른다. **(b) 조항이 이름을 부른 것은 전부 남는다** — 테이블·마이그레이션(§0.4-①), 도메인 이벤트와 조회 API·HTTP DTO(§0.4-②), 카피(§0.2-②), 시간대·조용시간 값(§0.2-①). 소비 앱이 계속 소유하는 것이 "우리 앱의 outbox"이고, 올라가는 것은 "outbox라는 것을 어떻게 안전하게 돌리는가"다. **(c) 같은 판정을 형제가 이미 내렸다** — `nest-operations-jobs`는 `JobRun` **테이블을 호스트에 남기고** 포트 + 적합성 케이스만 가져갔다 `[형제 §0.4-⑤]`. **(d) 근거 조항은 같은 절의 마지막 문장이다** — "새 관심사가 UI/미디어 중 어디에도 자연스럽게 속하지 않으면 관련 없는 package를 비대하게 만들지 말고 focused package를 제안한다"(AGENTS.md §1). 알림 파이프라인은 `expo-ui`에도 `expo-media`에도 속하지 않는다 |

---

## 1. 설계 원칙

1. **파이프라인은 프레임워크·전송·저장소·언어를 모른다.** `./core`는 `@nestjs/*`·`rxjs`·`reflect-metadata`·`expo*`·SQL·한국어 문자열을 **한 줄도** 포함하지 않는다. 선언이 아니라 강제다: 소스 스캔 가드 3종 + `dist/core.*` 문자열 스캔 + peer-graph 테스트(§5.3). 릴레이와 디스패처를 Nest 없이 `node --test`로 돌릴 수 있다는 것이 이 분리의 검증 가능한 결과다.
2. **정책은 전부 주입된다 — 시간대·조용시간·창 길이·카피·페이지 크기·stale 임계·시계·난수.** `Date.now()`·`new Date()`·`setTimeout`·`randomUUID`는 `src/core/runtime.ts` **한 파일 안에서만** 등장하고 그마저 `systemNotificationRuntime()` 팩토리 뒤에 있다. `process.env`는 `src/**` **어디에도 없다** — runtime.ts조차 환경을 읽지 않는다(`expoOptionsFromEnv`를 제외한 §0.1-27과 같은 결정이며, §5.3 가드가 파일 예외 없이 강제한다). 파이프라인의 모든 **정책** 시간 결정 — `resolveDeliveryAt`·`batchWindow`·조용시간 해석 — 이 주입된 시계에서 나오므로 DST 경계 테스트가 결정적이다.

   **주입된 시계가 소유하지 않는 시각이 두 개 있고, 둘 다 의도적이다.** ⑴ `createdAt`(ingress staging 시각) — 저장소 포트에 staging 메서드가 없으므로 라이브러리가 쓰지 않는다(R13 · §7-14). ⑵ claim 신선도 축(`claimedAt`과 stale 컷오프) — 워커가 N개면 프로세스 시계도 N개라, "두 워커가 겹치는가"를 가르는 비교식은 모두가 공유하는 저장소 시계 위에 있어야 한다(R12 · §0.2-⑰). 이 두 예외를 적지 않으면 "모든 시간이 주입된 시계에서 온다"는 문장이 거짓이 된다.
3. **영속화는 소유하지 않고 계약한다.** 저장소 포트가 **원자성 의무**(§3.3 R1–R13 · D1–D9)를 문장으로 정의하고, **저장소 포트 밖에 있는 두 보증**도 같은 방식으로 못 박는다 — ingress 멱등은 호스트 publisher의 의무(I1–I3), 삭제 이후 알림 0은 호스트 lifecycle의 의무(L1–L4)다(§3.3.6). 네 계열 전부 문서가 아니라 `./testing`의 적합성 케이스 배열이 검사하고, 케이스는 `NotificationStoreSuite` 하나로 **호스트 구현에 직접** 닿는다. "우리 케이스로 판정된다"가 성립하려면 케이스가 호스트 코드에 닿아야 한다 — 그 입구가 없으면 이 원칙은 자기 인메모리 구현을 검사하는 문장일 뿐이다.
4. **배달 의미론을 먼저 적고 그다음에 API를 적는다.** at-least-once·멱등 키·순서 없음·실패 행렬(§3.1)이 이 패키지의 1차 계약이고, 시그니처는 그것의 표현이다. 계약이 애매하면 소비자는 중복 알림을 버그로 신고한다.
5. **정확성 경로와 지연 경로를 타입으로 구분한다.** `run(): Promise<Summary>`(정확성, 주기 실행자 소유)와 `request(): void`(빠른 경로, 결과 없음·await 불가·실패 보고 없음). 반환 타입이 곧 계약이다.
6. **결정을 기본값으로 숨기지 않는다.** `applicationKey`·`policy`·`presenter`·저장소 3종은 **필수 옵션**이다. 조용히 동작하는 기본값은 "라이브러리가 우리 제품 정책을 골랐다"는 뜻이고, 이 저장소의 사용자는 그것을 가장 싫어한다.
7. **런타임 의존성 0, peer는 필수 3종.** `dependencies: {}`를 유지한다. `@nestjs/common`·`reflect-metadata`·`rxjs`는 **required** peer다. 범위 자체는 형제 `toss-payments-nestjs`와 같지만 `[형제 — package.json 실측]`, 그 패키지는 exports가 `.` 하나뿐인 Nest 전용이라 required의 대가가 0이고 **선례로 인용할 수 없다**. 구조적으로 동형인 형제는 `toss-payments-postgresql`(프레임워크 free `.` + `./nestjs`)이고 **그쪽은 셋 다 optional로 표시한다** `[형제 — package.json 실측]`. required를 고르는 논증과 그 대가는 §2.4.1, 잔존 리스크는 §7-13에 있다. expo-server-sdk는 peer도 optional peer도 아니다(§2.2).
8. **공개 옵셔널 필드는 전부 `?: T | undefined`, 입력 객체는 전부 `readonly`.** 모노레포 EOP 소비자 보호 규약 `[형제 — expo-ui → expo-media → expo-auth → expo-workouts → format → nest-operations-jobs]`.
9. **공개 JSDoc은 영어, 설계 해설 주석은 한국어.** 형제 패키지 전량과 동일 `[형제]`.

---

## 2. 모듈 구조와 exports 맵

### 2.1 서브패스 4개 — `.` · `./core` · `./expo` · `./testing`

형제에서 역산한 서브패스 정당화 조건 3종 `[형제]`: (a) optional peer 격리, (b) 플랫폼 조건 포크, (c) 무겁고 선택적인 표면.

- **`./core`** — peer **미사용** 격리(형제 `nest-operations-jobs §2.1`과 동일 논리 `[형제]`). peer는 required지만 `./core` 산출물은 `@nestjs/*`를 import하지 않으므로 Nest 없는 워커·람다·`node --test`가 파이프라인을 로드해 돌릴 수 있다. "framework-free pipeline core"의 물리적 실체다.
- **`./expo`** — (c)이자 이 패키지의 **가장 중요한 경계**다. Expo를 쓰지 않는 소비자(FCM·APNs·웹푸시)는 이 청크를 아예 로드하지 않는다. 그리고 분리 자체가 검사 가능한 불변식을 만든다: **`src/core/**`에 `expo`·`Expo` 문자열이 0이어야 한다**(§5.3). 이 파일들은 **아무것도 import하지 않는 순수 함수**뿐이라 peer도 dependency도 생기지 않는다(§2.2).
- **`./testing`** — 인메모리 저장소 3종·가짜 런타임·적합성 케이스 배열·기록 로거·테스트 전용 presenter. 프로덕션 번들에 들어가면 안 되는 표면이고, 형제 3종(`toss-payments/testing`·`toss-payments-postgresql/testing`·`nest-operations-jobs/testing`)의 관행 `[형제]`.
- **`.`** — Nest 어댑터. `NestNotificationsModule`·DI 토큰·러너 프로바이더·로거 어댑터. `./core`의 **런타임 값을 재수출하지 않는다**(같은 심볼이 두 경로로 보이면 CJS 이중 로드에서 토큰 동일성과 `instanceof`가 깨진다). 코어 타입은 `export type { … } from './core'`로 **타입만** 재수출한다.

### 2.2 expo-server-sdk를 어떻게 다룰 것인가 — 3안 판정

미션이 명시적으로 논증을 요구한 항목이다.

| 안 | 내용 | 판정 |
|---|---|---|
| A | `expo-server-sdk`를 `dependencies`에 | **기각** — 미션 금지이자 AGENTS.md §2(런타임 의존성 0 기본) 위반 |
| B | `./expo` 서브패스가 `expo-server-sdk`를 **optional peer**로 import | **기각** — 근거 5종 아래 |
| C | 전송은 **포트**, Expo의 순수 지식(청킹·토큰 형태·ticket 분류)만 `./expo`에 무의존 승격 | **채택** |

**B 기각 근거 5종.**

1. **얻는 것이 작다.** SDK에서 실제로 쓰던 것은 세 가지다 — `isExpoPushToken`(정규식 한 줄), `chunkPushNotifications`(100개 슬라이스), `sendPushNotificationsAsync`(`POST https://exp.host/--/api/v2/push/send` + gzip/재시도). 앞의 둘은 순수 함수라 우리가 소유하는 편이 **더 낫다**(§0.3-④가 그 증거: 우리가 청킹을 소유하면 ticket 대응이 자료구조로 고정된다). 남는 것은 HTTP 호출 하나이고, 호스트가 SDK를 쓰든 `fetch`를 쓰든 20줄이다.
2. **잃는 것이 크다.** optional peer는 packed consumer 매트릭스를 `설치함 × 설치안함`으로 2배 만들고, SDK 메이저 bump마다 peer 범위 변경이 필요하며 그것은 **breaking change**다(AGENTS.md §2). 알림 라이브러리의 메이저가 남의 SDK 메이저에 끌려다니게 된다.
3. **검증할 수 없는 표면이 늘어난다.** SDK 경유 전송은 네트워크가 있어야 실행되므로 `verify:release`에서 한 줄도 실행되지 않는다. 형제 `nest-operations-jobs`가 `sync-scheduler.mjs`를 기각한 것과 같은 이유 `[형제 §6.1-2]`.
4. **AGENTS.md의 회피 금지 조항에 가깝다.** optional peer + `try/catch` + dynamic import 조합은 명시적으로 금지돼 있다. 서브패스 격리는 허용된 형태이지만 — 즉 B가 **불법은 아니지만** — 허용된 형태를 쓸 만큼의 이득(1번)이 없다.
5. **포트가 이미 소스의 설계다.** `NotificationPushGateway`는 소스가 스스로 "provider port. PostgreSQL도 recipient의 application identity도 모른다"고 적어 둔 경계다 `[소스 notification-push-gateway.ts:31-33]`. 우리는 그 경계를 지우는 게 아니라 지킨다.

**C의 구체적 형태**(§3.5 전개): `createExpoPushGateway({ send })`가 `NotificationPushGateway`를 반환한다. `send`는 **메서드 문법**으로 선언한다 — `send(messages: readonly ExpoPushMessage[]): Promise<readonly ExpoPushTicket[]>`. 그래야 expo-server-sdk 인스턴스의 `sendPushNotificationsAsync`가 **구조적으로 그대로 대입된다**(zod가 `JobInputValidator`에 대입되는 것과 같은 기법 `[형제 §0.2-①]` — 그쪽도 `parse(value: unknown): Input`이라는 **메서드**다). SDK를 쓰는 호스트는 한 줄, `fetch`를 쓰는 호스트는 15줄이다.

**문법 선택이 이 주장의 참·거짓을 가른다 — 실측했다.** 루트 `tsconfig.base.json`이 `strict: true`이므로 `strictFunctionTypes`가 켜지고, **프로퍼티 + 화살표 함수 타입**의 파라미터는 반공변으로 검사된다. 그 형태에서는 SDK의 `sendPushNotificationsAsync(messages: ExpoPushMessage[])`를 넣을 때 대상 파라미터 `readonly ExpoPushMessage[]`가 소스 파라미터 `ExpoPushMessage[]`에 대입 가능해야 하는데 `ReadonlyArray<T>`는 `T[]`에 대입되지 않는다. **메서드 문법**의 파라미터는 양변(bivariant)으로 비교되므로 통과한다. `typescript@5.9.3` + `strict`+`exactOptionalPropertyTypes`+`noUncheckedIndexedAccess`로 두 형태를 각각 컴파일해 확인했다 `[실측 — 이 개정에서 tsc 실행]`:

```
// 화살표 프로퍼티: error TS2322: Type '(messages: Msg[]) => Promise<Ticket[]>' is not
//   assignable to type '(messages: readonly Msg[]) => Promise<readonly Ticket[]>'.
//   The type 'readonly Msg[]' is 'readonly' and cannot be assigned to the mutable type 'Msg[]'.
// 메서드 문법: 통과
```

§3.3의 저장소 포트와 `NotificationPushGateway.send`가 전부 메서드 문법인데 이 한 곳만 화살표였다. §5.2가 expo-server-sdk를 설치하지 않은 채 `declare const sdkSend`로 이 주장을 닫는다.

### 2.3 디렉토리 트리

```
nest-notifications/
├── package.json                # version 0.0.0 (§2.7)
├── tsconfig.json               # 편집기/tsup 기준 — extends ../tsconfig.base.json
├── tsconfig.src.json           # include: [src] — 소스 타입 검사
├── tsconfig.tests.json         # include: [src, tests] — @types/node 허용
├── tsup.config.ts              # entry 4종, esm+cjs, dts, target node20, platform node
├── vitest.config.ts            # projects: unit / types (형제 복제)
├── README.md                   # 한국어 산문 — ts 블록 전부 check:readme가 dist 타입으로 컴파일
├── LICENSE                     # MIT (형제 동일)
├── scripts/
│   ├── stamp-provenance.mjs    # 루트 scripts/stamp-package-provenance.mjs 위임 래퍼 (형제 복제)
│   ├── check-provenance.mjs    # 루트 check-package-provenance.mjs 위임 래퍼
│   └── check-readme.mjs        # format/scripts/check-readme.mjs 개조 — paths 매핑 4개
├── src/
│   ├── core.ts                 # "./core" 배럴
│   ├── core/
│   │   ├── contracts.ts        # 명령·타이밍·배치·액션·publisher 포트 + assert
│   │   ├── runtime.ts          # NotificationClock · claim token 생성 · scheduler — Date/타이머/난수가 등장하는 유일한 파일
│   │   ├── zone.ts             # IANA 벽시계 산술 (Intl 기반, 무의존) — §3.2
│   │   ├── policy.ts           # NotificationSchedulingPolicy 포트 + createQuietHoursPolicy + batch policy key
│   │   ├── recipient-key.ts    # notificationRecipientKey (node:crypto)
│   │   ├── presentation.ts     # NotificationPresenter 포트 + 입출력 타입 (기본 구현 없음)
│   │   ├── push.ts             # NotificationPushGateway 포트 + endpoint/payload/result
│   │   ├── store.ts            # 저장소 포트 3종 + 트랜잭션 seam + 동시성 계약(JSDoc 정본)
│   │   ├── lifecycle.ts        # NotificationRecipientLiveness · NotificationAccountLifecycle 포트 + I/L 의무 JSDoc — §3.3.6
│   │   ├── relay.ts            # createNotificationRelay
│   │   ├── dispatch.ts         # createNotificationDispatcher
│   │   ├── wakeup.ts           # createNotificationWakeup
│   │   ├── logger.ts           # NotificationLogger 포트 + silentNotificationLogger
│   │   └── errors.ts           # NotificationsError · 코드 유니언 · isNotificationsError
│   ├── expo.ts                 # "./expo" 배럴
│   ├── expo/
│   │   ├── wire.ts             # ExpoPushMessage/Ticket 최소 wire 타입 (SDK import 0)
│   │   ├── chunk.ts            # chunkExpoPushMessages — endpoint 동반 청킹
│   │   ├── tickets.ts          # classifyExpoPushTickets — undersized 가드 포함
│   │   └── gateway.ts          # createExpoPushGateway({ send })
│   ├── index.ts                # "." 배럴 — Nest 표면 + 코어 타입 재수출(타입만)
│   ├── nest/
│   │   ├── inject.ts           # Symbol.for DI 토큰 11종 + Inject* 데코레이터 (이름 집합은 §3.8.2가 정본)
│   │   ├── module.ts           # NestNotificationsModule.forRoot / forRootAsync
│   │   ├── runners.ts          # NotificationRelayRunner · NotificationDispatchRunner · NotificationWakeup 프로바이더
│   │   └── logger.ts           # fromNestLogger 어댑터
│   ├── testing.ts              # "./testing" 배럴
│   └── testing/
│       ├── memory-stores.ts    # memoryNotificationStores()
│       ├── fake-runtime.ts     # fakeNotificationRuntime({ now })
│       ├── recording-logger.ts # recordingNotificationLogger()
│       ├── passthrough.ts      # passthroughPresenter() — 테스트 전용 명시
│       └── store-contract.ts   # notificationStoreContractCases()
└── tests/
    ├── unit/                   # *.test.ts — §5.1
    │   └── guards/             # peer-graph · ambient-runtime · no-product-strings · release-artifact
    ├── types/                  # *.test-d.ts — §5.2
    └── fixtures/packed-consumer/{nest10,nest11,no-nest}/  # §5.5 — no-nest는 peer를 지운 채 ./core만 로드
```

### 2.4 package.json (확정 형태)

```jsonc
{
  "name": "@gj-kit/nest-notifications",
  "version": "0.0.0",
  "description": "내구성 알림 파이프라인 — 소스 트랜잭션 outbox → 릴레이(조용시간·배치·선호도) → 디스패치(inbox 메시지·푸시 fan-out). 순수 코어는 프레임워크·전송·저장소를 모르고, at-least-once 배달 계약과 저장소 원자성 의무를 명세로 강제한다. 런타임 의존성 0",
  "keywords": ["nestjs", "notifications", "push-notifications", "outbox", "transactional-outbox", "expo-push", "quiet-hours", "idempotency", "at-least-once"],
  "homepage": "https://github.com/gj-kit/gj-kit/tree/main/nest-notifications",
  "repository": { "type": "git", "url": "git+https://github.com/gj-kit/gj-kit.git", "directory": "nest-notifications" },
  "bugs": { "url": "https://github.com/gj-kit/gj-kit/issues" },
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "files": ["dist"],
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./core": {
      "import": { "types": "./dist/core.d.ts", "default": "./dist/core.js" },
      "require": { "types": "./dist/core.d.cts", "default": "./dist/core.cjs" }
    },
    "./expo": {
      "import": { "types": "./dist/expo.d.ts", "default": "./dist/expo.js" },
      "require": { "types": "./dist/expo.d.cts", "default": "./dist/expo.cjs" }
    },
    "./testing": {
      "import": { "types": "./dist/testing.d.ts", "default": "./dist/testing.js" },
      "require": { "types": "./dist/testing.d.cts", "default": "./dist/testing.cjs" }
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsup && node scripts/stamp-provenance.mjs",
    "prepack": "npm run build && node scripts/check-provenance.mjs --require-clean",
    "typecheck": "tsc --noEmit -p tsconfig.src.json && tsc --noEmit -p tsconfig.tests.json",
    "test": "vitest run --project unit",
    "test:types": "vitest run --project types",
    "check:readme": "corepack pnpm run build && node scripts/check-readme.mjs",
    "test:all": "pnpm run test && pnpm run test:types"
  },
  "peerDependencies": {
    "@nestjs/common": "^10 || ^11",
    "reflect-metadata": "^0.1.13 || ^0.2",
    "rxjs": "^7"
  },
  "devDependencies": {
    "@nestjs/common": "^11",
    "@nestjs/core": "^11",
    "@nestjs/testing": "^11",
    "@types/node": "^24",
    "reflect-metadata": "^0.2",
    "rxjs": "^7",
    "tsup": "^8",
    "typescript": "^5",
    "vitest": "^3"
  }
}
```

- **`dependencies` 필드 자체가 없다.** `peerDependenciesMeta`도 없다 — peer 3종은 전부 required이고 optional peer는 하나도 없다. 이 선택의 논증은 §2.4.1, 대가는 §7-13이다.
- **`devDependencies`에 `@gj-kit/nest-operations-jobs`·`@nestjs/schedule`·`expo-server-sdk`·`@prisma/client`를 넣지 않는다.** README 레시피가 그것들을 참조하지만 **import하지 않고 `declare`로 형태만 세우기** 때문에 필요가 없다(§5.6). devDependency로 넣는 순간 §0.4-③가 금지한 형제 결합이 devDependencies 계층으로 되살아나고 §2.2-C의 "expo-server-sdk 미탑재" 서사도 흐려진다. `release-artifact.test.ts`가 이 네 이름의 **부재**를 고정한다(§5.5).
- **peer 3종의 범위 자체는 형제 `toss-payments-nestjs`와 문자 그대로 동일하다** `[형제 — toss-payments-nestjs/package.json 실측]`. `@nestjs/core`는 필요하지 않다: 이 패키지는 `DiscoveryService`를 쓰지 않고 데코레이터 스캔도 하지 않는다(형제 `nest-operations-jobs`가 `@nestjs/core`를 추가한 유일한 이유가 그것이었다 `[형제 §2.2-3]`).
- **`rxjs`가 required인 이유**: `@nestjs/common`의 타입 선언이 여러 지점에서 `Observable`을 참조하므로, `skipLibCheck`를 끈 소비자에서 우리 `.d.ts`가 `@nestjs/common`을 import하는 순간 rxjs 타입이 해석돼야 한다 `[unverified — Nest 10·11 양쪽 d.ts로 실측 필요, §5.5 packed consumer가 닫는다]`. 형제가 같은 선택을 한 사실 자체는 실측 `[형제]`.
- **`typescript: "^5"`** — 서버 전용 패키지 관행(`toss-payments*` 3종 전부 `^5` `[형제]`).

#### 2.4.1 peer 정책 — 왜 required인가 (그리고 무엇을 대가로 내는가)

`toss-payments-nestjs`를 선례로 든 초안 문장을 **철회한다**. 그 패키지는 exports가 `.` 하나뿐인 Nest 전용이라 required peer의 대가가 애초에 0이다 `[형제 — package.json 실측]`. 이 패키지와 **구조적으로 동형인 형제는 `toss-payments-postgresql`**이고 — 프레임워크 free `.` + `./nestjs` 서브패스 — 그쪽은 `@nestjs/common`·`reflect-metadata`·`rxjs`를 전부 `peerDependenciesMeta.optional: true`로 표시한다 `[형제 — package.json 실측]`. 즉 우리는 형제의 **반대**를 고르고 있고, 그러므로 논증할 의무가 있다.

1. **패키지 이름이 `nest-`로 시작하고 `.`가 주 표면이다.** optional peer는 "Nest 없이도 쓸 수 있다"는 신호인데, `.` 엔트리는 Nest 없이 동작하지 않는다. `toss-payments-postgresql`이 optional을 고를 수 있는 이유는 **그 패키지의 `.`가 진짜로 Nest 없이 완결**되기 때문이다. 여기서 그 조건을 만족하는 것은 `.`가 아니라 `./core`다.
2. **`rxjs`는 타입 표면으로 새어 나온다.** `@nestjs/common`의 `.d.ts`가 여러 지점에서 `Observable`을 참조하므로, `skipLibCheck`를 끈 소비자에서 우리 `.d.ts`가 `@nestjs/common`을 import하는 순간 rxjs 타입이 해석돼야 한다 `[unverified — §5.5 packed consumer가 닫는다]`.
3. **AGENTS.md §2는 서브패스와 optional-meta를 양자택일로 만들지 않는다.** 그 절이 금지하는 것은 "root import에 optional peer를 넣은 뒤 `try/catch`·dynamic import·`peerDependenciesMeta`로 문제를 **숨기는 것**"이다. 형제가 병행 사례를 보여준다. 따라서 optional 안이 **불법이어서** 기각되는 것이 아니라, 1번 때문에 기각된다.
4. **완화 방향의 breaking 비대칭이 결정 시점을 앞당긴다.** required→optional은 완화라 0.2.0 minor로 낼 수 있지만 반대 방향은 breaking이다(AGENTS.md §2). 그래서 **0.1에 required로 굳히는 쪽이 되돌리기 쉽다.**

**대가는 설치 계층에 남는다.** `./core`만 쓰는 워커·람다 소비자도 `@nestjs/common`·`reflect-metadata`·`rxjs`를 설치한다(npm 7+ 자동 설치, pnpm은 unmet peer 경고). 모듈 그래프 계층에서는 §5.3 peer-graph 가드와 §5.5의 **no-nest packed consumer**가 `dist/core.js`의 Nest 무관성을 실제로 증명하지만, 설치 계층에는 증명할 것이 없다. §2.1의 "Nest 없는 워커·람다"는 **모듈 그래프에서는 참, `node_modules`에서는 거짓**이며 이 비대칭을 §7-13에 잔존 리스크로 올린다.

### 2.5 tsup / tsconfig 경계

```ts
// tsup.config.ts
export default defineConfig({
  entry: ['src/index.ts', 'src/core.ts', 'src/expo.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  platform: 'node',
  treeshake: true,
  // peer는 번들에 넣지 않는다 — 앱과 단일 인스턴스 공유(이중 로드 방지, 형제 동일).
  external: [/^@nestjs\//, 'reflect-metadata', 'rxjs'],
});
```

CJS 빌드는 청크 분리가 없어 `.`와 `./core`를 동시에 require하면 코어 코드가 두 벌 로드될 수 있다 `[unverified — 형제 nest-operations-jobs §2.5와 동일 미확인 사항]`. 따라서 **`instanceof`가 필요한 값(에러 클래스)은 `isNotificationsError()` 타입 가드를 정본으로** 두고, DI 토큰은 `Symbol.for`로 전역 레지스트리에 둔다(§0.2-⑬) — 두 조치가 이중 로드의 두 가지 실패 모드를 각각 막는다.

`tsconfig` 3분할은 형제 관행이다 `[형제 — format §2.2 · expo-media · expo-workouts · nest-operations-jobs]`. 다만 이 패키지는 `platform: 'node'`이므로 `tsconfig.src.json`이 `types: []`까지 잠그지는 않는다 — `node:crypto`를 정당하게 쓴다(§3.4). 코어 가드가 막는 것은 Node API가 아니라 **Nest/rxjs/Expo import와 파일 밖의 ambient 시계·난수**다(§5.3).

### 2.6 provenance / prepack 배선 (형제 패턴 복제)

- `scripts/stamp-provenance.mjs`·`check-provenance.mjs`는 `format/scripts/*`의 루트 위임 래퍼를 **그대로 복제**한다 `[형제 — 두 파일 전문 실측]`. 구현은 루트 `scripts/stamp-package-provenance.mjs` / `check-package-provenance.mjs`가 소유하고, 래퍼는 패키지 루트를 cwd로 공급한다.
- `build`가 `dist/gj-kit-provenance.json`을 스탬프하고, `prepack`이 `--require-clean`으로 dirty tree pack을 차단한다. AGENTS.md §3 — provenance 검증 우회 금지.
- `tests/unit/guards/release-artifact.test.ts`가 `files`·exports 5엔트리·peer 3종 정확 일치·`dependencies` 부재·`peerDependenciesMeta` 부재·`scripts.build`/`prepack` 배선·래퍼 존재를 고정한다. 추가로 **공개 DI 토큰 이름 집합의 정확 일치**(§3.8.2의 11종)와 **`devDependencies`에 `@gj-kit/nest-operations-jobs`·`@nestjs/schedule`·`expo-server-sdk`·`@prisma/client`가 없음**을 고정한다 — 토큰 이름은 exports·peer와 같은 등급의 공개 계약이고(AGENTS.md §2), 네 devDep은 편의상 들어오는 순간 §0.4-③와 §2.2를 조용히 무효화한다.

### 2.7 버전·changeset (03e4c50 선례)

`package.json`은 `version: "0.0.0"`으로 커밋하고 minor changeset을 동봉한다 — `changeset version`이 0.1.0을 만든다 (toss-payments-postgresql 도입 커밋 `03e4c50`과 동일 경로 `[형제 — git show 03e4c50 실측]`).

`.changeset/nest-notifications-v0-1.md`:

```md
---
"@gj-kit/nest-notifications": minor
---

신규 패키지 — memorylog2 apps/server의 알림 파이프라인(명령 계약·릴레이·디스패치·전송 포트·빠른 경로) 승격. 소스 도메인은 자기 트랜잭션에서 명령 하나를 stage하고, 조용시간·배치·선호도·재시도·푸시 fan-out은 파이프라인이 소유한다.

- 배달 계약을 먼저 명시한다: (applicationKey, recipientRef, eventKey)를 멱등 키로 하는 at-least-once, inbox 메시지는 배달당 정확히 하나, 순서 보장 없음. 실패 행렬 12종(완료 쓰기 실패·청크 부분 성공·ticket 무효 endpoint·배치 정체성 경쟁·영구 실패 행의 굶김 등)이 문서·테스트로 고정된다.
- ./core: 프레임워크·전송·저장소·언어를 모르는 파이프라인. @nestjs/*·rxjs·expo·SQL·비영어 문자열을 import도 포함도 하지 않는다(가드 테스트가 강제).
- 시간대 파라미터화: KST 하드코딩 제거. createQuietHoursPolicy({ timeZone: 'Asia/Seoul', quietHours: { startHour: 22, endHour: 8 }, batchWindowMs: 600_000 })처럼 호스트가 자기 지역을 말한다. IANA 벽시계 산술이라 DST 전환·비정시 offset(+05:45)에서도 정확하고, 갭/중복 시각 해석 규칙이 계약에 적혀 있다.
- 저장소 포트 3종 + 호스트 포트 2종 + 의무 29종(R1–R13 · D1–D9 · I1–I3 · L1–L4). 라이브러리는 테이블도 마이그레이션도 소유하지 않고, ./testing의 적합성 케이스 배열이 호스트 구현을 — ingress staging과 계정 삭제 순서까지 포함해 — 그대로 검사한다. 인메모리 구현 동봉.
- 배달 삽입은 예외를 요구하지 않는다: createDelivery가 { id, created }를 돌려주고, created:false면 릴레이가 병합/follow-up으로 되돌아간다. claim 신선도는 저장소 시계 하나에서만 판정된다(요청은 순간이 아니라 claimStaleMs 기간을 나른다). endpoint 비활성화는 listEnabled가 관측한 등록 리비전과 일치할 때만 쓴다 — 전송 중 재등록한 기기를 끄지 않는다.
- ./expo: expo-server-sdk 비의존. 청킹·토큰 형태 검사·ticket 분류(undersized 응답 가드 포함)는 순수 함수로 라이브러리가 소유하고, HTTP 전송만 호스트가 콜백으로 공급한다. SDK의 sendPushNotificationsAsync가 구조적으로 그대로 대입된다.
- 배치 카피는 NotificationPresenter 필수 포트다 — 라이브러리는 어떤 언어의 문장도 만들지 않는다.
- 빠른 경로(request(): void)는 명시적 best-effort다. 예약·배치 배달의 정확성 소유자는 주기 실행자이며, README가 @gj-kit/nest-operations-jobs 어댑터 12줄을 싣되 두 패키지 사이에 의존은 없다.
- 런타임 의존성 0. @nestjs/common·reflect-metadata·rxjs는 required peer.
```

---

## 3. 공개 API 전체 시그니처

`src/core.ts` · `src/index.ts` · `src/expo.ts` · `src/testing.ts`가 재수출하는 전부다. 여기 없는 심볼은 internal이며 exports 맵이 deep import를 차단한다. **모든 옵셔널 필드는 `?: T | undefined`, 모든 입력 객체는 `readonly`**(§1-8). JSDoc은 영어(공개 계약), 설계 해설은 한국어 주석.

### 3.1 배달 의미론 — 이 패키지의 1차 계약

**시그니처보다 먼저 읽어야 하는 절이다.** 소스에는 이 문장이 어디에도 없었고(코드가 그렇게 동작할 뿐이었고), 그래서 소비자가 중복 알림을 버그로 신고할 수밖에 없었다.

#### 3.1.1 한 문장 요약

> **`(applicationKey, recipientRef, eventKey)`를 멱등 키로 하는 at-least-once 파이프라인이다. inbox 메시지는 배달당 정확히 하나(exactly-once), 푸시 핸드오프는 최소 한 번(at-least-once, 중복 가능), 순서는 보장하지 않는다.**

#### 3.1.2 단계별 보장

| 단계 | 보장 | 근거가 되는 유니크 제약 | 어긋나면 생기는 일 |
|---|---|---|---|
| **G1 ingress** | 같은 멱등 키로 몇 번을 stage해도 outbox 행은 **하나** | `(applicationKey, recipientRef, eventKey)` | 소스 도메인 재시도가 알림을 복제한다 |
| **G2 relay** | outbox 행 하나는 delivery item **정확히 하나**를 만든다 (재생·stale 회수와 무관) | `(applicationKey, sourceOutboxId)` on item | 배치 카운트가 부풀고, 같은 이벤트가 두 배달로 나간다 |
| **G3 batch** | 하나의 `(수신자, batchKey, 창, policyKey)`는 배달 **하나** | `(applicationKey, recipientRef, batchKey, batchWindowStartedAt, batchPolicyKey)` | 같은 창의 항목들이 여러 배달로 흩어진다 |
| **G4 inbox** | 배달 하나는 inbox 메시지 **정확히 하나** | `(applicationKey, deliveryId)` on message | 재시도마다 inbox에 중복 카드가 쌓인다 |
| **G5 push** | 배달 하나는 **최소 한 번** 전송 시도. 성공 후 완료 기록에 실패하면 **다시 전송된다** | 없음 (전송은 트랜잭션 밖) | — 이것이 계약이다. 중복 푸시는 버그가 아니라 명시된 비용이다 |
| **G6 presentation** | dispatch가 claim한 순간 **표시 내용이 불변**이 된다. 그 뒤 도착한 배치 항목은 follow-up 배달로 간다 | claim과 `presentationLockedAt`을 **한 문장에** 쓰는 원자성(D1) | 사용자가 본 문장과 저장된 문장이 달라지거나, 늦은 항목이 조용히 사라진다 |
| **G7 lifecycle** | 수신자 tombstone 이후에는 어떤 배달·메시지도 **새로 생기지 않는다** | **I2**(publisher의 `ensureLive` 게이트) + **L1–L3**(삭제 트랜잭션의 단일성과 순서) + **R7**(릴레이 트랜잭션의 소스 행 잠금) — 셋 다 §3.3.6·§3.3.2의 번호 붙은 의무이고, §5.4가 전부 케이스로 검사한다 | 삭제된 계정에 알림이 도착한다(개인정보 사고) |
| **G8 ordering** | **없음.** 두 이벤트의 배달 순서는 어떤 것도 보장하지 않는다 | — | (보장하지 않으므로 어긋날 수 없다) |

**G7의 근거를 정정한 이력.** 초안은 근거를 "liveness 게이트 + R7"로만 적었는데, R7은 **릴레이 쪽**의 의무일 뿐이고 삭제 쪽에는 아무 의무도 없었다. 릴레이는 자기 liveness 검사를 하지 않는다 — `readCommand()`가 `null`을 돌려주는 것이 전부이고, 그것이 성립하려면 **호스트의 purge가 outbox 행을 지웠고, 지운 트랜잭션이 릴레이가 방금 커밋한 행까지 마저 지운다**는 보장이 있어야 한다. 소스에서 그것을 만드는 것은 한 트랜잭션 안의 고정된 순서다 — tombstone → ingress `deleteMany`(릴레이의 행 잠금에서 블록된다) → delivery → message → endpoint → preference `[소스 adapters/prisma-notification-account-lifecycle.ts:19-54 — 실측. 주석이 "Delete ingress first. Relay revalidates/locks this parent before it can materialize a delivery, so this ordering closes a concurrent worker race"라고 그 이유를 적고 있다]`. 이 순서가 README 권장 사항으로만 남으면, 배달을 outbox보다 먼저 지우거나 tombstone을 별도 트랜잭션에서 찍는 호스트가 **모든 저장소 의무를 만족하면서** 삭제된 계정에 푸시를 보낸다. 그래서 L1–L4로 승격했다(§3.3.6).

**G8을 명시적으로 선언하는 이유.** 조용시간 홀드(NORMAL만), 배치 창(창 끝까지 대기), `SCHEDULED` 타이밍, 병렬 워커, 항목별 재시도 — 다섯 가지가 전부 순서를 바꾼다. 예: 22:05에 stage된 NORMAL은 다음 날 08:00에, 22:06에 stage된 ESSENTIAL은 즉시 나간다. 순서에 의미를 부여해야 하는 도메인은 **본문에 순번을 넣어야 하고**, 파이프라인은 그것을 대신해 주지 않는다. README와 `NotificationCommand`의 JSDoc이 같은 문장을 싣는다.

#### 3.1.3 실패 행렬 — 각 지점이 죽었을 때 무엇이 남고 무엇이 재개되는가

미션이 명시적으로 요구한 표다. "다음 패스"는 stale 회수 임계(`DEFAULT_CLAIM_STALE_MS`, 5분) 이후 아무 워커가 같은 행을 다시 집는 것을 뜻한다.

| # | 실패 지점 | 커밋된 상태 | 다음 패스의 동작 | 사용자에게 보이는 결과 |
|---|---|---|---|---|
| **F1** | relay claim OK → relay 트랜잭션 OK → **완료 기록 실패**(프로세스 사망·네트워크) | delivery + item 존재. outbox 행은 claim된 채 `relayedAt` NULL | stale 회수 → relay 트랜잭션이 `(applicationKey, sourceOutboxId)`로 기존 item을 발견 → `already-relayed` → 완료 기록만 다시 시도 | **없음.** 중복 배달 0 (G2) |
| **F2** | relay claim OK → **relay 트랜잭션 중 실패** | 트랜잭션 롤백 = 아무것도 없음 | 즉시 claim 해제 → 다음 패스에서 재시도 | 한 주기만큼 지연 |
| **F3** | dispatch claim OK → inbox 메시지 생성 OK → **푸시 전송 실패** | 메시지 존재, `deliveredAt` NULL, presentation 잠김 | 재claim → 메시지 삽입은 conflict-safe no-op(G4) → 푸시 재시도 | inbox는 이미 보인다. 푸시는 늦게 오거나(성공) **provider가 실제로는 받았는데 응답만 유실됐다면 중복** |
| **F4** | 푸시가 **청크 경계에서 부분 성공**(청크1 접수, 청크2 throw) | 일부 기기는 이미 받음. 배달은 미완료 | 배달 전체 재시도 → 청크1 기기가 **또 받는다** | **중복 푸시.** at-least-once의 가장 구체적인 비용(§0.3-③). 완화는 §6-6의 endpoint 단위 재개 |
| **F5** | ticket이 **무효 endpoint**(DeviceNotRegistered) | 관측한 리비전이 그대로면 해당 endpoint 비활성화, 그 사이 **재등록됐으면 no-op**(D6). 나머지는 정상 접수 | 없음 — 핸드오프는 `accepted: true` | 정말 죽은 토큰이면 그 기기만 이후 수신 중단. **전송 중에 앱을 다시 열어 재등록한 기기는 계속 받는다** — 무조건 비활성화였다면 그 기기가 무기한 어두워졌다(§0.3-⑨) |
| **F6** | ticket이 무효 endpoint **이외의** 에러 | `accepted: false` → 배달 미완료 | 전량 재시도 | ticket이 정상이던 기기에 **중복 푸시** |
| **F7** | ticket 응답이 **요청보다 짧다**(undersized) | 어느 것이 성공했는지 알 수 없음 | `accepted: false` → 전량 재시도 | 중복 가능. **의도적으로 보수적** — 알림 유실이 중복보다 나쁘다는 판단(소스 주석이 같은 결론 `[소스]`) |
| **F8** | 푸시 성공 → **완료 기록 직전 사망** | 메시지 존재, 푸시 전송됨, `deliveredAt` NULL | stale 회수 → 재전송 | **중복 푸시.** F3와 구분되는 점: provider는 확실히 받았다 |
| **F9** | relay 진행 중 **수신자 계정 삭제** | tombstone + 삭제가 커밋 | relay의 잠금 후 재확인이 `no-longer-live` 반환 → 아무것도 만들지 않음 | 삭제 후 알림 0 (G7) |
| **F10** | 배치가 이미 claim된 뒤 **늦은 항목 도착** | 병합 조건부 UPDATE 실패, 또는 `createDelivery`가 `created: false`(경쟁하는 워커가 방금 만들었다) | 둘 다 같은 곳으로 간다 — follow-up 라우트(`sourceOutboxId`로 고유)로 별도 배달 생성. **`created: false`를 그냥 기존 id로 이어 쓰면 잠긴 배달에 항목이 붙어 조용히 유실된다**(§0.3-⑦ · R11) | 사용자가 알림을 **하나 더** 받는다 — 잃는 것보다 낫다는 판단(소스와 동일 `[소스]`) |
| **F11** | 같은 배치 정체성의 **서로 다른 outbox 행 2개**를 두 워커가 동시에 처리 | 한쪽만 배달 생성 성공 | 진 쪽은 `created: false` → `findOpenBatch` 재조회 → 열려 있으면 병합, 잠겼으면 follow-up | 배달 1개(둘 다 보임) 또는 배달 2개. **항목이 안 보이는 배달에 묶이는 경우는 없다** — R7의 행 잠금은 같은 outbox 행만 직렬화하므로 이 경쟁은 R11이 닫는다 |
| **F12** | 배달이 **영구 실패**(presenter throw · 미지원 priority · `ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE`) | claim 해제, `attempts` 증가 | `maxAttempts`를 준 호스트는 그 행이 due에서 빠진다. **안 주면 매 패스 다시 claim된다** | `maxAttempts` 미설정 + poison 행이 `pageSize`만큼 쌓이면 **건강한 알림이 페이지에 못 들어온다**(starvation). 라이브러리는 백오프를 소유하지 않되(§0.4-⑦) 굶기지 않을 수단은 준다(R13 · §7-16) |

**F1–F12를 한 장으로 읽는 법.** F1·F2·F9는 **잃지도 겹치지도 않는다**. F3·F4·F6·F7·F8은 **겹친다**(중복 푸시). F10·F11은 **하나 더 온다**(추가 배달). F12만 유일하게 **지연·굶김** 쪽이고, 그래서 유일하게 호스트가 옵션을 켜야 닫힌다.

**F3/F4/F6/F8이 전부 "중복 푸시"로 수렴한다.** 라이브러리가 0.1에서 할 수 있는 완화는 두 가지뿐이고 둘 다 한다: (1) `payload.idempotencyKey = deliveryId`를 전송 포트에 넘겨 provider의 dedupe/collapse를 쓸 수 있게 한다(§0.2-⑨), (2) inbox는 절대 중복되지 않으므로(G4) **사용자가 두 번 보는 것은 배너뿐이고 앱을 열면 하나다**. 이 두 문장이 README 최상단 경고에 그대로 들어간다.

#### 3.1.4 저장소 vs 릴레이/디스패처 — 누가 무엇을 보증하는가

| 보증 | 소유자 | 이유 |
|---|---|---|
| claim 원자성(경쟁에서 이긴 워커 하나만 행을 받는다) | **저장소** | 조건부 UPDATE의 영향 행 수는 DB만 안다. 라이브러리가 흉내 내면(조회 후 갱신) 두 워커가 같은 행을 집는다 |
| stale claim 회수 가능성 | **저장소** | 같은 조건부 UPDATE의 `OR claimedAt < now() - claimStaleMs` 분기. **컷오프를 만드는 시계도 저장소 것이다**(R12) |
| 멱등 완료(이미 마감된 행에 두 번째 완료 쓰기 금지) | **저장소** | `WHERE claimToken = $token AND relayedAt IS NULL` |
| 멱등 삽입(item·message·outbox) | **저장소** | conflict-safe SQL. 트랜잭션을 abort시키는 예외 캐치는 금지(P2002 교훈) |
| 배치 병합의 조건부 실행 | **저장소** | `deliveredAt IS NULL AND dispatchClaimToken IS NULL AND presentationLockedAt IS NULL` 조건이 UPDATE에 들어가야 한다 |
| **순서** | **아무도 보증하지 않는다** | G8 |
| 멱등 삽입(**배달** — `createDelivery`) | **저장소 + 릴레이 공동** | 저장소는 충돌 시 던지지 않고 `created: false`와 기존 행 id를 준다(R11). 그 값을 병합/follow-up으로 되돌리는 것은 릴레이다. 이 표에서 유일하게 소유자가 둘인 줄이며, §0.3-⑦이 그 이유다 |
| ingress 멱등(`(applicationKey, recipientRef, eventKey)`) | **호스트 publisher** | 라이브러리에는 staging 메서드가 없다 — outbox 삽입은 소스 도메인의 트랜잭션 안에서 일어나고 그 트랜잭션은 호스트 것이다. 그래서 이 보증은 저장소 의무가 아니라 **ingress 의무 I1**이고, 적합성 케이스는 호스트의 publisher 어댑터를 통해 실행된다(§3.9 `NotificationStoreSuite.stage`) |
| 수신자 tombstone 이후 배달 0 (G7) | **호스트 lifecycle** | 삭제 순서를 아는 것은 테이블을 아는 쪽뿐이다. 의무 L1–L4(§3.3.6) |
| **claim 신선도 판정** (`claimedAt` 기록 + stale 비교) | **저장소** | 워커가 N개면 프로세스 시계도 N개다. 이 비교식만은 모두가 공유하는 시계 하나 위에 있어야 한다(R12). 요청은 순간이 아니라 기간(`claimStaleMs`)을 나른다 |
| ingress `createdAt` (배치 버킷의 입력) | **호스트 staging 경로** | 라이브러리가 쓰지 않는 유일한 시각이다(R13 · §7-14) |
| 시도 횟수 누적과 due 필터 | **저장소** | `attempts` 증가는 claim UPDATE의 일부이고, 소진 행 제외는 due 조건의 일부다(R13). **백오프 정책은 아무도 소유하지 않는다**(§0.4-⑦) |
| claim 토큰 생성·페이지 크기·stale 임계 | **릴레이/디스패처** | 정책이지 영속화가 아니다. 단 stale 임계는 **기간으로만** 넘어간다(R12) |
| 배치 정책 키·follow-up 키·창 경계·조용시간 해석 | **릴레이(정책 포트 경유)** | 순수 함수. 저장소는 이 규칙을 몰라야 한다 |
| claim 하나당 완료 호출 정확히 1회 | **릴레이/디스패처** | 저장소는 이것을 신뢰하지 않아도 된다(멱등 완료가 방어한다) |
| 에러 텍스트 축약·비밀 제거 | **릴레이/디스패처** | 저장소에 원문 예외 메시지를 넘기지 않는다 |
| 푸시 청크 회계·무효 endpoint 판정 | **디스패처 + 게이트웨이** | 저장소는 endpoint 비활성화 명령만 받는다 |

### 3.2 `./core` — 시간대·조용시간·배치 창 (`src/core/zone.ts` · `policy.ts`)

미션이 요구한 두 번째 논증 지점이다. **라이브러리는 한국을 모른 채 "Asia/Seoul의 22–08, 10분 창"을 정확히 표현해야 한다.**

#### 3.2.1 입력 형태

```ts
/** Half-open local-clock window `[startHour, endHour)`. `start > end` wraps midnight. */
export interface NotificationQuietHours {
  /** 0-23, inclusive. */
  readonly startHour: number;
  /** 0-23, exclusive. */
  readonly endHour: number;
}

export interface QuietHoursPolicyOptions {
  /**
   * IANA time zone name (for example `'Asia/Seoul'`), or `'UTC'`.
   * The library holds no regional default: this field is required.
   */
  readonly timeZone: string;
  /** `null` disables quiet hours entirely. */
  readonly quietHours?: NotificationQuietHours | null | undefined;
  /** Aggregation window length. Must divide 24h evenly. Defaults to `DEFAULT_BATCH_WINDOW_MS`. */
  readonly batchWindowMs?: number | undefined;
  /** Priorities held during quiet hours. Defaults to `['NORMAL']`. */
  readonly holdPriorities?: readonly NotificationPriority[] | undefined;
}

export const DEFAULT_BATCH_WINDOW_MS = 600_000;

export function createQuietHoursPolicy(
  options: QuietHoursPolicyOptions,
): NotificationSchedulingPolicy;
```

memorylog2의 정책은 이 한 줄이 된다 — 라이브러리 어디에도 한국이 없다:

```ts
createQuietHoursPolicy({
  timeZone: 'Asia/Seoul',
  quietHours: { startHour: 22, endHour: 8 },
  batchWindowMs: 600_000,
});
```

#### 3.2.2 정책 포트

```ts
export interface ResolveDeliveryInput {
  readonly priority: NotificationPriority;
  readonly timing: NotificationTiming | undefined;
  readonly now: Date;
  /** Present so a host implementation can vary policy per recipient or category. */
  readonly recipientRef: string;
  readonly category: string;
}

/**
 * Pure scheduling decisions. Implement this interface to vary policy per
 * recipient (their own zone) or per category; `createQuietHoursPolicy` is the
 * built-in single-zone implementation.
 */
export interface NotificationSchedulingPolicy {
  /** True when `at` falls inside the configured quiet window. */
  isQuietHours(at: Date): boolean;
  /** Earliest instant this command may be delivered. Never earlier than `now`. */
  resolveDeliveryAt(input: ResolveDeliveryInput): Date;
  /** Aggregation bucket that contains `at`. */
  batchWindow(at: Date): NotificationBatchWindow;
}
```

`resolveDeliveryAt`이 `recipientRef`·`category`를 이미 받는 것이 §0.2-③의 실체다 — 수신자별 시간대는 새 필드가 아니라 **다른 구현체**로 들어온다.

#### 3.2.3 벽시계 산술 — 왜 고정 offset이 안 되는가, 그리고 무엇을 계약으로 적는가

소스는 `new Date(at.getTime() + KST_OFFSET_MS).getUTCHours()`로 시각을 읽는다. 이것이 성립하는 조건은 **(a) 그 지역에 DST가 없고, (b) offset이 창 길이의 배수**일 때뿐이다. 한국은 둘 다 만족하지만 라이브러리는 그것을 전제할 수 없다.

`src/core/zone.ts`가 제공하는 것은 두 방향의 변환뿐이다(공개 표면 아님 — 정책이 쓰는 내부 모듈):

- `wallClockIn(epochMs, timeZone)` → `{ year, month, day, hour, minute, second }`. `Intl.DateTimeFormat(…, { timeZone, hour12: false, … }).formatToParts()`로 구한다. 형제 `format/src/zone.ts`의 검증 기법(자기 시험 + offset 타당성 범위 `-720…840`분 + zone별 bounded cache)을 **재구현**한다 — 재사용하지 않는 이유는 §0.4-⑤.
- `instantOfWallClock(fields, timeZone)` → `{ epochMs, kind: 'exact' | 'gap' | 'ambiguous' }`. 2회 고정점 반복 후 재검산한다.

**계약으로 적는 해석 규칙 3종** (JSDoc + README + 테스트 3곳에 같은 문장):

| 상황 | 규칙 | 이유 |
|---|---|---|
| 조용시간 종료 시각이 **존재하지 않는다**(봄 DST 갭에 08:00이 삼켜짐) | 갭 **직후 첫 존재하는 순간**으로 릴리스 | 홀드를 하루 미루는 것보다 몇 분 이른 릴리스가 낫다 |
| 종료 시각이 **두 번 존재한다**(가을 DST 중복) | **이른 쪽** | 조용시간의 목적은 "밤에 안 울리기"이고, 아침이 오면 끝이다 |
| 계산된 릴리스 시각이 `now`보다 이르거나 같다 | 하루 전진 후 재계산. 48시간 안에 유효 해를 못 찾으면 `now`(즉시 배달) | 무한 홀드는 알림 유실과 같다. 실패 방향을 "조금 시끄러움"으로 고정한다 |

#### 3.2.4 배치 창 — 로컬 자정 기준

```ts
batchWindow(at) {
  // 로컬 자정부터의 경과 시간으로 버킷을 만든다. 창 경계는 절대 하루를 넘지 않는다.
  const dayStart = instantOfLocalMidnight(at, timeZone);
  const index = Math.floor((at - dayStart) / batchWindowMs);
  const startedAt = dayStart + index * batchWindowMs;
  const endsAt = Math.min(startedAt + batchWindowMs, nextLocalMidnight(at, timeZone));
  return { startedAt, endsAt };
}
```

- `batchWindowMs`가 24시간을 나누어떨어져야 하는 이유가 여기 있다 — 그렇지 않으면 마지막 버킷이 매일 다른 길이가 되어 `batchWindowStartedAt`이 유니크 키로서 의미를 잃는다. 조립 시점에 검증하고 위반이면 `ERR_NOTIFICATION_POLICY_INVALID`.
- **DST로 23시간이 된 날**의 마지막 버킷만 짧아진다. 경계가 뒤로 가는 일은 없으므로 `batchWindowStartedAt`의 단조성이 유지된다.
- KST·10분에서는 소스와 **비트 동일한 결과**를 낸다. 이관 호환성 테스트로 고정한다(§5.1).

#### 3.2.5 배치 라우트 키 (소스 그대로)

```ts
export function notificationBatchPolicyKey(
  category: string,
  priority: NotificationPriority,
  timing: NotificationTiming,
): string;

export function notificationFollowUpBatchPolicyKey(
  batchPolicyKey: string,
  sourceOutboxId: string,
): string;
```

JSON 인코딩을 유지한다 — 구분자 join을 쓰면 불투명한 카테고리 이름이 정책 구분자와 충돌할 수 있다는 소스의 근거가 그대로 유효하다 `[소스]`.

### 3.3 `./core` — 저장소·호스트 포트와 동시성 계약 (`src/core/store.ts` · `lifecycle.ts`)

**§3.1과 함께 이 패키지의 핵심이다.** 라이브러리는 테이블·ORM·마이그레이션을 소유하지 않는다(§0.4-①). 대신 저장소가 무엇을 원자적으로 해야 하는지를 문장으로 못 박고, `./testing`의 적합성 케이스가 그 문장을 실행 가능한 검사로 바꾼다.

**포트는 두 종류다.** §3.3.1–§3.3.3의 저장소 포트 3종은 **파이프라인이 직접 호출**한다. §3.3.6의 호스트 포트 2종(`NotificationPublisher`는 §3.4.1)은 파이프라인이 호출하지 않지만, G1과 G7이 그 위에 서 있으므로 같은 강도의 번호 붙은 의무를 진다. 초안은 두 번째 종류를 §0.1에서만 언급하고 시그니처도 의무도 싣지 않았고, 그 결과 이 패키지의 첫 보증(G1)과 유일한 "개인정보 사고" 등급 보증(G7)의 근거가 문서 어디에도 없었다.

#### 3.3.1 릴레이 측 (`NotificationRelayStore`)

```ts
export interface ClaimedNotificationCommand {
  readonly id: string;
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef: string | null;
  readonly targetRef: string | null;
  readonly category: string;
  readonly priority: string;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly eventKey: string;
  readonly batchKey: string | null;
  readonly batchLabel: string | null;
  readonly batchItemCount: number;
  readonly timing: NotificationTiming;
  /**
   * When this row entered the ingress outbox. The library never writes it: it
   * has no staging method (staging belongs to the host's `NotificationPublisher`),
   * so this timestamp comes from the host's staging path (R13). It is also the
   * input to the batch bucket, which is why R13 makes it an obligation rather
   * than a field description.
   */
  readonly createdAt: Date;
  /** How many times a worker has claimed this row, including this claim (R13). */
  readonly attempts: number;
}

export interface RelayClaimRequest {
  readonly applicationKey: string;
  readonly limit: number;
  /**
   * From the injected clock. Recorded verbatim on completion stamps and passed
   * to the policy (R9). It is NOT the input to the staleness comparison — see
   * `claimStaleMs`.
   */
  readonly at: Date;
  /**
   * A duration, deliberately not an instant. The store decides staleness on its
   * own clock (`claimedAt < now() - claimStaleMs`, R12): with N workers there
   * are N process clocks, and the only clock they share is the store's.
   */
  readonly claimStaleMs: number;
  /**
   * Skip rows already attempted this many times. Absent means no bound, which
   * lets a permanently failing row occupy the due page forever (R13, design 7-16).
   */
  readonly maxAttempts?: number | undefined;
  /** Opaque token this worker writes onto every row it wins. */
  readonly claimToken: string;
}

export interface RelayCompleteRequest {
  readonly applicationKey: string;
  readonly outboxId: string;
  readonly claimToken: string;
  readonly at: Date;
  readonly suppressed: boolean;
}

export interface RelayReleaseRequest {
  readonly applicationKey: string;
  readonly outboxId: string;
  readonly claimToken: string;
  /** Already redacted by the relay: a stable short code, never an exception message. */
  readonly errorCode: string | null;
}

export interface RelayTransactionRequest {
  readonly applicationKey: string;
  readonly outboxId: string;
  readonly claimToken: string;
  readonly at: Date;
}

/**
 * Ingress outbox persistence. The library owns no schema; a host maps these
 * four operations onto its own table. The obligations R1-R13 documented in
 * this file are part of the contract, and `notificationStoreContractCases()`
 * from the `./testing` subpath checks them.
 *
 * Note what is NOT here: staging. Rows enter this table through the host's
 * `NotificationPublisher`, inside the host's own source transaction, so ingress
 * idempotency is obligation I1 rather than a method on this port.
 */
export interface NotificationRelayStore {
  /** Atomically claim up to `limit` due rows. Only rows this call actually won are returned. */
  claimDue(request: RelayClaimRequest): Promise<readonly ClaimedNotificationCommand[]>;
  /**
   * Run `work` in one transaction that holds the outbox row lock. Resolves to
   * `null` without running `work` when this worker no longer owns the claim.
   */
  relayInTransaction<T>(
    request: RelayTransactionRequest,
    work: (tx: NotificationRelayTransaction) => Promise<T>,
  ): Promise<T | null>;
  /** `false` means the claim was lost; the stored outcome is unchanged. */
  completeClaim(request: RelayCompleteRequest): Promise<boolean>;
  /** Release a failed claim so the next pass can retry it. Never throws for a lost claim. */
  releaseClaim(request: RelayReleaseRequest): Promise<void>;
}

export interface OpenBatchDelivery {
  readonly id: string;
  readonly open: boolean;
}

/**
 * `created: false` means a delivery with this batch identity already existed
 * and `id` is that row. It is NOT an error and MUST NOT throw (R11): the caller
 * falls back to `mergeIntoBatch`, and to the follow-up route when that fails.
 * Appending an item to a delivery you did not create can bind it to a
 * presentation-locked row, which loses the notification silently (design 0.3-7).
 */
export interface CreateDeliveryResult {
  readonly id: string;
  readonly created: boolean;
}

export interface NotificationRelayTransaction {
  /** Re-read the locked source row. `null` means it is gone (recipient purge). */
  readCommand(): Promise<ClaimedNotificationCommand | null>;
  /** Category preference gate. Absent rows mean enabled. */
  isCategoryEnabled(input: { readonly recipientRef: string; readonly category: string }): Promise<boolean>;
  /** Idempotency probe for this source row. */
  findDeliveryBySource(): Promise<{ readonly deliveryId: string } | null>;
  findOpenBatch(key: BatchIdentity): Promise<OpenBatchDelivery | null>;
  /** Conditional merge. `false` means the batch closed between read and write. */
  mergeIntoBatch(input: MergeBatchInput): Promise<boolean>;
  /** Conflict-safe. Never throws on the batch-identity unique constraint (R11). */
  createDelivery(input: CreateDeliveryInput): Promise<CreateDeliveryResult>;
  /** `false` means an item for this source row already existed. */
  appendItem(input: AppendItemInput): Promise<boolean>;
}
```

#### 3.3.2 릴레이 저장소가 지는 의무 R1–R13

| # | 의무 | 정확한 뜻 | 준수 구현의 형태 |
|---|---|---|---|
| **R1** | **원자적 claim** | `claimDue`는 각 행에 대해 조건부 UPDATE를 수행하고, **영향 행 수가 1인 행만** 반환한다. 조회 결과를 그대로 돌려주면 두 워커가 같은 행을 처리한다 | R12의 UPDATE 한 문장이 claim·회수·시도 증가를 동시에 한다 — 소스도 한 문장이다 `[소스 relay:70-89]` |
| **R2** | **stale 회수** | 임계보다 오래된 claim은 다른 워커가 가져갈 수 있다. 회수도 R1과 같은 한 문장이어야 한다 | 같은 UPDATE의 `OR claimedAt < now() - claimStaleMs` 분기(컷오프를 만드는 시계는 저장소 것이다 — R12) |
| **R3** | **ingress 멱등** — 소유자는 `NotificationRelayStore`가 **아니다** | `(applicationKey, recipientRef, eventKey)`가 유니크이고, 중복 stage는 **예외가 아니라 무시**로 처리된다. 트랜잭션을 abort시키는 유니크 위반 캐치는 금지. **이 표에서 유일하게 `NotificationRelayStore`에 메서드가 없는 의무다** — staging은 호스트의 `NotificationPublisher<Tx>`가 호스트 트랜잭션 안에서 하기 때문이다(§3.4.1). 그래서 정본은 **I1**(§3.3.6)이고, 이 행은 상호 참조로만 남긴다 | `INSERT … ON CONFLICT DO NOTHING` 후 `SELECT`. Prisma에서는 `createMany({ skipDuplicates: true })` (소스의 P2002 주석이 이 규칙의 유래 `[소스 publisher:60-63]`). 적합성 케이스는 `NotificationStoreSuite.stage`를 통해 **호스트의 publisher 어댑터에** 닿는다(§3.9) — 초안처럼 저장소 의무로만 두면 G1의 유일한 근거가 어떤 포트에도 없어 호스트 구현을 검사할 수 없었다 |
| **R4** | **소스 항목 멱등** | `(applicationKey, sourceOutboxId)`가 유니크. `appendItem`은 충돌 시 **던지지 않고** `false` | 동일 기법 |
| **R5** | **배치 유일성** | `(applicationKey, recipientRef, batchKey, batchWindowStartedAt, batchPolicyKey)`가 유니크 | 복합 유니크 인덱스 |
| **R6** | **조건부 병합** | `mergeIntoBatch`는 `deliveredAt IS NULL AND dispatchClaimToken IS NULL AND presentationLockedAt IS NULL`을 **UPDATE 조건에 포함**하고 영향 행 수를 반환한다. 읽고 나서 쓰면 claim 경쟁에 진다 | 조건부 `UPDATE … SET batchCount=batchCount+1, batchItemCount=batchItemCount+$n WHERE …` |
| **R7** | **트랜잭션이 소스 행 잠금을 잡는다** | `relayInTransaction`은 `work` 실행 **전에** 그 outbox 행의 잠금을 획득해야 한다. 그래야 계정 삭제가 이 지점 앞이나 뒤 중 하나로 직렬화된다(G7·F9) | 트랜잭션 안에서 claim 소유권 재확인 UPDATE 한 번(소스가 쓰는 기법 `[소스 relay:140-152]`) 또는 `SELECT … FOR UPDATE` |
| **R8** | **멱등 완료** | `completeClaim`은 `claimToken` 일치 + `relayedAt IS NULL`일 때만 쓰고 `true`. 아니면 **아무것도 쓰지 않고** `false` | `UPDATE … WHERE id=$id AND claimToken=$t AND relayedAt IS NULL` |
| **R9** | **기록 시각 원문 보존** | `at`은 주입된 시계에서 온 값이고, 저장소는 `relayedAt`·`suppressedAt`에 **그대로** 쓴다. 자기 `now()`로 대체하면 완료 시각이 파이프라인의 다른 시간 결정과 다른 축에 놓인다. **`createdAt`은 이 의무의 대상이 아니다**(R13) — 라이브러리는 그 값을 쓰지 않는다. **claim 신선도 축도 대상이 아니다**(R12) | 파라미터 바인딩 |
| **R10** | **순서는 의무가 아니다** | `claimDue`는 `createdAt ASC` 정렬을 **권장**하지만 계약은 아니다. 라이브러리는 어떤 순서에도 정확하게 동작한다 | 인덱스가 있으면 정렬, 없으면 안 해도 된다 |
| **R11** | **배달 생성의 충돌 계약** | `createDelivery`는 `(applicationKey, recipientRef, batchKey, batchWindowStartedAt, batchPolicyKey)` 충돌에서 **던지지 않고** `{ id: 기존행, created: false }`를 반환한다. 새로 만들었으면 `created: true`. `batchCount`·`batchItemCount`를 충돌 시 **건드리지 않는다** — 병합은 R6의 조건부 UPDATE가 하는 일이고, `createDelivery`는 그 판정을 대신하지 않는다 | `INSERT … ON CONFLICT DO NOTHING RETURNING id`로 만들어졌는지 보고, 비었으면 `SELECT`로 기존 행 id. Prisma라면 `createMany({ skipDuplicates: true })` + `findUnique`(P2002 캐치 금지 — R3와 같은 이유). **소스는 여기서만 `create`로 던지고 트랜잭션을 3회 재시도했다** `[소스 relay:259-275 — 실측]`; 그 재시도 루프(`conflictRetries`)는 이 의무로 대체돼 옵션에서 사라졌다(§0.2-⑯) |
| **R12** | **claim 신선도는 저장소 시계 하나로 판정한다** | 요청은 컷오프 **순간**이 아니라 **기간**(`claimStaleMs`)을 나른다. 저장소는 `claimedAt`을 자기 `now()`로 쓰고, 회수 조건도 자기 `now() - claimStaleMs`로 만든다. 호출자가 준 `at`은 이 비교에 **절대 들어가지 않는다** | `UPDATE … SET claimToken=$t, claimedAt=now(), attempts=attempts+1 WHERE id=$id AND relayedAt IS NULL AND (claimToken IS NULL OR claimedAt < now() - ($claimStaleMs \|\| ' milliseconds')::interval)`. 근거: 워커가 N개면 프로세스 시계도 N개이고, 어느 것도 **다른 워커가 쓴 `claimedAt`과 같은 축이 아니다**. 두 시계가 `claimStaleMs`보다 벌어지면 신선한 claim이 상시 탈취된다(§0.3-⑧). 형제가 같은 결함에 같은 처방을 내렸다 `[형제 nest-operations-jobs §3.2 S6]` |
| **R13** | **시도 누적과 소진 필터** | claim UPDATE가 `attempts`를 1 증가시키고 그 값을 `ClaimedNotificationCommand.attempts`로 돌려준다. `maxAttempts`가 주어지면 due 조건에 `attempts < $maxAttempts`를 포함한다. 그리고 **`createdAt`은 staging에서 한 번만 쓰고 이후 어떤 경로로도 덮어쓰지 않는다** — 그 값이 바뀌면 이미 배달된 배치의 버킷이 이동한다 | `attempts int NOT NULL DEFAULT 0` + 위 UPDATE의 `attempts=attempts+1`. 라이브러리는 **백오프도 dead-letter 정책도 소유하지 않는다**(§0.4-⑦). 여기서 주는 것은 "굶지 않을 수단"뿐이고, 소진 행을 어떻게 처리할지는 호스트의 운영 결정이다(§6-15 · §7-16) |

#### 3.3.3 디스패치 측 (`NotificationDeliveryStore`) 과 의무 D1–D9

```ts
export interface ClaimedNotificationDelivery {
  readonly id: string;
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef: string | null;
  readonly category: string;
  readonly priority: string;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly batchCount: number;
  readonly batchItemCount: number;
  readonly aggregationLabel: string | null;
  /** How many times a worker has claimed this delivery, including this claim (D9). */
  readonly attempts: number;
}

export interface NotificationDeliveryStore {
  /**
   * Atomically claim due deliveries. The claim MUST also stamp the
   * presentation lock in the same statement (D1).
   */
  claimDue(request: DispatchClaimRequest): Promise<readonly ClaimedNotificationDelivery[]>;
  materializeInTransaction<T>(
    request: DispatchTransactionRequest,
    work: (tx: NotificationDispatchTransaction) => Promise<T>,
  ): Promise<T | null>;
  complete(request: DispatchCompleteRequest): Promise<boolean>;
  releaseClaim(request: DispatchReleaseRequest): Promise<void>;
}

export interface NotificationDispatchTransaction {
  readDelivery(): Promise<ClaimedNotificationDelivery | null>;
  /** Conflict-safe insert then read. Never throws on a duplicate. */
  ensureMessage(input: EnsureMessageInput): Promise<{ readonly id: string }>;
}

/**
 * An endpoint plus the registration revision observed when it was listed. A
 * disable computed from this observation must not survive a re-registration
 * that happened afterwards (D6).
 */
export interface ObservedNotificationEndpoint extends NotificationPushEndpoint {
  /**
   * Opaque and compared only for equality. Any value that changes whenever the
   * row is re-registered works: `lastSeenAt.toISOString()`, a version counter,
   * or an xmin/rowversion column.
   */
  readonly revision: string;
}

export interface NotificationEndpointDisableTarget {
  readonly id: string;
  /** Exactly the value `listEnabled` returned for this endpoint. */
  readonly revision: string;
}

export interface NotificationEndpointStore {
  listEnabled(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly providers: readonly string[];
  }): Promise<readonly ObservedNotificationEndpoint[]>;
  /**
   * Idempotent and stale-safe. An empty list is a no-op, and so is an entry
   * whose `revision` no longer matches the stored row: the device re-registered
   * between `listEnabled` and here, and disabling it would leave a live device
   * dark indefinitely (D6, design 0.2-18).
   */
  disable(input: {
    readonly applicationKey: string;
    readonly endpoints: readonly NotificationEndpointDisableTarget[];
    /** Recorded as the disable instant. From the injected clock (D7). */
    readonly at: Date;
  }): Promise<void>;
}
```

| # | 의무 | 정확한 뜻 |
|---|---|---|
| **D1** | **claim과 presentation lock은 한 문장이다** | 배달을 claim하는 UPDATE가 `presentationLockedAt`을 동시에 쓴다. 두 문장으로 나누면 그 사이에 relay가 배치에 항목을 병합해 **사용자가 못 볼 항목**이 생긴다(G6). 실패한 핸드오프 뒤에도 잠금은 **풀리지 않는다** — inbox 문장은 이미 사용자에게 노출됐을 수 있다 |
| **D2** | **inbox 메시지 유일성** | `(applicationKey, deliveryId)` 유니크 + conflict-safe 삽입 후 조회. PostgreSQL은 유니크 위반 후 트랜잭션을 abort하므로 캐치-후-재조회는 불가능하다(소스 주석 `[소스 dispatch:186-189]`) |
| **D3** | **멱등 완료** | `deliveredAt`은 `claimToken` 일치 + `deliveredAt IS NULL`일 때만 쓴다 |
| **D4** | **stale 회수** | R2와 동일 |
| **D5** | **due 필터** | `deliverAfter <= at AND deliveredAt IS NULL`. 미래 배달을 절대 반환하지 않는다 |
| **D6** | **endpoint 비활성화의 멱등성·범위·stale 안전성** | `disable`은 `applicationKey`로 범위가 제한되고 중복 호출이 안전하다. 이미 비활성인 endpoint를 다시 비활성화해도 오류가 아니다. **추가**: `listEnabled`가 관측한 리비전보다 뒤에 이뤄진 등록은 이 비활성화가 건드리지 않는다 — `WHERE id = $id AND revision = $revision`이고, 불일치는 **오류가 아니라 no-op**이다. endpoint 유일성이 `(applicationKey, provider, address)`이므로 재등록은 **같은 행**을 다시 켜고, 뒤늦은 무조건 `disable`은 그것을 다시 끈다(§0.3-⑨) |
| **D7** | **시각 원문 보존 · JSON 왕복** | R9와 동일(기록용 `at`만. claim 신선도 축은 D8) + `action` JSON 왕복 |
| **D8** | **claim 신선도는 저장소 시계 하나로** | R12와 동일. `DispatchClaimRequest`도 컷오프 순간이 아니라 `claimStaleMs` 기간을 나르고, `dispatchClaimedAt`과 회수 조건은 저장소 `now()`에서만 나온다 |
| **D9** | **시도 누적과 소진 필터** | R13과 동일. claim UPDATE가 `attempts`를 증가시켜 `ClaimedNotificationDelivery.attempts`로 돌려주고, `maxAttempts`가 있으면 due 조건에 포함한다. `DEFAULT_DISPATCH_PAGE_SIZE = 100`이므로 poison 배달 100건이면 페이지가 통째로 막힌다(F12 · §7-16) |

#### 3.3.4 릴레이/디스패처가 지는 의무 — 저장소가 **하지 않아도 되는** 것

저장소 구현자가 과잉 구현하지 않도록 경계를 명시한다.

- claim 토큰 생성(`randomUUID`), 페이지 크기, 패스당 시각 갱신(§0.2-⑦). **stale 임계는 값만 전달한다** — 기간(`claimStaleMs`)을 넘기고 판정은 저장소가 한다(R12·D8). 릴레이가 컷오프 순간을 계산해 넘기던 것이 §0.3-⑧의 결함이었다.
- `createDelivery`의 `created: false`를 병합/follow-up으로 되돌리는 라우팅(R11). 저장소는 "이미 있다"만 말하고, 그것이 병합인지 follow-up인지는 정책이므로 릴레이가 정한다.
- `attempts`를 읽고 `maxAttempts`를 넘길지 정하는 것(R13·D9). 저장소는 세고 거를 뿐, **몇 번이 너무 많은가는 호스트의 운영 결정**이고 릴레이는 그 값을 전달만 한다.
- `listEnabled`가 준 리비전을 `disable` 입력으로 옮기는 대응 관계(D6). 저장소는 리비전을 비교할 뿐 어떤 것을 끌지 고르지 않는다.
- 우선순위 문자열 → 유니언 변환과 그 실패 처리(배달 하나만 실패시키고 페이지는 계속 — 소스 스펙이 요구한 동작 `[소스 fan-out spec]`).
- 조용시간·창·배치 정책 키·follow-up 키 계산 전부.
- 선호도 게이트를 **NORMAL에만** 적용한다는 규칙(ESSENTIAL은 선호도로 억제되지 않는다).
- claim 하나당 완료 호출 정확히 1회.
- 실패 시 에러 코드 축약(기본 120자) — 저장소에 예외 원문을 넘기지 않는다.
- 푸시 청크 회계, 무효/거부 endpoint 분류, `accepted` 판정.
- 완료 쓰기 실패의 처리: 로그만 남기고 배달 성패를 덮어쓰지 않는다. 남은 claim은 다음 stale 회수가 정리한다(F1·F8).

#### 3.3.5 계약의 대가 — 정확히 무엇이 열려 있는가

**stale 회수는 liveness를 위해 safety를 판다.** 워커가 SIGKILL로 죽으면 claim이 영원히 남아 그 알림이 다시는 처리되지 않으므로, 5분(기본) 뒤 다른 워커가 가져간다. 그러나 그 프로세스가 **죽지 않고 멈춰 있었을** 뿐이라면(GC·네트워크 정지·컨테이너 스로틀) 두 워커가 같은 배달을 동시에 처리할 수 있다. 남는 것:

1. **relay 쪽은 안전하다** — R4(소스 항목 유니크)가 두 번째 워커의 배달 생성을 무효화하고, 같은 배치 정체성을 노리는 **다른** outbox 행끼리의 경쟁은 R11이 닫는다. 최악이 "쓸모없는 트랜잭션 한 번"이다.
2. **dispatch 쪽은 푸시가 중복될 수 있다** — D2가 inbox는 지키지만 전송은 트랜잭션 밖이다(G5). 이것이 F8과 같은 창이다.
3. `claimStaleMs`를 키우면 중복은 줄고 장애 복구는 느려진다. 기본 5분은 소스 값이다.

**멈춘 워커만 이 창을 여는 것이 아니다 — 시계 스큐도 연다.** 초안은 이 절을 "그 프로세스가 죽지 않고 멈춰 있었을 뿐"으로만 설명했는데, 그 설명은 컷오프와 `claimedAt`이 **같은 시계**에서 나올 때만 완결된다. 두 값이 서로 다른 앱 서버의 프로세스 시계에서 나오면, 정상 동작하는 워커 두 대가 `claimStaleMs`보다 벌어진 시계를 갖는 것만으로 **매 패스** 서로의 신선한 claim을 탈취한다 — 겹침이 예외가 아니라 상태가 된다. R12·D8이 판정을 저장소 시계 하나로 옮겨 이 경로를 닫는다. 닫히지 않고 남는 것은 저장소 시계 자체의 점프와 읽기 복제본 지연이며 §7-15에 있다.

**영구 실패 행은 이 절의 반대편 비용이다.** stale 회수는 "아무도 안 집는 행"을 없애지만, 매번 집혀서 매번 실패하는 행은 없애지 못한다. `maxAttempts` 없이 운영하면 poison 행이 due 페이지를 점유해 **건강한 알림이 굶는다**(F12 · R13 · §7-16). 라이브러리는 백오프를 소유하지 않으므로(§0.4-⑦) 여기서 줄 수 있는 것은 카운터와 필터, 그리고 이 문단뿐이다.

#### 3.3.6 ingress·계정 수명주기 포트와 의무 I1–I3 · L1–L4

**§0.1의 행 41·42가 `./core`로 승격된다고 적어 놓고 §3에 시그니처가 없었다.** 그 결과 G7("개인정보 사고" 등급)의 근거가 문장으로만 존재했고, `notificationRecipientKey`는 호출자가 없는 공개 심볼이었다. 여기서 닫는다.

```ts
/**
 * Recipient lifecycle barrier. The library calls neither method: staging calls
 * `ensureLive` from the host publisher, and account deletion calls `tombstone`
 * from the host lifecycle. Both live in `./core` because G7 — no delivery after
 * a tombstone — has no other basis, and because `NotificationStageResult.discarded`
 * is meaningless without them.
 *
 * `notificationRecipientKey(applicationKey, recipientRef)` is the intended key
 * for the tombstone row: it lets an implementation retain the barrier after a
 * purge without retaining the raw recipient reference.
 */
export interface NotificationRecipientLiveness<Transaction = unknown> {
  /**
   * Acquires the recipient gate inside this transaction and returns false once
   * the ref is tombstoned (I2). Acquiring — not merely reading — is what makes
   * stage and purge serialise against each other.
   */
  ensureLive(transaction: Transaction, applicationKey: string, recipientRef: string): Promise<boolean>;
  /** Marks deletion. The tombstone row must survive the purge that follows (L3). */
  tombstone(transaction: Transaction, applicationKey: string, recipientRef: string): Promise<void>;
}

/**
 * Host bridge for account deletion. Call both methods inside the same host
 * transaction as the deletion itself; the ordering obligations L1-L4 are the
 * entire basis of G7.
 */
export interface NotificationAccountLifecycle<Transaction = unknown> {
  purgeRecipient(transaction: Transaction, applicationKey: string, recipientRef: string): Promise<void>;
  anonymizeActor(transaction: Transaction, applicationKey: string, actorRef: string): Promise<void>;
}
```

**ingress 의무 I1–I3 — 호스트 publisher가 진다** (G1의 근거이며 `NotificationRelayStore`에는 대응 메서드가 없다):

| # | 의무 | 정확한 뜻 |
|---|---|---|
| **I1** | **ingress 멱등** | `(applicationKey, recipientRef, eventKey)` 유니크 + conflict-safe 삽입 후 조회. 중복 stage는 예외 없이 `staged: false`. PostgreSQL은 유니크 위반 후 대화형 트랜잭션을 abort시키므로 캐치-후-재조회는 **불가능하다** `[소스 publisher:57-63 — 주석이 이 이유를 적고 있다]` |
| **I2** | **staging은 liveness 게이트 뒤에 있다** | `stage`는 삽입 **전에** 같은 트랜잭션에서 `ensureLive`를 부르고, false면 아무것도 쓰지 않고 `{ id: null, staged: false, discarded: true }`를 반환한다. 게이트는 **읽기가 아니라 획득**이어야 한다 — 그래야 삭제와 직렬화된다 |
| **I3** | **staging 시각은 한 번만 쓴다** | `createdAt`은 삽입 시점에 정해지고 이후 어떤 경로로도 갱신되지 않는다(R13의 ingress 쪽 짝). 이 값이 배치 버킷의 유일한 입력이다 |

**계정 수명주기 의무 L1–L4 — 호스트 lifecycle이 진다**:

| # | 의무 | 정확한 뜻 | 어기면 |
|---|---|---|---|
| **L1** | **tombstone과 purge는 한 트랜잭션이다** | `tombstone`과 모든 삭제문이 계정 삭제와 **같은 하나의** 트랜잭션에서 실행된다 | tombstone만 먼저 커밋되면 그 사이 relay가 만든 배달이 남는다. purge만 먼저면 늦은 stage가 새 outbox를 만든다 |
| **L2** | **ingress를 배달보다 먼저 지운다** | 삭제 순서는 tombstone → ingress → delivery → message → endpoint → preference다. ingress `DELETE`가 **릴레이 트랜잭션의 행 잠금(R7)에서 블록되므로**, 그 릴레이는 이 삭제 앞이나 뒤 중 하나로 직렬화되고, 뒤라면 이어지는 delivery·message 삭제가 그 릴레이가 방금 커밋한 것을 마저 지운다 | 배달을 먼저 지우면 그 사이 릴레이가 커밋한 배달이 **삭제 이후에 살아남아** 푸시된다. 소스 주석이 이 순서의 이유를 명시하고 있다 `[소스 adapters/prisma-notification-account-lifecycle.ts:26-33 — 실측]` |
| **L3** | **tombstone 행은 purge에서 살아남는다** | 다른 모든 행은 지우되 `NotificationRecipientState`(또는 그에 해당하는 행)는 남긴다 | 늦게 도착한 `ensureLive`가 tombstone을 못 보고 true를 돌려준다 — 삭제된 계정이 다시 알림을 받기 시작한다 `[소스 schema.prisma 주석: "It is intentionally not deleted during purge"]` |
| **L4** | **actor 익명화는 수신자 삭제와 별개다** | `anonymizeActor`는 **다른 수신자의** 메시지에 남은 actor 참조를 지운다. 수신자 purge가 이것을 대신하지 않는다 | 삭제한 사용자의 참조가 남의 inbox에 남는다 |

**라이브러리가 이 의무들을 강제할 수 없다는 사실을 그대로 적는다.** 두 포트 모두 호스트가 구현하고, 파이프라인은 어느 메서드도 호출하지 않는다. 그래서 이 의무들은 (a) 두 인터페이스의 JSDoc, (b) §5.4의 적합성 케이스(`NotificationStoreSuite.stage`·`tombstoneRecipient`를 통해 호스트 구현에 닿는다), (c) README 필수 절(§5.6-8) **세 곳에 같은 문장으로** 실린다. 케이스를 안 돌린 호스트는 여전히 막지 못한다 — §7-2와 같은 등급의 잔존 리스크다.

### 3.4 `./core` — 명령·런타임·수신자 키·표시·에러

#### 3.4.1 명령 계약 (`src/core/contracts.ts` — 소스와 거의 동일)

```ts
export type NotificationPriority = 'NORMAL' | 'ESSENTIAL';

export type NotificationJsonPrimitive = string | number | boolean | null;
export type NotificationJsonValue =
  | NotificationJsonPrimitive
  | readonly NotificationJsonValue[]
  | { readonly [key: string]: NotificationJsonValue };

/** The client-visible action is intentionally transport and domain agnostic. */
export type NotificationAction = {
  readonly href?: string | undefined;
  readonly [key: string]: NotificationJsonValue | undefined;
};

/**
 * An ISO instant rather than a Date, so a command stays JSON-serialisable
 * while it waits in a durable ingress outbox.
 */
export type NotificationTiming =
  | { readonly mode: 'IMMEDIATE' }
  | { readonly mode: 'SCHEDULED'; readonly at: string };

export interface NotificationBatch {
  readonly key: string;
  readonly label?: string | undefined;
  readonly itemCount?: number | undefined;
}

/**
 * One source recipient plus one stable event key is the idempotency boundary
 * (§3.1 G1). `applicationKey` is server-owned configuration: API callers must
 * never choose it. Delivery order between two commands is never guaranteed.
 */
export interface NotificationCommand {
  readonly applicationKey: string;
  readonly recipientRef: string;
  readonly actorRef?: string | null | undefined;
  readonly targetRef?: string | null | undefined;
  readonly category: string;
  readonly priority: NotificationPriority;
  readonly title?: string | null | undefined;
  readonly body: string;
  readonly action?: NotificationAction | null | undefined;
  readonly eventKey: string;
  readonly batch?: NotificationBatch | null | undefined;
  readonly timing?: NotificationTiming | undefined;
}

export interface NotificationStageResult {
  /** Null only when the recipient lifecycle has already tombstoned this ref. */
  readonly id: string | null;
  readonly staged: boolean;
  readonly discarded?: boolean | undefined;
}

/** The only port source-domain code needs. `Transaction` stays generic. */
export interface NotificationPublisher<Transaction = unknown> {
  stage(transaction: Transaction, command: NotificationCommand): Promise<NotificationStageResult>;
}

/** Throws `NotificationsError('ERR_NOTIFICATION_COMMAND_INVALID')`. */
export function assertNotificationCommand(command: NotificationCommand): void;

export function notificationPriorityFrom(value: string): NotificationPriority;
```

`NotificationPublisher<Tx>`가 이 패키지에서 **호스트 트랜잭션 타입을 받는 유일한 포트**다. 이유는 outbox의 정의 그 자체다 — staging은 소스 도메인의 트랜잭션 안에서 일어나야 하고, 그 트랜잭션 객체는 호스트 것이다. 릴레이/디스패치 트랜잭션은 반대로 **저장소가 소유**하므로 제네릭이 없다(§3.3).

#### 3.4.2 런타임 (`src/core/runtime.ts`) — `Date`·타이머·난수가 등장하는 유일한 파일

```ts
export interface NotificationClock {
  now(): Date;
}

export interface NotificationRuntime {
  readonly clock: NotificationClock;
  /** Opaque claim token. Must be unguessable enough that two workers never collide. */
  claimToken(): string;
  /** Defers work off the caller's stack. Must not keep the process alive. */
  defer(work: () => void): void;
}

/** Uses `Date`, `crypto.randomUUID`, and an unref'd `setTimeout(0)`. */
export function systemNotificationRuntime(): NotificationRuntime;
```

가드 테스트가 `src/**`에서 `new Date(`·`Date.now(`·`setTimeout(`·`randomUUID`를 이 파일 밖에서 금지한다(§5.3). **`process.env`는 이 파일 안에서도 금지다** — `systemNotificationRuntime()`은 `Date`·`crypto.randomUUID`·unref된 `setTimeout`만 쓰고 환경을 읽을 이유가 없으며, `expoOptionsFromEnv`는 이미 제외됐다(§0.1-27). 그래서 §5.3의 가드는 `process.env`에 **파일 예외를 두지 않는다**(§4-13과 §1-2가 서로 다른 규칙을 적고 있던 것을 이렇게 통일한다).

**이 런타임은 Nest 표면에서도 주입 가능해야 한다.** `NestNotificationsOptions.runtime`과 `NOTIFICATION_RUNTIME` 토큰이 그 통로이며, 세 러너가 **같은 인스턴스**를 공유한다(§3.8.2). 그것이 없으면 `forRoot`로 배선한 소비자는 자기 앱의 조용시간·배치 창을 결정적으로 테스트할 수단이 없고 서버리스에서 `defer` 구현을 갈아끼울 수도 없다 — §0.2-⑫가 `enabled` 플래그를 넣은 것과 같은 동기다.

#### 3.4.3 수신자 키 (`src/core/recipient-key.ts`) — node:crypto를 쓴다

```ts
/**
 * Stable opaque key for the recipient liveness barrier. The digest is
 * byte-identical to `sha256(applicationKey + U+0000 + recipientRef)`.
 *
 * Throws `ERR_NOTIFICATION_RECIPIENT_KEY_INPUT` when either input contains a
 * U+0000 code point: the separator is only injective while the inputs are
 * free of it.
 */
export function notificationRecipientKey(applicationKey: string, recipientRef: string): string;
```

**이 함수의 호출자는 라이브러리가 아니라 호스트다.** 파이프라인은 이 값을 만들지도 읽지도 않는다 — `NotificationRecipientLiveness` 구현(§3.3.6)이 tombstone 행의 키로 쓴다. 그 포트가 §3에 없던 동안 이 함수는 **호출자 없는 공개 심볼**이었고, AGENTS.md §2의 "두 번째 소비자도 이해할 수 있는 계약" 기준에 걸린다. 이제 JSDoc이 그 용도를 직접 가리킨다.

**`node:crypto`를 쓰고 순수 SHA-256을 번들하지 않는다.** 근거:

1. 이 패키지는 **Node 전용**이다 — `platform: 'node'`, `engines: node >= 20`, 소비자는 NestJS 서버다. 형제 `expo-media`가 순수 SHA-256을 싣는 이유는 Hermes/RN에서 `node:crypto`가 없기 때문이고 `[형제]`, 그 조건이 여기엔 없다.
2. `node:crypto`는 **의존성이 아니라 런타임 내장**이다. AGENTS.md의 "direct runtime dependency 0"을 위반하지 않는다(`node:` 접두 import는 번들러에도 명시적이다).
3. 손으로 옮긴 SHA-256 120줄은 **감사받지 않은 암호 코드**이고, 여기서는 성능(수신자당 매 stage 1회 호출)도 손해다.
4. 그래서 이 함수는 `./core`에 있지만 **`./core`가 완전히 platform-neutral하지는 않다** — 이 사실을 §2.5에 적었고, `tsconfig.src.json`이 `types: []`를 잠그지 않는 이유이기도 하다.

#### 3.4.4 표시 포트 (`src/core/presentation.ts`) — 기본 구현 없음

```ts
export interface NotificationPresentationInput {
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly category: string;
  readonly priority: NotificationPriority;
  /** How many source commands were merged into this delivery. */
  readonly batchCount: number;
  /** Sum of the merged commands' item counts. */
  readonly batchItemCount: number;
  readonly aggregationLabel: string | null;
}

export interface NotificationPresentation {
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
}

/**
 * Produces the sentence a person actually reads, in the inbox and in the push
 * payload. The library ships no implementation: batch copy is product copy,
 * and a default would ship one product's language to every consumer.
 */
export interface NotificationPresenter {
  present(input: NotificationPresentationInput): NotificationPresentation;
}
```

memorylog2의 기존 동작은 **소비 앱 코드 10줄**이 된다(README 레시피). 라이브러리에는 `새 알림`도 `New notifications`도 없다.

#### 3.4.5 전송 포트 (`src/core/push.ts`)

```ts
export interface NotificationPushEndpoint {
  readonly id: string;
  readonly provider: string;
  readonly address: string;
}

export interface NotificationPushPayload {
  /** The durable inbox message id. */
  readonly notificationId: string;
  /**
   * Stable across every retry of this delivery. Transports that support
   * de-duplication or collapsing should map it onto their own key: retries are
   * at-least-once (§3.1 G5), and this is the only lever that reduces duplicates.
   */
  readonly idempotencyKey: string;
  readonly collapseKey?: string | undefined;
  readonly recipientRef: string;
  readonly title: string | null;
  readonly body: string;
  readonly action: NotificationAction | null;
  readonly priority: NotificationPriority;
}

export interface NotificationPushResult {
  /** False retains the durable delivery for retry. */
  readonly accepted: boolean;
  /** The provider confirmed these endpoints are gone. Safe to disable. */
  readonly invalidEndpointIds: readonly string[];
  /**
   * Locally malformed addresses. NOT provider-confirmed: the dispatcher logs
   * them and, by default, leaves them enabled (§0.2-6).
   */
  readonly rejectedEndpointIds: readonly string[];
}

export interface NotificationPushGateway {
  /** Reject malformed provider addresses before they become durable endpoints. */
  isValidEndpoint(endpoint: Pick<NotificationPushEndpoint, 'provider' | 'address'>): boolean;
  send(
    endpoints: readonly NotificationPushEndpoint[],
    payload: NotificationPushPayload,
  ): Promise<NotificationPushResult>;
}
```

#### 3.4.6 에러와 로거

```ts
export type NotificationsErrorCode =
  | 'ERR_NOTIFICATION_COMMAND_INVALID'
  | 'ERR_NOTIFICATION_APPLICATION_KEY_INVALID'
  | 'ERR_NOTIFICATION_RECIPIENT_KEY_INPUT'
  | 'ERR_NOTIFICATION_POLICY_INVALID'
  | 'ERR_NOTIFICATION_TIMEZONE_INVALID'
  | 'ERR_NOTIFICATION_PRIORITY_UNSUPPORTED'
  | 'ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED'
  | 'ERR_NOTIFICATION_MESSAGE_NOT_VISIBLE'
  | 'ERR_NOTIFICATION_CONFIG_INVALID';

export class NotificationsError extends Error {
  readonly code: NotificationsErrorCode;
  readonly cause?: unknown;
}

/** Prefer this over `instanceof` — dual CJS/ESM loads can produce two classes (§2.5). */
export function isNotificationsError(value: unknown): value is NotificationsError;

/** Shortens any thrown value to a stable, secret-free code (default 120 chars). */
export function safeErrorCode(error: unknown, limit?: number): string;

export interface NotificationLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

export function silentNotificationLogger(): NotificationLogger;
```

`safeErrorCode`는 소스의 함수에서 Prisma 분기를 제거한 형태다. **예외 메시지 원문은 저장소에도 로그에도 절대 들어가지 않는다** — 소스 스펙이 이미 이것을 단언하고 있었다(`"records a safe error code, never the exception message"` `[소스 fan-out spec]`).

### 3.5 `./expo` — Expo 지식만, SDK 없이

```ts
/** The subset of Expo's push message wire shape this library produces. */
export interface ExpoPushMessage {
  readonly to: string;
  readonly title?: string | undefined;
  readonly body: string;
  readonly sound?: 'default' | null | undefined;
  readonly priority?: 'default' | 'normal' | 'high' | undefined;
  readonly channelId?: string | undefined;
  readonly collapseId?: string | undefined;
  readonly data?: Record<string, unknown> | undefined;
}

/** The subset of Expo's ticket wire shape this library reads. */
export type ExpoPushTicket =
  | { readonly status: 'ok'; readonly id: string }
  | {
      readonly status: 'error';
      readonly message?: string | undefined;
      readonly details?: { readonly error?: string | undefined } | undefined;
    };

export interface ExpoPushEntry {
  readonly endpoint: NotificationPushEndpoint;
  readonly message: ExpoPushMessage;
}

/** Expo accepts at most 100 messages per request. */
export const EXPO_PUSH_CHUNK_SIZE = 100;

/**
 * Splits entries into request-sized chunks. Each chunk keeps its endpoints
 * beside its messages, so ticket attribution is a data-structure fact rather
 * than an assumption about a third-party chunker's ordering (design 0.3-4).
 */
export function chunkExpoPushMessages(
  entries: readonly ExpoPushEntry[],
  options?: { readonly chunkSize?: number | undefined },
): readonly (readonly ExpoPushEntry[])[];

export interface ExpoTicketClassification {
  readonly accepted: boolean;
  readonly invalidEndpointIds: readonly string[];
  /** Ids of accepted tickets, for a host that polls Expo receipts (design 0.3-2). */
  readonly ticketIds: readonly string[];
  readonly otherErrors: readonly string[];
}

/**
 * Maps one chunk's tickets back onto its entries. A response shorter than the
 * request is never treated as a handoff: which messages landed is unknowable,
 * and losing a notification is worse than sending it twice (design 3.1 F7).
 */
export function classifyExpoPushTickets(
  entries: readonly ExpoPushEntry[],
  tickets: readonly ExpoPushTicket[],
): ExpoTicketClassification;

/** `ExpoPushToken[…]` / `ExponentPushToken[…]` shape check. No network, no SDK. */
export function isExpoPushToken(address: string): boolean;

export interface ExpoPushGatewayOptions {
  /**
   * Sends one chunk. Declared with method syntax on purpose: method parameters
   * are compared bivariantly, so an `expo-server-sdk` instance's
   * `sendPushNotificationsAsync(messages: ExpoPushMessage[])` is assignable as
   * is. As an arrow-function property it would not be — under
   * `strictFunctionTypes` the parameter is contravariant and
   * `readonly ExpoPushMessage[]` is not assignable to `ExpoPushMessage[]`
   * (design 2.2). A 15-line `fetch` call fits the same shape; the library never
   * imports either.
   */
  send(messages: readonly ExpoPushMessage[]): Promise<readonly ExpoPushTicket[]>;
  /** Default title when a notification has none. Required: it is product copy. */
  readonly defaultTitle: string | null;
  readonly sound?: 'default' | null | undefined;
  readonly channelId?: string | undefined;
  /** Continue remaining chunks after one fails. Default true (matches source). */
  readonly continueAfterChunkFailure?: boolean | undefined;
}

export function createExpoPushGateway(options: ExpoPushGatewayOptions): NotificationPushGateway;
```

- `defaultTitle`이 **필수**인 이유: 소스는 `payload.title ?? "MemoryLog"`로 제품 이름을 하드코딩했다 `[소스 expo-push.service.ts:45]`. 라이브러리가 가질 수 없는 값이다.
- `collapseId`는 `payload.collapseKey ?? payload.idempotencyKey`로 채운다 — §3.1의 중복 완화 레버가 여기서 실제로 쓰인다.
- `send` 실패는 **throw하지 않고** `accepted: false`로 흡수한다(소스 스펙이 요구한 동작 `[소스 expo gateway spec]`).
- **`send`만 메서드 문법이고 나머지 옵션은 전부 데이터 프로퍼티다.** 이 비대칭은 실수가 아니라 §2.2-C 주장의 성립 조건이며, §5.2가 expo-server-sdk를 설치하지 않은 채 `declare const sdkSend`로 고정한다. 구현자가 습관적으로 화살표 프로퍼티로 되돌리면 그 타입 테스트가 깨진다.

### 3.6 `./core` — 릴레이 (`src/core/relay.ts`)

```ts
export interface NotificationRelayOptions {
  readonly applicationKey: string;
  readonly store: NotificationRelayStore;
  readonly policy: NotificationSchedulingPolicy;
  readonly runtime?: NotificationRuntime | undefined;
  readonly logger?: NotificationLogger | undefined;
  readonly pageSize?: number | undefined;        // DEFAULT_RELAY_PAGE_SIZE = 100
  /**
   * Passed to the store as a duration; the store compares it against its own
   * clock (R12). Default `DEFAULT_CLAIM_STALE_MS` = 300_000.
   */
  readonly claimStaleMs?: number | undefined;
  /**
   * Rows already attempted this many times are left out of the due page (R13).
   * Absent means no bound — a permanently failing row is then re-claimed every
   * pass and, at `pageSize` such rows, starves healthy notifications (design 7-16).
   * The library owns no backoff policy (design 0.4-7); this is the only lever
   * it offers, and choosing a value is an operational decision.
   */
  readonly maxAttempts?: number | undefined;
}

export type NotificationRelayOutcome =
  | 'relayed'
  | 'suppressed'
  | 'already-relayed'
  | 'no-longer-live';

/**
 * Declared as a type alias, NOT an interface. Only object type aliases get an
 * implicit index signature, so only this form is assignable to
 * `Record<string, unknown>` - which is exactly the shape a sibling job runner's
 * summary slot has. An interface fails with "Index signature for type 'string'
 * is missing" and the 12-line job adapter in 3.8.2 stops compiling
 * (measured, see design 0.4-3).
 */
export type NotificationRelaySummary = {
  readonly ok: boolean;
  readonly claimed: number;
  readonly relayed: number;
  readonly suppressed: number;
  readonly alreadyRelayed: number;
  readonly noLongerLive: number;
  readonly failed: number;
};

export interface NotificationRelay {
  relayDue(): Promise<NotificationRelaySummary>;
}

export function createNotificationRelay(options: NotificationRelayOptions): NotificationRelay;
```

파이프라인 단계(소스 로직 유지, 저장소 호출만 포트로):

1. `claimDue` → 이번 워커가 실제로 이긴 행만 받는다(R1).
2. 행마다 `relayInTransaction`:
   a. `readCommand()`로 **잠긴 최신 행**을 다시 읽는다 — 동시 actor 익명화를 반영하고 삭제를 관측한다(소스가 이 재읽기를 하는 이유 그대로 `[소스 relay:154-163]`).
   b. NORMAL이면 `isCategoryEnabled` → false면 `suppressed`.
   c. `findDeliveryBySource()`가 있으면 `already-relayed`(G2).
   d. `policy.resolveDeliveryAt()`로 배달 시각 계산.
   e. `batchKey`가 없거나 ESSENTIAL이면 **단독 배달**. ESSENTIAL은 NORMAL 배치에 갇히지 않는다.
   f. 배치면 `policy.batchWindow(createdAt)` + `notificationBatchPolicyKey()`로 정체성을 만들고 `findOpenBatch` → 있으면 `mergeIntoBatch`(R6), 없으면 `createDelivery`. 병합이 `false`면 `notificationFollowUpBatchPolicyKey(…, outboxId)`로 follow-up 배달(F10).
   f-bis. **`createDelivery`가 `created: false`를 돌려준 경우**(다른 outbox 행을 처리하던 워커가 그 사이에 같은 정체성의 배달을 만들었다 — F11): 돌아온 id를 그대로 쓰지 **않고** `findOpenBatch`를 다시 불러 f로 되돌아간다. 열려 있으면 병합, 잠겼으면 follow-up이다. **이 되돌림이 없으면 잠긴 배달에 항목이 붙어 알림이 조용히 사라진다**(§0.3-⑦ · R11). 되돌림은 정체성당 최대 1회이며(두 번째에는 `findOpenBatch`가 반드시 그 행을 본다) 그래서 무한 루프가 없다.
   g. `appendItem()` — **f 또는 f-bis가 확정한 배달에만** 붙인다.
3. 성공 → `completeClaim`(R8). 실패 → `releaseClaim(errorCode)` + `logger.error`.

`ok`는 `failed === 0`이다 — 형제 잡 계약의 `ok:false` 규약과 **구조적으로** 맞물린다(§0.4-③).

**`conflictRetries`가 사라진 이유.** 초안은 "stale-claim 겹침 중 유니크 경쟁을 위한 재시도, 기본 3"이라는 옵션을 두었는데, 그것은 (a) `createDelivery`가 **던진다**는 것을 전제했고 — 문서의 다른 모든 자리는 포트가 던지지 않는다고 적고 있었다 — (b) 경쟁의 정체도 잘못 지목했다. R7의 행 잠금은 **같은** outbox 행을 노리는 두 워커를 이미 직렬화하므로, 실제 경쟁은 **서로 다른** outbox 행 둘이 같은 배치 정체성에 동시에 도달하는 F11이다. R11이 그 경쟁을 반환값으로 표현하므로 재시도 루프가 필요 없어졌다(§0.2-⑯). 소스가 트랜잭션을 3회 재시도한 것은 Prisma `create`가 P2002을 던지기 때문이었다 `[소스 relay:259-275 — 실측]`.

### 3.7 `./core` — 디스패처 (`src/core/dispatch.ts`)

```ts
export interface NotificationDispatcherOptions {
  readonly applicationKey: string;
  readonly store: NotificationDeliveryStore;
  readonly endpoints: NotificationEndpointStore;
  readonly pushGateway: NotificationPushGateway;
  readonly presenter: NotificationPresenter;
  /** Which endpoint providers this gateway handles. Required: no default provider. */
  readonly providers: readonly string[];
  readonly runtime?: NotificationRuntime | undefined;
  readonly logger?: NotificationLogger | undefined;
  readonly pageSize?: number | undefined;      // DEFAULT_DISPATCH_PAGE_SIZE = 100
  /** A duration; the store compares it against its own clock (D8). */
  readonly claimStaleMs?: number | undefined;
  /** Deliveries already attempted this many times are left out of the page (D9). */
  readonly maxAttempts?: number | undefined;
  /** Disable locally rejected endpoints too. Default false (design 0.2-6). */
  readonly disableRejectedEndpoints?: boolean | undefined;
}

/** A type alias for the same reason `NotificationRelaySummary` is (design 3.6). */
export type NotificationDispatchSummary = {
  readonly ok: boolean;
  readonly claimed: number;
  readonly delivered: number;
  readonly failed: number;
  readonly endpointsDisabled: number;
};

export interface NotificationDispatcher {
  dispatchDue(): Promise<NotificationDispatchSummary>;
}

export function createNotificationDispatcher(
  options: NotificationDispatcherOptions,
): NotificationDispatcher;
```

단계: `claimDue`(claim + presentation lock 한 문장, D1) → `materializeInTransaction`(잠긴 배달 재읽기 → `presenter.present()` → `ensureMessage()`, D2) → `endpoints.listEnabled`(**리비전 동반 반송**) → `pushGateway.send` → `endpoints.disable(…)` → `accepted`면 `complete`, 아니면 `ERR_NOTIFICATION_PUSH_HANDOFF_REJECTED`로 `releaseClaim`.

**`disable` 단계의 정확한 형태.** 게이트웨이가 돌려준 `invalidEndpointIds`를 **`listEnabled` 결과에 되짚어** 각 id의 `revision`을 찾고, `{ id, revision }` 쌍으로 `disable`을 부른다. 리비전을 못 찾은 id(게이트웨이가 목록에 없던 endpoint를 보고했다 — 있을 수 없지만 방어한다)는 조용히 건너뛰고 `logger.warn`만 남긴다. 이 되짚기가 D6의 stale 안전성이 실제로 작동하는 지점이며, 없으면 전송 중에 재등록한 기기가 꺼진다(§0.3-⑨).

소스 스펙이 고정한 동작 중 반드시 보존하는 것 5종 `[소스 dispatch/fan-out specs]`: ① endpoint가 하나도 없어도 inbox 메시지는 쓰고 배달은 완료한다, ② 한 수신자의 핸드오프 실패가 페이지의 나머지를 막지 않는다, ③ 핸드오프가 실패해도 provider가 확인한 무효 endpoint는 비활성화한다, ④ 다른 워커가 claim을 가로채면 inbox 쓰기 **전에** 멈춘다, ⑤ 게이트웨이에 넘기는 것은 `actorRef`가 아니라 `recipientRef`다.

### 3.8 `./core` + `.` — 빠른 경로와 Nest 표면

#### 3.8.1 wakeup — 명시적 best-effort

```ts
/**
 * Post-commit latency hint. NOT an ingress and NOT a correctness dependency.
 *
 * `request()` returns nothing: there is no promise to await, no result to
 * inspect, and no error to catch. A hint may be coalesced with others, dropped
 * entirely, or fail silently.
 *
 * A periodic runner owns correctness. A host that wires only this hint will
 * never deliver a batched, quiet-hours-held, or scheduled notification,
 * because nothing calls the pipeline at the instant those become due
 * (design 0.3-1).
 */
export interface NotificationPipelineWakeup {
  request(): void;
}

export interface NotificationWakeupOptions {
  readonly relay: NotificationRelay;
  readonly dispatcher: NotificationDispatcher;
  /** Set false to make `request()` a no-op (serverless, tests). Default true. */
  readonly enabled?: boolean | undefined;
  readonly runtime?: NotificationRuntime | undefined;
  readonly logger?: NotificationLogger | undefined;
}

export function createNotificationWakeup(
  options: NotificationWakeupOptions,
): NotificationPipelineWakeup;
```

동작(소스와 동일 + 강화): 래치로 버스트를 한 패스로 접는다 · 호출자 스택에서 아무 저장소 호출도 하지 않는다 · `runtime.defer`가 unref된 타이머를 쓰므로 프로세스를 붙잡지 않는다 · relay가 하나도 relay하지 못했으면 dispatcher를 부르지 않는다 · 모든 예외를 삼키고 `logger.warn({ error: error.name })`만 남긴다(페이로드 유출 금지 — 소스 스펙이 단언 `[소스]`).

#### 3.8.2 Nest 표면 (`src/nest/*`)

```ts
// 공개 DI 토큰은 정확히 11종이다. 이 목록이 정본이고, release-artifact 테스트가
// 이름 집합을 exports·peer와 같은 등급으로 고정한다(§5.5). 초안이 §0.1·§2.3에
// "8종"이라고 적어 두고 여기에 9개를 나열했던 불일치를 이렇게 없앤다.
export const NOTIFICATION_APPLICATION_KEY: unique symbol;   // Symbol.for('@gj-kit/nest-notifications:application-key')
export const NOTIFICATION_PUBLISHER: unique symbol;
export const NOTIFICATION_RELAY_STORE: unique symbol;
export const NOTIFICATION_DELIVERY_STORE: unique symbol;
export const NOTIFICATION_ENDPOINT_STORE: unique symbol;
export const NOTIFICATION_PUSH_GATEWAY: unique symbol;
export const NOTIFICATION_PRESENTER: unique symbol;
export const NOTIFICATION_SCHEDULING_POLICY: unique symbol;
export const NOTIFICATION_PIPELINE_WAKEUP: unique symbol;
/** The one runtime the three runners share. Injectable so a host can fix the clock. */
export const NOTIFICATION_RUNTIME: unique symbol;
/** Lets a host swap the logger through DI instead of only through `forRoot`. */
export const NOTIFICATION_LOGGER: unique symbol;

export interface NestNotificationsOptions {
  readonly applicationKey: string;
  readonly relayStore: NotificationRelayStore;
  readonly deliveryStore: NotificationDeliveryStore;
  readonly endpointStore: NotificationEndpointStore;
  readonly pushGateway: NotificationPushGateway;
  readonly presenter: NotificationPresenter;
  readonly policy: NotificationSchedulingPolicy;
  readonly providers: readonly string[];
  readonly publisher?: NotificationPublisher<never> | undefined;
  readonly logger?: NotificationLogger | undefined;
  /**
   * Shared by the relay, the dispatcher and the wakeup hint - one instance, not
   * three. Defaults to `systemNotificationRuntime()`. Without this a consumer
   * wired through `forRoot` cannot fix the clock, so their own quiet-hours and
   * batch-window behaviour is untestable, and `defer` cannot be swapped for a
   * serverless host (design 0.2-12).
   */
  readonly runtime?: NotificationRuntime | undefined;
  readonly wakeup?: { readonly enabled?: boolean | undefined } | undefined;
  readonly relay?: Pick<NotificationRelayOptions, 'pageSize' | 'claimStaleMs' | 'maxAttempts'> | undefined;
  readonly dispatch?: Pick<NotificationDispatcherOptions, 'pageSize' | 'claimStaleMs' | 'maxAttempts' | 'disableRejectedEndpoints'> | undefined;
}

export class NestNotificationsModule {
  static forRoot(options: NestNotificationsOptions): DynamicModule;
  static forRootAsync(options: NestNotificationsAsyncOptions): DynamicModule;
}

/** Injectable wrappers whose `run()` is what a scheduler calls. */
export class NotificationRelayRunner { run(): Promise<NotificationRelaySummary>; }
export class NotificationDispatchRunner { run(): Promise<NotificationDispatchSummary>; }

/** Adapts a Nest `LoggerService` to the structural `NotificationLogger` port. */
export function fromNestLogger(logger: LoggerService, context?: string): NotificationLogger;
```

- 주입은 전량 **명시적 `@Inject(토큰)`** — `design:paramtypes`를 읽지 않으므로 SWC/esbuild 빌드에서도 동작한다 `[형제 — toss-payments-nestjs inject.ts 관행]`.
- `NOTIFICATION_RUNTIME`은 **하나의 프로바이더**이고 relay·dispatch·wakeup 세 러너가 그것을 주입받는다. 별개 인스턴스를 만들면 `fakeNotificationRuntime.advance()`가 파이프라인의 일부만 움직여, 배치 창을 넘긴 뒤 dispatch가 아직 과거에 있는 식의 테스트 거짓이 생긴다.
- `NOTIFICATION_LOGGER`가 없으면 호스트는 `forRoot` 옵션으로만 로거를 줄 수 있고 `forRootAsync`에서 다른 프로바이더에 의존하는 로거를 만들 수 없다. 토큰으로 두면 `fromNestLogger`가 일반 프로바이더가 된다.
- 조립 시점 검증: `applicationKey` 비문자열/공백, `providers` 빈 배열, 정책 옵션 위반은 **부팅 실패**(`ERR_NOTIFICATION_CONFIG_INVALID`). 런타임까지 살아남는 설정 오류를 만들지 않는다.
- **`@gj-kit/nest-operations-jobs`와의 접합**(의존 없음, §0.4-③). README 레시피 전문:

```ts
import { Injectable } from '@nestjs/common';
import { NotificationRelayRunner } from '@gj-kit/nest-notifications';

// @gj-kit/nest-operations-jobs의 데코레이터를 import하지 않고 형태만 세운다.
// 그래서 이 블록은 그 패키지를 devDependency로 두지 않고도 check:readme가
// 실제로 컴파일하며, 동시에 "두 패키지 사이에 import는 한 줄도 없다"는
// §0.4-③의 주장을 README가 스스로 증명한다(형제 §3.7의 google-auth-library 기법).
declare function OperationsJobDefinition(): ClassDecorator;

@Injectable()
@OperationsJobDefinition()
export class NotificationsRelayJob {
  readonly key = 'notifications.relay';
  readonly description = 'Relay staged notification commands into deliveries';
  readonly schedule = { cron: '* * * * *', timeZone: 'Asia/Seoul' } as const;
  constructor(private readonly relay: NotificationRelayRunner) {}
  run() { return this.relay.run(); }
}
```

**이 12줄이 성립하는 조건은 정확히 하나다 — `NotificationRelaySummary`가 `interface`가 아니라 `type` alias여야 한다.** 형제의 접합 지점은 `run(input, context): Promise<JobSummary | void>`이고 `JobSummary = Record<string, unknown>`이다 `[형제 — nest-operations-jobs/src/core/job.ts:5,60 실측]`. TypeScript는 implicit index signature를 **object type alias에만** 부여하고 `interface`에는 부여하지 않으므로(선언 병합 때문에 open이다), 요약 타입이 interface면 이 어댑터는 `Index signature for type 'string' is missing in type 'NotificationRelaySummary'`로 컴파일에 실패한다. `typescript@5.9.3`으로 양쪽을 실제로 컴파일해 확인했다 `[실측 — 이 개정에서 tsc 실행]`. 그래서 §3.6·§3.7이 두 요약을 alias로 선언하고, §5.2가 형제의 `run` 시그니처를 로컬 `declare`로 재현해 이 접합을 타입으로 고정한다. **구현자가 습관적으로 interface로 되돌리는 순간 조용히 깨지는 종류의 계약이다.**

### 3.9 `./testing`

```ts
/**
 * What the contract cases drive. A host implements it by wiring its own three
 * stores plus thin adapters over its publisher and account lifecycle, so the
 * obligations that live outside `NotificationRelayStore` - I1-I3 (ingress) and
 * L1-L4 (lifecycle) - are checkable against a real implementation rather than
 * only against ours.
 */
export interface NotificationStoreSuite {
  readonly relayStore: NotificationRelayStore;
  readonly deliveryStore: NotificationDeliveryStore;
  readonly endpointStore: NotificationEndpointStore;
  /** Runs the host's publisher inside its own transaction. Checks I1-I3, and so G1. */
  stage(command: NotificationCommand): Promise<NotificationStageResult>;
  /** Runs the host's account lifecycle for one recipient. Checks L1-L4, and so G7. */
  tombstoneRecipient(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
  }): Promise<void>;
  /** Registers or refreshes an endpoint and returns what `listEnabled` would observe. */
  registerEndpoint(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly provider: string;
    readonly address: string;
  }): Promise<ObservedNotificationEndpoint>;
  setCategoryEnabled(input: {
    readonly applicationKey: string;
    readonly recipientRef: string;
    readonly category: string;
    readonly enabled: boolean;
  }): Promise<void>;
}

export interface MemoryNotificationStores extends NotificationStoreSuite {
  snapshot(): MemoryNotificationSnapshot;
}

/**
 * Never use in production: no durability, no cross-process atomicity.
 *
 * It implements the same `stage`, `tombstoneRecipient` and `registerEndpoint`
 * seams a host wires over its own adapters, so our own unit suite and a host's
 * conformance run enter through one door (design 5.4).
 */
export function memoryNotificationStores(runtime?: NotificationRuntime): MemoryNotificationStores;

export function fakeNotificationRuntime(options?: { readonly now?: Date | undefined }): NotificationRuntime & {
  advance(ms: number): void;
  /** Runs every deferred callback synchronously. */
  flush(): void;
};

export function recordingNotificationLogger(): NotificationLogger & { readonly entries: readonly LogEntry[] };

/**
 * Batch-unaware presenter for tests only: it passes the seed command's content
 * through unchanged, which is wrong copy for any merged batch. Production hosts
 * write their own — that is why the library ships no default (design 0.2-2).
 */
export function passthroughPresenter(): NotificationPresenter;

export type NotificationObligation =
  | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6' | 'R7' | 'R8' | 'R9' | 'R10' | 'R11' | 'R12' | 'R13'
  | 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'D6' | 'D7' | 'D8' | 'D9'
  | 'I1' | 'I2' | 'I3'
  | 'L1' | 'L2' | 'L3' | 'L4';

export interface StoreContractCase {
  /** e.g. `'R11: a losing createDelivery reports created:false, never throws'`. */
  readonly name: string;
  readonly obligation: NotificationObligation;
  /**
   * The factory returns the suite under test. Typed as `NotificationStoreSuite`
   * and not as `MemoryNotificationStores`, because the point of these cases is
   * a host's own implementation: narrowing the parameter to the in-memory type
   * would make the whole array a self-test toy.
   */
  run(factory: () => NotificationStoreSuite | Promise<NotificationStoreSuite>): Promise<void>;
}

/**
 * The executable form of R1-R13, D1-D9, I1-I3 and L1-L4. Deliberately
 * framework-free: it returns cases instead of calling `describe`/`it`, so a
 * host drives them from vitest, jest or `node:test`.
 */
export function notificationStoreContractCases(options?: {
  /** Skip obligations an implementation legitimately cannot support, with a reason. */
  readonly skip?: readonly NotificationObligation[] | undefined;
  /** Concurrent calls the R1/R11 burst cases issue. Default 8; needs a pool of >= 2. */
  readonly concurrency?: number | undefined;
}): readonly StoreContractCase[];
```

- `HostStores`라는 이름은 초안의 시그니처에 등장했지만 **어디에도 정의되지 않았다**. 그 자리를 `NotificationStoreSuite`가 채운다 — 호스트가 자기 구현을 넣는 유일한 입구이고, §1-3("호스트의 Prisma 구현이 계약을 만족하는지는 우리 케이스로 판정된다")·§5.4·§7-2·AGENTS.md §4의 handoff 검증이 전부 이 타입 하나에 걸려 있다.
- `stage`·`tombstoneRecipient`가 스위트에 있는 이유는 **I1–I3과 L1–L4가 저장소 포트에 없기 때문**이다. 초안에서는 이 둘이 인메모리 헬퍼(`stage`)이거나 아예 없었고(`tombstone`), 그래서 G1과 G7 — 이 패키지의 첫 보증과 유일한 "개인정보 사고" 등급 보증 — 이 호스트 구현에 대해 **한 줄도 검사되지 않았다**.

---

## 4. 오용 차단

**검증 방법 열은 빈칸을 남기지 않는다.** 형제 문서에는 타입안전 대표 주장이 실측으로 거짓 판명된 전례가 두 건 있다 `[형제 — expo-media §0.3 V3, expo-workouts §0 V2]`. 아래는 **설계 시점의 예측**이며, `[검증필요]` 행은 구현 1단계에서 `typescript@^5` + 루트 `tsconfig.base.json` 플래그(strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)로 실제 픽스처를 돌려 확정한다.

| # | 오용 시나리오 | 차단 장치 | 픽스처 · 검증 방법 |
|---|---|---|---|
| 1 | **빠른 경로만 배선하고 주기 실행자를 안 붙인다** (§0.3-①) — 배치·예약·조용시간 알림이 영원히 안 나간다 | 타입으로 못 막는다. `request(): void`의 반환 타입 + JSDoc + README 최상단 경고 + 모듈 옵션 이름(`wakeup.enabled`)이 "보조"임을 말한다 | unit: `wakeup.request()`만 호출한 상태에서 시계를 12시간 전진 → 배치 배달이 미배달로 남음을 **테스트로 고정**(라이브러리가 이 사실을 알고 있다는 증거) |
| 2 | 저장소를 "조회 후 갱신"으로 대충 구현 → 두 워커가 같은 행 처리 | 타입으로 불가능 → **적합성 케이스**가 런타임에 잡는다 | `notificationStoreContractCases()` R1: 동시 `claimDue` 2회 → 두 결과의 id 교집합이 공집합 |
| 3 | claim과 presentation lock을 두 문장으로 나눔(D1) | 적합성 케이스 D1 | claim 직후 `mergeIntoBatch` 시도 → 반드시 `false` |
| 4 | 중복 stage가 알림을 복제 | I1 유니크 + conflict-safe 삽입 | 적합성 케이스 **I1**: 같은 `eventKey` 2회 stage → 행 1개, 두 번째 `staged: false`, 예외 없음. **케이스는 `NotificationStoreSuite.stage`를 통해 호스트의 publisher 어댑터에 닿는다** — 초안은 이 의무를 `NotificationRelayStore`(staging 메서드가 없는 포트)에 걸고 인메모리 헬퍼로만 검사했고, 그래서 G1이 호스트 구현에 대해 검사되지 않았다(§3.3.6) |
| 5 | 유니크 위반을 `try/catch`로 잡고 같은 트랜잭션에서 재조회 | 포트 시그니처가 애초에 예외를 요구하지 않는다(`appendItem`이 `boolean` 반환) | 적합성 케이스 R4 + README가 PostgreSQL의 abort 동작을 명시 |
| 6 | 라이브러리가 한국어(또는 영어) 카피를 배포 | `presenter`가 **필수 옵션** | `@ts-expect-error`: `createNotificationDispatcher({ …presenter 누락 })` `[검증필요]` + 가드: **주석·JSDoc을 제거한 뒤** `src/**`의 문자열 리터럴만 스캔해 비ASCII 0(§5.3 — §1-9가 소스 전역에 한국어 설계 주석을 요구하므로 이 한정이 없으면 가드가 자기 소스를 잡는다) |
| 7 | 시간대를 잊고 서버 로컬 시간에 기대기 | `timeZone`이 **필수 필드**, 기본값 없음 | `@ts-expect-error`: `createQuietHoursPolicy({ quietHours: … })` `[검증필요]` + unit: 알 수 없는 zone → `ERR_NOTIFICATION_TIMEZONE_INVALID` |
| 8 | 24시간을 나누어떨어지지 않는 배치 창(예: 7분) | 조립 시점 `ERR_NOTIFICATION_POLICY_INVALID` | unit: 7분·0·음수·`Number.MAX_SAFE_INTEGER` 전수 거부, 10분·1시간·6시간 통과 |
| 9 | 조용시간을 `{ startHour: 22, endHour: 22 }`로 줘서 24시간 침묵 | 조립 시점 거부(같은 값 = 빈 구간인지 종일인지 모호) | unit: 동일 값 거부 · `0..23` 밖 거부 · 정수 아님 거부 |
| 10 | 로컬 형태 검사 실패를 provider 확인으로 오인해 살아 있는 기기를 영구 비활성화(§0.3-⑤) | 결과 타입이 두 배열로 **분리** + 기본값이 보수적 | type: `NotificationPushResult`에 두 필드 모두 필수 · unit: 형태 거부 endpoint가 `disable` 인자에 없음 |
| 11 | ticket 응답이 짧은데 성공으로 취급 | `classifyExpoPushTickets`가 길이 불일치 시 `accepted: false` | unit: 3요청/2티켓 → `accepted: false`, 이미 확인된 무효 endpoint는 그대로 반환 |
| 12 | SDK 청킹 결과를 순서로 재대응(§0.3-④) | 청크가 `{ endpoint, message }` 쌍을 들고 다닌다 — 대응이 자료구조 | type: `chunkExpoPushMessages`가 `ExpoPushMessage[][]`가 아니라 `ExpoPushEntry[][]`를 반환 `[검증필요]` |
| 13 | `applicationKey`를 API 호출자가 정하게 함 | 라이브러리는 값을 만들지 않고 모듈 옵션으로만 받는다 + JSDoc 경고 | 가드: `src/**`에 `process.env` 0 — **파일 예외 없음**. §1-2의 나열에서 `process.env`를 빼고 §5.3의 ambient-runtime 가드에서도 `runtime.ts` 예외를 주지 않아, 두 절과 이 행이 **하나의 규칙**을 말하게 했다(초안에서는 §1-2·§5.3이 "runtime.ts 안에서만 허용", 이 행이 "전면 금지"로 갈렸다). README가 "클라이언트 입력에서 오면 안 되는 값"을 명시 |
| 14 | ESSENTIAL을 선호도로 억제 | 릴레이가 NORMAL에만 게이트를 적용 | unit: 비활성 카테고리 + ESSENTIAL → `relayed`(소스 스펙 이식) |
| 15 | ESSENTIAL이 NORMAL 배치에 갇힘 | `batchPolicyKey`가 priority를 포함 + 릴레이가 ESSENTIAL을 단독 배달로 | unit: 같은 `batchKey`의 NORMAL/ESSENTIAL → 배달 2개, ESSENTIAL의 `deliverAfter`가 즉시 |
| 16 | 늦은 배치 항목이 조용히 사라짐 | follow-up 라우트(F10) | unit: 병합 실패 → 별도 배달 생성, `sourceOutboxId`가 다르면 키도 다름 |
| 17 | 삭제된 수신자에게 알림 도착 | I2(staging 게이트) + L1–L3(삭제 트랜잭션의 단일성·순서·tombstone 존속) + R7(릴레이 행 잠금) | unit: 트랜잭션 안 `readCommand()`가 `null` → `no-longer-live`, 저장소 쓰기 0 · 적합성 케이스 **L1·L2**: 릴레이와 purge를 양쪽 순서로 교차 → 생존 배달·메시지 0 · **L3**: purge 후 `ensureLive` → false. R7만으로는 삭제 쪽에 아무 의무가 없어 이 오용을 막지 못했다(§3.1.2 "G7의 근거를 정정한 이력") |
| 18 | 예외 메시지가 DB/로그/HTTP로 유출 | `safeErrorCode`만 저장, 로거에는 `error.name` | unit: 비밀 문자열을 담은 예외 → 저장된 값·로그 필드에 그 문자열 없음 |
| 19 | 소비자가 internal 모듈 deep import | exports 맵 4엔트리 + `./package.json` | `release-artifact.test.ts`가 exports 표면 고정 |
| 20 | `.`와 `./core`를 CJS로 동시 require해 `instanceof`·토큰 동일성이 깨짐 | `isNotificationsError()` 정본화 + `Symbol.for` 토큰 | unit: 두 경로에서 만든 에러 모두 가드 참 · 토큰 `===` `[검증필요 — §2.5]` |
| 21 | EOP 소비자가 `string \| undefined`를 옵셔널 필드에 전달 | 전 옵셔널 필드 `?: T \| undefined`(§1-8) | type: `actorRef: maybeActor` 통과 `[검증필요]` |
| 22 | 닫힌 유니언을 부분 처리 | `NotificationPriority`·`NotificationTiming`·`NotificationRelayOutcome` 전수 스위치 | type: 누락 시 `never` 할당 실패 `[검증필요]` |
| 23 | 저장소가 `createDelivery`를 `ON CONFLICT DO NOTHING` + `SELECT`로 만들고 릴레이가 그 id에 항목을 붙임 → **잠긴 배달에 묶여 알림 유실** | 반환 타입이 `{ id, created }`이고 R11이 `created: false`의 처리를 규정 | 적합성 케이스 R11: 같은 배치 정체성으로 `createDelivery` 2회 → 두 번째가 **던지지 않고** `created:false` + 같은 id, `batchCount` 불변 · unit: `created:false` + 잠긴 배달 → follow-up 배달 생성, 항목이 잠긴 배달에 **붙지 않음**(F11) |
| 24 | 저장소가 stale 컷오프를 **호출자가 준 순간**으로 비교 → 시계 스큐가 신선한 claim을 탈취 | 요청이 순간이 아니라 기간(`claimStaleMs`)을 나른다 — 순간을 넘길 필드가 **타입에 없다** | type: `RelayClaimRequest`에 `staleBefore`가 없음 `[검증필요]` · 적합성 케이스 R12: claim 직후 `claimStaleMs: 0`으로 재claim → 회수됨 / 큰 값 → 회수 안 됨. 두 호출이 **호출자 시각을 하나도 안 넘기고** 그 결과를 낸다 |
| 25 | 전송 중 재등록한 기기를 무효 ticket으로 영구 비활성화 | `listEnabled`가 리비전을 동반 반송하고 `disable`이 그것을 조건으로 씀(D6) | 적합성 케이스 D6: `listEnabled` → 같은 주소 재등록 → 관측한 리비전으로 `disable` → **여전히 enabled** · 재등록 없이 같은 순서 → disabled |
| 26 | 영구 실패 배달이 페이지를 점유해 건강한 알림이 굶음 | `attempts` 노출 + `maxAttempts` 필터(R13·D9) | unit: poison 배달 1건 + 정상 9건, `maxAttempts: 3` → 4번째 패스부터 정상 9건이 전부 처리됨. `maxAttempts` 미설정이면 **굶는다**는 것도 같은 파일에서 단언한다(라이브러리가 이 사실을 알고 있다는 증거 — §4-1과 같은 기법) |
| 27 | 요약 타입을 `interface`로 선언 → 잡 어댑터 레시피가 컴파일 불가 | `NotificationRelaySummary`·`NotificationDispatchSummary`를 **type alias**로 선언 | type: 형제의 `run(input, context): Promise<Record<string, unknown> \| void>`를 로컬 `declare`로 재현해 `() => Promise<NotificationRelaySummary>`가 대입되는지 검사 `[실측 — interface는 TS2322 "Index signature for type 'string' is missing", alias는 통과. typescript@5.9.3]` |
| 28 | `send`를 화살표 프로퍼티로 선언 → SDK 함수가 대입 안 됨 | 메서드 문법(파라미터 양변 비교) | type: expo-server-sdk 미설치 상태에서 `declare const sdkSend: (m: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>` → `createExpoPushGateway({ send: sdkSend, defaultTitle: null })` 컴파일 `[실측 — 화살표 프로퍼티는 TS2322 readonly/mutable 불일치, 메서드는 통과]` |
| 29 | 호스트가 삭제를 tombstone과 **다른 트랜잭션**에서, 또는 배달을 ingress보다 먼저 지움 | L1–L4를 번호 붙은 의무로 승격 + 두 포트의 JSDoc | 적합성 케이스 L1·L2: 릴레이 트랜잭션과 purge를 **양쪽 순서로** 교차 실행 → 생존 배달·메시지 0 · L3: purge 후 `ensureLive` → false |
| 30 | 호스트가 적합성 케이스를 자기 스토어가 아니라 인메모리에만 돌림 | `run(factory)` 파라미터가 `NotificationStoreSuite` — 3스토어 + `stage` + `tombstoneRecipient`를 가진 **호스트 객체가 통과한다** | type: 인메모리 타입을 전혀 언급하지 않는 객체 리터럴이 `run`에 들어감 `[검증필요]` + README가 "이 루프 6줄을 자기 스토어 테스트에 넣는다"를 명시 |

`[검증필요]`가 **7행** 남아 있다는 사실 자체를 남긴다(초안은 6행을 7행이라 적었고, 여기서 24·30이 추가돼 실제로 8행이 됐다가 두 건이 실측으로 닫혀 7행이다) — 형제 두 문서가 "타입으로 막힌다"는 미검증 주장으로 틀렸던 전례가 있으므로, 구현 착수 시 이 7개가 첫 작업 항목이다. **27·28은 이 개정에서 `typescript@5.9.3`으로 실제 컴파일해 닫았다**: 둘 다 초안의 형태(`interface` 요약, 화살표 `send`)로는 **거짓**이었고, 그래서 §3.6·§3.7·§3.5의 선언 형태를 바꿨다. 형제 문서의 전례 두 건과 정확히 같은 종류의 오류였으므로, 이 문서에서 미검증으로 남은 7행도 같은 방식으로 처리해야 한다.

## 5. 테스트 전략

CLAUDE.md 3계층 중 **integration은 없다** — 네트워크·외부 시스템·DB가 0이다(저장소는 포트이고 인메모리 구현으로 검증한다). 대신 guard·store-contract·packed-consumer를 unit 계층과 릴리스 게이트에 둔다. 소스의 `test/notifications/**` 2,336줄이 **무엇을 보장하려 했는지의 정본**이며, 아래는 그 중 라이브러리 계약에 해당하는 것을 이식한 목록이다.

### 5.1 unit (`pnpm test`, 네트워크 0)

**정책 — 이 패키지에서 가장 촘촘해야 할 곳** (`fakeNotificationRuntime` + zone 픽스처):

- **KST 회귀**: `Asia/Seoul` + 22–08 + 10분 창에서 소스 스펙 6케이스와 **비트 동일** 결과(`docs` 이관 호환성). 예: `2026-08-18T13:00:00Z`(KST 22:00) NORMAL → `2026-08-18T23:00:00Z`.
- **DST 전진(갭)**: `America/New_York` 2026-03-08, 조용시간 종료 02:00을 설정 → 02:00이 존재하지 않음 → 갭 직후(03:00 EDT)로 릴리스.
- **DST 후퇴(중복)**: 같은 zone 2026-11-01, 종료 01:00이 두 번 존재 → **이른 쪽**.
- **비정시 offset**: `Asia/Kathmandu`(+05:45)에서 10분 창 경계가 로컬 자정에 정렬되는지 — epoch 격자였다면 :05/:15가 됐을 지점.
- **30분 DST**: `Australia/Lord_Howe`(+10:30/+11:00)에서 창 단조성 — 어떤 창의 `startedAt`도 이전 창보다 이르지 않다.
- **하루 경계 클리핑**: 6시간 창 + DST 23시간 날 → 마지막 창이 짧고 자정을 넘지 않는다.
- **ESSENTIAL 무홀드**: 조용시간 한가운데의 ESSENTIAL은 `now` 그대로.
- **과거 `SCHEDULED`**: `now`로 접힌다.
- **미래 `SCHEDULED` + 조용시간**: 요청 시각이 조용시간이면 그 시각 기준으로 다시 홀드된다(소스 동작).
- **정책 옵션 검증**: §4-8·9 전수.
- **배치 라우트 키**: 카테고리·우선순위·타이밍 4조합이 전부 다른 키(소스 스펙 이식) + follow-up 키의 충돌 없음.

**릴레이** (`memoryNotificationStores`): 소스 relay 스펙 11케이스 전수 이식 — claim→배달/항목 1쌍 · NORMAL 선호도 억제 · ESSENTIAL 무시 · 명시적 창 컬럼 · ESSENTIAL이 배치 밖 · 예약 배치 라우트 분리 · 배달된 배치에 늦은 항목 → follow-up · 실패한 푸시로 잠긴 배치에도 follow-up · 삭제 경쟁 시 미생성 · 익명화된 actor 반영 · 소스 항목 존재 시 멱등 재생.

**디스패처**: 소스 dispatch/fan-out 스펙 20케이스 전수 이식(§3.7의 5종 포함) + `disableRejectedEndpoints` 기본 false 검증 + 우선순위 미지원 값이 페이지 전체를 죽이지 않음.

**실패 행렬 F1–F12**: 각 지점에서 인메모리 저장소가 예외를 던지도록 주입하고 **두 번째 패스의 결과**를 단언한다. 이 표가 문서에만 있고 테스트에 없으면 계약이 아니다. F11(같은 배치 정체성의 두 outbox 행이 동시에 도달)과 F12(영구 실패 행의 굶김)는 초안에 없던 행이며, 각각 R11·R13이 없으면 **에러 없이 알림이 사라진다**는 사실을 테스트가 직접 보인다.

**시도 상한과 굶김**: poison 배달 1건 + 정상 9건을 `pageSize: 10`으로 돌린다. `maxAttempts: 3`이면 4번째 패스에서 정상 9건이 전부 처리되고, `maxAttempts` 미설정이면 **정상 9건이 매 패스 처리되지 못한다**(§4-26). 두 번째 단언은 라이브러리가 이 실패 모드를 알고 있다는 증거로 남긴다.

**Expo 헬퍼**: 청크 경계(99·100·101·250) · 빈 입력 · 커스텀 `chunkSize` · ticket 분류 5종(전부 ok / DeviceNotRegistered / 기타 에러 / undersized / 빈 응답) · `isExpoPushToken` 케이스 표(`ExpoPushToken[xxx]` · `ExponentPushToken[xxx]` · 대소문자 · 괄호 없음 · 빈 문자열 · 공백 포함) · `send` 거부 시 `accepted:false` · `continueAfterChunkFailure` 양쪽.

**수신자 키**: 소스 스펙 6케이스 이식(소문자 64자 · 결정성 · 앱 간 분리 · 수신자 간 분리 · 콜론 형태 위장 불가 · 빈 ref 허용) + **NUL 거부 2케이스**(§0.2-⑤) + 알려진 벡터 1개로 **digest 비트 동일성** 고정.

**wakeup**: 소스 스펙 9케이스 전수 이식하되 **실시간 대기 없이** `fakeNotificationRuntime.flush()`로 — 버스트 접기 · 호출자 스택 무작업 · relay 0건이면 dispatcher 미호출 · 실패 삼킴 · 비-Error 거부 시 `unknown-error` · 실패 후 재사용 가능 · `enabled: false`면 완전 무동작 · §4-1의 "배치가 안 나간다" 케이스.

**에러/로거**: `safeErrorCode` 길이 절단·비-Error·문자열 던지기 · `isNotificationsError` 이중 로드 시뮬레이션.

### 5.2 type (`pnpm test:types`)

`expectTypeOf` + `@ts-expect-error` — §4 표의 타입 항목 전부. 추가로:

- `NotificationPublisher<Tx>`의 `Tx` 추론: Prisma 유사 트랜잭션 타입을 넣었을 때 `stage`의 첫 인자가 정확히 그 타입.
- `NotificationTiming` 판별 유니언 좁힘(`mode === 'SCHEDULED'`일 때만 `at` 접근 가능).
- `NotificationAction`의 인덱스 시그니처가 `undefined`를 허용해 EOP 소비자를 막지 않는지.
- 저장소 포트 구조적 적합: 4메서드 구현체 통과, `completeClaim` 누락은 `@ts-expect-error`.
- **잡 어댑터 접합** — "대입 가능"이 아니라 **실제 접합 형태**로 검사한다. 형제를 import하지 않고 로컬에 시그니처를 재현한다:

  ```ts
  type JobSummaryLike = Record<string, unknown>;
  declare const relayRun: () => Promise<NotificationRelaySummary>;
  const asJobRun: (input: never, context: never) => Promise<JobSummaryLike | void> = relayRun;
  void asJobRun;
  ```

  `NotificationDispatchSummary`도 같은 형태로. §0.4-③의 구조적 호환을 **타입으로 고정**하는 자리이며, 요약을 `interface`로 되돌리면 여기서 `TS2322`로 깨진다 `[실측]`.
- **Expo 게이트웨이 콜백 접합** — expo-server-sdk를 설치하지 않은 채 형태만 세워 검사한다(형제 §3.7이 google-auth-library에 쓴 기법 `[형제]`):

  ```ts
  declare const sdkSend: (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;
  createExpoPushGateway({ send: sdkSend, defaultTitle: null });
  ```

  §2.2-C의 "SDK 한 줄" 주장을 닫는 유일한 픽스처다.
- **적합성 스위트 seam** — `relayStore`·`deliveryStore`·`endpointStore` + `stage`·`tombstoneRecipient`·`registerEndpoint`·`setCategoryEnabled`만 가진 **호스트 객체**가 `StoreContractCase.run`의 팩토리로 통과한다. 인메모리 타입을 언급하지 않는 것이 요점이다(§4-30).
- **claim 요청에 순간이 없다** — `RelayClaimRequest`·`DispatchClaimRequest`에 `staleBefore` 같은 컷오프 `Date` 필드가 없음을 `@ts-expect-error`로 고정(R12·D8이 타입으로도 강제되게).
- `.` 배럴이 코어 **런타임 값**을 재수출하지 않음: `expectTypeOf<typeof import('../../src/index')>`에 `createNotificationRelay`가 없음을 단언(§2.1).

### 5.3 guard (unit 계층 — 아키텍처 불변식의 정적 강제)

`format` §5.3 · `nest-operations-jobs` §5.3 선례 `[형제]`.

- **peer-graph**: `src/core/**`·`src/expo/**` 소스와 `dist/core.{js,cjs}`·`dist/expo.{js,cjs}`에 `@nestjs`·`rxjs`·`reflect-metadata` 문자열 0.
- **transport-free core**: `src/core/**`와 `dist/core.*`에 `expo`·`Expo`·`exp.host` 문자열 0. §2.1의 서브패스 분리가 마케팅이 아니라는 유일한 기계적 증거다.
- **dependency-free expo**: `src/expo/**`에 `import`가 `../core/*` 타입 외에 0. `expo-server-sdk` 문자열 0.
- **ambient-runtime**: `src/**`에서 `new Date(`·`Date.now(`·`setTimeout(`·`setInterval(`·`randomUUID`는 `src/core/runtime.ts` 밖에서 금지. **`process.env`는 `runtime.ts`를 포함해 `src/**` 전면 금지**(예외 파일 없음) — §1-2·§4-13과 같은 규칙 하나다. 초안은 §1-2·§5.3이 "runtime.ts 안에서만 허용", §4-13이 "전면 금지"로 갈려 있었고, 구현하면 서로 다른 두 가드가 됐을 것이다. 이 패키지의 `runtime.ts`는 실제로 환경을 읽지 않으므로 전면 금지가 실태에도 맞다.
- **no-product-strings**: `src/**`에 `memorylog`·`MemoryLog`·`Asia/Seoul`·`KST`·`EXPO_ACCESS_TOKEN` 문자열 0, 그리고 **비ASCII 문자열 리터럴 0**. **스캔 대상은 주석과 JSDoc을 제거한 뒤 남은 문자열 리터럴뿐이다** — §1-9가 `src/**` 전역에 한국어 설계 주석을 요구하므로 이 한정이 없으면 가드가 자기 소스를 잡는다. 구현은 TypeScript 스캐너로 토큰화해 `StringLiteral`·`NoSubstitutionTemplateLiteral`·템플릿 조각만 검사한다(정규식으로 주석을 지우는 방식은 문자열 안의 `//`에서 틀린다).

### 5.4 store contract (unit 계층 — 포트 계약의 실행 가능한 형태)

`notificationStoreContractCases()`를 `memoryNotificationStores()`에 돌린다. R1–R13·D1–D9·I1–I3·L1–L4 각각 최소 1케이스, 총 35개 내외. 특히:

- R1: 동시 `claimDue` 2회 → id 교집합 공집합 / 완료된 행 재claim 안 됨.
- R2: 신선한 claim은 회수 안 됨 / stale 임계 초과 시 회수됨.
- R4: 중복 `appendItem`이 **예외 없이** false.
- R6: claim된 배치 병합 시도 → false, 저장 상태 불변.
- R7: 트랜잭션 안에서 소스 행이 사라졌을 때 `readCommand()`가 `null`.
- R8·D3: 두 번째 완료 → false, 저장된 결과 불변.
- **R11**: 같은 배치 정체성으로 `createDelivery` 2회 → 두 번째가 **던지지 않고** `{ id: 첫 번째와 동일, created: false }`, `batchCount`·`batchItemCount` 불변. 동시 버스트(기본 8) 버전도 함께 — 정확히 하나만 `created: true`.
- **R12**: 호출자 시각을 **하나도 넘기지 않고** `claimStaleMs: 0` → 방금 만든 claim이 회수되고, 충분히 큰 값 → 회수되지 않는다. 저장소가 자기 시계로 판정한다는 것의 실행 가능한 형태다.
- **R13**: `attempts`가 claim마다 증가하고 반환값에 실린다 / `maxAttempts` 초과 행은 due에서 빠진다 / `createdAt`은 재claim·완료 후에도 불변.
- D1: `claimDue` 직후 그 배달의 `presentationLockedAt`이 이미 설정됨.
- D2: `ensureMessage` 2회 → 같은 id, 행 1개.
- D5: 미래 `deliverAfter`는 반환되지 않음.
- **D6**: `listEnabled` → 같은 주소로 `registerEndpoint` 재호출 → 앞서 관측한 리비전으로 `disable` → **여전히 enabled**. 재등록 없이 같은 순서면 disabled. 리비전 불일치가 **오류가 아님**도 함께 단언한다.
- **I1**: 같은 `eventKey`로 `stage` 2회 → 행 1개, 두 번째 `staged: false`, **예외 없음**. 이 케이스는 스위트의 `stage`를 통해 **호스트의 publisher 어댑터에** 닿는다 — 초안처럼 인메모리 헬퍼에만 있으면 G1이 호스트에 대해 검사되지 않는다.
- **I2**: `tombstoneRecipient` 이후 `stage` → `{ id: null, staged: false, discarded: true }`, 행 0.
- **L1·L2**: 릴레이 트랜잭션과 purge를 **양쪽 순서로** 교차 실행한다. (a) purge 먼저 커밋 → 릴레이가 `no-longer-live`, 배달 0. (b) 릴레이가 트랜잭션을 연 뒤 purge 시작 → purge의 ingress 삭제가 블록됐다가, 릴레이 커밋 후 이어지는 delivery·message 삭제가 방금 만들어진 행까지 지운다 → 최종 생존 배달·메시지 **0**. 이 케이스가 G7의 유일한 실행 가능한 증거다.
- **L3**: purge 이후 `ensureLive` → false (tombstone 행이 남아 있어야만 성립).

**이 배열이 곧 호스트 구현의 인수 조건이다.** README가 "호스트는 자기 스토어 테스트에 이 루프 6줄을 넣는다"를 명시하고, 핸드오프 문서가 그 실행 증거를 요구한다(AGENTS.md §4). **인수 조건에 ingress와 계정 삭제가 포함된 것이 초안과의 가장 큰 차이다** — 그 둘이 빠져 있으면 이 패키지의 첫 보증(G1)과 유일한 "개인정보 사고" 등급 보증(G7)이 호스트 구현에 대해 한 줄도 검사되지 않는다.

### 5.5 release artifact / packed consumer

- `tests/unit/guards/release-artifact.test.ts`: `files: ['dist']`, exports 4엔트리 + `./package.json`, peer 3종 정확 일치, `peerDependenciesMeta` **부재**, `dependencies` 필드 **부재**, `scripts.build`/`prepack` 배선, 루트 provenance 스크립트 존재.
- `scripts/check-nest-notifications-consumer.mjs`(루트 신설 — §8): `npm pack` 후 Nest 10·11 픽스처에 설치해 ① ESM `import`와 CJS `require`로 4엔트리 해석, ② `NestFactory.createApplicationContext`로 `NestNotificationsModule.forRoot` 부팅, ③ 인메모리 저장소 + **`fakeNotificationRuntime({ now })`로 시각을 고정한 채** 명령 1건을 stage → relay → dispatch까지 돌려 가짜 게이트웨이가 payload를 받는지 확인. 시각을 고정하므로 **조용시간 홀드와 배치 창 경로까지 릴리스 게이트에서 실제로 실행된다**(이것이 `NestNotificationsOptions.runtime` 통로가 필요한 두 번째 이유다), ④ `dist/gj-kit-provenance.json` 존재 확인, ⑤ **no-nest 픽스처** — `node_modules/@nestjs`·`rxjs`·`reflect-metadata`를 지운 뒤 `require('@gj-kit/nest-notifications/core')`로 릴레이·디스패처를 만들어 명령 1건을 처리한다. §2.1의 "Nest 없는 워커·람다" 주장을 **모듈 그래프 계층에서** 증명하는 유일한 실행이며, 설치 계층의 비용(§7-13)은 이 테스트로도 없어지지 않는다. 형제 `check-toss-payments-consumer.mjs` 구조 복제 `[형제]`, ⑤는 형제 `nest-operations-jobs §5.5-⑥`과 같은 기법 `[형제]`.

### 5.6 README (`check:readme`)

`format/scripts/check-readme.mjs`를 개조한다 `[형제 — 전문 실측]`. 다른 점: `paths` 매핑이 4개(`@gj-kit/nest-notifications`·`/core`·`/expo`·`/testing`)이고, `lib: ['ES2022']`에 `types: ['node']`를 허용한다(서버 패키지이므로 `crypto`·`process` 예제가 정당하다).

README 필수 내용:

1. **최상단 배달 계약 요약** — §3.1.1 한 문장 + "중복 푸시는 명시된 비용, inbox는 중복되지 않는다".
2. 5분 배선 — 모듈 `forRoot` + 정책 + presenter + 게이트웨이 + 주기 실행자.
3. **저장소 구현 가이드** — R1–R13·D1–D9·I1–I3·L1–L4 표 재게재 + PostgreSQL DDL(유니크 5종 + `attempts`·endpoint `revision` 컬럼 포함) + Prisma 구현 60줄 + 적합성 케이스 루프 6줄. README에서 가장 길어야 할 절.
4. 정책 레시피 — `Asia/Seoul` 22–08 · UTC 무조용시간 · 수신자별 시간대 구현체 20줄.
5. presenter 레시피 — 한국어/영어 두 벌(**소비 앱 코드로**).
6. Expo 배선 — expo-server-sdk 1줄 버전과 `fetch` 15줄 버전 둘 다.
7. 주기 실행자 배선 — `@gj-kit/nest-operations-jobs` 12줄 · `@nestjs/schedule` 8줄 · Cloud Scheduler HTTP 컨트롤러 10줄 (셋 다 호스트 코드).
8. 계정 삭제 배선 — `NotificationAccountLifecycle` 구현 순서(tombstone → ingress → delivery → message → endpoint → preference)와 그 순서의 이유. **이 절은 L1–L4를 재게재하고 "이것은 권장이 아니라 의무"라고 적는다** — 초안에서는 이 순서가 README 항목으로만 존재해, 그것을 어긴 호스트도 모든 저장소 의무를 만족했다(§3.3.6).
9. `./core`만 쓰는 비-Nest 소비 예제 — §1-1이 마케팅이 아니라는 증거. 같은 절에 **설치 계층의 정직한 각주**를 단다: peer 3종은 required이므로 `./core`만 쓰는 프로젝트도 그것들을 설치하게 된다(로드는 하지 않는다 — §5.5-⑤가 증명). 이유는 §2.4.1, 잔존 리스크는 §7-13.

**외부 패키지를 참조하는 레시피는 import 없이 `declare` 구조 선언으로 쓴다.** `check:readme`는 ```ts 펜스를 **전량** 추출해 패키지 루트 아래 임시 디렉토리에서 컴파일하고 **스킵 마커가 없으며**, 작업 디렉토리가 패키지 루트 하위라 import는 그 패키지의 `node_modules`로 해석된다 `[형제 — format/scripts/check-readme.mjs 전문 실측]`. 그런데 §2.4의 devDependencies에는 `@gj-kit/nest-operations-jobs`·`@nestjs/schedule`·`expo-server-sdk`·`@prisma/client`가 **없고, 넣지 않는다**(§2.4 — 넣으면 §0.4-③의 형제 결합이 devDependencies 계층으로 되살아나고 §2.2-C의 "미탑재" 서사가 흐려진다). 따라서 위 3·6·7의 레시피는 다음 형태로 쓴다:

- 잡 어댑터(§3.8.2 참조): `declare function OperationsJobDefinition(): ClassDecorator;`
- `@nestjs/schedule`: `declare function Cron(expression: string): MethodDecorator;`
- Expo SDK: `declare const expo: { sendPushNotificationsAsync(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> };`
- Prisma: `declare const prisma: { $transaction<T>(fn: (tx: PrismaTxLike) => Promise<T>): Promise<T> };` + 필요한 모델 메서드만 갖는 `PrismaTxLike` 구조 선언

이 형태는 import 0으로 컴파일되면서 **어댑터의 형태를 고정**하므로, 포트 시그니처가 바뀌면 README가 깨진다. 동시에 "두 패키지 사이에 import는 한 줄도 없다"는 §0.4-③의 주장을 README가 스스로 증명한다. 형제가 google-auth-library에 같은 기법을 쓴다 `[형제 nest-operations-jobs §3.7]`. `ClassDecorator`·`MethodDecorator` 형태가 이 스크립트의 컴파일러 플래그(strict + `exactOptionalPropertyTypes` + `verbatimModuleSyntax` + `isolatedModules`, target ES2022, 데코레이터 설정 없음)에서 실제로 통과하는지는 이 개정에서 확인했다 `[실측 — typescript@5.9.3, EXIT 0]`.

## 6. 의도적으로 뺀 것

| # | 뺀 것 | 이유 · additive 경로 |
|---|---|---|
| 1 | **스키마·마이그레이션 소유** | §0.4-①. 정답은 형제 패키지(`@gj-kit/nest-notifications-postgresql`)이며, 그 패키지는 이 패키지의 포트를 구현하고 이 패키지를 **peer로** 잡는다(toss-payments ↔ toss-payments-postgresql 선례 `[형제]`). 0.1에서는 README DDL + 적합성 케이스 |
| 2 | inbox 조회·읽음·선호도 CRUD·엔드포인트 등록 API | §0.4-②. 호스트의 HTTP/도메인. 라이브러리가 주는 것은 파이프라인이 쓰는 포트 3종뿐 |
| 3 | Prisma 어댑터 4종 | §0.4-①. `./testing`의 인메모리 구현이 참조 구현 역할을 한다 |
| 4 | 어떤 언어의 카피도 | §0.2-②. presenter는 필수 포트 |
| 5 | `expo-server-sdk`(dep·peer·optional peer 전부) | §2.2. 전송은 콜백 |
| 6 | **endpoint 단위 전송 재개** (F4의 중복 완화) | 저장소에 "이 배달의 어떤 endpoint까지 접수됐는가" 컬럼이 필요하다 → 포트 확장 = 호스트 마이그레이션. 0.1의 계약(배달 단위 at-least-once)을 먼저 안정화하고, 요구가 실제로 생기면 `NotificationDeliveryStore.recordEndpointProgress?`를 **옵셔널 메서드로** 추가한다(additive) |
| 7 | Expo **receipt 폴링**(§0.3-②) | 별도 주기 잡 + receipt 저장소 + Expo 고유 재시도 정책이 필요하다. 0.1은 `classifyExpoPushTickets`가 `ticketIds`를 반환하는 데까지만 하고, 폴링 잡은 호스트가 쓴다. 요구가 모이면 `NotificationPushReceiptGateway` 포트로 additive |
| 8 | 재시도 백오프·큐·우선순위 스케줄링 | §0.4-⑦ |
| 9 | 배달 순서 보장 | §0.4-⑨ · §3.1 G8 |
| 10 | 수신자별 시간대 **내장 구현** | 인터페이스는 이미 그것을 허용한다(§3.2.2). 내장하려면 "수신자 시간대를 어디서 읽는가"라는 저장소 질문이 생기고, 그건 호스트의 사용자 테이블이다 |
| 11 | 이메일·SMS·웹훅 채널 | `NotificationPushGateway`는 provider 중립이라 이메일 어댑터도 형태상 가능하지만, 이메일은 endpoint 수명주기(무효 주소 판정·바운스)가 완전히 다르다. 억지 추상화 금지(AGENTS.md §1) |
| 12 | 조용시간의 "긴급 우회" 정책·수신 빈도 상한(rate limit) | 제품 정책. `holdPriorities`가 표현할 수 있는 만큼만 제공하고 나머지는 호스트 정책 구현체로 |
| 13 | OpenTelemetry·metrics 계측 | `NotificationLogger`가 구조화 필드를 내보내므로 호스트가 로그에서 파생시킨다. 두 번째 관측 표면은 요구가 생길 때 additive |
| 14 | A/B·개인화·템플릿 엔진 | presenter 포트 바깥. 라이브러리는 문장을 만들지 않는다 |
| 15 | **dead-letter 상태와 재시도 백오프 정책** | 재시도 소유자는 하나여야 한다(§0.4-⑦)는 결정은 유지한다. 다만 초안은 **시도 횟수 자체를 포트에서 지워** 호스트가 완화책을 만들 수단조차 없앴었다(소스는 `relayAttemptCount`·`dispatchAttemptCount` 컬럼을 유지하고 있었다 `[소스 — 실측]`). 0.1은 `attempts` 노출 + `maxAttempts` 필터까지만 한다(R13·D9). 소진 행을 어떻게 볼지·되살릴지는 호스트의 조회이며 라이브러리 표면이 아니다. 요구가 모이면 `deadLetteredAt` 종착 상태와 `completeClaim`의 종착 분기를 **옵셔널 필드로** 추가한다(additive) |
| 16 | **워커 시계 스큐 감지·보정** | R12·D8이 claim 판정을 저장소 시계 하나로 옮겨 스큐가 **정확성에 영향을 주지 않게** 만든다. 그 위에 "워커 시계가 저장소와 얼마나 벌어졌나"를 재는 표면을 더하면, 라이브러리가 관측 도구가 되고 그 값으로 무엇을 할지에 대한 정책까지 따라온다. 남는 노출(정책 시각이 워커 시계에서 온다)은 §7-15에 리스크로 적는다 |
| 17 | **endpoint 등록·해제 API** | §0.4-②. 라이브러리는 `listEnabled`/`disable`만 쓴다. 다만 D6이 `revision`을 요구하므로 **호스트의 등록 경로가 재등록 때 그 값을 반드시 바꿔야 한다**는 사실은 README 필수 절과 적합성 케이스 D6에 실린다 — 계약이 호스트 코드에 조건을 거는 몇 안 되는 지점이다 |

## 7. 잔존 리스크

| # | 리스크 | 완화 |
|---|---|---|
| 1 | **중복 푸시가 계약이다**(§3.1 G5·F3·F4·F6·F8) — 소비자가 이것을 버그로 신고할 것이다 | README 최상단 + `NotificationPushPayload.idempotencyKey` JSDoc + 실패 행렬 테스트. "inbox는 중복되지 않으므로 사용자가 두 번 보는 것은 배너뿐"이라는 문장이 세 곳에 같은 형태로 실린다 |
| 2 | **호스트 구현이 R1–R13·D1–D9·I1–I3·L1–L4를 어겨도 라이브러리는 모른다** — 스키마 비소유의 직접적 대가 | 적합성 케이스가 호스트 테스트 안에서 검사하고(§5.4), 그 케이스가 **닿는 범위**를 이 개정에서 넓혔다: 초안에서는 `run(factory)`의 파라미터가 인메모리 타입으로 좁혀져 있었고 staging·tombstone에는 포트가 아예 없어서, G1(첫 보증)과 G7(개인정보)이 호스트 구현에 대해 **검사 자체가 불가능**했다 — 즉 초안의 이 행은 "어겨도 모른다"가 아니라 "돌려도 모른다"였다. `NotificationStoreSuite`(§3.9)가 그 입구를 연다. 그래도 "케이스를 안 돌린 호스트"는 막지 못한다 — README 최상단 경고 + `memoryNotificationStores` JSDoc의 "프로덕션 금지" |
| 3 | **D1(claim + presentation lock 한 문장)은 SQL로만 표현된다** — 호스트가 두 문장으로 나누면 늦은 배치 항목이 사라지고, 증상은 "가끔 알림이 안 온다"는 가장 진단하기 어려운 형태다 | 적합성 케이스 D1이 정확히 이 실패를 잡고, 실패 메시지가 "claim UPDATE에 presentationLockedAt을 같이 써라"를 직접 말한다 + README DDL·쿼리를 복사 가능한 블록으로 |
| 4 | **`Intl` 의존** — Node 20+ full-icu 전제. small-icu 빌드에서는 알 수 없는 시간대가 조용히 UTC로 처리될 수 있다 `[unverified — 실측 필요]` | 조립 시점 zone 자기시험(형제 `format/src/zone.ts` 기법 `[형제]`) → 실패 시 `ERR_NOTIFICATION_TIMEZONE_INVALID`로 **부팅 실패**. README에 full-icu 권고. 실패 방향이 "조용한 오배달"이 아니라 "부팅 거부"가 되게 한다 |
| 5 | **DST 갭/중복 규칙이 제품 기대와 다를 수 있다** — "08:00에 보낸다"가 그날만 07:00 또는 09:00이 된다 | 규칙 3종을 계약으로 명시(§3.2.3) + 테스트로 고정. 다른 규칙이 필요한 호스트는 정책 인터페이스를 직접 구현한다(§3.2.2) |
| 6 | **자체 zone 산술이 형제 `format`과 갈라진다** — 같은 모노레포에 IANA 벽시계 코드가 두 벌 존재하게 된다(§0.4-⑤) | 의도적 중복이며 문서에 남긴다. 세 번째 소비자가 생기면 그때 내부 공유 패키지를 검토한다 — **공개 계약이 아니라 내부 구현으로**. 두 구현의 동치성은 각자의 테스트가 지킨다 |
| 7 | **stale 회수가 단일 처리 보장을 판다**(§3.3.5) — 멈췄던 워커가 깨어나면 두 워커가 같은 배달을 민다 | relay 쪽은 R4가 구조적으로 막는다. dispatch 쪽은 D2가 inbox를 지키고 남는 것은 중복 푸시(=리스크 1). `claimStaleMs`로 조정 가능 |
| 8 | **`applicationKey` 오설정** — 두 환경이 같은 키를 쓰면 스테이징이 프로덕션 사용자에게 알림을 보낸다 | 조립 시점 비어있음 검증 + README가 "환경마다 다른 값"을 명시. 라이브러리가 더 할 수 있는 것은 없다(값의 의미는 호스트 것) |
| 9 | **presenter 필수화가 이관 마찰을 만든다** — memorylog2는 지금 없는 파일을 하나 써야 한다 | README 레시피가 소스의 함수를 **그대로 붙여 넣을 수 있는 형태**로 싣는다(입출력 타입이 동일). 이관 비용 10줄 |
| 10 | **Nest 10/11 타입 차이** `[unverified]` — `DynamicModule`·`LoggerService` 시그니처가 메이저 간 동일한지 미확인 | packed consumer가 양쪽에서 실제 부팅한다(§5.5). 차이가 나오면 peer를 `^11`로 좁히는 것이 첫 릴리스에서 가장 싼 대응이다 |
| 11 | **`.`/`./core` CJS 이중 로드** `[unverified — §2.5]` | `isNotificationsError()` 정본화 + `Symbol.for` 토큰 + packed consumer가 CJS `require`로 양 엔트리를 실제 실행 |
| 12 | **`memoryNotificationStores`가 프로덕션에 들어간다** — 이름과 서브패스로 막았지만 막을 수 없는 사용자는 있다 | `./testing` 서브패스 + JSDoc 경고 + 생성 시 `logger.warn` 1회. 그 이상은 하지 않는다(런타임 차단은 테스트를 방해한다) |
| 13 | **required peer 3종은 설치 계층에서 정직하지 않다** — `./core`만 쓰는 비-Nest 소비자도 `@nestjs/common`·`reflect-metadata`·`rxjs`를 설치한다(npm 7+ 자동 설치, pnpm은 unmet 경고). §2.1이 파는 "Nest 없는 워커·람다"는 모듈 그래프에서는 참이지만 `node_modules`에서는 참이 아니다 | 기각한 대안을 함께 적는다: 형제 `toss-payments-postgresql`처럼 세 개를 `peerDependenciesMeta.optional`로 두는 형태 `[형제 — 실측]`. 고르지 않은 이유는 `.`이 이 패키지의 **주 표면**이고 그것은 Nest 없이 성립하지 않기 때문이다(§2.4.1). 대가의 크기는 §5.5-⑤가 실측한다(peer 디렉토리를 지운 픽스처에서 `./core`가 로드된다). 요구가 생기면 optional 전환은 **완화 방향**이므로 0.2.0 minor로 낼 수 있다 |
| 14 | **배치 버킷이 staging 시계를 상속한다** — `batchWindowStartedAt`은 `policy.batchWindow(createdAt)`에서 나오고 `createdAt`은 라이브러리가 쓰지 않는 유일한 시각이다(R13·I3). DB 시계가 점프하거나 호스트가 자기 타임스탬프를 공급하면 항목들이 인접 버킷으로 흩어져 **병합되지 않는다** | 실패 방향이 안전한 쪽이다 — 배달이 N개로 늘어날 뿐 사라지지 않는다(G3의 유니크 키가 여전히 각 버킷을 지킨다). §1-2가 결정성 주장을 **정책 시간**으로 좁혔고, README의 DDL 절이 "`createdAt`은 한 번만 쓰고 갱신하지 않는다"를 적는다. 호스트가 staging 시각까지 주입하고 싶으면 `NotificationPublisher.stage`가 `createdAt`을 받는 형태로 **additive** 확장할 수 있다 |
| 15 | **저장소 시계 자체의 점프·읽기 복제본 지연** — R12·D8이 claim 판정을 저장소 시계로 모았지만, 그 시계가 NTP step으로 뒤로 가거나 복제본이 지연되면 신선한 claim이 회수될 수 있다 | 워커 N개의 시계를 저장소 1개로 줄인 것이 이 리스크의 전부다(N→1). 남은 노출은 §3.3.5의 겹침 창과 같고 relay 쪽은 R4·R11이, dispatch 쪽은 D2가 막는다. README가 "claim 판정 쿼리는 primary에서 실행한다"를 명시한다 |
| 16 | **영구 실패 배달의 굶김(starvation)** — `maxAttempts`를 설정하지 않은 호스트에서 poison 행이 `pageSize`만큼 쌓이면 건강한 알림이 페이지에 들어오지 못한다. 에러가 하나도 안 나는 유실이다 | 옵션(R13·D9)과 실패 행렬 F12와 단위 테스트(§5.1)까지가 라이브러리가 할 수 있는 전부다. **기본값을 주지 않는 이유**: 상한을 두면 그 이상 실패한 알림이 조용히 버려지고, 그것은 "실패 방향을 유실로 고정"하는 결정이라 §3.1의 계약과 정면으로 충돌한다. 대신 README가 "운영 시작 전에 `maxAttempts`와 소진 행 알림을 정하라"를 배선 체크리스트에 넣는다 |
| 17 | **L1–L4를 라이브러리가 강제할 수 없다** — 두 포트 모두 호스트 구현이고 파이프라인은 어느 메서드도 호출하지 않는다. 잘못된 삭제 순서는 "개인정보 사고"인데 컴파일도 런타임도 그것을 막지 못한다 | §7-2와 같은 등급이지만 결과가 더 무겁다. 적합성 케이스 L1–L3(§5.4)이 호스트 테스트 안에서 검사하고, 두 인터페이스의 JSDoc과 README 필수 절(§5.6-8)이 같은 문장을 싣는다. 핸드오프가 **L 케이스의 실행 증거**를 별도로 요구한다(AGENTS.md §4) |

---
## 8. 루트 배선 (오케스트레이터 적용 대상 — 이 문서 작성자는 건드리지 않았다)

CLAUDE.md·AGENTS.md의 릴리스 게이트에 새 패키지를 접합하는 데 필요한 **루트 변경 전량**이다. 순서는 무관하나 7은 6 이후에 의미가 있다.

| # | 파일 | 변경 | 근거 |
|---|---|---|---|
| 1 | `pnpm-workspace.yaml` | **변경 없음** — `packages: ["*"]`가 `nest-notifications/package.json`을 자동 인식 | CLAUDE.md 구조 규칙 |
| 2 | 루트 `package.json` `build`·`typecheck`·`test`·`test:types` | **변경 없음** — 전부 `corepack pnpm -r` | 실측 |
| 3 | 루트 `package.json` `check:readme` | 끝에 ` && corepack pnpm --filter @gj-kit/nest-notifications check:readme` 추가 | README ts 블록 컴파일이 릴리스 계약(AGENTS.md §3) |
| 4 | `scripts/check-pack-contents.mjs` `packages` 배열 | `{ directory: 'nest-notifications', requirePrepack: true, requireProvenance: true }` 1행 추가 | 03e4c50 선례와 동일 배선 |
| 5 | `scripts/publish-github-packages.mjs` `packageDirectories` | `'nest-notifications'` 1행 추가 | 동 |
| 6 | `scripts/check-nest-notifications-consumer.mjs` | **신설** — `check-toss-payments-consumer.mjs` 복제 개조(§5.5). Nest 10·11 픽스처는 패키지가 소유 | 4개 서브패스가 실제 설치에서 해석되는지는 packed consumer만 증명한다 |
| 7 | 루트 `package.json` `verify:release` | ` && corepack pnpm run check:nest-notifications-consumer` 추가 + 같은 이름의 스크립트 항목 신설 | 6번을 게이트에 넣는다 |
| 8 | `.env.example` | **변경 없음** — 통합 테스트도 시크릿도 요구하지 않는다 | 저장소가 포트, 전송이 콜백 |
| 9 | `.github/workflows/*` | **변경 없음** — CI가 `verify:release` 하나를 돌린다 | `ci.yml:25` · `release.yml:37` 실측 |
| 10 | `.gitignore` | **변경 없음** — `.readme-check-*/`가 이미 있다 | 실측 |
| 11 | 루트 `README.md` | 패키지 목록에 1행 추가 | 문서 일관성 |
| 12 | `.changeset/nest-notifications-v0-1.md` | **신설**(§2.7 본문 그대로) | 0.0.0 + minor → 0.1.0 |

형제 `nest-operations-jobs`가 동시에 같은 파일 3개(루트 `package.json`·`check-pack-contents.mjs`·`publish-github-packages.mjs`)를 건드리므로, 오케스트레이터는 **두 패키지의 항목을 한 번에 병합**해서 적용해야 한다.

## 부록 A. 근거 파일 경로 (재검증용)

- `[소스]` — memorylog2 `apps/server` 직접 판독:
  - `src/notifications/core/{notification-contracts,notification-scheduling-policy,notification-recipient-key,notification-push-gateway,notification-presentation}.ts`
  - `src/notifications/{expo-push.service,notification-relay.service,notification-dispatch.service,notification-pipeline-wakeup.service,notifications.module,notifications-v2.service,notifications.controller,notifications-relay.job,notifications-dispatch.job}.ts`
  - `src/notifications/{notification-publisher,notification-recipient-liveness,notification-account-lifecycle,notification-pipeline-wakeup}.port.ts` · `notification-endpoint.repository.ts` · `notification-application-key.token.ts`
  - `src/notifications/adapters/prisma-{notification.publisher,notification-recipient-liveness,notification-endpoint.repository,notification-account-lifecycle}.ts`
  - `prisma/schema.prisma:513-672` (NotificationIngressOutbox · NotificationRecipientState · NotificationDelivery · NotificationDeliveryItem · NotificationMessage · NotificationPreference · NotificationEndpoint — 유니크·인덱스 전량)
  - `test/notifications/**` 14파일 + `test/notifications/core/**` 3파일
  - 줄 수는 `wc -l`로 실측
- `[형제]` — gj-kit 직접 판독:
  - `AGENTS.md`(§1 패키지 책임 · §2 공개 API/의존성 · §3 릴리스 · §4 handoff) · `CLAUDE.md`
  - `format/{package.json,tsup.config.ts,vitest.config.ts,tsconfig*.json,scripts/{check-readme,stamp-provenance,check-provenance}.mjs}` · `format/src/{index.ts,zone.ts}`
  - `toss-payments-nestjs/package.json` — peer 3종의 정본
  - `toss-payments-postgresql/package.json` — 서브패스 분할·형제 peer 선례
  - `docs/design/nest-operations-jobs-api-surface.md` — 형식 기준이자 동시 작업 중인 형제 패키지의 계약
  - `docs/design/format-api-surface.md` · `docs/design/toss-payments-postgresql-v1.md`
  - 루트 `package.json` · `scripts/{check-pack-contents,publish-github-packages}.mjs` · `.github/workflows/{ci,release}.yml` · `.gitignore` · `pnpm-workspace.yaml`
  - 커밋 `03e4c50` (toss-payments-postgresql 도입 — version 0.0.0 + minor changeset + 루트 배선 3종)
- `[unverified]` 표시가 붙은 주장 6건: §2.4 rxjs 타입 전이 참조, §2.5 CJS 청크 이중 로드, §0.3-② Expo receipt 비중, §7-4 small-icu 동작, §7-10 Nest 10/11 타입 차이, §7-11 이중 로드 실측. 전부 구현 또는 packed consumer 단계에서 닫힌다.
- `[실측]` — 이 개정에서 새로 실행해 확인한 것:
  - `typescript@5.9.3`(`strict` + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`, target/lib ES2022)로 두 타입 주장을 컴파일 검증했다. ⑴ `interface` 요약 → `Record<string, unknown>` **실패**(`TS2322: Index signature for type 'string' is missing`), `type` alias → 통과. 형제의 실제 접합 형태(`(input: never, ctx: never) => Promise<Record<string, unknown> | void>`)로도 같은 결과. ⑵ 화살표 프로퍼티 `send` ← `(m: Msg[]) => Promise<Ticket[]>` **실패**(`TS2322: The type 'readonly Msg[]' is 'readonly' and cannot be assigned to the mutable type 'Msg[]'`), 메서드 문법 → 통과. → §3.6·§3.7·§3.5의 선언 형태를 바꿨다(§4-27·28).
  - `check:readme` 컴파일러 플래그(위 + `verbatimModuleSyntax`·`isolatedModules`·`skipLibCheck`, module ESNext, moduleResolution Bundler, 데코레이터 설정 없음)에서 `declare function OperationsJobDefinition(): ClassDecorator;` + `@Injectable() @OperationsJobDefinition() export class …` 블록이 **EXIT 0**으로 통과함을 확인했다 → §5.6의 `declare` 레시피 규칙.
  - `format/scripts/check-readme.mjs` 전문: ```ts 펜스 **전량** 추출, **스킵 마커 없음**, 작업 디렉토리가 패키지 루트 하위(= import가 그 패키지 `node_modules`로 해석됨), `paths`는 공개 엔트리에만 매핑. → §5.6의 devDependency 문제와 그 해법.
  - `toss-payments-nestjs/package.json`: exports `.` 1엔트리, `peerDependenciesMeta` 없음. `toss-payments-postgresql/package.json`: exports 3엔트리(`.`·`./nestjs`·`./testing`), `@nestjs/common`·`reflect-metadata`·`rxjs` **전부 `optional: true`**. → §1-7·§2.4.1의 선례 정정.
  - `nest-operations-jobs/src/core/job.ts`: `export type JobSummary = Record<string, unknown>`(5행), `run(input, context): Promise<JobSummary | void>`(60행), `JobInputValidator.parse`가 **메서드 문법**(13–15행). → §0.4-③·§2.2-C의 접합 형태.
  - memorylog2 `apps/server`: `notification-relay.service.ts`의 `persistClaimed` 3회 재시도 + `notificationDelivery.create`(P2002 throw), `relayDue`의 프로세스 시계 컷오프; `adapters/prisma-notification-account-lifecycle.ts:19-54`의 purge 순서와 그 이유를 적은 주석; `adapters/prisma-notification.publisher.ts`가 `createdAt`을 **보내지 않음**; `prisma/schema.prisma`의 `NotificationEndpoint @@unique([applicationKey, provider, address])` + `lastSeenAt`, `NotificationIngressOutbox.createdAt @default(now())`, `relayAttemptCount`·`dispatchAttemptCount`(어떤 쿼리도 읽지 않음), `NotificationRecipientState` 주석의 "intentionally not deleted during purge". → §0.3-⑦⑧⑨⑩ · §0.2-⑯⑰⑱⑲ · R11·R12·R13·D6 · L1–L4.
