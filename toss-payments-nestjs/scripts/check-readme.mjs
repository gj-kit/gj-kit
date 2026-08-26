#!/usr/bin/env node
/**
 * Nest README의 운영 경계를 고정한다.
 *
 * 타입 시그니처는 `tests/types/docs-golden-path.test-d.ts`가 실제 src 표면에 대해
 * 검사하고, 이 스크립트는 README가 그 골든 패스(키 쌍 분리 + trusted proxy의 명시적
 * sourceIp + packed artifact handoff)를 잃지 않도록 문서의 필수 표식을 확인한다. 코드 블록을 문자열로 복제해
 * 검증하면 앱 소유 Prisma 타입 같은 주변 의존성 때문에 오히려 약한 any 검사로 흐르므로,
 * 공개 API 타입 검증과 문서 계약 검증을 분리한다.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmeName = process.env.README_PATH ?? 'README.md';
const readme = readFileSync(resolve(packageRoot, readmeName), 'utf8');

const koreanRequired = [
  '## 여러 Toss 키 쌍을 함께 쓴다면: named kit으로 분리',
  'TossPaymentsModule.registerAsync({',
  "name: 'billing'",
  "name: 'widget'",
  "@InjectTossPayments('billing')",
  "@InjectTossPayments('widget')",
  'socket.remoteAddress',
  'sourceIpFromTrustedIngress',
  'X-Forwarded-For',
  '## 배포 산출물 handoff',
  'dist/gj-kit-provenance.json',
  'file:vendor/...tgz',
];

const englishRequired = [
  '# @gj-kit/toss-payments-nestjs',
  '[한국어](./README.ko.md)',
  'pnpm add @gj-kit/toss-payments-nestjs',
  'https://gj-kit.github.io/gj-kit/packages/toss-payments-nestjs/',
  'https://gj-kit.github.io/gj-kit/api/toss-payments-nestjs/',
];

const required = readmeName === 'README.ko.md' ? koreanRequired : englishRequired;

const missing = required.filter((marker) => !readme.includes(marker));
if (missing.length > 0) {
  console.error('README 운영 설정 표식이 누락되었습니다:');
  for (const marker of missing) console.error(`- ${marker}`);
  process.exit(1);
}

console.log(`README 운영 설정 표식 ${required.length}개 확인 + docs golden-path type test는 선행 통과.`);
