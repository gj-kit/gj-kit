/**
 * browser — optional peer(@tosspayments/tosspayments-sdk) 동적 import 실패 경로.
 * mock 팩토리가 throw하면 동적 import가 거부된다 — 미설치 환경 재현.
 */
import { describe, expect, it, vi } from 'vitest';

import { orThrow, parseApiClientKey, parseWidgetClientKey, widgetCustomerKey } from '../../src/index';
import { loadWidgets, requestBillingAuth } from '../../src/browser';

vi.mock('@tosspayments/tosspayments-sdk', () => {
  throw new Error("Cannot find module '@tosspayments/tosspayments-sdk'");
});

const gck = orThrow(parseWidgetClientKey('test_gck_docs_abc'));
const ck = orThrow(parseApiClientKey('test_ck_docs_abc'));
const wck = orThrow(widgetCustomerKey('cust-001'));

describe('SDK 미설치 (동적 import 실패)', () => {
  it('loadWidgets → load-failed Err (cause 보존)', async () => {
    const result = await loadWidgets(gck, wck);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('load-failed');
      if (result.error.kind === 'load-failed') {
        expect(result.error.cause).toBeInstanceOf(Error);
      }
    }
  });

  it('requestBillingAuth → SdkError(SDK_LOAD_FAILED) — 에러 채널이 SdkError뿐', async () => {
    const result = await requestBillingAuth(ck, wck, {
      method: 'CARD',
      successUrl: 'https://shop.example/billing/callback',
      failUrl: 'https://shop.example/billing/fail',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe('sdk');
      expect(result.error.code).toBe('SDK_LOAD_FAILED');
    }
  });
});
