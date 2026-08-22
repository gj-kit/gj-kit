// 빌드 산출물 계약 — `app.plugin.js` → `plugin/build`가 실제로 로드되고, **컴파일된 CJS가
// TS 소스와 같은 매니페스트를 낸다**.
//
// 왜 필요한가: 소비자가 실행하는 것은 `plugin/src/*.ts`가 아니라 `plugin/build/*.js`다.
// 위의 introspect 스냅샷들은 전부 TS 소스를 import하므로, tsc 설정이 어긋나 산출물이 달라져도
// 전부 초록으로 남는다. 이 파일이 그 구멍을 막는다.

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { compileModsAsync } from 'expo/config-plugins';

import { healthPermissions, introspectAsync, type AndroidManifest } from './helpers';
import { SCOPES } from '../src/scopes';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require_ = createRequire(join(PACKAGE_ROOT, 'noop.cjs'));

const BUILD_ENTRY = join(PACKAGE_ROOT, 'plugin', 'build', 'index.js');

const PROPS = {
  privacyPolicyUrl: 'https://example.com/privacy',
  read: [...SCOPES],
  write: [...SCOPES],
  history: true,
} as const;

describe('T9 — app.plugin.js 로더', () => {
  it('plugin/build가 존재한다 (없으면 먼저 `pnpm build`)', () => {
    expect(existsSync(BUILD_ENTRY), 'plugin/build/index.js 없음 — 먼저 `pnpm build`').toBe(true);
  });

  it('app.plugin.js는 순수 CJS이며 `.default`가 함수다', () => {
    const source = readFileSync(join(PACKAGE_ROOT, 'app.plugin.js'), 'utf8');
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
    const loaded = require_(join(PACKAGE_ROOT, 'app.plugin.js')) as Record<string, unknown>;
    expect(typeof loaded === 'function' || typeof loaded['default'] === 'function').toBe(true);
    expect(loaded['__esModule']).toBe(true);
    expect(typeof loaded['withGjKitWorkouts']).toBe('function');
  });

  it('루트 package.json에 `"type": "module"`이 없다 — 이 로더의 전제다 (설계 §2.4-A)', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;
    expect(pkg['type']).toBeUndefined();
  });
});

describe('컴파일된 CJS == TS 소스', () => {
  it('같은 props에서 같은 health 권한 집합과 같은 alias를 낸다', async () => {
    const loaded = require_(join(PACKAGE_ROOT, 'app.plugin.js')) as {
      default: (config: unknown, props: unknown) => unknown;
    };
    const compiled = await compileModsAsync(
      loaded.default(
        {
          name: 'gjkit-workouts-fixture',
          slug: 'gjkit-workouts-fixture',
          android: { package: 'com.gjkit.workoutsfixture' },
          ios: { bundleIdentifier: 'com.gjkit.workoutsfixture' },
        },
        PROPS,
      ) as never,
      {
        projectRoot: mkdtempSync(join(tmpdir(), 'gjkit-workouts-built-')),
        platforms: ['ios', 'android'],
        introspect: true,
        assertMissingModProviders: false,
      },
    );
    const results = (compiled as unknown as { _internal?: { modResults?: Record<string, Record<string, unknown>> } })
      ._internal?.modResults;
    const builtManifest = results?.['android']?.['manifest'] as AndroidManifest;
    const fromSource = await introspectAsync(PROPS);

    expect(healthPermissions(builtManifest)).toEqual(healthPermissions(fromSource.manifest));
    expect(builtManifest.manifest.application?.[0]?.['activity-alias']).toEqual(
      fromSource.manifest.manifest.application?.[0]?.['activity-alias'],
    );
    expect(builtManifest.manifest.application?.[0]?.['meta-data']).toEqual(
      fromSource.manifest.manifest.application?.[0]?.['meta-data'],
    );
  });
});
