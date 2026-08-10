/**
 * ESM+CJS 듀얼 빌드 스모크 (설계 §4.1 — Nest 호환 CJS 필수).
 *
 * dist가 없으면(빌드 전 fresh 체크아웃) 스킵한다 — `pnpm build` 후 실행이 검증 경로다.
 * Symbol.for 토큰이 ESM/CJS 이중 로드에서도 동일함을 함께 고정한다(§4.2 채택 근거).
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const cjsUrl = new URL('../../dist/index.cjs', import.meta.url);
const esmUrl = new URL('../../dist/index.js', import.meta.url);
const built = existsSync(cjsUrl) && existsSync(esmUrl);

describe.skipIf(!built)('듀얼 빌드 스모크 — dist/index.{js,cjs}', () => {
  it('CJS require — 공개 표면 4종이 노출된다', () => {
    // eslint 없음 — 동적 require는 CJS 소비자 재현이 목적
    const mod = require(cjsUrl.pathname) as Record<string, unknown>;
    expect(typeof mod['TossPaymentsModule']).toBe('function');
    expect(typeof mod['InjectTossPayments']).toBe('function');
    expect(typeof mod['toNestWebhookHandler']).toBe('function');
    expect(mod['TOSS_PAYMENTS']).toBe(Symbol.for('@gj-kit/toss-payments-nestjs:facade'));
  });

  it('ESM import — CJS와 동일 토큰(이중 로드에도 Symbol.for 보장)', async () => {
    const esm = (await import(/* @vite-ignore */ esmUrl.href)) as Record<string, unknown>;
    const cjs = require(cjsUrl.pathname) as Record<string, unknown>;
    expect(typeof esm['TossPaymentsModule']).toBe('function');
    expect(esm['TOSS_PAYMENTS']).toBe(cjs['TOSS_PAYMENTS']);
  });

  it('CJS forRoot 산출물 — DynamicModule 형태(providers/exports/global)', () => {
    const mod = require(cjsUrl.pathname) as {
      TossPaymentsModule: {
        forRootAsync(options: { useFactory: () => unknown }): {
          module: unknown;
          global?: boolean;
          providers: readonly { provide: unknown }[];
          exports: readonly unknown[];
        };
      };
      TOSS_PAYMENTS: symbol;
    };
    // 키 파싱 없이 모듈 형태만 스모크 — useFactory는 컴파일 전이라 실행되지 않는다
    const dynamic = mod.TossPaymentsModule.forRootAsync({ useFactory: () => ({}) });
    expect(dynamic.module).toBe(mod.TossPaymentsModule);
    expect(dynamic.global).toBe(true);
    expect(dynamic.providers[0]?.provide).toBe(mod.TOSS_PAYMENTS);
    expect(dynamic.exports).toEqual([mod.TOSS_PAYMENTS]);
  });
});
