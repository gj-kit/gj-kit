/**
 * @gj-kit/toss-payments-nestjs — 코어 파사드(createTossPayments)의 NestJS 통합 (설계 §4).
 *
 * 원칙 경계: 코어의 "런타임 의존성 0" 원칙은 이 패키지에 적용되지 않는다 —
 * Nest·코어를 **peer로만** 수용하며 dependencies 0은 유지한다(설계 §4.1).
 */
export { InjectTossPayments, TOSS_PAYMENTS } from './inject';
export { TossPaymentsModule } from './module';
export type {
  AnyTossPaymentsConfig,
  TossPaymentsFor,
  TossPaymentsModuleAsyncOptions,
} from './module';
export { toNestWebhookHandler } from './webhook-handler';
export type { NestWebhookRequest } from './webhook-handler';
