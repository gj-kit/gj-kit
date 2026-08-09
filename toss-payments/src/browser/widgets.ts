/**
 * 결제위젯 — loadWidgets 3단계 typestate.
 *
 * SDK 문서의 순서 제약(setAmount가 렌더링·결제요청보다 반드시 선행)을
 * "메서드 부재"로 강제한다: 각 상태 타입에는 그 시점에 허용된 메서드만 존재한다.
 *   상태 0 TossWidgets            — setAmount만
 *   상태 1 TossWidgetsWithAmount  — render 2종 + setAmount(금액 변경)
 *   상태 2 RenderedTossWidgets    — 여기서만 requestPayment
 */
import type { Brand } from '../core/brand';
import type { OrderId, OrderName, WidgetCustomerKey } from '../core/ids';
import type { WidgetClientKey } from '../core/keys';
import { err, ok, type Result } from '../core/result';
import { asUserCancelCode, callSdk, importSdk, toSdkError } from './internal';
import type {
  TossPaymentsWidgets,
  WidgetAgreementWidget as SdkAgreementWidget,
  WidgetPaymentMethodWidget as SdkPaymentMethodWidget,
} from '@tosspayments/tosspayments-sdk';

/**
 * 비회원 결제 표식 — SDK ANONYMOUS의 브랜딩 재노출.
 * 빌링 인증(requestBillingAuth)의 customer 파라미터에는 대입 불가한 타입이다
 * (빌링은 고유 customerKey 전제 — 연구문서 §빌링).
 */
export type Anonymous = Brand<'Anonymous'>;

/**
 * SDK v2.7.1 `declare const ANONYMOUS = "@@ANONYMOUS"`와 동일 값의 재선언 —
 * SDK는 optional peer라 정적 import로 값을 재export할 수 없다.
 */
// 팬텀 브랜드 각인은 단언으로만 가능(브랜드 심볼 비공개) — 이 상수가 Anonymous 값의 유일한 공급원
export const ANONYMOUS: Anonymous = '@@ANONYMOUS' as unknown as Anonymous;

/** SDK 호출이 던진 예외의 {code, message} 회수 형태. */
export interface SdkError {
  readonly kind: 'sdk';
  readonly code: string;
  readonly message: string;
}

export type WidgetError = SdkError | { readonly kind: 'load-failed'; readonly cause: unknown };

export interface WidgetAmount {
  readonly currency: 'KRW' | 'USD' | 'JPY';
  readonly value: number;
}

/** 상태 0: 금액 미설정 — render/requestPayment 메서드 자체가 없다. */
export interface TossWidgets {
  setAmount(amount: WidgetAmount): Promise<Result<TossWidgetsWithAmount, WidgetError>>;
}

/** 상태 1: 금액 설정됨 — 렌더링 가능. setAmount는 쿠폰 등 금액 변경용으로 남는다. */
export interface TossWidgetsWithAmount {
  renderPaymentMethods(options: {
    readonly selector: string;
    readonly variantKey?: string;
  }): Promise<Result<RenderedTossWidgets, WidgetError>>;
  renderAgreement(options: {
    readonly selector: string;
    readonly variantKey?: string;
  }): Promise<Result<AgreementWidget, WidgetError>>;
  setAmount(amount: WidgetAmount): Promise<Result<TossWidgetsWithAmount, WidgetError>>;
}

/** 상태 2: 렌더 완료 — 여기서만 결제 요청이 가능하다. */
export interface RenderedTossWidgets {
  requestPayment(request: WidgetPaymentRequest): Promise<Result<PaymentRequestOutcome, SdkError>>;
  setAmount(amount: WidgetAmount): Promise<Result<RenderedTossWidgets, WidgetError>>;
  getSelectedPaymentMethod(): Promise<Result<{ readonly code: string }, WidgetError>>;
  /**
   * 결제수단 선택 이벤트 구독. 반환 함수로 구독을 해제한다 —
   * SDK on()은 해제를 제공하지 않으므로 래퍼가 활성 플래그로 전달을 중단한다.
   */
  on(event: 'paymentMethodSelect', handler: (m: { code: string }) => void): () => void;
  destroy(): Promise<void>;
}

export interface AgreementWidget {
  /** {@link RenderedTossWidgets.on}과 동일한 래퍼 수준 구독 해제. */
  on(
    event: 'agreementStatusChange',
    handler: (s: { agreedRequiredTerms: boolean }) => void,
  ): () => void;
  destroy(): Promise<void>;
}

