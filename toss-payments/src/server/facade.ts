/**
 * createTossPayments 파사드 — 배선을 누락할 수 없는 조립층 (설계 §2, G2).
 *
 * **순수 조립층**이다: 기존 팩토리 4종(createTossClient/createConfirmFlow/
 * createBillingFlow/createWebhookVerifier)에 전량 위임하고 검증 로직 중복이 0이다.
 * 배선하지 않은 플로우는 반환 타입에 **프로퍼티 자체가 없어** 사용 시점에 컴파일
 * 에러가 난다 — "스토어 미제공 시 플로우 생성 불가"라는 기존 런타임 보장을 타입으로
 * 옮긴 것뿐, 새 동작이 없다.
 *
 * 확정 판정(§2):
 * - flat config + 오버로드 2종 — 중첩(keys/stores/options)은 조건부 타입 판정 경로를
 *   깊게 만들어 추론 취약성만 늘린다.
 * - 단일 키 = 파사드 1개 — 위젯 결제 + 빌링 병용 상점은 파사드 2개(gsk용/sk용)를
 *   만든다. 키 쌍 규칙이 파사드 경계와 일치해 "confirm은 위젯 client 우선" 같은
 *   새 암묵 규칙이 생기지 않는다.
 * - raw string 키 미수용(§7-1 기각) — Env phantom 소실·실패 시점 이원화.
 */
import type { AuditOptions } from '../core/audit';
import type { OrderId, PaymentKey } from '../core/ids';
import type { ApiSecretKey, Env, WidgetSecretKey } from '../core/keys';
// 파사드는 웹훅 verifier를 조립해야 하므로 server→webhook 방향의 런타임 import가 필요하다
// — 역방향(webhook→server)의 런타임 의존 금지 규칙과는 별개다(webhook 단독 사용성 보존).
import { createWebhookVerifier } from '../webhook/verifier';
import type {
  SecurityKey,
  WebhookDedupeStore,
  WebhookVerifier,
  WebhookVerifierConfig,
} from '../webhook/verifier';
import { createBillingFlow } from './billing';
import type { BillingCapabilities, BillingFlow } from './billing';
import type { CancelRetryStore } from './cancel';
import { createTossClient } from './client';
import type { KeyKind, RetryOptions, TossClientOptions, TossServerClient } from './client';
import { createConfirmFlow } from './confirm';
import type { ConfirmFlow, ConfirmFlowOptions } from './confirm';
import type { TossEvents } from './events';
import type { BillingKeyStore, DepositSecretStore, OrderStore } from './stores';

export interface TossPaymentsBaseConfig<E extends Env> {
  /** confirm 플로우 배선 — 미지정 시 반환 타입에 `confirm` 부재. */
  readonly orders?: OrderStore;
  /**
   * G1 — 1회 배선으로 confirm측 자동 저장 + webhook측 getSecret 대조 양쪽 커버 (§3.1).
   * README의 수동 저장 한 줄(`db.deposits.save`)이 사라진다.
   */
  readonly depositSecrets?: DepositSecretStore;
  /**
   * §3.1 saveSecret 실패 통지 — payload에 secret 원문 미포함(로그 유출 방지).
   * 미지정 시 실패 1건당 console.warn 1회. 복구: `getPaymentByOrderId(orderId)` →
   * `Payment.secret` → `saveSecret` 재시도.
   */
  readonly onDepositSecretSaveFailed?: (info: {
    readonly orderId: OrderId;
    readonly paymentKey: PaymentKey;
    readonly cause: unknown;
  }) => void;
  /** webhook 배선 — 미지정 시 반환 타입에 `webhook` 부재. depositSecrets는 위 필드가 자동 배선. */
  readonly webhook?: {
    readonly dedupe: WebhookDedupeStore;
    readonly securityKeys?: readonly SecurityKey[];
    readonly allowedSourceIps?: readonly string[] | false;
    /** 서명 이벤트 전송 시각의 과거/미래 허용 폭. 기본 5분. */
    readonly transmissionTimeToleranceMs?: number | false;
    /** 테스트 또는 통제된 런타임의 시계 주입용. */
    readonly clock?: () => Date;
    /** true → 파사드 내부 client를 PaymentLookup으로 자동 결속 (§3.5 배선 1비트). */
    readonly autoRefetch?: true;
  };
  /**
   * 옵션 3종 — 기본 전부 꺼짐. events는 client·confirm·billing·webhook 4곳에 자동 배선된다.
   * 미주입 시 반환 kit의 `events`는 no-op 구독 표면(발행 지점 순회 0회)이다.
   */
  readonly events?: TossEvents;
  readonly audit?: AuditOptions;
  readonly retry?: RetryOptions;
  /** 취소 transport 실패 재시도 티켓의 영속 저장소. */
  readonly cancelRetries?: CancelRetryStore;
  /** fetch/baseUrl/timeoutMs — audit/retry/events는 파사드가 위 필드에서 병합 주입한다. */
  readonly client?: Pick<
    TossClientOptions,
    'fetch' | 'baseUrl' | 'timeoutMs' | 'dangerouslyAllowCustomLiveBaseUrl'
  >;
  readonly confirm?: Pick<ConfirmFlowOptions, 'approvalWindowMs' | 'clock'>;
}

