#!/usr/bin/env node
/**
 * README ts 코드블록 컴파일 검증 (toss-payments/scripts/check-readme.mjs 개조판).
 *
 * README.md의 모든 ```ts 블록을 추출해 실제 패키지 타입(dist d.ts)에 대해 tsc --noEmit로
 * 검사한다. 라이브러리 import는 tsconfig paths로 dist 엔트리에 매핑하고 — 이 패키지 자신
 * (`.`/`./nestjs`/`./testing`)과 코어(`@gj-kit/toss-payments` 3엔트리), Nest 배선 패키지, 그리고
 * `pg`/`@nestjs/*` devDependency 타입까지 — 예제가 가정하는 서드파티 모듈
 * (`typeorm`/`@nestjs/schedule`)은 ambient 스텁으로 선언한다: 앱/서드파티 식별자는 스텁,
 * 라이브러리 유래 식별자는 실제 타입이라 시그니처 오용은 그대로 컴파일 에러로 잡힌다.
 *
 * 파일 경로 주석(`// payments/toss.ts` 형태의 블록 첫 줄)이 있는 블록은 `@/<경로>`
 * alias로 등록되어 다른 블록이 import할 수 있다 — 골든 패스 배선(payments/toss.ts)을
 * 후속 예제(웹훅 라우트·cleanup 등)가 실제 타입으로 재사용하는 구조를 그대로 검증한다.
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
const readmePath = join(pkgRoot, process.env.README_PATH ?? 'README.md');
// dist 타입에 매핑한다(소비자가 실제로 보는 표면 + skipLibCheck로 라이브러리 내부 우회).
// 실행 전 이 패키지의 pnpm build 필요. 코어/Nest 배선 dist는 워크스페이스 빌드 산출물을
// 그대로 본다 — 없으면 루트에서 pnpm build를 먼저 실행하라.
const distDir = join(pkgRoot, 'dist');
const coreDistDir = join(pkgRoot, 'node_modules', '@gj-kit', 'toss-payments', 'dist');
const nestPkgDistDir = join(pkgRoot, '..', 'toss-payments-nestjs', 'dist');
for (const [label, file] of [
  ['dist/index.d.ts', join(distDir, 'index.d.ts')],
  ['dist/nestjs.d.ts', join(distDir, 'nestjs.d.ts')],
  ['dist/testing.d.ts', join(distDir, 'testing.d.ts')],
  ['@gj-kit/toss-payments dist', join(coreDistDir, 'index.d.ts')],
  ['@gj-kit/toss-payments-nestjs dist', join(nestPkgDistDir, 'index.d.ts')],
]) {
  if (!existsSync(file)) {
    console.error(`${label}가 없습니다 (${file}) — 먼저 루트에서 pnpm build를 실행하세요.`);
    process.exit(2);
  }
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

// 파일 경로 주석 블록 → `@/<경로>` alias (경로별 첫 블록이 정본)
const aliasFiles = new Map(); // '@/payments/toss' → 블록 파일 절대경로
const fileMaps = new Map(); // 상대경로 → (readmeLine|null)[]

blocks.forEach((block, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fileName = `block-${n}.ts`;
  const firstLine = block.lines[0] ?? '';
  const marker = /^\/\/\s*([A-Za-z0-9._/-]+)\.ts(?:\s.*)?$/.exec(firstLine);
  if (marker !== null) {
    const alias = `@/${marker[1]}`;
    if (!aliasFiles.has(alias)) aliasFiles.set(alias, join(blocksDir, fileName));
  }

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

// ── 3. ambient 선언 — 서드파티 모듈 스텁 + 라이브러리 유래 식별자(실타입) ──
writeFileSync(
  join(work, 'globals.d.ts'),
  `// README 예제가 가정하는 주변 환경 선언.
// 앱 소유/서드파티 식별자는 스텁(any) — 검증 대상이 아니다. 라이브러리 유래 식별자는
// 실제 타입(import())으로 선언해 시그니처 오용이 컴파일 에러가 되게 한다.

// 서드파티 모듈 스텁 — README 검증이 설치를 강제하지 않기 위한 최소 구조 타입.
declare module '@nestjs/schedule' {
  export function Cron(cronExpression: string): MethodDecorator;
}

declare module 'typeorm' {
  export interface QueryRunner {
    query(query: string, parameters?: unknown[]): Promise<any>;
    release(): Promise<void>;
  }
  export interface DataSource {
    query(query: string, parameters?: unknown[]): Promise<any>;
    createQueryRunner(): QueryRunner;
  }
}

// 라이브러리 유래 — 프래그먼트 블록이 스코프에 있다고 가정하는 값 (실타입)
declare const webhook: import('@gj-kit/toss-payments/webhook').AcceptedWebhook;
`,
);

// ── 4. tsconfig — 라이브러리 import를 dist 엔트리에 매핑 ─────────────────────
const paths = {
  '@gj-kit/toss-payments-postgresql': [join(distDir, 'index.d.ts')],
  '@gj-kit/toss-payments-postgresql/nestjs': [join(distDir, 'nestjs.d.ts')],
  '@gj-kit/toss-payments-postgresql/testing': [join(distDir, 'testing.d.ts')],
  '@gj-kit/toss-payments': [join(coreDistDir, 'index.d.ts')],
  '@gj-kit/toss-payments/server': [join(coreDistDir, 'server.d.ts')],
  '@gj-kit/toss-payments/webhook': [join(coreDistDir, 'webhook.d.ts')],
  '@gj-kit/toss-payments/testing': [join(coreDistDir, 'testing.d.ts')],
  '@gj-kit/toss-payments-nestjs': [join(nestPkgDistDir, 'index.d.ts')],
  // devDependency 타입 — 임시 디렉토리에서 bare specifier가 해석되지 않으므로 명시 매핑
  pg: [join(pkgRoot, 'node_modules', '@types', 'pg', 'index.d.ts')],
  '@nestjs/common': [join(pkgRoot, 'node_modules', '@nestjs', 'common', 'index.d.ts')],
  '@nestjs/core': [join(pkgRoot, 'node_modules', '@nestjs', 'core', 'index.d.ts')],
};
for (const [alias, file] of aliasFiles) paths[alias] = [file];

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
        // Nest 예제(@Module/@Injectable/@Cron)용 — 패키지 tsconfig과 동일 설정
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
        // 예제는 앱 컨텍스트(Next.js/Nest) 코드 — 소비자 표준 조합인
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
