/** `./insets/pure` must stay usable without React, React Native, or the optional peer. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeKeyboardRevealOffset,
  nativeBottomInset,
  nativeBottomPadding,
} from '../../src/insets/pure';

const pureSource = readFileSync(resolve(process.cwd(), 'src/insets/pure.ts'), 'utf8');
const importSpecifiers = [...pureSource.matchAll(/(?:from\s*|^\s*import\s+)['"]([^'"]+)['"]/g)]
  .map((match) => match[1]);

describe('./insets/pure', () => {
  it('has no runtime framework or optional-peer dependency', () => {
    expect(importSpecifiers).toEqual([]);
  });

  it('keeps the inset rules deterministic when the platform is supplied', () => {
    expect(nativeBottomInset(34, 'web')).toBe(0);
    expect(nativeBottomInset(-10, 'ios')).toBe(0);
    expect(nativeBottomPadding(16, 34, 'android')).toBe(50);
  });

  it('exports the keyboard reveal calculation without pulling in React Native', () => {
    expect(
      computeKeyboardRevealOffset({
        currentOffset: 0,
        inputHeight: 40,
        inputTop: 600,
        keyboardInset: 300,
        reservedBottomHeight: 0,
        viewportHeight: 800,
      }),
    ).toBe(156);
  });
});