export interface TossPaymentsApiConfig<E extends Env> extends TossPaymentsBaseConfig<E> {
  /** 브랜드 키만 수용 — raw string 미수용 (§7-1 기각: Env phantom 소실·실패 시점 이원화). */
  readonly secretKey: ApiSecretKey<E>;
  /** billing 플로우 배선 — 미지정 시 반환 타입에 `billing` 부재. */
  readonly billingKeys?: BillingKeyStore;
  readonly billing?: { readonly capabilities?: BillingCapabilities };
}

export interface TossPaymentsWidgetConfig<E extends Env> extends TossPaymentsBaseConfig<E> {
  readonly secretKey: WidgetSecretKey<E>;
  /** 빌링은 API 키 전용(키 쌍 규칙) — 위젯 키 + 빌링 배선은 컴파일 에러(400 INVALID_API_KEY 선차단). */
  readonly billingKeys?: never;
  readonly billing?: never;
}

/** (내부) config에서 billing capabilities 리터럴을 추출 — 미지정이면 {} (BillingFlowBase). */
type CapabilitiesOf<C> = C extends {
  readonly billing: { readonly capabilities: infer Cap extends BillingCapabilities };
}
  ? Cap
  : {};

/**
 * 파사드 산출물 — 배선한 플로우만 프로퍼티가 존재한다.
 *
 * 기지 리스크(§2): 조건부 교차 타입의 에러 메시지는 "`billing` 프로퍼티가 없다"고만
 * 말하고 원인(billingKeys 미배선)을 직접 말하지 않는다 — 각 프로퍼티 TSDoc의
 * "이 프로퍼티가 없다면" 매핑과 README 에러↔원인 표를 참조하라.
 */
export type TossPaymentsKit<E extends Env, K extends KeyKind, C> = {
  readonly client: TossServerClient<E, K>;
  /**
   * 항상 존재 — config.events 미주입 시 no-op 구독 표면(구독해도 아무 이벤트도 발화되지
   * 않는다 — 발행 지점 순회 0회). 이벤트를 받으려면 `createTossEvents()`를 config.events에
   * 주입하라.
   */
  readonly events: TossEvents;
} & (C extends { readonly orders: OrderStore }
  ? {
      /** confirm 플로우. **이 프로퍼티가 없다면** → config에 `orders`(OrderStore)가 빠진 것이다. */
      readonly confirm: ConfirmFlow<E>;
    }
  : {}) &
  (C extends { readonly billingKeys: BillingKeyStore }
    ? {
        /**
         * 빌링 플로우. **이 프로퍼티가 없다면** → config에 `billingKeys`(BillingKeyStore)가
         * 빠졌거나, 위젯 시크릿 키 파사드다(빌링은 API 키 전용 — 키 쌍 규칙).
         */
        readonly billing: BillingFlow<E, CapabilitiesOf<C>>;
      }
    : {}) &
  (C extends { readonly webhook: object }
    ? {
        /** 웹훅 verifier. **이 프로퍼티가 없다면** → config에 `webhook`({ dedupe })이 빠진 것이다. */
        readonly webhook: WebhookVerifier;
      }
    : {});

