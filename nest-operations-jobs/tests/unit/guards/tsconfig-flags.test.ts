/**
 * §5.3 tsconfig-flags — §7-11 완화책의 전제를 기계로 고정한다.
 * emitDecoratorMetadata를 켜면 design:paramtypes 의존이 조용히 가능해지고, 그 의존은
 * 메타데이터를 만들지 않는 SWC/esbuild 호스트에서만 깨져 우리 CI에서는 영원히 초록이다.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { packageRoot } from './sources';

function readJsonc(relative: string): Record<string, any> {
  const raw = readFileSync(join(packageRoot, relative), 'utf8');
  const stripped = raw
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/u, ''))
    .join('\n');
  return JSON.parse(stripped) as Record<string, any>;
}

describe('§5.3 tsconfig-flags', () => {
  it.each(['tsconfig.json', 'tsconfig.src.json', 'tsconfig.tests.json'])(
    '%s는 experimentalDecorators: true / emitDecoratorMetadata: false를 고정한다',
    (file) => {
      const config = readJsonc(file);
      expect(config.compilerOptions?.experimentalDecorators).toBe(true);
      expect(config.compilerOptions?.emitDecoratorMetadata).toBe(false);
    },
  );

  it('세 tsconfig 모두 루트 base를 extends해 strict 계열 플래그를 상속한다', () => {
    for (const file of ['tsconfig.json', 'tsconfig.src.json', 'tsconfig.tests.json']) {
      expect(readJsonc(file).extends).toBe('../tsconfig.base.json');
    }
    const base = readJsonc('../tsconfig.base.json');
    expect(base.compilerOptions?.strict).toBe(true);
    expect(base.compilerOptions?.exactOptionalPropertyTypes).toBe(true);
    expect(base.compilerOptions?.noUncheckedIndexedAccess).toBe(true);
  });
});
