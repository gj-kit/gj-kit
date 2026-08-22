/** public secure-storage contract — required async protector and context are source-compatible. */
import { describe, expectTypeOf, it } from 'vitest';

import {
  SENSITIVE_VALUE_PURPOSE,
  createSensitiveValueContext,
  unsafePlaintextSensitiveValueProtector,
} from '../../src/index';
import type {
  PgSensitiveStoreOptions,
  SensitiveValueContext,
  SensitiveValueProtector,
  SensitiveValuePurpose,
} from '../../src/index';

describe('SensitiveValueProtector public contract', () => {
  it('async encrypt/decrypt and immutable purpose + recordId context shape are exported', () => {
    expectTypeOf<SensitiveValueProtector>().toMatchTypeOf<{
      encrypt(plaintext: string, context: SensitiveValueContext): Promise<string>;
      decrypt(ciphertext: string, context: SensitiveValueContext): Promise<string>;
    }>();
    expectTypeOf(unsafePlaintextSensitiveValueProtector).toEqualTypeOf<SensitiveValueProtector>();
    expectTypeOf(createSensitiveValueContext).returns.toEqualTypeOf<SensitiveValueContext>();

    const purpose: SensitiveValuePurpose = SENSITIVE_VALUE_PURPOSE.billingKey;
    const options: PgSensitiveStoreOptions = {
      sensitiveValueProtector: unsafePlaintextSensitiveValueProtector,
    };
    void [purpose, options];
  });

  it('purpose labels are closed and a partial/plain synchronous protector cannot typecheck', () => {
    // @ts-expect-error unregistered purpose cannot accidentally create a different AAD namespace
    const badPurpose: SensitiveValuePurpose = 'billing-key-v2';
    void badPurpose;
    // @ts-expect-error decrypt missing + encrypt is not Promise<string>
    const invalidProtector: SensitiveValueProtector = { encrypt: () => 'plaintext' };
    void invalidProtector;
    // @ts-expect-error direct sensitive-store options cannot omit the required protector
    const missingProtector: PgSensitiveStoreOptions = {};
    void missingProtector;
  });
});
