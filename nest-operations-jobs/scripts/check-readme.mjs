#!/usr/bin/env node
/**
 * README ts 코드블록 컴파일 검증 — format `scripts/check-readme.mjs` 개조판(설계 §5.6).
 *
 * README.md의 모든 ```ts 블록을 추출해 **dist 타입에 대해** tsc --noEmit로 검사한다.
 * 소비자가 실제로 읽는 것은 소스가 아니라 `dist/*.d.ts`이므로, 검사도 그쪽을 본다.
 *
 * format판과 다른 점:
 * - 공개 서브패스가 3개다 → paths 매핑도 3개(`.`·`/core`·`/testing`).
 * - 서버 전용 패키지이므로 `types: ["node"]`를 허용한다 — README 예제의 `process`·`crypto`가
 *   정당한 사용이기 때문이다. DOM은 여전히 주지 않는다.
 * - `@nestjs/*` 타입은 이 패키지의 devDependencies에서 그대로 해석된다(작업 디렉토리가
 *   패키지 루트 아래에 있으므로 node_modules 탐색이 자연스럽게 닿는다).
 *
 * 사용: node scripts/check-readme.mjs [패키지루트]
 */
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const pkgRoot = process.argv[2]
  ? resolve(process.argv[2])
  : dirname(dirname(fileURLToPath(import.meta.url)));
const readmePath = join(pkgRoot, 'README.md');
const distDir = join(pkgRoot, 'dist');
for (const entry of ['index.d.ts', 'core.d.ts', 'testing.d.ts']) {
  if (!existsSync(join(distDir, entry))) {
    console.error(`dist/${entry}가 없습니다 — 먼저 corepack pnpm build를 실행하세요.`);
    process.exit(2);
  }
}

// ── 1. ts 펜스 블록 추출 ────────────────────────────────────────────────────
const readmeLines = readFileSync(readmePath, 'utf8').split('\n');
const blocks = [];
for (let i = 0; i < readmeLines.length; i++) {
  if (!/^```ts\s*$/.test(readmeLines[i])) continue;
  const start = i + 1;
  let j = start;
  while (j < readmeLines.length && readmeLines[j].trim() !== '```') j++;
  blocks.push({ contentStartLine: start + 1, lines: readmeLines.slice(start, j) });
  i = j;
}
if (blocks.length === 0) {
  console.error('README에서 ts 코드 블록을 찾지 못했습니다.');
  process.exit(2);
}

// ── 2. 블록 → 컴파일 단위 파일 (.ts) ────────────────────────────────────────
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
      i++;
      continue;
    }
    break;
  }
  return i;
}

// 작업 디렉토리는 패키지 루트 아래 — node_modules 해석을 자연스럽게 하기 위해서다
// (루트 .gitignore가 `.readme-check-*/`를 무시한다. 실패 시 보존되므로 그 규칙이 필요하다).
const work = mkdtempSync(join(pkgRoot, '.readme-check-'));
const blocksDir = join(work, 'blocks');
mkdirSync(blocksDir);

const fileMaps = new Map();

blocks.forEach((block, index) => {
  const n = String(index + 1).padStart(2, '0');
  const fileName = `block-${n}.ts`;

  const preludeCount = splitPrelude(block.lines);
  const body = block.lines.slice(preludeCount);
  // `export`·`declare`가 있는 블록은 최상위여야 한다(함수 본문에서는 문법 에러).
  // 나머지는 `await`을 쓸 수 있도록 async 함수로 감싼다.
  const needsTopLevel = body.some((l) => /^(export|declare)\b/.test(l));

  const out = [];
  block.lines.slice(0, preludeCount).forEach((text, k) => {
    out.push({ text, srcLine: block.contentStartLine + k });
  });
  if (needsTopLevel) {
    body.forEach((text, k) => {
      out.push({ text, srcLine: block.contentStartLine + preludeCount + k });
    });
    out.push({ text: 'export {};', srcLine: null });
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

// ── 3. ambient 선언 ─────────────────────────────────────────────────────────
// README 예제가 가정하는 주변 환경. 앱 소유 식별자는 형태만 선언하고(검증 대상 아님),
// 라이브러리 유래 식별자는 실타입으로 선언해 시그니처 오용이 컴파일 에러가 되게 한다.
writeFileSync(
  join(work, 'globals.d.ts'),
  `// README 예제가 가정하는 주변 환경 선언.
// 앱/서드파티 소유 식별자는 형태만 선언하고(검증 대상 아님), 라이브러리 유래 식별자는
// 실타입으로 선언해 시그니처 오용이 컴파일 에러가 되게 한다.

// ── 앱 소유 (검증 대상 아님) ──
declare class AppModule {}
declare const prisma: {
  \$queryRaw<T = unknown>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  \$executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
};
declare function isOverlapUniqueViolation(error: unknown): boolean;
declare function it(name: string, body: () => Promise<void> | void): void;

// ── 라이브러리 유래 (실타입) ──
declare const appStore: import('@gj-kit/nest-operations-jobs/core').JobRunStore;
declare const appRegistry: import('@gj-kit/nest-operations-jobs/core').JobRegistryView;
declare const appRunner: import('@gj-kit/nest-operations-jobs/core').JobRunner;
`,
);

// ── 4. tsconfig — 라이브러리 import를 dist d.ts에 매핑 (공개 엔트리 1개) ──────
const paths = {
  '@gj-kit/nest-operations-jobs': [join(distDir, 'index.d.ts')],
  '@gj-kit/nest-operations-jobs/core': [join(distDir, 'core.d.ts')],
  '@gj-kit/nest-operations-jobs/testing': [join(distDir, 'testing.d.ts')],
};

writeFileSync(
  join(work, 'tsconfig.json'),
  JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        verbatimModuleSyntax: true,
        isolatedModules: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        // 산출 선언 자체도 검사 대상이다 — 소비자가 읽는 것이 그 파일이므로
        // 여기서 건너뛰면 README는 초록인데 소비자 프로젝트만 빨간 상황이 생긴다.
        skipLibCheck: false,
        noEmit: true,
        // DOM은 주지 않는다 — 서버 패키지이므로 Node 전역만 정당하다.
        lib: ['ES2022'],
        types: ['node'],
        experimentalDecorators: true,
        emitDecoratorMetadata: false,
        baseUrl: work,
        paths,
      },
      include: ['blocks', 'globals.d.ts'],
    },
    null,
    2,
  ),
);

// ── 5. tsc 실행 + README 행 번호 역매핑 ─────────────────────────────────────
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
    errors.push({ raw: `README.md:${srcLine ?? '?'} (${rel}:${lineNo}:${colRaw}) ${message}` });
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
