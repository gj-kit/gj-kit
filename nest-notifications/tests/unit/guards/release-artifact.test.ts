/**
 * §5.5 릴리스 아티팩트 계약.
 *
 * exports·peer와 **같은 등급으로** 공개 DI 토큰 이름 집합을 고정한다(AGENTS.md §2). 그리고
 * `@gj-kit/nest-operations-jobs`·`@nestjs/schedule`·`expo-server-sdk`·`@prisma/client`가
 * devDependencies에 **없다**는 것도 고정한다 — 편의상 하나만 들어와도 §0.4-③의 형제 비결합과
 * §2.2의 "SDK 미탑재" 서사가 조용히 무효가 된다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import * as index from '../../../src/index';
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
  devDependencies?: Record<string, string>;
  publishConfig?: { access?: string };
  scripts?: Record<string, string>;
}

const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as Manifest;

describe('release artifact contract', () => {
  it('dist만 싣고 pack 전에 provenance를 찍고 검증한다', () => {
    expect(manifest.files).toEqual(['dist']);
    expect(manifest.scripts?.build).toContain('scripts/stamp-provenance.mjs');
    expect(manifest.scripts?.prepack).toContain('scripts/check-provenance.mjs --require-clean');
    for (const script of ['stamp-provenance.mjs', 'check-provenance.mjs', 'check-readme.mjs']) {
      expect(existsSync(join(packageRoot, 'scripts', script)), script).toBe(true);
    }
    expect(existsSync(join(packageRoot, '..', 'scripts', 'stamp-package-provenance.mjs'))).toBe(true);
    expect(existsSync(join(packageRoot, '..', 'scripts', 'check-package-provenance.mjs'))).toBe(true);
  });

  it('§2.7 최초 커밋 버전은 0.0.0이다 — changeset이 0.1.0을 만든다', () => {
    expect(manifest.name).toBe('@gj-kit/nest-notifications');
    expect(manifest.version).toBe('0.0.0');
    expect(existsSync(join(packageRoot, '..', '.changeset', 'nest-notifications-v0-1.md'))).toBe(
      true,
    );
  });

  it('exports는 4엔트리 + package.json뿐이다 — internal deep import 차단', () => {
    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual([
      '.',
      './core',
      './expo',
      './package.json',
      './testing',
    ]);
    for (const entry of ['.', './core', './expo', './testing'] as const) {
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

  it('런타임 의존성 0, required peer 3종, optional 표시 없음', () => {
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependenciesMeta).toBeUndefined();
    expect(manifest.peerDependencies).toEqual({
      '@nestjs/common': '^10 || ^11',
      'reflect-metadata': '^0.1.13 || ^0.2',
      rxjs: '^7',
    });
  });

  it.each([
    '@gj-kit/nest-operations-jobs',
    '@nestjs/schedule',
    'expo-server-sdk',
    '@prisma/client',
  ])('devDependencies에 %s가 없다 — README 레시피는 declare로 형태만 세운다', (name) => {
    expect(Object.keys(manifest.devDependencies ?? {})).not.toContain(name);
  });

  it('공개 DI 토큰 이름 집합이 정확히 11종이다', () => {
    const tokens = Object.entries(index)
      .filter(([, value]) => typeof value === 'symbol')
      .map(([name]) => name)
      .sort();
    expect(tokens).toEqual([
      'NOTIFICATION_APPLICATION_KEY',
      'NOTIFICATION_DELIVERY_STORE',
      'NOTIFICATION_ENDPOINT_STORE',
      'NOTIFICATION_LOGGER',
      'NOTIFICATION_PIPELINE_WAKEUP',
      'NOTIFICATION_PRESENTER',
      'NOTIFICATION_PUBLISHER',
      'NOTIFICATION_PUSH_GATEWAY',
      'NOTIFICATION_RELAY_STORE',
      'NOTIFICATION_RUNTIME',
      'NOTIFICATION_SCHEDULING_POLICY',
    ]);
    for (const token of tokens) {
      const value = (index as unknown as Record<string, symbol | undefined>)[token];
      expect(value === undefined ? null : Symbol.keyFor(value), token).toMatch(
        /^@gj-kit\/nest-notifications:/u,
      );
    }
  });

  it('`.` 배럴은 코어의 런타임 값을 재수출하지 않는다 — CJS 이중 로드 방어', () => {
    const runtimeExports = Object.keys(index);
    for (const name of [
      'createNotificationRelay',
      'createNotificationDispatcher',
      'createQuietHoursPolicy',
      'createNotificationWakeup',
      'notificationRecipientKey',
      'NotificationsError',
    ]) {
      expect(runtimeExports, name).not.toContain(name);
    }
  });

  it('packed consumer 픽스처가 Nest 10·11·no-nest 세 벌로 존재한다', () => {
    const fixtures = join(packageRoot, 'tests', 'fixtures', 'packed-consumer');
    for (const fixture of ['nest10', 'nest11', 'no-nest']) {
      expect(existsSync(join(fixtures, fixture, 'package.json')), fixture).toBe(true);
    }
    for (const smoke of ['smoke.mjs', 'smoke.cjs', 'core-only.cjs']) {
      expect(existsSync(join(fixtures, smoke)), smoke).toBe(true);
    }
  });

  it.skipIf(!existsSync(join(packageRoot, 'dist')))(
    '선언한 exports 타깃이 전부 디스크에 존재한다',
    () => {
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
    },
  );
});