export interface WidgetPaymentRequest {
  /** 스마트 생성자 산출물만 — 서버 createOrder가 발급한 값은 JSON 경계에서 orderId(raw)로 재파싱한다. */
  readonly orderId: OrderId;
  readonly orderName: OrderName;
  /** origin을 포함한 완전 URL (SDK 문서 요구 — 런타임 검증). */
  readonly successUrl: string;
  readonly failUrl: string;
  readonly customerEmail?: string;
  readonly customerName?: string;
  readonly customerMobilePhone?: string;
  readonly taxFreeAmount?: number;
  /** 최대 5쌍 (문서: metadata 최대 5개 key-value — 런타임 검증). */
  readonly metadata?: Readonly<Record<string, string>>;
}

/**
 * 결제 요청 결과 — 사용자 취소는 에러가 아니다.
 * 리다이렉트 모드 고정: 프로미스 모드는 모바일 미지원(문서 근거)이라 제공하지 않는다.
 */
export type PaymentRequestOutcome =
  | { readonly kind: 'redirecting' }
  | {
      readonly kind: 'user-canceled';
      readonly code: 'USER_CANCEL' | 'PAY_PROCESS_CANCELED';
      readonly message: string;
    };

/**
 * 위젯 로드 — WidgetClientKey(gck) 전용. ApiSecretKey는 물론 ApiClientKey(ck)도 컴파일 에러다.
 * customer는 2–50자 서브타입(WidgetCustomerKey) 또는 {@link ANONYMOUS}만 —
 * 300자 허용 서버용 CustomerKey는 컴파일 에러.
 */
export async function loadWidgets(
  clientKey: WidgetClientKey,
  customer: WidgetCustomerKey | Anonymous,
): Promise<Result<TossWidgets, WidgetError>> {
  const sdk = await importSdk();
  if (!sdk.ok) return sdk;
  // Anonymous는 팬텀 브랜드 — 런타임 값은 SDK ANONYMOUS 문자열('@@ANONYMOUS')이라 String()이 항등이다
  const customerKey: string = typeof customer === 'string' ? customer : String(customer);
  try {
    // loadTossPayments(스크립트 로드)와 widgets() 초기화 예외(InvalidClientKey 등)는 SDK 예외로 회수
    const tossPayments = await sdk.value.loadTossPayments(clientKey);
    return ok(stage0(tossPayments.widgets({ customerKey })));
  } catch (cause) {
    return err(toSdkError(cause));
  }
}

// ── typestate 래퍼 ───────────────────────────────────────────────

function stage0(widgets: TossPaymentsWidgets): TossWidgets {
  return {
    setAmount: (amount) =>
      callSdk(async () => {
        await widgets.setAmount(amount);
        return stage1(widgets);
      }),
  };
}

function stage1(widgets: TossPaymentsWidgets): TossWidgetsWithAmount {
  return {
    setAmount: (amount) =>
      callSdk(async () => {
        await widgets.setAmount(amount);
        return stage1(widgets);
      }),
    renderPaymentMethods: (options) =>
      callSdk(async () => {
        const methodWidget = await widgets.renderPaymentMethods(renderParams(options));
        return stage2(widgets, methodWidget);
      }),
    renderAgreement: (options) =>
      callSdk(async () => wrapAgreement(await widgets.renderAgreement(renderParams(options)))),
  };
}

function stage2(
  widgets: TossPaymentsWidgets,
  methodWidget: SdkPaymentMethodWidget,
): RenderedTossWidgets {
  const rendered: RenderedTossWidgets = {
    requestPayment: async (request) => {
      const invalid = validatePaymentRequest(request);
      if (invalid !== null) return err(invalid);
      try {
        // successUrl/failUrl이 항상 실리므로 SDK는 리다이렉트 모드로 동작한다
        await widgets.requestPayment(toSdkPaymentRequest(request));
        return ok({ kind: 'redirecting' });
      } catch (cause) {
        const sdkError = toSdkError(cause);
        const cancelCode = asUserCancelCode(sdkError.code);
        if (cancelCode !== null) {
          return ok({ kind: 'user-canceled', code: cancelCode, message: sdkError.message });
        }
        return err(sdkError);
      }
    },
    setAmount: (amount) =>
      callSdk(async () => {
        await widgets.setAmount(amount);
        return rendered;
      }),
    getSelectedPaymentMethod: () =>
      callSdk(async () => {
        const selected = await methodWidget.getSelectedPaymentMethod();
        return { code: selected.code };
      }),
    on: (event, handler) => {
      // SDK on()은 구독 해제가 없다 — 래퍼의 활성 플래그로 전달을 중단한다
      let active = true;
      methodWidget.on(event, (selected) => {
        if (active) handler({ code: selected.code });
      });
      return () => {
        active = false;
      };
    },
    destroy: () => methodWidget.destroy(),
  };
  return rendered;
}

