# @gj-kit/nest-notifications

## 0.1.2

### Patch Changes

- 73379a8: docs: lead every README with the payoff instead of the taxonomy

  패키지 README와 문서 포털을 전면 개편했다. 기존 문서는 경계와 금지 사항부터 나열해서, 처음 보는 사람이 이 패키지를 왜 써야 하는지 판단할 근거가 없었다.

  각 README는 이제 다음 순서로 읽힌다.

  - npm·CI·types·runtime deps·license 배지
  - tagline — 이 패키지가 무엇을 불가능하게 만드는지 한 줄
  - "왜 필요한가" — 이 패키지 없이 실제로 나는 사고
  - "무엇으로 막는가" — 실제 export 심볼로 추적 가능한 항목 4~5개
  - Golden path — 기존과 동일
  - "실제로는 이렇게 걸립니다" — payoff가 드러나는 두 번째 예제
  - "주장 대신 검증" — 측정한 숫자만

  문구 정본은 `website/src/data/catalog.mjs` 하나이고 README 20종과 포털이 여기서 생성된다. 추가한 예제는 전부 `check:readme`가 dist 타입에 대해 컴파일을 검증하며, `check:docs`와 `check:readme`가 tagline·problem·highlights·배지의 존재를 검사한다. `localize-readmes.mjs`는 "runtime deps 0" 배지가 사실인지도 함께 강제한다.

  공개 API는 변경되지 않았다.

## 0.1.1

### Patch Changes

- 9c3cbc4: Publish English-first and Korean README files, add package discovery metadata, and link every package to the generated global API documentation portal.

## 0.1.0

### Minor Changes

- 455c904: 신규 패키지 — memorylog2 `apps/server`의 알림 파이프라인(명령 계약·릴레이·디스패치·전송 포트·빠른 경로) 승격. 소스 도메인은 자기 트랜잭션에서 명령 하나를 stage하고, 조용시간·배치·선호도·재시도·푸시 fan-out은 파이프라인이 소유한다.

  - 배달 계약을 먼저 명시한다: `(applicationKey, recipientRef, eventKey)`를 멱등 키로 하는 at-least-once, inbox 메시지는 배달당 정확히 하나, 순서 보장 없음. 실패 행렬 12종(완료 쓰기 실패·청크 부분 성공·ticket 무효 endpoint·배치 정체성 경쟁·영구 실패 행의 굶김 등)이 문서·테스트로 고정된다.
  - `./core`: 프레임워크·전송·저장소·언어를 모르는 파이프라인. `@nestjs/*`·`rxjs`·provider SDK·비영어 문자열 리터럴을 import도 포함도 하지 않는다(가드 테스트가 소스와 dist 양쪽에서 강제).
  - 시간대 파라미터화: 지역 상수 하드코딩 제거. `createQuietHoursPolicy({ timeZone, quietHours: { startHour: 22, endHour: 8 }, batchWindowMs: 600_000 })`처럼 호스트가 자기 지역을 말한다. IANA 벽시계 산술이라 DST 전환·비정시 offset(+05:45)에서도 정확하고, 갭/중복 시각 해석 규칙이 계약에 적혀 있다.
  - 저장소 포트 3종 + 호스트 포트 2종 + 의무 29종(R1–R13 · D1–D9 · I1–I3 · L1–L4). 라이브러리는 테이블도 마이그레이션도 소유하지 않고, `./testing`의 적합성 케이스 배열이 호스트 구현을 — ingress staging과 계정 삭제 순서까지 포함해 — 그대로 검사한다. 인메모리 구현 동봉.
  - 배달 삽입은 예외를 요구하지 않는다: `createDelivery`가 `{ id, created }`를 돌려주고, `created: false`면 릴레이가 병합/follow-up으로 되돌아간다. claim 신선도는 저장소 시계 하나에서만 판정된다(요청은 순간이 아니라 `claimStaleMs` 기간을 나른다). endpoint 비활성화는 `listEnabled`가 관측한 등록 리비전과 일치할 때만 쓴다 — 전송 중 재등록한 기기를 끄지 않는다.
  - `./expo`: `expo-server-sdk` 비의존. 청킹·토큰 형태 검사·ticket 분류(undersized 응답 가드 포함)는 순수 함수로 라이브러리가 소유하고, HTTP 전송만 호스트가 콜백으로 공급한다. SDK의 `sendPushNotificationsAsync`가 구조적으로 그대로 대입된다.
  - 배치 카피는 `NotificationPresenter` 필수 포트다 — 라이브러리는 어떤 언어의 문장도 만들지 않는다.
  - 빠른 경로(`request(): void`)는 명시적 best-effort다. 예약·배치 배달의 정확성 소유자는 주기 실행자이며, README가 `@gj-kit/nest-operations-jobs` 어댑터 12줄을 싣되 두 패키지 사이에 의존은 없다.
  - 런타임 의존성 0. `@nestjs/common`·`reflect-metadata`·`rxjs`는 required peer.
