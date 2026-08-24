/**
 * §2.5 · §7-7 듀얼 빌드 스모크 — dist가 없으면(빌드 전 fresh 체크아웃) 스킵한다.
 *
 * CJS에는 청크 분리가 없으므로 `.`와 `./core`를 함께 require하면 코어 코드가 두 벌
 * 로드된다. 그래서 에러 판정의 정본은 `instanceof`가 아니라 `isOperationsJobsError()`다 —
 * 이 파일이 그 사실을 실제 산출물로 확인한다.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const rootCjs = new URL('../../dist/index.cjs', import.meta.url);
const coreCjs = new URL('../../dist/core.cjs', import.meta.url);
const testingCjs = new URL('../../dist/testing.cjs', import.meta.url);
const rootEsm = new URL('../../dist/index.js', import.meta.url);
const built = [rootCjs, coreCjs, testingCjs, rootEsm].every((url) => existsSync(url));

describe.skipIf(!built)('듀얼 빌드 스모크', () => {
  it('CJS require — 3엔트리의 공개 표면이 노출된다', () => {
    const root = require(rootCjs.pathname) as Record<string, unknown>;
    const core = require(coreCjs.pathname) as Record<string, unknown>;
    const testing = require(testingCjs.pathname) as Record<string, unknown>;

    expect(typeof root['OperationsJobsModule']).toBe('function');
    expect(typeof root['OperationsJobDefinition']).toBe('function');
    expect(typeof root['runOperationsJobCli']).toBe('function');
    expect(root['JOB_RUNNER']).toBe(Symbol.for('@gj-kit/nest-operations-jobs:runner'));
    expect(typeof core['createJobRunner']).toBe('function');
    expect(typeof testing['jobRunStoreContractCases']).toBe('function');
  });

  it('§2.1 `.` 배럴은 코어 런타임 값을 재수출하지 않는다 (값의 단일 출처)', () => {
    const root = require(rootCjs.pathname) as Record<string, unknown>;
    expect('createJobRunner' in root).toBe(false);
    expect('createJobRegistry' in root).toBe(false);
    expect('memoryJobRunStore' in root).toBe(false);
  });

  it('ESM import — CJS와 동일 토큰(이중 로드에도 Symbol.for 보장)', async () => {
    const esm = (await import(/* @vite-ignore */ rootEsm.href)) as Record<string, unknown>;
    const cjs = require(rootCjs.pathname) as Record<string, unknown>;
    expect(esm['JOB_RUNNER']).toBe(cjs['JOB_RUNNER']);
    expect(esm['JOB_REGISTRY']).toBe(cjs['JOB_REGISTRY']);
    expect(esm['OPERATIONS_JOB_METADATA']).toBe(cjs['OPERATIONS_JOB_METADATA']);
  });

  it.each([
    ['index', 'index.d.ts', 'index.cjs', 'index.js'],
    ['core', 'core.d.ts', 'core.cjs', 'core.js'],
    ['testing', 'testing.d.ts', 'testing.cjs', 'testing.js'],
  ])(
    '%s: .d.ts가 런타임 값으로 광고하는 이름은 CJS·ESM 산출물에 실제로 존재한다',
    async (_entry, dts, cjs, esm) => {
      // 이 단언이 없으면 클래스를 `export type {…}`로 재수출하는 실수가 통과한다:
      // dts 롤업이 `type` 수식어를 떨어뜨려 선언은 값이라고 말하는데 산출물엔 없고,
      // 소비자의 tsc는 초록, ESM import는 모듈 인스턴스화에서 프로세스가 죽는다.
      const declared = valueExportsOf(new URL(`../../dist/${dts}`, import.meta.url));
      expect(declared.length).toBeGreaterThan(0);

      const fromCjs = require(new URL(`../../dist/${cjs}`, import.meta.url).pathname) as Record<
        string,
        unknown
      >;
      const fromEsm = (await import(
        /* @vite-ignore */ new URL(`../../dist/${esm}`, import.meta.url).href
      )) as Record<string, unknown>;

      expect(declared.filter((name) => !(name in fromCjs))).toEqual([]);
      expect(declared.filter((name) => !(name in fromEsm))).toEqual([]);
    },
    30_000,
  );

  it('§7-7 CJS 이중 로드 — `./core`가 만든 에러를 `.`의 매핑이 알아본다', () => {
    const root = require(rootCjs.pathname) as {
      toHttpException(input: unknown): { getStatus(): number } | null;
    };
    const core = require(coreCjs.pathname) as {
      OperationsJobsError: new (code: string, message: string) => Error;
      isOperationsJobsError(value: unknown): boolean;
    };
    const error = new core.OperationsJobsError('ERR_JOB_STORE', 'x');
    expect(core.isOperationsJobsError(error)).toBe(true);
    // instanceof였다면 두 벌 로드에서 실패했을 판정이다.
    expect(root.toHttpException(error)?.getStatus()).toBe(503);
  });
});

/**
 * 산출 선언이 **런타임 값**으로 내보내는 export 이름들. 타입 별칭·인터페이스는 제외한다 —
 * 판정은 문자열 스캔이 아니라 타입 체커가 한다(별칭을 따라가야 하므로 정규식으로는 못 푼다).
 */
function valueExportsOf(dts: URL): readonly string[] {
  const path = fileURLToPath(dts);
  const program = ts.createProgram([path], {
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
  });
  const source = program.getSourceFile(path);
  if (source === undefined) throw new Error(`could not read ${path}`);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) throw new Error(`${path} is not a module`);

  const names: string[] = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const resolved =
      (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
    if ((resolved.flags & ts.SymbolFlags.Value) !== 0) names.push(symbol.name);
  }
  return names.sort();
}