function wrapAgreement(agreementWidget: SdkAgreementWidget): AgreementWidget {
  return {
    on: (event, handler) => {
      let active = true;
      agreementWidget.on(event, (status) => {
        if (active) handler({ agreedRequiredTerms: status.agreedRequiredTerms });
      });
      return () => {
        active = false;
      };
    },
    destroy: () => agreementWidget.destroy(),
  };
}

// ── SDK 입력 매핑 + 런타임 검증 ─────────────────────────────────

function renderParams(options: { readonly selector: string; readonly variantKey?: string }): {
  selector: string;
  variantKey?: string;
} {
  return {
    selector: options.selector,
    ...(options.variantKey !== undefined ? { variantKey: options.variantKey } : {}),
  };
}

/** 문서: metadata는 최대 5개의 key-value 쌍. */
const MAX_METADATA_PAIRS = 5;

/**
 * SDK 호출 전 선검증 — 코드는 SDK가 같은 상황에서 던지는 공개 에러명
 * (IncorrectSuccessUrlFormatError / IncorrectFailUrlFormatError / InvalidMetadataError)을 미러링한다.
 */
function validatePaymentRequest(request: WidgetPaymentRequest): SdkError | null {
  if (!isCompleteHttpUrl(request.successUrl)) {
    return {
      kind: 'sdk',
      code: 'INCORRECT_SUCCESS_URL_FORMAT',
      message: 'successUrl은 오리진을 포함한 완전한 http(s) URL이어야 합니다.',
    };
  }
  if (!isCompleteHttpUrl(request.failUrl)) {
    return {
      kind: 'sdk',
      code: 'INCORRECT_FAIL_URL_FORMAT',
      message: 'failUrl은 오리진을 포함한 완전한 http(s) URL이어야 합니다.',
    };
  }
  if (request.metadata !== undefined) {
    const entries = Object.entries(request.metadata);
    if (entries.length > MAX_METADATA_PAIRS) {
      return {
        kind: 'sdk',
        code: 'INVALID_METADATA',
        message: `metadata는 최대 ${MAX_METADATA_PAIRS}쌍까지 허용됩니다.`,
      };
    }
    // 문서: 키 최대 40자, 값 최대 2000자.
    const bad = entries.find(([k, v]) => k.length > 40 || v.length > 2000);
    if (bad !== undefined) {
      return {
        kind: 'sdk',
        code: 'INVALID_METADATA',
        message: `metadata 키는 40자, 값은 2000자 이하여야 합니다 (위반 키: ${bad[0].slice(0, 40)}).`,
      };
    }
  }
  return null;
}

/** SDK 문서: "https://www.example.com/success와 같이 오리진을 포함한 형태" — 상대 경로 차단. */
function isCompleteHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}

/** 리다이렉트 오버로드(마지막 시그니처)의 파라미터 — successUrl/failUrl 포함 형태. */
type SdkWidgetPaymentRequest = Parameters<TossPaymentsWidgets['requestPayment']>[0];

function toSdkPaymentRequest(request: WidgetPaymentRequest): SdkWidgetPaymentRequest {
  return {
    orderId: request.orderId,
    orderName: request.orderName,
    successUrl: request.successUrl,
    failUrl: request.failUrl,
    ...(request.customerEmail !== undefined ? { customerEmail: request.customerEmail } : {}),
    ...(request.customerName !== undefined ? { customerName: request.customerName } : {}),
    ...(request.customerMobilePhone !== undefined
      ? { customerMobilePhone: request.customerMobilePhone }
      : {}),
    ...(request.taxFreeAmount !== undefined ? { taxFreeAmount: request.taxFreeAmount } : {}),
    ...(request.metadata !== undefined ? { metadata: copyMetadata(request.metadata) } : {}),
  };
}

/** SDK metadata 타입은 symbol/number 인덱스까지 요구 — readonly 입력을 넓은 인덱스 레코드로 복사한다. */
function copyMetadata(
  metadata: Readonly<Record<string, string>>,
): Record<string | number | symbol, unknown> {
  const copy: Record<string | number | symbol, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) copy[key] = value;
  return copy;
}
