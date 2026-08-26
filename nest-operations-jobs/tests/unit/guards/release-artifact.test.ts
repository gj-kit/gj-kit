/**
 * §5.5 릴리스 아티팩트 계약 — 형제 toss-payments-nestjs의 가드를 복제하고
 * 이 패키지의 exports 3엔트리·required peer 4종을 추가로 고정한다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { packageRoot } from './sources';

interface Manifest {
  name?: string;
  version?: string;
  files?: unknown;
  type?: string;
  sideEffects?: unknown;
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, unknown>;
  dependencies?: unknown;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: unknown;
  publishConfig?: { access?: string };
  scripts?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(join(packageRoot, 'package.json'), 'utf8'),
) as Manifest;

describe('release artifact contract', () => {
  it('dist와 양언어 README를 싣고 pack 전에 provenance를 찍고 검증한다', () => {
    expect(manifest.files).toEqual(['dist', 'README.md', 'README.ko.md']);
    expect(manifest.scripts?.build).toContain('scripts/stamp-provenance.mjs');
    expect(manifest.scripts?.prepack).toContain('scripts/check-provenance.mjs --require-clean');
    expect(existsSync(join(packageRoot, 'scripts', 'stamp-provenance.mjs'))).toBe(true);
    expect(existsSync(join(packageRoot, 'scripts', 'check-provenance.mjs'))).toBe(true);
    expect(existsSync(join(packageRoot, '..', 'scripts', 'stamp-package-provenance.mjs'))).toBe(true);
    expect(existsSync(join(packageRoot, '..', 'scripts', 'check-package-provenance.mjs'))).toBe(true);
  });

  it('§2.7 최초 커밋 버전은 0.0.0이다 — changeset이 0.1.0을 만든다', () => {
    expect(manifest.name).toBe('@gj-kit/nest-operations-jobs');
    // 릴리스 상태 불변식. 0.0.0을 하드코딩하면 `changeset version`이 돈 트리에서
    // verify:release가 실패해 릴리스 PR의 CI가 빨개진다(2026-08-25 재현).
    const changeset = join(packageRoot, '..', '.changeset', 'nest-operations-jobs-v0-1.md');
    if (manifest.version === '0.0.0') {
      expect(existsSync(changeset)).toBe(true);
    } else {
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(existsSync(changeset)).toBe(false);
    }
  });

  it('§4-15 exports는 3엔트리 + package.json뿐이다 — internal deep import 차단', () => {
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([
      '.',
      './core',
      './package.json',
      './testing',
    ]);
    for (const entry of ['.', './core', './testing'] as const) {
      expect(manifest.exports?.[entry]).toEqual({
        import: {
          types: expect.stringMatching(/^\.\/dist\/[a-z]+\.d\.ts$/u),
          default: expect.stringMatching(/^\.\/dist\/[a-z]+\.js$/u),
        },
        require: {
          types: expect.stringMatching(/^\.\/dist\/[a-z]+\.d\.cts$/u),
          default: expect.stringMatching(/^\.\/dist\/[a-z]+\.cjs$/u),
        },
      });
    }
    expect(manifest.type).toBe('module');
    expect(manifest.sideEffects).toBe(false);
    expect(manifest.publishConfig?.access).toBe('public');
  });

  it('§2.2 런타임 의존성 0, required peer 4종, optional 표시 없음', () => {
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependenciesMeta).toBeUndefined();
    expect(manifest.peerDependencies).toEqual({
      '@nestjs/common': '^10 || ^11',
      '@nestjs/core': '^10 || ^11',
      'reflect-metadata': '^0.1.13 || ^0.2',
      rxjs: '^7',
    });
  });

  it.skipIf(!existsSync(join(packageRoot, 'dist')))('선언한 exports 타깃이 전부 디스크에 존재한다', () => {
    const targets = new Set<string>();
    const collect = (value: unknown): void => {
      if (typeof value === 'string') {
        targets.add(value);
        return;
      }
      if (value === null || typeof value !== 'object') return;
      for (const next of Object.values(value)) collect(next);
    };
    for (const field of [manifest.main, manifest.module, manifest.types]) collect(field);
    collect(manifest.exports);
    for (const target of targets) {
      expect(existsSync(join(packageRoot, target)), target).toBe(true);
    }
    expect(existsSync(join(packageRoot, 'dist', 'gj-kit-provenance.json'))).toBe(true);
  });

  it('packed consumer 픽스처가 Nest 10·11 양쪽으로 존재한다', () => {
    for (const fixture of ['nest10', 'nest11']) {
      expect(
        existsSync(join(packageRoot, 'tests', 'fixtures', 'packed-consumer', fixture, 'package.json')),
      ).toBe(true);
    }
    for (const smoke of ['smoke.mjs', 'smoke.cjs', 'core-only.cjs']) {
      expect(existsSync(join(packageRoot, 'tests', 'fixtures', 'packed-consumer', smoke))).toBe(true);
    }
  });
});
