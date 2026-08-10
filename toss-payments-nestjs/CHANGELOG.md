# @gj-kit/toss-payments-nestjs

## 0.1.0

### Minor Changes

- 6fd6718: 첫 릴리스: `@gj-kit/toss-payments` NestJS 어댑터

  - `TossPaymentsModule.forRoot / forRootAsync` — 파사드 싱글턴 DI 등록(글로벌 모듈)
  - `@InjectTossPayments()` — 파사드 주입 데코레이터
  - `toNestWebhookHandler` — rawBody 강제 확인(누락 시 실행 없이 500 + 설정 안내), 검증·dedupe는 코어 웹훅 어댑터에 위임
  - 코어를 번들하지 않고 `@gj-kit/toss-payments/server` import 유지, ESM+CJS 듀얼

### Patch Changes

- Updated dependencies [3ba0dfb]
- Updated dependencies [6fd6718]
  - @gj-kit/toss-payments@0.1.0
