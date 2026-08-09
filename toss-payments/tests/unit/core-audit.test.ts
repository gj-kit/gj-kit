/**
 * §3.2 redaction 순회기 — 실측 응답 픽스처 전수 스냅샷.
 *
 * denylist는 토스가 새 민감 필드를 추가하면 누락될 수 있다(설계 잔존 리스크) —
 * 이 테스트가 AUDIT_REDACTED_KEYS 전 키의 치환을 회귀 고정한다.
 */
import { describe, expect, it } from 'vitest';

import { AUDIT_REDACTED_KEYS, redactForAudit } from '../../src/core/audit';
import { rawPayment } from './helpers';

const redacted = '[REDACTED]';
const asRecord = (v: unknown): Record<string, unknown> => v as Record<string, unknown>;

describe('AUDIT_REDACTED_KEYS — 확정 표(§3.2) 그대로', () => {
  it('denylist 8키 단일 상수 — 감사 가능(버전 관리 대상)', () => {
    expect(AUDIT_REDACTED_KEYS).toEqual([
      'cardNumber',
      'cardPassword',
      'customerIdentityNumber',
      'accountNumber',
      'secret',
      'billingKey',
      'authKey',
      'customerMobilePhone',
    ]);
  });

  it('전수 치환 — 목록의 모든 키가 어떤 깊이에서든 치환된다', () => {
    const flat: Record<string, unknown> = {};
    const nested: Record<string, unknown> = {};
    for (const key of AUDIT_REDACTED_KEYS) {
      flat[key] = `raw-${key}`;
      nested[key] = `deep-${key}`;
    }
    const out = asRecord(redactForAudit({ ...flat, child: { grand: nested } }));
    for (const key of AUDIT_REDACTED_KEYS) {
      expect(out[key]).toBe(redacted);
      expect(asRecord(asRecord(out['child'])['grand'])[key]).toBe(redacted);
    }
    // 원문이 어디에도 남지 않는다
    expect(JSON.stringify(out)).not.toContain('raw-');
    expect(JSON.stringify(out)).not.toContain('deep-');
  });
});

describe('redactForAudit — 실측 응답 픽스처 스냅샷', () => {
  it('카드 confirm 응답 — card.number(컨텍스트 규칙) + secret 치환, 나머지 보존', () => {
    // Phase 5 실측: BILLING 카드 결제 응답에도 secret이 non-null로 내려온다
    const raw = rawPayment({ secret: 'ps_live_secret_value' });
    const out = asRecord(redactForAudit(raw));

    expect(asRecord(out['card'])['number']).toBe(redacted);
    expect(out['secret']).toBe(redacted);
    // 비민감 필드는 원형 보존
    expect(out['paymentKey']).toBe(raw['paymentKey']);
    expect(out['totalAmount']).toBe(1000);
    expect(asRecord(out['card'])['issuerCode']).toBe('21');
    expect(JSON.stringify(out)).not.toContain('ps_live_secret_value');
    expect(JSON.stringify(out)).not.toContain('433012');
  });

  it('빌링 발급 요청/응답 — cardNumber/cardPassword/customerIdentityNumber/authKey/billingKey 치환', () => {
    // POST /v1/billing/authorizations/card 요청 body (직접 발급 경로 — 문서 필드)
    const issueRequest = {
      cardNumber: '4330123456789012',
      cardExpirationYear: '28',
      cardExpirationMonth: '07',
      cardPassword: '12',
      customerIdentityNumber: '900101',
      customerKey: 'cust-1',
    };
    // 발급 응답 (문서: mId, customerKey, authenticatedAt, method, billingKey, card{...})
    const issueResponse = {
      mId: 'tvivarepublica',
      customerKey: 'cust-1',
      authenticatedAt: '2026-08-09T12:00:00+09:00',
      method: '카드',
      billingKey: 'bkey-raw-value',
      card: { issuerCode: '21', number: '433012******9012', cardType: '신용' },
    };
    const authCallback = { authKey: 'auth-raw-value', customerKey: 'cust-1' };

    const req = asRecord(redactForAudit(issueRequest));
    expect(req['cardNumber']).toBe(redacted);
    expect(req['cardPassword']).toBe(redacted);
    expect(req['customerIdentityNumber']).toBe(redacted);
    expect(req['customerKey']).toBe('cust-1'); // customerKey는 denylist 아님 — 매핑 추적에 필요

    const res = asRecord(redactForAudit(issueResponse));
    expect(res['billingKey']).toBe(redacted);
    expect(asRecord(res['card'])['number']).toBe(redacted);

    const cb = asRecord(redactForAudit(authCallback));
    expect(cb['authKey']).toBe(redacted);
    expect(JSON.stringify([req, res, cb])).not.toMatch(/4330123456789012|bkey-raw-value|auth-raw-value|900101/);
  });

  it('가상계좌 취소 요청/응답 — accountNumber + refundAccount.number(컨텍스트) + customerMobilePhone 치환', () => {
    const cancelRequest = {
      cancelReason: '고객 요청',
      refundReceiveAccount: { bank: '20', accountNumber: '12345678901234', holderName: '홍길동' },
    };
    const vaResponse = rawPayment({
      method: '가상계좌',
      card: null,
      secret: 'va-secret-value',
      virtualAccount: {
        accountType: '일반',
        accountNumber: 'X9899344076559',
        bankCode: '20',
        customerName: '홍길동',
        dueDate: '2026-08-16T23:59:59+09:00',
        refundStatus: 'NONE',
        expired: false,
        settlementStatus: 'INCOMPLETED',
      },
      // refundAccount 컨텍스트 하위 number — §3.2 확정 표의 컨텍스트 규칙 2호
      refundAccount: { bank: '20', number: '99911122233344', holderName: '홍길동' },
      customerMobilePhone: '01012345678',
    });

    const req = asRecord(redactForAudit(cancelRequest));
    expect(asRecord(req['refundReceiveAccount'])['accountNumber']).toBe(redacted);
    expect(asRecord(req['refundReceiveAccount'])['holderName']).toBe('홍길동');

    const res = asRecord(redactForAudit(vaResponse));
    expect(asRecord(res['virtualAccount'])['accountNumber']).toBe(redacted);
    expect(res['secret']).toBe(redacted);
    expect(asRecord(res['refundAccount'])['number']).toBe(redacted);
    expect(res['customerMobilePhone']).toBe(redacted);
    expect(JSON.stringify(res)).not.toMatch(/va-secret-value|X9899344076559|99911122233344|01012345678/);
  });
});

