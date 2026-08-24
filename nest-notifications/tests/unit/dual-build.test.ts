/**
 * §2.5 · §7-11 — ESM/CJS 듀얼 산출물이 실제로 로드되는지, 그리고 이중 로드의 두 가지 실패
 * 모드(토큰 동일성·`instanceof`)를 우리가 실제로 막았는지 확인한다.
 *
 * dist가 없으면 스킵한다 — 릴리스 게이트는 build → test 순서다.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { distRoot } from './guards/sources';

const require = createRequire(import.meta.url);
const built = existsSync(join(distRoot, 'core.cjs'));

describe.skipIf(!built)('듀얼 빌드', () => {
  it('네 엔트리가 CJS require로 로드된다', () => {
    for (const entry of ['index.cjs', 'core.cjs', 'expo.cjs', 'testing.cjs']) {
      const loaded = require(join(distRoot, entry)) as Record<string, unknown>;
      expect(Object.keys(loaded).length, entry).toBeGreaterThan(0);
    }
  });

  it('네 엔트리가 ESM import로 로드된다', async () => {
    for (const entry of ['index.js', 'core.js', 'expo.js', 'testing.js']) {
      const loaded = (await import(join(distRoot, entry))) as Record<string, unknown>;
      expect(Object.keys(loaded).length, entry).toBeGreaterThan(0);
    }
  });

  it('`.`와 `./core`를 CJS로 동시 로드해도 DI 토큰이 같다 — Symbol.for가 그것을 보장한다', () => {
    const index = require(join(distRoot, 'index.cjs')) as Record<string, symbol>;
    expect(index['NOTIFICATION_RELAY_STORE']).toBe(
      Symbol.for('@gj-kit/nest-notifications:relay-store'),
    );
  });

  it('두 로드에서 만든 에러가 모두 isNotificationsError로 잡힌다', async () => {
    const cjs = require(join(distRoot, 'core.cjs')) as {
      NotificationsError: new (code: string, message: string) => Error;
      isNotificationsError: (value: unknown) => boolean;
    };
    const esm = (await import(join(distRoot, 'core.js'))) as typeof cjs;
    const fromCjs = new cjs.NotificationsError('ERR_NOTIFICATION_CONFIG_INVALID', 'x');
    const fromEsm = new esm.NotificationsError('ERR_NOTIFICATION_CONFIG_INVALID', 'y');
    // 클래스는 서로 다르지만(이중 로드) 가드는 양쪽을 잡는다.
    expect(cjs.isNotificationsError(fromEsm)).toBe(true);
    expect(esm.isNotificationsError(fromCjs)).toBe(true);
  });

  it('산출 선언이 **값으로** 광고하는 이름은 전부 런타임에 실재한다', async () => {
    // `export type { NotificationsError }`처럼 값 의미를 가진 이름을 type 블록에 넣으면
    // dts 롤업이 `type` 수식어를 떨어뜨려 `dist/index.d.ts`가 그것을 **값으로** 광고한다.
    // 소비자는 타입 검사를 통과한 뒤 ESM 모듈 인스턴스화 실패로 프로세스를 잃는다(CJS면
    // `undefined`). 텍스트로는 판정할 수 없으므로 — .d.ts의 `export {}`는 타입에도 쓴다 —
    // 체커에게 각 export의 의미를 직접 묻는다.
    for (const [declaration, artifact] of [
      ['index.d.ts', 'index.js'],
      ['core.d.ts', 'core.js'],
      ['expo.d.ts', 'expo.js'],
      ['testing.d.ts', 'testing.js'],
    ] as const) {
      const entry = join(distRoot, declaration);
      const program = ts.createProgram([entry], {
        noEmit: true,
        skipLibCheck: true,
        strict: true,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        target: ts.ScriptTarget.ES2022,
      });
      const checker = program.getTypeChecker();
      const source = program.getSourceFile(entry);
      expect(source, declaration).toBeDefined();
      const moduleSymbol = checker.getSymbolAtLocation(source as ts.SourceFile);
      expect(moduleSymbol, declaration).toBeDefined();

      const advertisedAsValue: string[] = [];
      for (const symbol of checker.getExportsOfModule(moduleSymbol as ts.Symbol)) {
        const resolved =
          (symbol.flags & ts.SymbolFlags.Alias) !== 0 ? checker.getAliasedSymbol(symbol) : symbol;
        if ((resolved.flags & ts.SymbolFlags.Value) !== 0) advertisedAsValue.push(symbol.name);
      }
      expect(advertisedAsValue.length, declaration).toBeGreaterThan(0);

      const runtime = (await import(join(distRoot, artifact))) as Record<string, unknown>;
      const missing = advertisedAsValue.filter((name) => !(name in runtime));
      expect(missing, declaration).toEqual([]);
    }
  }, 15_000);

  it('`./core`는 Nest 없이 릴레이를 조립할 수 있다 — 모듈 그래프 층의 증명', async () => {
    const core = (await import(join(distRoot, 'core.js'))) as Record<string, unknown>;
    const testing = (await import(join(distRoot, 'testing.js'))) as Record<string, unknown>;
    expect(typeof core['createNotificationRelay']).toBe('function');
    expect(typeof core['createQuietHoursPolicy']).toBe('function');
    expect(typeof testing['memoryNotificationStores']).toBe('function');
    // `.` 배럴은 코어의 런타임 값을 재수출하지 않는다.
    const index = (await import(join(distRoot, 'index.js'))) as Record<string, unknown>;
    expect(index['createNotificationRelay']).toBeUndefined();
  });
});
