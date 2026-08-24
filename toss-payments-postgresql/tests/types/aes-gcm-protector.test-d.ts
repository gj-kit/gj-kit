/** reference AES-256-GCM protector — public option surface, protector assignability, closed error codes. */
import { describe, expectTypeOf, it } from 'vitest';

import {
  createAes256GcmSensitiveValueProtector,
  createTossPaymentsPostgres,
  isSensitiveValueProtectorError,
} from '../../src/index';
import type {
  Aes256GcmSensitiveValueProtectorOptions,
  SensitiveValueProtector,
  SensitiveValueProtectorError,
  SensitiveValueProtectorErrorCode,
  SqlClient,
} from '../../src/index';

const forge = <T>(): T => undefined as T; // 타입 테스트 전용 헬퍼

describe('createAes256GcmSensitiveValueProtector — option surface', () => {
  it('accepts a 32-byte Uint8Array/Buffer or a hex string key with an optional keyId and returns the seam protector', () => {
    expectTypeOf(createAes256GcmSensitiveValueProtector).returns.toEqualTypeOf<SensitiveValueProtector>();
    void createAes256GcmSensitiveValueProtector({ key: new Uint8Array(32) });
    void createAes256GcmSensitiveValueProtector({ key: Buffer.alloc(32) });
    void createAes256GcmSensitiveValueProtector({ key: 'a'.repeat(64), keyId: '2026-08' });

    const options: Aes256GcmSensitiveValueProtectorOptions = { key: 'a'.repeat(64) };
    void options;
    // 실제 aggregate 배선에 그대로 들어간다 — 캐스팅 0
    void createTossPaymentsPostgres({
      sql: forge<SqlClient>(),
      sensitiveValueProtector: createAes256GcmSensitiveValueProtector({ key: new Uint8Array(32) }),
    });
  });

  it('misuse is a compile error — missing key, wrong key type, unknown option keys', () => {
    // @ts-expect-error key is required
    createAes256GcmSensitiveValueProtector({});
    // @ts-expect-error key must be bytes or a hex string, not a number
    createAes256GcmSensitiveValueProtector({ key: 42 });
    // @ts-expect-error keyId is a string
    createAes256GcmSensitiveValueProtector({ key: new Uint8Array(32), keyId: 1 });
    // @ts-expect-error unknown option (e.g. a typo of keyId) cannot silently become a default
    createAes256GcmSensitiveValueProtector({ key: new Uint8Array(32), keyID: 'x' });
    // @ts-expect-error rotation lists are host-owned — no previousKeys option exists
    createAes256GcmSensitiveValueProtector({ key: new Uint8Array(32), previousKeys: [] });
  });

  it('error code union is closed and the guard narrows to SensitiveValueProtectorError', () => {
    expectTypeOf(isSensitiveValueProtectorError).guards.toEqualTypeOf<SensitiveValueProtectorError>();
    expectTypeOf<SensitiveValueProtectorError['code']>().toEqualTypeOf<SensitiveValueProtectorErrorCode>();
    const code: SensitiveValueProtectorErrorCode = 'authentication-failed';
    void code;
    // @ts-expect-error unregistered code — consumers can exhaustively branch on the union
    const bad: SensitiveValueProtectorErrorCode = 'wrong-key';
    void bad;
  });
});