describe('redactForAudit — 순회 시맨틱', () => {
  it('대소문자 무시 매칭', () => {
    const out = asRecord(redactForAudit({ CardNumber: 'x', SECRET: 'y', BillingKEY: 'z' }));
    expect(out['CardNumber']).toBe(redacted);
    expect(out['SECRET']).toBe(redacted);
    expect(out['BillingKEY']).toBe(redacted);
  });

  it('null은 치환하지 않는다 — "비어 있었다"는 사실 보존(유출 원문 없음)', () => {
    const out = asRecord(redactForAudit({ secret: null, billingKey: null }));
    expect(out['secret']).toBeNull();
    expect(out['billingKey']).toBeNull();
  });

  it('컨텍스트 규칙 — card/refundAccount 밖의 number는 보존', () => {
    const out = asRecord(redactForAudit({ number: '123', easyPay: { number: '456' } }));
    expect(out['number']).toBe('123');
    expect(asRecord(out['easyPay'])['number']).toBe('456');
  });

  it('배열은 부모 컨텍스트를 투과하며 요소를 재귀 처리한다', () => {
    const out = asRecord(redactForAudit({ cancels: [{ secret: 's1' }, { secret: 's2' }] }));
    const cancels = out['cancels'] as ReadonlyArray<Record<string, unknown>>;
    expect(cancels[0]?.['secret']).toBe(redacted);
    expect(cancels[1]?.['secret']).toBe(redacted);
  });

  it('원본 비변조 — 항상 새 객체를 반환한다', () => {
    const original = { secret: 'keep-me', card: { number: '1234' } };
    const out = asRecord(redactForAudit(original));
    expect(original.secret).toBe('keep-me');
    expect(original.card.number).toBe('1234');
    expect(out).not.toBe(original);
  });

  it('중복 참조(DAG)는 순환으로 오판하지 않고, 진짜 순환은 [CIRCULAR]로 끊는다', () => {
    const shared = { secret: 's' };
    const dag = asRecord(redactForAudit({ a: shared, b: shared }));
    expect(asRecord(dag['a'])['secret']).toBe(redacted);
    expect(asRecord(dag['b'])['secret']).toBe(redacted);

    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic['self'] = cyclic;
    const out = asRecord(redactForAudit(cyclic));
    expect(out['self']).toBe('[CIRCULAR]');
  });

  it('스칼라/undefined는 그대로 통과한다', () => {
    expect(redactForAudit(null)).toBeNull();
    expect(redactForAudit(42)).toBe(42);
    expect(redactForAudit('secret')).toBe('secret'); // 값이 아니라 "키"가 매칭 대상
    expect(asRecord(redactForAudit({ secret: undefined }))['secret']).toBeUndefined();
  });
});