/** config.events 미주입 시의 no-op 구독 표면 — 구독 등록도 하지 않는다(발행 지점 자체가 없음). */
const NOOP_EVENTS: TossEvents = {
  on: () => () => {},
};

/**
 * 파사드 팩토리 — 오버로드 2종(API 키 / 위젯 키). 위젯 키 + `billingKeys`는 어느
 * 오버로드도 충족하지 못해 컴파일 에러다(키 쌍 규칙 선차단).
 *
 * ⚠ config를 스프레드로 동적 구성하면 `const` 추론이 풀려 조건부 프로퍼티 판정이
 * 무너질 수 있다 — 동적 구성이 필요하면 기존 개별 팩토리 4종을 직접 사용하라.
 * forRootAsync 등 간접 전달에는 {@link defineTossPaymentsConfig}로 추론을 고정하라.
 */
export function createTossPayments<E extends Env, const C extends TossPaymentsApiConfig<E>>(
  // 교차의 두 번째 멤버는 E의 추론 지점이다 — TS는 타입 파라미터 제약(C extends ...<E>)에서
  // E를 역추론하지 않으므로, 파라미터 타입에 명시해 브랜드 키의 Env phantom을 각인한다.
  config: C & { readonly secretKey: ApiSecretKey<E> },
): TossPaymentsKit<E, 'api', C>;
export function createTossPayments<E extends Env, const C extends TossPaymentsWidgetConfig<E>>(
  config: C & { readonly secretKey: WidgetSecretKey<E> },
): TossPaymentsKit<E, 'widget', C>;
export function createTossPayments(
  config: TossPaymentsApiConfig<Env> | TossPaymentsWidgetConfig<Env>,
): TossPaymentsKit<Env, KeyKind, Record<never, never>> {
  const events = config.events;

  // ── client — audit/retry/events를 client 하위 옵션과 병합 주입 ──────────────
  const clientOptions: TossClientOptions = {
    ...(config.client?.fetch !== undefined ? { fetch: config.client.fetch } : {}),
    ...(config.client?.baseUrl !== undefined ? { baseUrl: config.client.baseUrl } : {}),
    ...(config.client?.timeoutMs !== undefined ? { timeoutMs: config.client.timeoutMs } : {}),
    ...(config.audit !== undefined ? { audit: config.audit } : {}),
    ...(config.retry !== undefined ? { retry: config.retry } : {}),
    ...(config.cancelRetries !== undefined ? { cancelRetries: config.cancelRetries } : {}),
    ...(config.client?.dangerouslyAllowCustomLiveBaseUrl !== undefined
      ? { dangerouslyAllowCustomLiveBaseUrl: config.client.dangerouslyAllowCustomLiveBaseUrl }
      : {}),
    ...(events !== undefined ? { events } : {}),
  };
  // 오버로드 합집합 호출 — 키 종류(api/widget)의 런타임 판별은 createTossClient가 접두사로
  // 소유한다(두 오버로드의 런타임 경로 동일). 파사드 오버로드가 키↔config 조합을 이미
  // 협착했으므로 이 단언이 호출 경로를 넓히지 않는다.
  const client: TossServerClient<Env, KeyKind> = createTossClient(
    config.secretKey as ApiSecretKey<Env>,
    clientOptions,
  );

  // ── confirm — orders 배선 시에만 생성. depositSecrets/이벤트/실패 통지 병합 주입 ──
  const confirmOptions: ConfirmFlowOptions = {
    ...(config.confirm?.approvalWindowMs !== undefined
      ? { approvalWindowMs: config.confirm.approvalWindowMs }
      : {}),
    ...(config.confirm?.clock !== undefined ? { clock: config.confirm.clock } : {}),
    ...(config.depositSecrets !== undefined ? { depositSecrets: config.depositSecrets } : {}),
    ...(config.onDepositSecretSaveFailed !== undefined
      ? { onDepositSecretSaveFailed: config.onDepositSecretSaveFailed }
      : {}),
    ...(events !== undefined ? { events } : {}),
  };
  const confirm =
    config.orders === undefined ? undefined : createConfirmFlow(client, config.orders, confirmOptions);

  // ── billing — billingKeys 배선 시에만 생성 ─────────────────────────────────
  const billing =
    config.billingKeys === undefined
      ? undefined
      : createBillingFlow(
          // 빌링은 'api' KeyKind 전용 — 위젯 config는 billingKeys가 never라 타입 경로상
          // 이 분기에 도달할 수 없다. 합집합 impl 시그니처 탓에 단언이 불가피.
          client as TossServerClient<Env, 'api'>,
          config.billingKeys,
          {
            ...(config.billing?.capabilities !== undefined
              ? { capabilities: config.billing.capabilities }
              : {}),
            ...(events !== undefined ? { events } : {}),
          },
        );

  // ── webhook — dedupe 필수, depositSecrets(getSecret측)·events 자동 배선,
  //    autoRefetch: true → 내부 client 결속(§3.5) ────────────────────────────
  const webhookInput = config.webhook;
  const webhookConfig: WebhookVerifierConfig | undefined =
    webhookInput === undefined
      ? undefined
      : {
          dedupe: webhookInput.dedupe,
          ...(webhookInput.securityKeys !== undefined
            ? { securityKeys: webhookInput.securityKeys }
            : {}),
          ...(webhookInput.allowedSourceIps !== undefined
            ? { allowedSourceIps: webhookInput.allowedSourceIps }
            : {}),
          ...(webhookInput.transmissionTimeToleranceMs !== undefined
            ? { transmissionTimeToleranceMs: webhookInput.transmissionTimeToleranceMs }
            : {}),
          ...(webhookInput.clock !== undefined ? { clock: webhookInput.clock } : {}),
          // §3.1 — confirm측 자동 저장과 같은 store의 getSecret이 웹훅 대조에 쓰인다(1회 배선)
          ...(config.depositSecrets !== undefined ? { depositSecrets: config.depositSecrets } : {}),
          ...(events !== undefined ? { events } : {}),
          // TossServerClient가 PaymentLookup을 구조적으로 충족한다(webhook→server 의존 없음)
          ...(webhookInput.autoRefetch === true ? { autoRefetch: { client } } : {}),
        };
  const webhook = webhookConfig === undefined ? undefined : createWebhookVerifier(webhookConfig);

  return {
    client,
    events: events ?? NOOP_EVENTS,
    ...(confirm !== undefined ? { confirm } : {}),
    ...(billing !== undefined ? { billing } : {}),
    ...(webhook !== undefined ? { webhook } : {}),
  };
}

/**
 * forRootAsync 등 간접 전달에서 `const` 추론을 고정하는 identity — 타입 보존용 (설계 §4 필수 사용).
 *
 * 팩토리 함수가 config를 반환하는 경로(NestJS useFactory 등)에서는 리터럴 추론이 풀려
 * 조건부 프로퍼티 판정이 무너질 수 있다 — 이 함수로 감싸 정의 시점에 타입을 고정하고,
 * `typeof` 로 배선 판정이 보존된 config 타입을 재사용하라.
 */
export function defineTossPaymentsConfig<
  E extends Env,
  const C extends TossPaymentsApiConfig<E> | TossPaymentsWidgetConfig<E>,
>(config: C): C {
  return config;
}
