# @gj-kit/nest-operations-jobs

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
