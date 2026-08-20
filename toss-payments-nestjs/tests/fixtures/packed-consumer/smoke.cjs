require('reflect-metadata');

const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { Module, Injectable } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');
const { orThrow } = require('@gj-kit/toss-payments');
const { defineTossPaymentsConfig, parseApiSecretKey } = require('@gj-kit/toss-payments/server');
const {
  getTossPaymentsToken,
  InjectTossPayments,
  TossPaymentsModule,
} = require('@gj-kit/toss-payments-nestjs');

function packageRootFromEntry(entry) {
  return dirname(dirname(require.resolve(entry)));
}

function assertProvenance(entry, expectedPackage) {
  const packageRoot = packageRootFromEntry(entry);
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const stamp = JSON.parse(readFileSync(join(packageRoot, 'dist', 'gj-kit-provenance.json'), 'utf8'));
  if (manifest.name !== expectedPackage || stamp.package !== expectedPackage) {
    throw new Error(`Unexpected packed package identity for ${expectedPackage}.`);
  }
  if (stamp.version !== manifest.version || !/^[0-9a-f]{40,64}$/u.test(stamp.sourceCommit)) {
    throw new Error(`${expectedPackage} has no valid immutable provenance stamp.`);
  }
}

class ConsumerService {
  constructor(toss) {
    this.toss = toss;
  }
}
Injectable()(ConsumerService);
InjectTossPayments('billing')(ConsumerService, undefined, 0);

class ConsumerModule {}
const config = defineTossPaymentsConfig({
  secretKey: orThrow(parseApiSecretKey('test_sk_packed_nest_consumer')),
});
Module({
  imports: [TossPaymentsModule.register({ name: 'billing', config })],
  providers: [ConsumerService],
})(ConsumerModule);

async function main() {
  assertProvenance('@gj-kit/toss-payments/server', '@gj-kit/toss-payments');
  assertProvenance('@gj-kit/toss-payments-nestjs', '@gj-kit/toss-payments-nestjs');

  const app = await NestFactory.createApplicationContext(ConsumerModule, { logger: false });
  try {
    const token = getTossPaymentsToken('billing');
    const kit = app.get(token);
    const service = app.get(ConsumerService);
    if (kit !== service.toss || kit.client.keyKind !== 'api') {
      throw new Error('Named TossPayments kit was not resolved through the packed Nest consumer.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
