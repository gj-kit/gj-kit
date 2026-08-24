/**
 * §2.1 · §5.5-⑥ — Nest 없는 `./core` 로드.
 * 이 파일은 픽스처의 node_modules에서 @nestjs·rxjs·reflect-metadata를 지운 뒤 실행된다.
 * "Nest 없는 워커·람다" 주장을 모듈 그래프 계층에서 증명하는 유일한 실행이다
 * (설치 계층의 비용은 이 테스트로도 없어지지 않는다 — required peer이므로 설치는 된다).
 */
const core = require('@gj-kit/nest-operations-jobs/core');
const testing = require('@gj-kit/nest-operations-jobs/testing');

for (const id of ['@nestjs/common', '@nestjs/core', 'rxjs', 'reflect-metadata']) {
  try {
    require.resolve(id);
    throw new Error(`${id} is still installed; this fixture must run without the Nest peers.`);
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') throw error;
  }
}

async function main() {
  const registry = core.createJobRegistry([
    {
      key: 'core.only',
      description: 'runs without Nest',
      run: async () => ({ ok: true }),
    },
  ]);
  const store = testing.memoryJobRunStore();
  const runner = core.createJobRunner({ registry, store, logger: core.silentJobLogger() });
  const result = await runner.execute('core.only', undefined, { source: 'CLI' });
  if (result.status !== 'SUCCEEDED') {
    throw new Error(`The framework-free runner reported ${result.status}.`);
  }
  if (store.runs().length !== 1) throw new Error('No run row was recorded.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
