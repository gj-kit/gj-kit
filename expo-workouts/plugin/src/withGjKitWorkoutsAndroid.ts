// Android mod — `<uses-permission>` · `<queries>` · privacy-policy meta-data · activity-alias 2종.
//
// **`minSdk`는 건드리지 않는다 (D7).** 이 파일에도, 이 패키지 어디에도 `withGradleProperties` ·
// `withProjectBuildGradle` · `withAppBuildGradle` · `withDangerousMod` 호출은 **하나도 없다**.
// `plugin/__tests__/no-forbidden-mutations.test.ts`가 등록된 mod 키 집합으로 그것을 단언한다.
// connect-client 1.1.0이 minSdk 26을 요구하므로 24짜리 앱은 병합이 깨지지만, 그 해결은 소비자가
// `expo-build-properties`로 하는 것이 맞다 — 우리가 남의 앱의 최소 지원 기기를 바꿀 수는 없다.

import { AndroidConfig, withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

import {
  ANDROID_HISTORY_PERMISSION,
  ANDROID_READ_PERMISSIONS,
  ANDROID_ROUTES_MANIFEST_ONLY_PERMISSION,
  ANDROID_WRITE_PERMISSIONS,
} from './scopes';
import type { ResolvedProps } from './props';

type AndroidManifest = AndroidConfig.Manifest.AndroidManifest;
type ManifestApplication = AndroidConfig.Manifest.ManifestApplication;
type ManifestActivityAlias = AndroidConfig.Manifest.ManifestActivityAlias;

/** Health Connect 제공자 패키지. API 28–33 경로에서 provider 가시성을 얻으려면 필요하다. */
export const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';

/** props의 `privacyPolicyUrl`이 실리는 자리. 우리 Activity가 `PackageManager`로 읽는다. */
export const PRIVACY_POLICY_META_DATA = 'kit.gj.workouts.PRIVACY_POLICY_URL';

/**
 * alias의 타깃. **라이브러리 `AndroidManifest.xml`이 shipping하는 고정 부품**이며 플러그인은
 * 선언하지 않는다 (설계 §7.1 마지막 행). 스냅샷이 증명할 것은 alias의 존재이지 타깃 클래스가
 * 아니다 — 둘은 매니페스트 병합 시점에 함께 검증된다.
 */
export const PERMISSION_USAGE_ACTIVITY = 'kit.gj.workouts.PermissionUsageActivity';

/**
 * **f123**: Android 14+(API 34+)의 health permission 다이얼로그가 실제로 띄우는 것은 이 alias다.
 * `ACTION_SHOW_PERMISSIONS_RATIONALE`은 API 36에서 한 번도 발화하지 않았다.
 */
export const VIEW_PERMISSION_USAGE_ALIAS = 'kit.gj.workouts.ViewPermissionUsageAlias';
export const VIEW_PERMISSION_USAGE_ACTION = 'android.intent.action.VIEW_PERMISSION_USAGE';
export const HEALTH_PERMISSIONS_CATEGORY = 'android.intent.category.HEALTH_PERMISSIONS';
export const START_VIEW_PERMISSION_USAGE = 'android.permission.START_VIEW_PERMISSION_USAGE';

/**
 * API 28–33 경로. RESULTS 261행이 **유지하라**고 명시한다 — 34+에서 발화하지 않을 뿐
 * 제거 대상이 아니다.
 */
export const RATIONALE_ALIAS = 'kit.gj.workouts.ShowPermissionsRationaleAlias';
export const RATIONALE_ACTION = 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';

/**
 * props → `<uses-permission>` 집합 (설계 §8.8 · §7.1).
 *
 * `'routes'`의 READ는 read/write **어느 쪽에** 있어도 무조건 나간다 — f112: 미선언이면 route
 * 요청이 아무 에러 없이 조용히 null을 반환한다. (런타임 **요청** 집합에 넣는 것은 별개의 일이고
 * 그쪽은 절대 하지 않는다 — f110.)
 */
export function usesPermissionsFor(props: ResolvedProps): readonly string[] {
  const out = new Set<string>();
  for (const scope of props.read) out.add(ANDROID_READ_PERMISSIONS[scope]);
  for (const scope of props.write) out.add(ANDROID_WRITE_PERMISSIONS[scope]);
  if (props.read.includes('routes') || props.write.includes('routes')) {
    out.add(ANDROID_ROUTES_MANIFEST_ONLY_PERMISSION);
  }
  if (props.history) out.add(ANDROID_HISTORY_PERMISSION);
  return [...out].sort();
}

function ensureUsesPermission(manifest: AndroidManifest, name: string): void {
  // 직접 쓴다. `AndroidConfig.Permissions.ensurePermission`은 마지막 세그먼트를 대문자화하는
  // 정규화를 하며(`ensurePermissionNameFormat`), 우리 문자열은 한 글자도 변형되면 안 된다.
  const list = (manifest.manifest['uses-permission'] ??= []);
  if (list.some((entry) => entry.$?.['android:name'] === name)) return;
  list.push({ $: { 'android:name': name } });
}

function ensureHealthConnectQuery(manifest: AndroidManifest): void {
  const queries = (manifest.manifest.queries ??= []);
  for (const query of queries) {
    if (query.package?.some((pkg) => pkg.$['android:name'] === HEALTH_CONNECT_PACKAGE)) return;
  }
  const first = queries[0];
  if (first === undefined) {
    queries.push({ package: [{ $: { 'android:name': HEALTH_CONNECT_PACKAGE } }] });
    return;
  }
  (first.package ??= []).push({ $: { 'android:name': HEALTH_CONNECT_PACKAGE } });
}

function upsertActivityAlias(application: ManifestApplication, alias: ManifestActivityAlias): void {
  const aliases = (application['activity-alias'] ??= []);
  const name = alias.$?.['android:name'];
  const index = aliases.findIndex((entry) => entry.$?.['android:name'] === name);
  // 멱등: 플러그인이 두 번 적용돼도 alias는 하나다. 값은 **우리 것으로 덮어쓴다** — 이 두 alias는
  // 전적으로 우리 소유이고, 반쯤 낡은 버전이 남는 것이 최악이다.
  if (index >= 0) aliases[index] = alias;
  else aliases.push(alias);
}

function viewPermissionUsageAlias(): ManifestActivityAlias {
  return {
    $: {
      'android:name': VIEW_PERMISSION_USAGE_ALIAS,
      'android:targetActivity': PERMISSION_USAGE_ACTIVITY,
      // 시스템(Settings)이 직접 띄운다 → exported. 아무나 띄우지 못하도록 시스템 전용 권한으로 잠근다.
      'android:exported': 'true',
      'android:permission': START_VIEW_PERMISSION_USAGE,
    },
    'intent-filter': [
      {
        action: [{ $: { 'android:name': VIEW_PERMISSION_USAGE_ACTION } }],
        category: [{ $: { 'android:name': HEALTH_PERMISSIONS_CATEGORY } }],
      },
    ],
  };
}

function rationaleAlias(): ManifestActivityAlias {
  return {
    $: {
      'android:name': RATIONALE_ALIAS,
      'android:targetActivity': PERMISSION_USAGE_ACTIVITY,
      // Health Connect 앱이 띄운다 → exported. `START_VIEW_PERMISSION_USAGE`로 잠그면
      // Health Connect가 띄우지 못하므로 여기에는 권한을 걸지 않는다.
      'android:exported': 'true',
    },
    'intent-filter': [{ action: [{ $: { 'android:name': RATIONALE_ACTION } }] }],
  };
}

export const withGjKitWorkoutsAndroid: ConfigPlugin<ResolvedProps> = (config, props) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    for (const permission of usesPermissionsFor(props)) ensureUsesPermission(manifest, permission);
    ensureHealthConnectQuery(manifest);

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      PRIVACY_POLICY_META_DATA,
      props.privacyPolicyUrl,
      'value',
    );
    upsertActivityAlias(application, viewPermissionUsageAlias());
    upsertActivityAlias(application, rationaleAlias());
    return cfg;
  });
