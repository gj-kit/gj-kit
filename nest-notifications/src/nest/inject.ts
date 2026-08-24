/**
 * DI 토큰 — 정확히 11종이다(설계 §3.8.2).
 *
 * - `Symbol.for` 사용 근거: ESM/CJS 이중 로드에서 `Symbol()`은 서로 다른 토큰이 되어 주입이
 *   **조용히** 실패한다. 전역 심볼 레지스트리는 그 실패 모드를 구조적으로 없앤다.
 * - 이 이름 집합은 exports·peer와 같은 등급의 공개 계약이고
 *   `tests/unit/guards/release-artifact.test.ts`가 그것을 고정한다.
 * - 모든 주입이 명시적 `@Inject(토큰)`이다 — 이 패키지의 어떤 코드도 `design:paramtypes`를
 *   읽지 않으므로 `emitDecoratorMetadata` 없는 SWC/esbuild 빌드에서도 무설정으로 동작한다.
 */

/** The server-owned application key every store call is scoped by. */
export const NOTIFICATION_APPLICATION_KEY: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:application-key',
);
/** The host's `NotificationPublisher`, when it wired one. `null` otherwise. */
export const NOTIFICATION_PUBLISHER: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:publisher',
);
export const NOTIFICATION_RELAY_STORE: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:relay-store',
);
export const NOTIFICATION_DELIVERY_STORE: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:delivery-store',
);
export const NOTIFICATION_ENDPOINT_STORE: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:endpoint-store',
);
export const NOTIFICATION_PUSH_GATEWAY: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:push-gateway',
);
export const NOTIFICATION_PRESENTER: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:presenter',
);
export const NOTIFICATION_SCHEDULING_POLICY: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:scheduling-policy',
);
/** The best-effort wakeup hint. Correctness still belongs to a periodic runner. */
export const NOTIFICATION_PIPELINE_WAKEUP: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:pipeline-wakeup',
);
/** The one runtime the three runners share. Injectable so a host can fix the clock. */
export const NOTIFICATION_RUNTIME: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:runtime',
);
/** Lets a host swap the logger through DI instead of only through `forRoot`. */
export const NOTIFICATION_LOGGER: unique symbol = Symbol.for(
  '@gj-kit/nest-notifications:logger',
);
