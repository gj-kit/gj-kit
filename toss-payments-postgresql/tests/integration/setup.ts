/**
 * 통합 테스트 셋업 — 루트 .env를 process.env로 로드한다 (dotenv 의존성 금지,
 * toss-payments/tests/integration/setup.ts 선례).
 *
 * toss-payments와 달리 .env 부재 자체는 실패가 아니다 — CI/스크립트가
 * TOSS_PG_TEST_DATABASE_URL을 인라인 환경변수로 줄 수 있기 때문이다. 실패 조건은
 * 오직 하나: 어느 경로로도 접속 URL이 없는 상태. 그때는 docker 기동법까지 담은
 * 한국어 안내로 즉시 중단한다(원인 추적이 빠른 fail-fast).
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
}

const url = process.env['TOSS_PG_TEST_DATABASE_URL'];
if (url === undefined || url.length === 0) {
  throw new Error(
    [
      '통합 테스트에는 실 PostgreSQL 접속 URL(TOSS_PG_TEST_DATABASE_URL)이 필요합니다.',
      '',
      '1) 동봉된 docker-compose로 테스트 전용 PostgreSQL을 띄우세요:',
      '   docker compose -f toss-payments-postgresql/docker-compose.yml up -d --wait',
      '',
      '2) 모노레포 루트 .env에 아래 한 줄을 추가하세요 (.env.example 참고):',
      '   TOSS_PG_TEST_DATABASE_URL=postgres://toss_pg_test:toss_pg_test@localhost:55432/toss_pg_test',
      '',
      `(.env 탐색 경로: ${rootEnvPath} — 인라인 환경변수로 주어도 됩니다.)`,
    ].join('\n'),
  );
}
