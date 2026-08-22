// 설계 §7.2 — 플러그인이 **절대 하지 않는 것**을 단언한다.
//
// 이 파일은 "무엇을 하는가"가 아니라 "무엇을 하지 않는가"를 본다. 그래서 스냅샷 비교가 아니라
// (a) 등록된 mod 키 집합과 (b) 플러그인 적용 전/후 introspect 결과의 **차이**로 말한다.
// D7("플러그인은 minSdk를 건드리지 않는다")은 이 두 가지로만 증명 가능하다 — expo의 minSdk는
// `expo-build-properties`가 gradle mod로 쓰는 값이라, 우리가 gradle mod를 하나도 등록하지
// 않았다는 사실이 곧 계약이다.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments } from '../../tests/guards/ast';
import { introspectAsync, introspectBaselineAsync } from './helpers';
import { SCOPES } from '../src/scopes';

const URL = 'https://example.com/privacy';
const PLUGIN_SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const FULL_PROPS = {
  privacyPolicyUrl: URL,
  read: [...SCOPES],
  write: [...SCOPES],
  history: true,
} as const;

describe('D7 — 플러그인은 minSdk를 건드리지 않는다', () => {
  it('등록하는 mod는 정확히 ios.entitlements · ios.infoPlist · android.manifest 3개뿐이다', async () => {
    const { modNames } = await introspectAsync(FULL_PROPS);
    expect([...modNames.ios].sort()).toEqual(['entitlements', 'infoPlist']);
    expect([...modNames.android].sort()).toEqual(['manifest']);
  });

  it('gradle·dangerous 계열 mod 호출이 소스에 **하나도** 없다', () => {
    const forbidden = [
      'withGradleProperties',
      'withProjectBuildGradle',
      'withAppBuildGradle',
      'withSettingsGradle',
      'withDangerousMod',
      'withPodfile',
      'withXcodeProject',
      'minSdkVersion',
      'compileSdkVersion',
      'targetSdkVersion',
    ];
    // 주석은 **제거하고** 스캔한다 — 이 파일들의 주석은 "무엇을 하지 않는가"를 설명하느라
    // 금지 토큰을 정당하게 여러 번 부른다. 실행되는 코드만 봐야 한다.
    const sources = ['index.ts', 'props.ts', 'scopes.ts', 'withGjKitWorkoutsAndroid.ts', 'withGjKitWorkoutsIos.ts']
      .map((name) => stripComments(readFileSync(join(PLUGIN_SRC, name), 'utf8')))
      .join('\n');
    for (const token of forbidden) {
      expect(sources, `plugin/src must not mention ${token}`).not.toContain(token);
    }
  });

  it('introspect된 gradle.properties가 기준선과 **완전히 동일**하다', async () => {
    const baseline = await introspectBaselineAsync();
    const applied = await introspectAsync(FULL_PROPS);
    expect(applied.gradleProperties).toEqual(baseline.gradleProperties);
  });

  it('매니페스트에 <uses-sdk>를 추가하지 않는다', async () => {
    const baseline = await introspectBaselineAsync();
    const applied = await introspectAsync(FULL_PROPS);
    expect((applied.manifest.manifest as Record<string, unknown>)['uses-sdk']).toEqual(
      (baseline.manifest.manifest as Record<string, unknown>)['uses-sdk'],
    );
    expect((applied.manifest.manifest as Record<string, unknown>)['uses-sdk']).toBeUndefined();
  });
});

describe('플러그인 적용 전/후 차이가 우리가 의도한 것뿐이다', () => {
  it('템플릿의 기존 권한을 지우거나 바꾸지 않는다 (INTERNET·VIBRATE 등은 그대로)', async () => {
    const baseline = await introspectBaselineAsync();
    const applied = await introspectAsync(FULL_PROPS);
    const before = (baseline.manifest.manifest['uses-permission'] ?? []).map((p) => p.$['android:name']);
    const after = (applied.manifest.manifest['uses-permission'] ?? []).map((p) => p.$['android:name']);
    expect(after.slice(0, before.length)).toEqual(before);
    for (const added of after.slice(before.length)) {
      expect(added.startsWith('android.permission.health.')).toBe(true);
    }
  });

  it('<application>의 기존 activity를 건드리지 않는다', async () => {
    const baseline = await introspectBaselineAsync();
    const applied = await introspectAsync(FULL_PROPS);
    expect(applied.manifest.manifest.application?.[0]?.activity).toEqual(
      baseline.manifest.manifest.application?.[0]?.activity,
    );
  });

  it('기준선에는 우리 항목이 하나도 없다 — 위 단언들이 공허하지 않다는 음성 대조군', async () => {
    const baseline = await introspectBaselineAsync();
    const names = (baseline.manifest.manifest['uses-permission'] ?? []).map((p) => p.$['android:name']);
    expect(names.some((n) => n.startsWith('android.permission.health.'))).toBe(false);
    expect(baseline.manifest.manifest.application?.[0]?.['activity-alias']).toBeUndefined();
    expect(baseline.entitlements['com.apple.developer.healthkit']).toBeUndefined();
    expect(baseline.infoPlist['NSHealthShareUsageDescription']).toBeUndefined();
  });
});
