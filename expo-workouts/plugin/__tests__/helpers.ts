// introspect 스냅샷 공용 하네스 (설계 §7.3, idx f10).
//
// `compileModsAsync(config, { introspect: true })`는 **파일을 하나도 쓰지 않는다** — base mod들이
// 실제 프로젝트 파일을 읽으려다 실패하면 expo가 내장 템플릿으로 폴백하고, `write()`는 introspect
// 모드에서 즉시 return한다. 그래서 prebuild된 android/ios 디렉토리 없이 순수 Node에서 돈다.
//
// 결과는 `config._internal.modResults[platform][modName]`에 남는다(`saveToInternal: true`).
// iOS는 추가로 `config.ios.infoPlist` / `config.ios.entitlements`에도 반영된다.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compileModsAsync, type AndroidConfig, type ExportedConfig } from 'expo/config-plugins';

import withGjKitWorkouts from '../src/index';
import type { GjKitWorkoutsPluginProps } from '../src/props';

export type AndroidManifest = AndroidConfig.Manifest.AndroidManifest;

export interface Introspection {
  readonly manifest: AndroidManifest;
  readonly infoPlist: Record<string, unknown>;
  readonly entitlements: Record<string, unknown>;
  readonly gradleProperties: readonly { type: string; key?: string; value?: string }[];
  /** 플러그인이 **등록한** mod 이름들 — D7 단언의 근거다. */
  readonly modNames: { readonly ios: readonly string[]; readonly android: readonly string[] };
}

function baseConfig(overrides?: Partial<ExportedConfig>): ExportedConfig {
  return {
    name: 'gjkit-workouts-fixture',
    slug: 'gjkit-workouts-fixture',
    ...overrides,
    android: { package: 'com.gjkit.workoutsfixture', ...overrides?.android },
    ios: { bundleIdentifier: 'com.gjkit.workoutsfixture', ...overrides?.ios },
  };
}

/** 플러그인을 적용하지 않은 **기준선**. minSdk 단언은 이것과의 차이로만 말할 수 있다. */
export async function introspectBaselineAsync(): Promise<Introspection> {
  return runAsync(baseConfig());
}

export async function introspectAsync(
  props: GjKitWorkoutsPluginProps,
  /** 소비자가 `app.json`에 이미 쓴 값을 흉내 낼 때 쓴다 (현지화 우선순위 테스트). */
  overrides?: Partial<ExportedConfig>,
): Promise<Introspection> {
  return runAsync(withGjKitWorkouts(baseConfig(overrides), props) as ExportedConfig);
}

async function runAsync(config: ExportedConfig): Promise<Introspection> {
  const modNames = {
    ios: Object.keys(config.mods?.ios ?? {}),
    android: Object.keys(config.mods?.android ?? {}),
  };
  const projectRoot = mkdtempSync(join(tmpdir(), 'gjkit-workouts-plugin-'));
  const out = (await compileModsAsync(config, {
    projectRoot,
    platforms: ['ios', 'android'],
    introspect: true,
    assertMissingModProviders: false,
  })) as ExportedConfig & {
    _internal?: { modResults?: Record<string, Record<string, unknown>> };
    ios?: { infoPlist?: Record<string, unknown>; entitlements?: Record<string, unknown> };
  };
  const results = out._internal?.modResults ?? {};
  return {
    manifest: results['android']?.['manifest'] as AndroidManifest,
    infoPlist: (out.ios?.infoPlist ?? {}) as Record<string, unknown>,
    entitlements: (out.ios?.entitlements ?? {}) as Record<string, unknown>,
    gradleProperties: (results['android']?.['gradleProperties'] ?? []) as readonly {
      type: string;
      key?: string;
      value?: string;
    }[],
    modNames,
  };
}

const HEALTH_PREFIX = 'android.permission.health.';

/** 우리가 방출한 권한만. 템플릿의 INTERNET·VIBRATE 등은 우리 관심사가 아니다. */
export function healthPermissions(manifest: AndroidManifest): readonly string[] {
  return (manifest.manifest['uses-permission'] ?? [])
    .map((entry) => entry.$?.['android:name'])
    .filter((name): name is string => typeof name === 'string' && name.startsWith(HEALTH_PREFIX))
    .sort();
}

export function allPermissions(manifest: AndroidManifest): readonly string[] {
  return (manifest.manifest['uses-permission'] ?? [])
    .map((entry) => entry.$?.['android:name'])
    .filter((name): name is string => typeof name === 'string');
}

export function mainApplication(manifest: AndroidManifest): AndroidConfig.Manifest.ManifestApplication {
  const application = manifest.manifest.application?.[0];
  if (application === undefined) throw new Error('fixture manifest has no <application>');
  return application;
}

export function activityAlias(
  manifest: AndroidManifest,
  name: string,
): AndroidConfig.Manifest.ManifestActivityAlias | undefined {
  return (mainApplication(manifest)['activity-alias'] ?? []).find(
    (alias) => alias.$?.['android:name'] === name,
  );
}

export function metaDataValue(manifest: AndroidManifest, name: string): string | undefined {
  return (mainApplication(manifest)['meta-data'] ?? []).find(
    (item) => item.$?.['android:name'] === name,
  )?.$['android:value'];
}

export function queriesPackages(manifest: AndroidManifest): readonly string[] {
  return (manifest.manifest.queries ?? []).flatMap((query) =>
    (query.package ?? []).map((pkg) => pkg.$['android:name']),
  );
}

export const VALID_PROPS: GjKitWorkoutsPluginProps = {
  privacyPolicyUrl: 'https://example.com/privacy',
};
