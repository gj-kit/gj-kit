import { describe, expect, it } from 'vitest';

import { customerKey, isErr, isOk, orThrow, orderId, orderName } from '../../src/server';
import {
  confirmPendingAuth,
  createBillingFlow,
  createTossClient,
  parseApiSecretKey,
  parseBillingAuthCallback,
  recoverBillingKeyRecord,
  type AuthKeyReceived,
  type BillingKeyRecord,
  type BillingKeyStore,
  type BillingProfile,
} from '../../src/server';
import { mockFetch, rawPayment, type RecordedCall } from './helpers';

const CK = 'cust-0001';
const sessionCk = () => orThrow(customerKey(CK));

function apiClient(fetchImpl: typeof fetch) {
  return createTossClient(orThrow(parseApiSecretKey('test_sk_abcdef')), { fetch: fetchImpl });
}

function memoryBillingStore(): BillingKeyStore & { readonly map: Map<string, BillingKeyRecord> } {
  const map = new Map<string, BillingKeyRecord>();
  return {
    map,
    save: async (record) => {
      map.set(record.customerKey, record);
    },
    find: async (ck) => map.get(ck) ?? null,
    delete: async (ck) => {
      map.delete(ck);
    },
  };
}

const issueResponse = {
  mId: 'tvivarepublica',
  customerKey: CK,
  authenticatedAt: '2026-08-09T12:00:00+09:00',
  method: '카드',
  billingKey: 'bill_abcdef=',
  card: { issuerCode: '21', number: '941000******890', cardType: '신용', ownerType: '개인' },
};

const CALLBACK = `?customerKey=${CK}&authKey=auth-one-time-key`;

function authorizedPending() {
  const parsed = orThrow(parseBillingAuthCallback(CALLBACK));
  if (parsed.status !== 'authorized') throw new Error('authorized여야 한다');
  return parsed.pending;
}

function receivedAuth(): AuthKeyReceived {
  return orThrow(confirmPendingAuth(authorizedPending(), sessionCk()));
}

describe('parseBillingAuthCallback — authKey 봉인', () => {
  it('authKey는 공개 필드가 아니다 — JSON/열거 어디에도 새지 않는다', () => {
    const pending = authorizedPending();
    expect(pending.returnedCustomerKey).toBe(CK);
    expect(JSON.stringify(pending)).not.toContain('auth-one-time-key');
    expect(Object.values({ ...pending })).not.toContain('auth-one-time-key');
  });

  it('사용자 취소/실패 variant 분리, 파라미터 전무 → missing-param', () => {
    const canceled = orThrow(parseBillingAuthCallback('?code=PAY_PROCESS_CANCELED&message=x'));
    expect(canceled.status).toBe('user-canceled');
    const failed = orThrow(
      parseBillingAuthCallback('?code=REJECT_CARD_COMPANY&message=%EA%B1%B0%EC%A0%88'),
    );
    if (failed.status === 'failed') expect(failed.message).toBe('거절');
    else expect.unreachable('failed여야 한다');
    expect(isErr(parseBillingAuthCallback('?foo=bar'))).toBe(true);
  });
});

describe('confirmPendingAuth — 세션 customerKey 대조', () => {
  it('세션 값과 일치해야만 AuthKeyReceived — customerKey는 세션 유래 값', () => {
    const auth = receivedAuth();
    expect(auth.customerKey).toBe(CK);
  });

  it('불일치 → Err, 에러 값은 마스킹된다', () => {
    const r = confirmPendingAuth(authorizedPending(), orThrow(customerKey('other-user-42')));
    expect(isErr(r)).toBe(true);
    if (isErr(r)) {
      expect(r.error.kind).toBe('customer-key-mismatch');
      expect(r.error.expected).not.toBe('other-user-42');
      expect(r.error.returned).not.toBe(CK);
      expect(r.error.returned).toContain('***');
    }
  });
});

