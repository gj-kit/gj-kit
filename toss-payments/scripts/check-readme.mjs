#!/usr/bin/env node
/**
 * README ts 코드블록 컴파일 검증.
 *
 * README.md의 모든 ```ts 블록을 추출해 실제 패키지 타입(src)에 대해 tsc --noEmit로
 * 검사한다. 라이브러리 import는 tsconfig paths로 src 엔트리에 매핑하고, 예제가
 * 가정하는 앱 소유 식별자(db/redis/app/session 등)는 ambient d.ts로 선언한다 —
 * 앱 소유 식별자는 any, 라이브러리 유래 식별자(client/verifier/billing 등)는
 * 실제 타입(typeof import)이라 시그니처 오용은 그대로 컴파일 에러로 잡힌다.
 *
 * top-level `export`가 없는 블록(프래그먼트)은 async 래퍼로 감싼다 —
 * top-level return/await를 허용하기 위한 하네스 수용이며 타입 검사에는 영향이 없다.
 *
 * 사용: node scripts/check-readme.mjs [패키지루트]
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pkgRoot = process.argv[2]
  ? resolve(process.argv[2])
  : dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(pkgRoot, 'README.md');
// dist 타입에 매핑한다(소비자가 실제로 보는 표면 + DOM lib과 @types/node의
// Uint8Array 제네릭 충돌을 skipLibCheck로 우회). 실행 전 pnpm build 필요.
const distDir = join(pkgRoot, 'dist');
if (!existsSync(join(distDir, 'index.d.ts'))) {
  console.error('dist/index.d.ts가 없습니다 — 먼저 pnpm build를 실행하세요.');
  process.exit(2);
}

// ── 1. ts/tsx 펜스 블록 추출 ────────────────────────────────────────────────
const readmeLines = readFileSync(readmePath, 'utf8').split('\n');
const blocks = [];
for (let i = 0; i < readmeLines.length; i++) {
  if (!/^```(ts|tsx)\s*$/.test(readmeLines[i])) continue;
  const start = i + 1;
  let j = start;
  while (j < readmeLines.length && readmeLines[j].trim() !== '```') j++;
  // contentStartLine: 1-based README 행 번호 (블록 첫 코드 줄)
  blocks.push({ contentStartLine: start + 1, lines: readmeLines.slice(start, j) });
  i = j;
}
if (blocks.length === 0) {
  console.error('README에서 ts 코드 블록을 찾지 못했습니다.');
  process.exit(2);
}

// ── 2. 블록 → 컴파일 단위 파일 ──────────────────────────────────────────────
// prelude = 선행 주석/공백/import 문. 본문에 top-level export가 없으면 async 래퍼.
function splitPrelude(lines) {
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*\/\//.test(line)) {
      i++;
      continue;
    }
    if (/^import\b/.test(line)) {
      while (i < lines.length && !/;\s*$/.test(lines[i])) i++;
      i++; // ';'로 끝난 줄 포함
      continue;
    }
    break;
  }
  return i;
}

const work = mkdtempSync(join(tmpdir(), 'gj-kit-readme-check-'));
const blocksDir = join(work, 'blocks');
mkdirSync(blocksDir);

let libTossFile = null;
const fileMaps = new Map(); // 상대경로 → { srcLines: (readmeLine|null)[] }

blocks.forEach((block, index) => {
  const n = String(index + 1).padStart(2, '0');
  const isLibToss = block.lines.some((l) => /^\/\/\s*lib\/toss\.ts\s*$/.test(l));
  const fileName = isLibToss ? `block-${n}-lib-toss.ts` : `block-${n}.ts`;
  if (isLibToss) libTossFile = join(blocksDir, fileName);

  const preludeCount = splitPrelude(block.lines);
  const body = block.lines.slice(preludeCount);
  const hasTopLevelExport = body.some((l) => /^export\b/.test(l));

  const out = []; // { text, srcLine|null }
  block.lines.slice(0, preludeCount).forEach((text, k) => {
    out.push({ text, srcLine: block.contentStartLine + k });
  });
  if (hasTopLevelExport) {
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
  } else {
    out.push({ text: 'async function __readmeBlock() {', srcLine: null });
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
    out.push({ text: '}', srcLine: null });
    out.push({ text: 'void __readmeBlock;', srcLine: null });
    out.push({ text: 'export {};', srcLine: null });
  }

  writeFileSync(join(blocksDir, fileName), out.map((l) => l.text).join('\n') + '\n');
  fileMaps.set(`blocks/${fileName}`, out.map((l) => l.srcLine));
});

// ── 3. ambient 선언 — 앱 소유 식별자(any) + 라이브러리 유래 식별자(실타입) ──
writeFileSync(
  join(work, 'globals.d.ts'),
  `// README 예제가 가정하는 주변 환경 선언.
// 앱 소유 식별자는 any — 검증 대상이 아니다. 라이브러리 유래 식별자는 실제
// 타입(import()/typeof import)으로 선언해 시그니처 오용이 컴파일 에러가 되게 한다.

// 앱 소유 (DB/세션/프레임워크/알림 등)
declare const db: any;
declare const redis: any;
// 라우터 프레임워크 스텁 — 파라미터에 명시적 any를 줘서(implicit-any 오탐 방지)
// 예제 검증 대상을 라이브러리 API 사용부로 한정한다.
declare const app: {
  get(path: string, handler: (c: any) => any): unknown;
  post(path: string, ...handlers: ((req: any, res: any, next?: any) => any)[]): unknown;
};
declare const express: any;
declare const session: any;
declare const retryQueue: any;
declare function toast(message: string): void;
declare function priceOf(planId: unknown): number;
declare function alertFraud(error: unknown): void;
declare function opsAlert(payload: unknown): void;
declare function notifyReissueNeeded(customerKey: string): unknown;
declare function requestReauth(customerKey: string): Promise<unknown>;
declare function fulfillOrder(orderId: string): Promise<void>;
declare function revertToAwaiting(orderId: string): Promise<void>;
declare function deactivateSubscription(billingKey: string): Promise<void>;
declare function syncStatus(payment: unknown): Promise<void>;
declare function respond200(): unknown;
declare function respond400(): unknown;
declare function respond503(): unknown;
declare function completeOrder(payment: unknown): unknown;
declare function redirectToCheckout(): unknown;
declare function showFailure(error: unknown): unknown;
declare function sendReceiptMail(orderId: string): Promise<void>;
declare const metrics: any;
declare const clientIp: string;
declare const rawBody: string;
declare const headers: Headers;
declare const req: Request;
declare const serverOrder: {
  orderId: string;
  amount: number;
  orderName: string;
  currency: string;
};

// 라이브러리 유래 — 프래그먼트 블록이 스코프에 있다고 가정하는 값들 (실타입)
type __Env = import('@gj-kit/toss-payments').Env;
declare const client: import('@gj-kit/toss-payments/server').TossServerClient<__Env, 'api'>;
declare const confirmFlow: import('@gj-kit/toss-payments/server').ConfirmFlow<__Env>;
declare const billing: import('@gj-kit/toss-payments/server').BillingFlowBase<__Env>;
declare const verifier: import('@gj-kit/toss-payments/webhook').WebhookVerifier;
declare const ticket: import('@gj-kit/toss-payments/server').CancelRetryTicket;
declare const result: import('@gj-kit/toss-payments').Result<
  import('@gj-kit/toss-payments/server').CancelOutcome,
  import('@gj-kit/toss-payments/server').CancelError
>;
declare const secKey: import('@gj-kit/toss-payments/webhook').SecurityKey;
declare const order: import('@gj-kit/toss-payments/server').BillingOrder;
declare const orders: import('@gj-kit/toss-payments/server').OrderStore;
declare const dedupe: import('@gj-kit/toss-payments/webhook').WebhookDedupeStore;
declare const profile: import('@gj-kit/toss-payments/server').BillingProfile;
declare const verified: import('@gj-kit/toss-payments/server').VerifiedCheckout;
// 풀 배선 파사드 kit — 옵션 카탈로그 프래그먼트가 스코프에 있다고 가정하는 값
declare const toss: import('@gj-kit/toss-payments/server').TossPaymentsKit<
  __Env,
  'api',
  {
    orders: import('@gj-kit/toss-payments/server').OrderStore;
    billingKeys: import('@gj-kit/toss-payments/server').BillingKeyStore;
    depositSecrets: import('@gj-kit/toss-payments/server').DepositSecretStore;
    webhook: { dedupe: import('@gj-kit/toss-payments/webhook').WebhookDedupeStore };
  }
>;
declare const isErr: typeof import('@gj-kit/toss-payments').isErr;
declare const createConfirmFlow: typeof import('@gj-kit/toss-payments/server').createConfirmFlow;
declare const createBillingFlow: typeof import('@gj-kit/toss-payments/server').createBillingFlow;
declare const createWebhookVerifier: typeof import('@gj-kit/toss-payments/webhook').createWebhookVerifier;

// Vite 스타일 import.meta.env — Vite의 ImportMetaEnv 인덱서는 any다
interface ImportMeta {
  readonly env: { readonly [key: string]: any };
}
`,
);

// ── 4. tsconfig — 라이브러리 import를 src 엔트리에 매핑 ─────────────────────
const paths = {
  '@gj-kit/toss-payments': [join(distDir, 'index.d.ts')],
  '@gj-kit/toss-payments/server': [join(distDir, 'server.d.ts')],
  '@gj-kit/toss-payments/browser': [join(distDir, 'browser.d.ts')],
  '@gj-kit/toss-payments/webhook': [join(distDir, 'webhook.d.ts')],
  '@gj-kit/toss-payments/testing': [join(distDir, 'testing.d.ts')],
};
if (libTossFile !== null) paths['@/lib/toss'] = [libTossFile];

writeFileSync(
  join(work, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        // 라이브러리 기본 설정(tsconfig.base.json)과 동일 강도
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        skipLibCheck: true,
        noEmit: true,
        // 예제는 앱 컨텍스트(Next.js/브라우저) 코드 — 소비자 표준 조합인
        // DOM + @types/node로 검사한다 (라이브러리 내부는 dist d.ts + skipLibCheck).
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        types: ['node'],
        typeRoots: [join(pkgRoot, 'node_modules', '@types')],
        baseUrl: work,
        paths,
      },
      include: ['blocks', 'globals.d.ts'],
    },
    null,
    2,
  ),
);

// ── 5. tsc 실행 + README 행 번호로 역매핑 ──────────────────────────────────
const requireFromPkg = createRequire(join(pkgRoot, 'package.json'));
const tscJs = requireFromPkg.resolve('typescript/lib/tsc.js');
const run = spawnSync(process.execPath, [tscJs, '-p', work, '--pretty', 'false'], {
  encoding: 'utf8',
  maxBuffer: 16 * 1024 * 1024,
});

const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
const errors = [];
for (const line of output.split('\n')) {
  const m = /^(.+?)\((\d+),(\d+)\): (error TS\d+: .*)$/.exec(line.trim());
  if (m === null) {
    if (line.trim().length > 0 && !/^\s/.test(line)) errors.push({ raw: line.trim() });
    continue;
  }
  const [, file, lineNoRaw, colRaw, message] = m;
  const rel = file.replaceAll('\\', '/').replace(/^.*\/blocks\//, 'blocks/');
  const map = fileMaps.get(rel);
  const lineNo = Number(lineNoRaw);
  if (map !== undefined) {
    const srcLine = map[lineNo - 1] ?? null;
    errors.push({
      raw: `README.md:${srcLine ?? '?'} (${rel}:${lineNo}:${colRaw}) ${message}`,
    });
  } else {
    errors.push({ raw: `${file}(${lineNoRaw},${colRaw}): ${message}` });
  }
}

if (run.status === 0 && errors.length === 0) {
  rmSync(work, { recursive: true, force: true });
  console.log(`README 코드 블록 ${blocks.length}개 — 전부 컴파일 통과.`);
  process.exit(0);
}

console.error(`README 코드 블록 ${blocks.length}개 중 컴파일 에러 발견:\n`);
for (const e of errors) console.error(`  ${e.raw}`);
console.error(`\n작업 디렉토리 보존: ${work}`);
process.exit(1);
