// 릴리스 산출물 계약 — 설계 문서 §5.4 (toss-payments-postgresql · expo-media 선례).
//
// 두 가지를 고정한다.
//  1. package.json의 배포 계약(exports 표면 · files · sideEffects · engines · provenance 배선).
//  2. `dist/**` 문자열 스캔 — 소스 가드가 막은 목록이 **산출물에도** 없는지. 소스와 산출물
//     양쪽이 닫혀야 "빌드 후처리가 몰래 넣었다"는 경로가 사라진다.
//
// 금지 목록은 소스 가드와 **같은 배열**(`./forbidden`)을 읽는다. 두 벌 적으면 산출물 쪽이
// 조용히 진부분집합이 되고, 그러면 빌드 후처리가 `style: 'currency'`를 되돌려 넣어도 통과한다.
//
// dist가 아직 없으면 (2)는 건너뛴다 — 빌드 없이 도는 로컬 `pnpm test`를 실패시키는 것은 이
// 가드의 목적이 아니다. **단 릴리스 게이트(CI·GJKIT_RELEASE)에서는 dist 부재 자체가 실패다.**
// 산출물이 통째로 없는 경우야말로 이 블록이 가장 필요한 순간인데, 그때 전부 skip으로 초록이
// 되는 것이 초판의 구멍이었다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const DIST = join(PACKAGE_ROOT, 'dist');

const manifest = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
  name?: unknown;
  version?: unknown;
  license?: unknown;
  type?: unknown;
  sideEffects?: unknown;
  files?: unknown;
  engines?: { node?: unknown };
  publishConfig?: { access?: unknown };
  exports?: Record<string, unknown>;
  dependencies?: unknown;
  peerDependencies?: unknown;
  scripts?: Record<string, string | undefined>;
};

describe('package.json 배포 계약', () => {
  it('identity와 기본 필드', () => {
    expect(manifest.name).toBe('@gj-kit/format');
    expect(manifest.type).toBe('module');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.files).toEqual(['dist', 'README.md', 'README.ko.md']);
    expect(manifest.engines?.node).toBe('>=20');
    expect(manifest.publishConfig?.access).toBe('public');
  });

  it('런타임 의존성 0 · peer 0 — gj-kit 최초의 peer 없는 패키지', () => {
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("exports는 '.'과 package.json 둘뿐 — internal deep import가 불가능하다", () => {
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual(['.', './package.json']);
    expect(manifest.exports?.['.']).toEqual({
      import: { types: './dist/index.d.ts', default: './dist/index.js' },
      require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
    });
  });

  it('provenance 배선 — build가 스탬프하고 prepack이 clean tree를 요구한다', () => {
    expect(manifest.scripts?.build).toContain('scripts/stamp-provenance.mjs');
    expect(manifest.scripts?.prepack).toContain('scripts/check-provenance.mjs --require-clean');
    for (const script of ['stamp-provenance.mjs', 'check-provenance.mjs', 'check-readme.mjs']) {
      expect(existsSync(join(PACKAGE_ROOT, 'scripts', script))).toBe(true);
    }
    for (const script of ['stamp-package-provenance.mjs', 'check-package-provenance.mjs']) {
      expect(existsSync(join(PACKAGE_ROOT, '..', 'scripts', script))).toBe(true);
    }
  });

  it('MIT를 선언했으면 LICENSE 원문이 tarball에 들어간다', () => {
    // npm은 `files: ["dist"]`와 무관하게 LICENSE를 항상 담는다. 반대로 파일이 없으면
    // `"license": "MIT"`만 적힌 채 원문 없이 배포된다 — 형제 패키지(expo-media·expo-auth)는
    // 전부 싣고 있으므로 이 패키지만 빠지면 모노레포 안에서의 불일치다.
    expect(manifest.license).toBe('MIT');
    const licensePath = join(PACKAGE_ROOT, 'LICENSE');
    expect(existsSync(licensePath)).toBe(true);
    expect(readFileSync(licensePath, 'utf8')).toContain('MIT License');
  });

  // 릴리스 상태 불변식. 버전을 0.0.0으로 못 박으면 릴리스 파이프라인이 자기 자신을
  // 깨뜨린다 — `changeset version`이 돈 트리에서도 verify:release가 실행되므로
  // 버전 PR에서 CI가 빨개진다(2026-08-25 클린 스냅샷 게이트에서 재현).
  it('릴리스 상태가 일관된다 — 0.0.0이면 changeset 대기, 버전이 매겨졌으면 소비 완료', () => {
    const changeset = join(PACKAGE_ROOT, '..', '.changeset', 'format-v0-1.md');
    if (manifest.version === '0.0.0') {
      expect(existsSync(changeset)).toBe(true);
      expect(readFileSync(changeset, 'utf8')).toContain('"@gj-kit/format": minor');
    } else {
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(existsSync(changeset)).toBe(false);
    }
  });
});

function distFiles(): string[] {
  if (!existsSync(DIST)) return [];
  return readdirSync(DIST, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath ?? DIST, entry.name))
    .filter((path) => /\.(?:js|cjs|d\.ts|d\.cts)$/.test(path));
}

/** 빌드 산출물이 반드시 있어야 하는 실행인가. `pnpm build`가 선행되는 게이트에서만 참이다. */
const RELEASE_GATE = process.env.CI !== undefined || process.env.GJKIT_RELEASE !== undefined;

describe('dist 스캔 — 금지 목록이 산출물에도 없다 (소스 가드와 같은 목록)', () => {
  const files = distFiles();
  const scanned = files.map((path) => ({
    path,
    relative: path.slice(PACKAGE_ROOT.length + 1),
    code: stripComments(readFileSync(path, 'utf8')),
  }));

  it.skipIf(!RELEASE_GATE && files.length === 0)('빌드 산출물이 존재한다', () => {
    expect(existsSync(DIST)).toBe(true);
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.runIf(files.length > 0).each(FORBIDDEN_INTL)('(a) %s', (symbol) => {
    const offenders = scanned.filter(({ code }) => code.includes(symbol)).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });

  it.runIf(files.length > 0).each(FORBIDDEN_STYLES.map((p) => [p.source, p] as const))(
    '(b) %s',
    (_label, pattern) => {
      const offenders = scanned.filter(({ code }) => pattern.test(code)).map((f) => f.relative);
      expect(offenders).toEqual([]);
    },
  );

  it.runIf(files.length > 0).each(FORBIDDEN_GLOBALS)('(d) %s', (identifier) => {
    const pattern = new RegExp(`\\b${identifier}\\b`);
    const offenders = scanned.filter(({ code }) => pattern.test(code)).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });

  it.runIf(files.length > 0)('(d) require( · fetch(', () => {
    const offenders = scanned.filter(({ code }) => FORBIDDEN_CALLS.test(code)).map((f) => f.relative);
    expect(offenders).toEqual([]);
  });

  it.runIf(files.length > 0)('provenance 스탬프가 dist에 있다', () => {
    const stamp = join(DIST, 'gj-kit-provenance.json');
    expect(existsSync(stamp)).toBe(true);
    const parsed = JSON.parse(readFileSync(stamp, 'utf8')) as { package?: unknown };
    expect(parsed.package).toBe('@gj-kit/format');
  });
});