describe('billing.issue — store.save 성공 후에만 Ok', () => {
  it('발급 요청 body {authKey, customerKey} + 저장 + billingKey 봉인 프로필', async () => {
    const pair = mockFetch(() => ({ status: 200, body: issueResponse }));
    const store = memoryBillingStore();
    const billing = createBillingFlow(apiClient(pair.fetch), store);

    const r = await billing.issue(receivedAuth());
    expect(isOk(r)).toBe(true);
    if (!r.ok) return;

    expect(pair.calls[0]?.url).toBe(
      'https://api.tosspayments.com/v1/billing/authorizations/issue',
    );
    expect(JSON.parse(pair.calls[0]?.body ?? '{}')).toEqual({
      authKey: 'auth-one-time-key',
      customerKey: CK,
    });
    // 저장 완료 — record에만 raw 쌍이 보인다
    expect(store.map.get(CK)?.billingKey).toBe('bill_abcdef=');
    // 프로필에는 billingKey가 어디에도 노출되지 않는다
    expect(r.value.maskedSource).toBe('941000******890');
    expect(JSON.stringify(r.value)).not.toContain('bill_abcdef=');
    expect(Object.values({ ...r.value })).not.toContain('bill_abcdef=');
  });

  it('저장 실패 → Err에 발급 record 동봉 — billingKey는 봉인, recoverBillingKeyRecord로만 회수', async () => {
    const pair = mockFetch(() => ({ status: 200, body: issueResponse }));
    const boom = new Error('db down');
    const store: BillingKeyStore = {
      save: async () => {
        throw boom;
      },
      find: async () => null,
      delete: async () => undefined,
    };
    const billing = createBillingFlow(apiClient(pair.fetch), store);
    const r = await billing.issue(receivedAuth());
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error && r.error.kind === 'store-save-failed') {
      expect(r.error.cause).toBe(boom);
      // 에러 객체 통째 로깅(JSON.stringify) — billingKey 평문이 어디에도 새지 않는다
      expect(JSON.stringify(r.error)).not.toContain('bill_abcdef=');
      expect(Object.values({ ...r.error.issuedRecord })).not.toContain('bill_abcdef=');
      expect(r.error.issuedRecord.customerKey).toBe(CK);
      // 회수는 recoverBillingKeyRecord로만 — store.save 재시도용 원본 record 복원
      const recovered = recoverBillingKeyRecord(r.error.issuedRecord);
      expect(isOk(recovered)).toBe(true);
      if (isOk(recovered)) {
        expect(recovered.value.billingKey).toBe('bill_abcdef=');
        expect(recovered.value.customerKey).toBe(CK);
        expect(recovered.value.method).toBe('카드');
      }
      // 스프레드 복제본은 봉인 소실 — 명시적 Err
      const detached = recoverBillingKeyRecord({ ...r.error.issuedRecord });
      expect(isErr(detached)).toBe(true);
      if (isErr(detached)) expect(detached.error.kind).toBe('record-detached');
    } else {
      expect.unreachable('store-save-failed여야 한다');
    }
  });

  it('스프레드 복제 auth(봉인 소실) → auth-detached', async () => {
    const pair = mockFetch(() => ({ status: 200, body: issueResponse }));
    const billing = createBillingFlow(apiClient(pair.fetch), memoryBillingStore());
    const cloned = { ...receivedAuth() } as AuthKeyReceived; // 비열거 봉인 소실
    const r = await billing.issue(cloned);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error) expect(r.error.kind).toBe('auth-detached');
    else expect.unreachable('library 실패여야 한다');
    expect(pair.calls.length).toBe(0);
  });
});

