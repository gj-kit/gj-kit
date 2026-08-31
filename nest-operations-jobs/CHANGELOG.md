# @gj-kit/nest-operations-jobs

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

- f3e4011: 신규 패키지 — memorylog2 `apps/server`의 운영 잡 플랫폼(잡 계약·레지스트리·러너·가드·CLI) 승격. 잡은 비즈니스 로직만 갖고, 인증·중복 실행 방지·하트비트·타임아웃·실행 기록은 파이프라인이 소유한다.

  - `./core`: 프레임워크 없는 러너. `@nestjs/*`·`rxjs`를 import하지 않아 Nest 없이 테스트·재사용된다.
  - `JobRunStore` 포트: 라이브러리는 스키마를 소유하지 않는다. 저장소가 지는 원자성 의무(단일 claim·단조 하트비트·멱등 완료·원자적 reap·시간축 분리)를 명세하고, `./testing`의 적합성 케이스 배열이 호스트 구현을 그대로 검사한다(동시 claim 버스트·동시 reap 포함). 실행 기록의 시각은 러너 시계에서, 살아 있음(liveness) 판정은 저장소 시계에서 나온다 — 인스턴스가 여럿이면 그것이 유일한 공통 시계다. 인메모리 구현 동봉.
  - 시계·타임아웃 주입: ambient 시계 호출 0. `AbortSignal`이 잡에 전파되며, 시그널을 무시한 잡의 결말(기록은 정확히 한 번, orphan은 기록을 오염시킬 수 없음, 부수효과는 중단 불가)이 문서·테스트로 고정된다.
  - 가드: timing-safe 공유 시크릿 비교(길이 유출 없는 digest 비교)는 라이브러리가 소유하고, Cloud Scheduler OIDC 검증은 `JobTriggerTokenVerifier` 포트로 호스트가 공급한다 — google-auth 의존 0. JWT 형태 사전 검사는 라이브러리가 수행해 오입력 시크릿이 네트워크 검증까지 가지 않는다.
  - 스케줄러 동기화 도구는 포함하지 않는다(GCP 고유). 대신 `jobCatalog()`·`schedulerHttpTargets()`가 순수 카탈로그를 내보내 호스트가 gcloud/Terraform 동기화를 30줄로 작성한다.
  - 런타임 의존성 0. `@nestjs/common`·`@nestjs/core`·`reflect-metadata`·`rxjs`는 required peer.
