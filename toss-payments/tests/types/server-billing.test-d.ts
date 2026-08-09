import { describe, it } from 'vitest';

import { createBillingFlow } from '../../src/server';
import type {
  AuthKeyReceived,
  BillingFlow,
  BillingKeyStore,
  BillingOrder,
  BillingProfile,
  DirectCardIssueInput,
  PendingBillingAuth,
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
});
