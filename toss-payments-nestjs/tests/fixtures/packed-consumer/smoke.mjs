import { createRequire } from 'node:module';

import * as core from '@gj-kit/toss-payments';
import * as server from '@gj-kit/toss-payments/server';
import * as nest from '@gj-kit/toss-payments-nestjs';

const require = createRequire(import.meta.url);
const coreCjs = require('@gj-kit/toss-payments');
const nestCjs = require('@gj-kit/toss-payments-nestjs');

if (
  typeof core.orThrow !== 'function' ||
  typeof coreCjs.orThrow !== 'function' ||
  typeof server.defineTossPaymentsConfig !== 'function' ||
  typeof nest.TossPaymentsModule?.register !== 'function' ||
  typeof nest.getTossPaymentsToken !== 'function' ||
  typeof nestCjs.InjectTossPayments !== 'function'
) {
  throw new Error('Packed Toss ESM/CJS public exports did not resolve for this consumer.');
}
