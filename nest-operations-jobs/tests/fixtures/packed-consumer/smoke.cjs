/**
 * CJS 해상도 + 실제 Nest 부팅 + 잡 1건 실행 + provenance 스탬프 확인.
 */
require('reflect-metadata');

const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { Injectable, Module } = require('@nestjs/common');
const { NestFactory } = require('@nestjs/core');

const nest = require('@gj-kit/nest-operations-jobs');
const core = require('@gj-kit/nest-operations-jobs/core');
const testing = require('@gj-kit/nest-operations-jobs/testing');

function assertProvenance() {
  const packageRoot = dirname(dirname(require.resolve('@gj-kit/nest-operations-jobs')));
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const stamp = JSON.parse(
    readFileSync(join(packageRoot, 'dist', 'gj-kit-provenance.json'), 'utf8'),
  );
  if (manifest.name !== '@gj-kit/nest-operations-jobs' || stamp.package !== manifest.name) {
    throw new Error('Unexpected packed package identity.');
  }
  if (stamp.version !== manifest.version || !/^[0-9a-f]{40,64}$/u.test(stamp.sourceCommit)) {
    throw new Error('The packed artifact has no valid immutable provenance stamp.');
  }
}

class SmokeJob {
  constructor() {
    this.key = 'smoke.run';
    this.description = 'packed consumer smoke job';
    this.ran = 0;
  }
  async run() {
    this.ran += 1;
    return { ok: true };
  }
}
Injectable()(SmokeJob);
nest.OperationsJobDefinition()(SmokeJob);

class ConsumerModule {}
const store = testing.memoryJobRunStore();
Module({
  imports: [
    nest.OperationsJobsModule.forRoot({
      store,
      auth: { secret: 'p'.repeat(32) },
      logger: core.silentJobLogger(),
    }),
  ],
  providers: [SmokeJob],
})(ConsumerModule);

async function main() {
  assertProvenance();

  if (typeof core.createJobRunner !== 'function' || typeof nest.toHttpException !== 'function') {
    throw new Error('Packed CJS public exports did not resolve for this consumer.');
  }

  const app = await NestFactory.createApplicationContext(ConsumerModule, { logger: false });
  try {
    const runner = app.get(nest.JOB_RUNNER);
    const result = await runner.execute('smoke.run', undefined, { source: 'CLI' });
    if (result.status !== 'SUCCEEDED' || result.recorded !== 'settled') {
      throw new Error(`Packed Nest consumer ran the job as ${result.status}/${result.recorded}.`);
    }
    if (app.get(SmokeJob).ran !== 1 || store.runs().length !== 1) {
      throw new Error('The discovered job did not run exactly once through the packed runner.');
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
