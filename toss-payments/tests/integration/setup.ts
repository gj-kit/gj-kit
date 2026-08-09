/**
 * 통합 테스트 셋업 — 루트 .env를 process.env로 로드한다 (dotenv 의존성 금지).
 * 주의: 토스 테스트 환경 분당 100건 제한 — 통합 테스트는 직렬 실행된다(fileParallelism: false).
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(rootEnvPath)) {
  loadEnvFile(rootEnvPath);
} else {
  throw new Error(
    '통합 테스트에는 모노레포 루트의 .env가 필요합니다 (TOSS_SECRET_KEY 등). ' +
      `찾은 경로: ${rootEnvPath}`,
  );
}
