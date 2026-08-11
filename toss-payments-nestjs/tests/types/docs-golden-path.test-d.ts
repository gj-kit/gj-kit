/** Published NestJS landing-page composition — keep the documented imports and
 * forRootAsync configuration aligned with the supported public surface. */
import { describe, it } from 'vitest';

import { orThrow } from '@gj-kit/toss-payments';
import {
  defineTossPaymentsConfig,
  parseApiSecretKey,
  type OrderStore,
} from '@gj-kit/toss-payments/server';

import { TossPaymentsModule } from '../../src/index';

class TossOrderStore implements OrderStore {
  async saveOrder(): Promise<void> {}

  async loadOrder(): Promise<null> {
    return null;
  }
}

describe('NestJS landing-page golden path', () => {
  it('accepts an app provider through forRootAsync', () => {
    void TossPaymentsModule.forRootAsync({
      inject: [TossOrderStore],
      useFactory: (orders: TossOrderStore) =>
        defineTossPaymentsConfig({
          secretKey: orThrow(parseApiSecretKey('test_sk_docs-golden-path')),
          orders,
        }),
    });
  });
});
