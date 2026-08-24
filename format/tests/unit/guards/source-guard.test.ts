// 소스 가드 — 설계 문서 §5.3.
//
// "Node에서 테스트가 통과했다"는 "Hermes에서 동작한다"를 의미하지 않는다. 그 격차를 리뷰가
// 아니라 CI에서 닫는 장치다. `src/**`의 소스 텍스트를 스캔해 금지 목록이 나타나면 실패한다.
//
// 목록 자체는 `./forbidden`에 있다 — 산출물 가드(`release-artifact.test.ts`)와 **같은
// 배열**을 읽어야 §5.4의 "소스와 산출물 양쪽이 닫힌다"가 성립하기 때문이다.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  FORBIDDEN_CALLS,
  FORBIDDEN_GLOBALS,
  FORBIDDEN_INTL,
  FORBIDDEN_STYLES,
  stripComments,
} from './forbidden';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const SRC = join(PACKAGE_ROOT, 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

const FILES = sourceFiles(SRC).map((path) => ({
  path,
  relative: path.slice(PACKAGE_ROOT.length + 1),
  code: stripComments(readFileSync(path, 'utf8')),
}));

describe('(a) Hermes 지원 목록 밖 Intl API는 소스에 존재할 수 없다', () => {
  it.each(FORBIDDEN_INTL)('%s', (symbol) => {
    const offenders = FILES.filter(({ code }) => code.includes(symbol)).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });
});

describe('(b) 로케일 위임 스타일은 되돌아올 수 없다', () => {
  it.each(FORBIDDEN_STYLES.map((pattern) => [pattern.source, pattern] as const))(
    '%s',
    (_label, pattern) => {
      const offenders = FILES.filter(({ code }) => pattern.test(code)).map((f) => f.relative);
      expect(offenders).toEqual([]);
    },
  );
});

describe('(c) 엔진 날짜 문자열 파싱은 존재할 수 없다', () => {
  it('Date.parse는 전면 금지', () => {
    const offenders = FILES.filter(({ code }) => /\bDate\s*\.\s*parse\b/.test(code)).map(
      (f) => f.relative,
    );
    expect(offenders).toEqual([]);
  });

  it('`new Date(`는 src/parse.ts에만 있다', () => {
    const offenders = FILES.filter(
      ({ code, relative }) => /new\s+Date\s*\(/.test(code) && relative !== 'src/parse.ts',
    ).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });

  it('src/parse.ts 안에서도 인자가 숫자 표현식인 형태만 허용한다', () => {
    const parse = FILES.find((f) => f.relative === 'src/parse.ts');
    expect(parse).toBeDefined();
    const calls = [...(parse?.code ?? '').matchAll(/new\s+Date\s*\(([^)]*)\)/g)].map(
      (match) => match[1]?.trim() ?? '',
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      // 문자열 리터럴도, 문자열 타입 변수도 들어갈 수 없다. 허용되는 것은
      // `Date.UTC(...)` · 숫자 식별자 목록 · 산술식뿐이다.
      expect(args).not.toMatch(/['"`]/);
      expect(args).toMatch(/^[A-Za-z0-9_ ,.\-+*/()]*$/);
      expect(args).not.toBe('');
    }
  });
});

describe('(d) Node/DOM 전역은 소스에 존재할 수 없다', () => {
  it.each(FORBIDDEN_GLOBALS)('%s', (identifier) => {
    const pattern = new RegExp(`\\b${identifier}\\b`);
    const offenders = FILES.filter(({ code }) => pattern.test(code)).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });

  it('require( · fetch(', () => {
    const offenders = FILES.filter(({ code }) => FORBIDDEN_CALLS.test(code)).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });
});

describe('화이트리스트 — 이 패키지가 호출하는 Intl 전량 (§1.2)', () => {
  it('DateTimeFormat 옵션 키는 timeZone·year·month·day·hour·minute·hourCycle·hour12뿐이다', () => {
    const zone = FILES.find((f) => f.relative === 'src/zone.ts');
    expect(zone).toBeDefined();
    const constructions = [
      ...(zone?.code ?? '').matchAll(/new Intl\.DateTimeFormat\('en-US',\s*\{([^}]*)\}/g),
    ].map((match) => match[1] ?? '');
    expect(constructions.length).toBeGreaterThan(0);
    const allowed = new Set([
      'timeZone',
      'year',
      'month',
      'day',
      'hour',
      'minute',
      'hourCycle',
      'hour12',
    ]);
    for (const body of constructions) {
      for (const key of [...body.matchAll(/([A-Za-z0-9]+)\s*:/g)].map((m) => m[1] ?? '')) {
        expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it("NumberFormat은 style:'decimal' + fraction digits만 쓴다", () => {
    const number = FILES.find((f) => f.relative === 'src/number.ts');
    expect(number?.code).toMatch(/style:\s*'decimal'/);
    const constructions = [...(number?.code ?? '').matchAll(/new Intl\.NumberFormat\(/g)];
    expect(constructions).toHaveLength(1);
  });

  it('Intl 호출부는 src/zone.ts와 src/number.ts 두 파일뿐이다', () => {
    const users = FILES.filter(({ code }) => /\bIntl\./.test(code)).map((f) => f.relative);
    expect(users.sort()).toEqual(['src/number.ts', 'src/zone.ts']);
  });
});