describe('billing.approve — 봉인 쌍으로만 승인', () => {
  const approveResponse = () =>
    rawPayment({ type: 'BILLING', status: 'DONE', orderId: 'sub-202608-0001' });

  async function issuedProfile(pair: { fetch: typeof fetch; calls: RecordedCall[] }) {
    const store = memoryBillingStore();
    const billing = createBillingFlow(apiClient(pair.fetch), store);
    const profile = orThrow(await billing.issue(receivedAuth()));
    return { billing, profile, store };
  }

  const order = () => ({
    orderId: orThrow(orderId('sub-202608-0001')),
    orderName: orThrow(orderName('2026년 8월 구독')),
    amount: 12_900,
  });

  it('POST /v1/billing/{billingKey} — customerKey는 봉인 쌍(profile)의 값만 전송된다', async () => {
    let approveCall: RecordedCall | undefined;
    const pair = mockFetch((call, index) => {
      if (index === 0) return { status: 200, body: issueResponse };
      approveCall = call;
      return { status: 200, body: approveResponse() };
    });
    const { billing, profile } = await issuedProfile(pair);

    const paid = await billing.approve(profile, order());
    expect(isOk(paid)).toBe(true);
    if (isOk(paid)) expect(paid.value.status).toBe('DONE');

    // billingKey는 경로에 percent-encoding으로 (= 포함 키 실측 대응)
    expect(approveCall?.url).toBe('https://api.tosspayments.com/v1/billing/bill_abcdef%3D');
    const body = JSON.parse(approveCall?.body ?? '{}') as Record<string, unknown>;
    expect(body['customerKey']).toBe(CK);
    expect(body['amount']).toBe(12_900);
  });

  it('approve 200 + 빈 body → 빈 BillingPayment 제조 금지 — TransportFailure(재시도 가능)', async () => {
    const pair = mockFetch((_call, index) =>
      index === 0 ? { status: 200, body: issueResponse } : { status: 200 }, // 승인 응답이 0바이트
    );
    const { billing, profile } = await issuedProfile(pair);
    const r = await billing.approve(profile, order());
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'network') {
      expect(r.error.code).toBe('NETWORK_ERROR');
      expect(r.error.retryable).toBe(true);
    } else {
      expect.unreachable('network 실패여야 한다 — 전부 undefined인 결제가 승인 성공으로 새면 안 된다');
    }
  });

  it('스프레드 복제 profile(봉인 소실) → profile-detached, API 미호출', async () => {
    const pair = mockFetch(() => ({ status: 200, body: issueResponse }));
    const { billing, profile } = await issuedProfile(pair);
    const callsBefore = pair.calls.length;

    const cloned = { ...profile } as BillingProfile; // 비열거 봉인 소실
    const r = await billing.approve(cloned, order());
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'kind' in r.error && r.error.kind === 'profile-detached')
      expect(r.error.customerKey).toBe(CK);
    else expect.unreachable('profile-detached여야 한다');
    expect(pair.calls.length).toBe(callsBefore);
  });

  it('billing.load — 스토어 재수화로 봉인이 복원된다 (복구 API)', async () => {
    const pair = mockFetch((_call, index) =>
      index === 0 ? { status: 200, body: issueResponse } : { status: 200, body: approveResponse() },
    );
    const { billing } = await issuedProfile(pair);

    const loaded = orThrow(await billing.load(sessionCk()));
    expect(loaded).not.toBeNull();
    if (loaded === null) return;
    const paid = await billing.approve(loaded, order());
    expect(isOk(paid)).toBe(true);
  });

  it('미보관 customerKey → load는 Ok(null)', async () => {
    const pair = mockFetch(() => ({ status: 200, body: issueResponse }));
    const billing = createBillingFlow(apiClient(pair.fetch), memoryBillingStore());
    const r = await billing.load(orThrow(customerKey('nobody-1')));
    expect(isOk(r)).toBe(true);
    if (isOk(r)) expect(r.value).toBeNull();
  });
});

describe('billing.revoke — DELETE + store.delete', () => {
  it('삭제 성공 시 스토어에서도 제거된다', async () => {
    const pair = mockFetch((_call, index) =>
      index === 0 ? { status: 200, body: issueResponse } : { status: 200 },
    );
    const store = memoryBillingStore();
    const billing = createBillingFlow(apiClient(pair.fetch), store);
    const profile = orThrow(await billing.issue(receivedAuth()));

    const r = await billing.revoke(profile);
    expect(isOk(r)).toBe(true);
    expect(pair.calls[1]?.method).toBe('DELETE');
    expect(pair.calls[1]?.url).toBe('https://api.tosspayments.com/v1/billing/bill_abcdef%3D');
    expect(store.map.has(CK)).toBe(false);
  });

  it('이미 삭제된 키 → 400 ALREADY_REMOVED_BILLING_KEY (재발급 유도)', async () => {
    const pair = mockFetch((_call, index) =>
      index === 0
        ? { status: 200, body: issueResponse }
        : { status: 400, body: { code: 'ALREADY_REMOVED_BILLING_KEY', message: '이미 삭제된 빌링키입니다.' } },
    );
    const billing = createBillingFlow(apiClient(pair.fetch), memoryBillingStore());
    const profile = orThrow(await billing.issue(receivedAuth()));
    const r = await billing.revoke(profile);
    expect(isErr(r)).toBe(true);
    if (isErr(r) && 'source' in r.error && r.error.source === 'toss') {
      expect(r.error.code).toBe('ALREADY_REMOVED_BILLING_KEY');
    } else {
      expect.unreachable('toss 실패여야 한다');
    }
  });
});

