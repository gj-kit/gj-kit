/**
 * 빌링 등록 인증창 — SDK payment({customerKey}).requestBillingAuth 래퍼.
 *
 * 빌링은 API 개별 키(ck) 전용 — 위젯 키(gck)는 컴파일 에러.
 * customer는 WidgetCustomerKey만 — ANONYMOUS는 파라미터 타입에서 배제된다
 * (빌링은 고유 customerKey 전제, SDK 문서에 ANONYMOUS 빌링 언급 없음 — 연구문서 §빌링).
 */
import type { WidgetCustomerKey } from '../core/ids';
import type { ApiClientKey } from '../core/keys';
import { err, ok, type Result } from '../core/result';
import { asUserCancelCode, importSdk, toSdkError } from './internal';
import type { PaymentRequestOutcome, SdkError } from './widgets';
import type { TossPaymentsPayment } from '@tosspayments/tosspayments-sdk';

/**
 * SDK v2.7.1 타입 정의로 확정(Phase 0): method 'CARD' | 'TRANSFER' 판별 유니언.
 * selectableCardTypes는 CARD 전용 — TRANSFER 쪽은 `?: never`로 변수 경유 전달까지 차단한다.
 */
export type BillingAuthRequest =
  | {
      readonly method: 'CARD';
      /** origin을 포함한 완전 URL — 성공 시 쿼리로 authKey, customerKey가 붙는다. */
      readonly successUrl: string;
      readonly failUrl: string;
      readonly customerName?: string;
      readonly customerEmail?: string;
      readonly windowTarget?: 'self' | 'iframe';
      /** 결제화면에 노출할 카드 타입 — 입력 순서대로 노출, 첫 항목이 기본 선택. */
      readonly selectableCardTypes?: readonly ('PERSONAL' | 'CORPORATE')[];
    }
  | {
      readonly method: 'TRANSFER';
      readonly successUrl: string;
      readonly failUrl: string;
      readonly customerName?: string;
      readonly customerEmail?: string;
      readonly windowTarget?: 'self' | 'iframe';
      /** 카드 전용 파라미터 (SDK v2.7.1 타입 정합) — TRANSFER에서는 존재 자체가 컴파일 에러. */
      readonly selectableCardTypes?: never;
    };

/**
 * 자동결제(빌링) 등록 인증창을 연다. 성공 시 successUrl로 리다이렉트되며
 * 서버에서 parseBillingAuthCallback → confirmPendingAuth → issue로 이어진다.
 * 사용자 취소(USER_CANCEL / PAY_PROCESS_CANCELED)는 에러가 아닌 user-canceled variant다.
 */
export async function requestBillingAuth(
  clientKey: ApiClientKey,
  customer: WidgetCustomerKey,
  request: BillingAuthRequest,
): Promise<Result<PaymentRequestOutcome, SdkError>> {
  const sdk = await importSdk();
  if (!sdk.ok) {
    // 반환 에러 채널이 SdkError 하나뿐(설계 §3.5 시그니처) — 로드 실패는 전용 코드로 표면화한다
    return err({
      kind: 'sdk',
      code: 'SDK_LOAD_FAILED',
      message:
        '@tosspayments/tosspayments-sdk를 불러오지 못했습니다 — optional peer 의존성이 설치되어 있는지 확인하세요.',
    });
  }
  try {
    const tossPayments = await sdk.value.loadTossPayments(clientKey);
    const payment = tossPayments.payment({ customerKey: customer });
    // successUrl/failUrl 필수 입력 — SDK는 리다이렉트로만 결과를 전달한다
    await payment.requestBillingAuth(toSdkBillingAuthRequest(request));
    return ok({ kind: 'redirecting' });
  } catch (cause) {
    const sdkError = toSdkError(cause);
    const cancelCode = asUserCancelCode(sdkError.code);
    if (cancelCode !== null) {
      return ok({ kind: 'user-canceled', code: cancelCode, message: sdkError.message });
    }
    return err(sdkError);
  }
}

/** SDK 파라미터 타입 — BillingAuthRequest 자체는 SDK에서 export되지 않아 시그니처에서 유도한다. */
type SdkBillingAuthRequest = Parameters<TossPaymentsPayment['requestBillingAuth']>[0];

function toSdkBillingAuthRequest(request: BillingAuthRequest): SdkBillingAuthRequest {
  const base = {
    successUrl: request.successUrl,
    failUrl: request.failUrl,
    ...(request.customerName !== undefined ? { customerName: request.customerName } : {}),
    ...(request.customerEmail !== undefined ? { customerEmail: request.customerEmail } : {}),
    ...(request.windowTarget !== undefined ? { windowTarget: request.windowTarget } : {}),
  };
  if (request.method === 'CARD') {
    return {
      ...base,
      method: 'CARD',
      // SDK 타입은 mutable Array — readonly 입력을 복사해 전달한다
      ...(request.selectableCardTypes !== undefined
        ? { selectableCardTypes: [...request.selectableCardTypes] }
        : {}),
    };
  }
  return { ...base, method: 'TRANSFER' };
}
