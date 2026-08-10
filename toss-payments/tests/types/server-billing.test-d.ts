import { describe, it } from 'vitest';

import { createBillingFlow, recoverBillingKeyRecord } from '../../src/server';
import type {
  AuthKeyReceived,
  BillingFlow,
  BillingFlowBase,
  BillingKeyStore,
  BillingOrder,
  BillingProfile,
  DirectCardIssueInput,
  IdempotencyKey,
  PendingBillingAuth,
  SealedBillingKeyRecord,
  TossEvents,
  TossServerClient,
} from '../../src/server';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('§3.3 billing — 오용 = 컴파일 에러', () => {
  const pending = forge<PendingBillingAuth>();
  const profile = forge<BillingProfile>();
  const basicFlow = forge<BillingFlow<'test'>>(); // capability 미선언
  const order = forge<BillingOrder>();
  const cardInput = forge<DirectCardIssueInput>();

  it('typestate 체인을 건너뛸 수 없다', () => {
    // @ts-expect-error customerKey 대조(confirmPendingAuth) 전의 PendingBillingAuth로 issue — AuthKeyReceived만 허용
    void basicFlow.issue(pending);

    // @ts-expect-error billingKey 문자열로 직접 승인 — BillingProfile(봉인 쌍)만 허용
    void basicFlow.approve('bill_abcdef', order);

    // @ts-expect-error BillingOrder에 customerKey 끼워넣기 — 필드 자체가 없음 → NOT_MATCHES_CUSTOMER_KEY 원천 봉쇄
    void basicFlow.approve(profile, { ...order, customerKey: 'other-user' });
  });

  it('없는 능력/메서드는 타입에 존재하지 않는다', () => {
    // @ts-expect-error 카드 직접 발급은 옵트인 capability — 미선언 플로우에 메서드가 존재하지 않음
    void basicFlow.issueWithCard(cardInput);

    // @ts-expect-error refresh류는 설계상 부재 — 갱신 API가 없음(revoke + 재발급만)
    void basicFlow.refresh(profile);
  });

  it('빌링은 API 개별키 전용 — 위젯 키 클라이언트는 컴파일 에러', () => {
    const widgetKeyClient = forge<TossServerClient<'test', 'widget'>>();
    const store = forge<BillingKeyStore>();
    // @ts-expect-error 위젯 키 클라이언트로 빌링 플로우 생성 — 'api' KeyKind만 허용
    void createBillingFlow(widgetKeyClient, store);

    const apiClient = forge<TossServerClient<'test', 'api'>>();
    void createBillingFlow(apiClient, store); // 정상 경로
  });

  it('capability 선언 시에만 issueWithCard가 존재한다', () => {
    const capFlow = forge<BillingFlow<'test', { directCardIssue: true }>>();
    void capFlow.issueWithCard(cardInput);
    const auth = forge<AuthKeyReceived>();
    void capFlow.issue(auth); // base 메서드도 유지
  });

  it('store-save-failed의 issuedRecord — billingKey 필드가 타입에 존재하지 않는다(봉인)', () => {
    const sealed = forge<SealedBillingKeyRecord>();
    // @ts-expect-error billingKey는 봉인 상태 — recoverBillingKeyRecord로만 회수 가능
    void sealed.billingKey;

    // 회수 함수는 원본 record를 돌려준다
    const recovered = recoverBillingKeyRecord(sealed);
    if (recovered.ok) {
      const key: string = recovered.value.billingKey;
      void key;
    }

    // @ts-expect-error 봉인 record를 store.save에 직접 넣을 수 없다 — billingKey 부재
    void forge<BillingKeyStore>().save(sealed);
  });
});

describe('§3.6 billing approve — 모든 구성에서 idempotencyKey 필수', () => {
  const profile = forge<BillingProfile>();
  const order = forge<BillingOrder>();
  const flow = forge<BillingFlow<'test'>>();

  it('멱등키 없는 approve = 컴파일 에러 (키 없는 approve 중복 실행 = 이중 과금)', () => {
    // @ts-expect-error options 파라미터 자체가 필수 — 멱등키 누락 원천 차단
    void flow.approve(profile, order);

    // @ts-expect-error options에 idempotencyKey가 없다 — 필수 필드
    void flow.approve(profile, order, {});

    // @ts-expect-error signal만으로는 불충분 — idempotencyKey 필수
    void flow.approve(profile, order, { signal: forge<AbortSignal>() });

    // 정상 경로 — 멱등키 부착
    void flow.approve(profile, order, { idempotencyKey: forge<IdempotencyKey>() });
  });

  it('directCardIssue capability와 병행해도 approve 강제는 유지된다', () => {
    const bothFlow = forge<
      BillingFlow<'test', { directCardIssue: true }>
    >();
    void bothFlow.issueWithCard(forge<DirectCardIssueInput>());
    // @ts-expect-error 병행 선언에서도 approve 멱등키는 필수
    void bothFlow.approve(profile, order);
    void bothFlow.approve(profile, order, { idempotencyKey: forge<IdempotencyKey>() });
  });

  it('BillingFlowBase나 기본 BillingFlow로 넓혀도 멱등키 강제를 풀 수 없다', () => {
    const strict = forge<BillingFlow<'test', { directCardIssue: true }>>();

    const base: BillingFlowBase<'test'> = strict;
    void base;

    const widened: BillingFlow<'test'> = strict;
    void widened;

    void ((b: BillingFlow<'test'>) => b.approve(profile, order, {
      idempotencyKey: forge<IdempotencyKey>(),
    }))(strict);
  });

  it('deprecated capability를 받는 기존 설정도 호환되지만 approve 계약은 동일하다', () => {
    const client = forge<TossServerClient<'test', 'api'>>();
    const store = forge<BillingKeyStore>();
    const flow = createBillingFlow(client, store, {
      capabilities: { requireApproveIdempotencyKey: true },
      events: forge<TossEvents>(),
    });
    // @ts-expect-error 기존 설정을 받아도 생성된 플로우의 멱등키는 필수
    void flow.approve(profile, order);
  });
});
