/**
 * §5.3 transport-free core — §2.1의 서브패스 분리가 마케팅이 아니라는 유일한 기계적 증거.
 *
 * 토큰 검사는 단어 경계로 한다. 단순 부분문자열이면 `export` 안의 네 글자가 걸려 가드가
 * 자기 소스를 잡는다 — 그런 가드는 곧 꺼지고, 꺼진 가드는 없는 가드다.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { distRoot, readArtifactGraph, readSources, srcRoot } from './sources';

const TRANSPORT_PATTERNS: readonly RegExp[] = [
  /\bexpo\b/iu,
  /Expo[A-Z]/u,
  /expo-server-sdk/u,
  /exp\.host/u,
];
const built = existsSync(join(distRoot, 'core.js'));

function offendersIn(text: string): string[] {
  return TRANSPORT_PATTERNS.filter((pattern) => pattern.test(text)).map(String);
}

describe('§5.3 transport-free core', () => {
  it('src/core/**에 전송 provider의 이름이 한 번도 등장하지 않는다', () => {
    const offenders: string[] = [];
    for (const file of readSources(join(srcRoot, 'core'))) {
      for (const hit of offendersIn(file.text)) offenders.push(`${file.relative}: ${hit}`);
    }
    expect(offenders).toEqual([]);
  });

  it('src/expo/**에는 반대로 등장한다 — 가드가 빈 집합을 검사하고 있지 않다는 대조군', () => {
    const files = readSources(join(srcRoot, 'expo'));
    expect(files.length).toBeGreaterThan(0);
    expect(files.some((file) => offendersIn(file.text).length > 0)).toBe(true);
  });

  it.skipIf(!built)('dist/core.* 모듈 그래프에도 없다', () => {
    for (const entry of ['core.js', 'core.cjs']) {
      for (const file of readArtifactGraph(join(distRoot, entry))) {
        expect(offendersIn(file.text), `${file.relative}`).toEqual([]);
      }
    }
  });
});

describe('§5.3 dependency-free expo', () => {
  it('src/expo/**는 상대 경로 말고 아무것도 import하지 않는다', () => {
    const offenders: string[] = [];
    for (const file of readSources(join(srcRoot, 'expo'))) {
      for (const match of file.text.matchAll(/from\s+'([^']+)'/gu)) {
        const specifier = match[1] ?? '';
        if (!specifier.startsWith('.')) offenders.push(`${file.relative}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('어떤 파일도 expo-server-sdk를 import하지 않는다 — dependency도 peer도 optional peer도 아니다', () => {
    const offenders: string[] = [];
    for (const file of readSources(srcRoot)) {
      for (const match of file.text.matchAll(/from\s+'([^']+)'|require\('([^']+)'\)/gu)) {
        const specifier = match[1] ?? match[2] ?? '';
        if (specifier.startsWith('.')) continue;
        if (specifier.includes('expo')) offenders.push(`${file.relative}: ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('SDK 이름은 `./expo` 안의 설명 주석에만 남는다 — 코어·Nest·testing에는 0', () => {
    const offenders = readSources(srcRoot)
      .filter((file) => file.text.includes('expo-server-sdk'))
      .filter((file) => !file.relative.startsWith('src/expo'))
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });
});
