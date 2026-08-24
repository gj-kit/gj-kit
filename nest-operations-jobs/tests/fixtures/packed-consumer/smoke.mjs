/**
 * ESM 해상도 — 공개 3엔트리가 전부 import되고, peer 심볼의 출처가 설계 근거대로 갈린다.
 */
import { createRequire } from 'node:module';

import * as nest from '@gj-kit/nest-operations-jobs';
import * as core from '@gj-kit/nest-operations-jobs/core';
import * as testing from '@gj-kit/nest-operations-jobs/testing';

const require = createRequire(import.meta.url);

if (
  typeof nest.OperationsJobsModule?.forRoot !== 'function' ||
  typeof nest.OperationsJobDefinition !== 'function' ||
  typeof nest.runOperationsJobCli !== 'function' ||
  typeof core.createJobRunner !== 'function' ||
  typeof core.createJobRegistry !== 'function' ||
  typeof testing.memoryJobRunStore !== 'function' ||
  typeof testing.jobRunStoreContractCases !== 'function'
) {
  throw new Error('Packed ESM public exports did not resolve for this consumer.');
}

// `.` 배럴은 코어 런타임 값을 재수출하지 않는다 — 값의 단일 출처 규칙(§2.1).
if ('createJobRunner' in nest) {
  throw new Error('The root entry re-exported a core runtime value; values must have one source.');
}

// §2.2-3 — peer 심볼의 import 출처가 근거 문장이 아니라 실제 해상도로 서게 한다.
const nestCore = require('@nestjs/core');
const nestCommon = require('@nestjs/common');
for (const symbol of ['DiscoveryService', 'DiscoveryModule', 'Reflector']) {
  if (typeof nestCore[symbol] !== 'function') {
    throw new Error(`${symbol} did not resolve from @nestjs/core.`);
  }
}
if (typeof nestCommon.Injectable !== 'function' || typeof nestCommon.SetMetadata !== 'function') {
  throw new Error('@nestjs/common did not provide the decorators this package uses.');
}
