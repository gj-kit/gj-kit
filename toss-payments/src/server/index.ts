// "./server" — Node 전용. core 전체 재export (brand.ts 제외 — 격리 규칙).
// 내부 계층(TossHttp/getInternalHttp/parsePayment/createCancels 등)은 여기서 재export하지
// 않는다 — 공개 표면은 설계 문서 §3의 시그니처가 전부다.
export * from '../core/index';

// §4.2b — secret key 파서는 이 엔트리에서만 export (구조적 시크릿 키 차단)
export { parseApiSecretKey, parseSecretKey, parseWidgetSecretKey } from './keys';

// 저장소 인터페이스 (필수 주입 지점 + §3.1 depositSecrets)
export type {
  BillingKeyRecord,
  BillingKeyStore,
  DepositSecretStore,
  OrderStore,
  StoredOrder,
} from './stores';

// 서버 클라이언트 (+ §3.4 retry 옵션)
export { createTossClient } from './client';
export type {
  CallOptions,
  KeyKind,
  LookupError,
  RetryOptions,
  TossClientOptions,
  TossServerClient,
} from './client';

// §3.3 events — 이미터 런타임은 core, TossEventMap·별칭은 여기서 export
export { createTossEvents } from './events';
export type { TossEvent, TossEventMap, TossEventName, TossEvents } from './events';

// §3.2 audit — 타입·AUDIT_REDACTED_KEYS는 core 재export(위 `export *`) 경유,
// 파일 싱크 참조 구현만 server 전용(지연 node:fs — Edge 호환 불변)
export { createFileAuditSink } from './audit-file';

// §3.1 confirm 플로우 (+ §3.7 resolveConfirmFailure)
export {
  createConfirmFlow,
  parseFailCallback,
  parseSuccessCallback,
  resolveConfirmFailure,
} from './confirm';
export type {
  CallbackParseError,
  ConfirmResolution,
  CallbackQueryInput,
  ConfirmedPayment,
  ConfirmError,
  ConfirmFlow,
  ConfirmFlowOptions,
  CreateOrderError,
  FailCallbackResult,
  PendingOrder,
  UnverifiedCallback,
  VerifiedCheckout,
  VerifyCheckoutError,
} from './confirm';

// §3.2 cancel
export { asCancelable, refundAccount } from './cancel';
export type {
  AwaitingDepositCancelable,
  CancelablePayment,
  CancelError,
  CancelOutcome,
  CancelPreflightError,
  CancelRetryTicket,
  CancelRetryRecord,
  CancelRetryStore,
  DepositedVaCancelable,
  PartiallyCancelable,
  NotCancelableError,
  RefundAccount,
  SettledCancelable,
  TossCancels,
} from './cancel';

// §2 파사드 — 배선을 누락할 수 없는 조립층 (기존 팩토리 4종에 전량 위임)
export { createTossPayments, defineTossPaymentsConfig } from './facade';
export type {
  TossPaymentsApiConfig,
  TossPaymentsBaseConfig,
  TossPaymentsKit,
  TossPaymentsWidgetConfig,
} from './facade';

// §3.3 billing
export {
  confirmPendingAuth,
  createBillingFlow,
  parseBillingAuthCallback,
  recoverBillingKeyRecord,
} from './billing';
export type {
  AuthKeyReceived,
  BillingApproveError,
  BillingAuthCallback,
  BillingCapabilities,
  BillingFlow,
  BillingFlowBase,
  BillingOrder,
  BillingPayment,
  DirectCardIssueInput,
  ImportBillingKeyError,
  IssueBillingKeyError,
  PendingBillingAuth,
  BillingProfile,
  RevokeBillingKeyError,
  SealedBillingKeyRecord,
  StoreFailure,
} from './billing';