describe('billing.import — 마이그레이션 이관 경로 (§7 확정 6)', () => {
  const validRecord: BillingKeyRecord = {
    customerKey: CK,
    billingKey: 'bill_migrated_1',
    method: '카드',
    issuedAt: '2025-01-01T00:00:00+09:00',
    card: { issuerCode: '21', number: '433012******890', cardType: '신용', ownerType: '개인' },
    transfers: null,
  };

  it('형식 검증 통과 → store.save 후 BillingProfile 반환 (approve 가능)', async () => {
    const pair = mockFetch(() => ({
      status: 200,
      body: rawPayment({ type: 'BILLING', status: 'DONE' }),
    }));
    const store = memoryBillingStore();
    const billing = createBillingFlow(apiClient(pair.fetch), store);

    const r = await billing.import(validRecord);
    expect(isOk(r)).toBe(true);
    expect(store.map.get(CK)?.billingKey).toBe('bill_migrated_1');
    if (!r.ok) return;

    const paid = await billing.approve(r.value, {
      orderId: orThrow(orderId('sub-202608-0002')),
      orderName: orThrow(orderName('이관 후 첫 결제')),
      amount: 1000,
    });
    expect(isOk(paid)).toBe(true);
    expect(pair.calls[0]?.url).toBe('https://api.tosspayments.com/v1/billing/bill_migrated_1');
  });

  it('형식 위반 record는 저장 전에 거부된다', async () => {
    const pair = mockFetch(() => ({ status: 200 }));
    const store = memoryBillingStore();
    const billing = createBillingFlow(apiClient(pair.fetch), store);

    const emptyKey = await billing.import({ ...validRecord, billingKey: '' });
    if (isErr(emptyKey) && emptyKey.error.kind === 'invalid-input') {
      expect(emptyKey.error.field).toBe('billingKey');
    } else {
      expect.unreachable('invalid-input(billingKey)여야 한다');
    }

    const badCk = await billing.import({ ...validRecord, customerKey: 'x' }); // 2자 미만
    if (isErr(badCk) && badCk.error.kind === 'invalid-input') {
      expect(badCk.error.field).toBe('customerKey');
    } else {
      expect.unreachable('invalid-input(customerKey)여야 한다');
    }
    expect(store.map.size).toBe(0);
  });
});

describe('billing capability — issueWithCard (옵트인)', () => {
  it('capabilities.directCardIssue 선언 시에만 존재하며 /authorizations/card로 발급한다', async () => {
    const pair = mockFetch(() => ({ status: 200, body: issueResponse }));
    const store = memoryBillingStore();
    const billing = createBillingFlow(apiClient(pair.fetch), store, {
      capabilities: { directCardIssue: true },
    });

    const r = await billing.issueWithCard({
      customerKey: sessionCk(),
      cardNumber: '9410001234567890', // Phase 0 실측 표준 테스트 카드
      cardExpirationYear: '30',
      cardExpirationMonth: '12',
      customerIdentityNumber: '900101',
      cardPassword: '12',
    });
    expect(isOk(r)).toBe(true);
    expect(pair.calls[0]?.url).toBe(
      'https://api.tosspayments.com/v1/billing/authorizations/card',
    );
    const body = JSON.parse(pair.calls[0]?.body ?? '{}') as Record<string, unknown>;
    expect(body['cardNumber']).toBe('9410001234567890');
    expect(store.map.has(CK)).toBe(true);
  });
});
