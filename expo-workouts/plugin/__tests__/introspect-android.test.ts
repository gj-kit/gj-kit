// 설계 §7.3 — Android introspect 스냅샷.
//
// 이 파일이 지키는 것은 **소유자 결정 ②의 관측 가능한 형태**다: `read: ['workouts']`가 권한
// 1개를, `WORKOUT_TOTALS_SCOPES`가 권한 4개를 낸다는 것. 이 두 스냅샷이 없으면 결정 ②는
// 타입 수준의 주장일 뿐이다(§7.3 각주).

import { describe, expect, it } from 'vitest';

import {
  ANDROID_HISTORY_PERMISSION,
  ANDROID_READ_PERMISSIONS,
  ANDROID_WRITE_PERMISSIONS,
  SCOPES,
} from '../src/scopes';
import {
  HEALTH_CONNECT_PACKAGE,
  PERMISSION_USAGE_ACTIVITY,
  PRIVACY_POLICY_META_DATA,
  RATIONALE_ACTION,
  RATIONALE_ALIAS,
  START_VIEW_PERMISSION_USAGE,
  VIEW_PERMISSION_USAGE_ACTION,
  VIEW_PERMISSION_USAGE_ALIAS,
  HEALTH_PERMISSIONS_CATEGORY,
} from '../src/withGjKitWorkoutsAndroid';
import {
  activityAlias,
  healthPermissions,
  introspectAsync,
  mainApplication,
  metaDataValue,
  queriesPackages,
} from './helpers';

const URL = 'https://example.com/privacy';

/** 설계 §5.1의 coarse 레시피. 여기서는 값을 **손으로 적어** core와의 표류까지 잡는다. */
const WORKOUT_TOTALS_SCOPES = ['workouts', 'distance', 'activeEnergy', 'elevation'] as const;

describe('§7.3 행 1 — `read: [\'workouts\']`는 권한 **한 줄만** 낸다 (소유자 결정 ②)', () => {
  it('READ_EXERCISE 단 하나이고 총합 3종과 routes·history는 부재다', async () => {
    const { manifest } = await introspectAsync({ privacyPolicyUrl: URL, read: ['workouts'] });
    expect(healthPermissions(manifest)).toEqual([ANDROID_READ_PERMISSIONS.workouts]);
  });
});

describe("§7.3 행 2 — `read: [...WORKOUT_TOTALS_SCOPES]`는 정확히 4줄을 낸다", () => {
  it('READ_EXERCISE + READ_DISTANCE + READ_ACTIVE_CALORIES_BURNED + READ_ELEVATION_GAINED, routes 부재', async () => {
    const { manifest } = await introspectAsync({
      privacyPolicyUrl: URL,
      read: [...WORKOUT_TOTALS_SCOPES],
    });
    expect(healthPermissions(manifest)).toEqual(
      [
        ANDROID_READ_PERMISSIONS.workouts,
        ANDROID_READ_PERMISSIONS.distance,
        ANDROID_READ_PERMISSIONS.activeEnergy,
        ANDROID_READ_PERMISSIONS.elevation,
      ].sort(),
    );
    expect(healthPermissions(manifest)).not.toContain(ANDROID_READ_PERMISSIONS.routes);
  });

  it('행 1과 행 2의 **차이가 정확히 3줄**이다 — 이것이 "개발자가 입도를 고른다"의 실체다', async () => {
    const coarse = await introspectAsync({ privacyPolicyUrl: URL, read: [...WORKOUT_TOTALS_SCOPES] });
    const fine = await introspectAsync({ privacyPolicyUrl: URL, read: ['workouts'] });
    expect(healthPermissions(coarse.manifest)).toHaveLength(4);
    expect(healthPermissions(fine.manifest)).toHaveLength(1);
  });
});

describe('§7.3 행 3 — 전수 read + 5종 write', () => {
  const props = {
    privacyPolicyUrl: URL,
    read: [...SCOPES],
    write: ['workouts', 'distance', 'activeEnergy', 'elevation', 'routes'],
  } as const;

  it('READ 7종 + WRITE 5종을 전부 낸다', async () => {
    const { manifest } = await introspectAsync(props);
    const expected = [
      ...SCOPES.map((scope) => ANDROID_READ_PERMISSIONS[scope]),
      ...(['workouts', 'distance', 'activeEnergy', 'elevation', 'routes'] as const).map(
        (scope) => ANDROID_WRITE_PERMISSIONS[scope],
      ),
    ].sort();
    expect(healthPermissions(manifest)).toEqual(expected);
  });

  it('READ_EXERCISE_ROUTES와 WRITE_EXERCISE_ROUTE(단수)가 둘 다 있다', async () => {
    const { manifest } = await introspectAsync(props);
    expect(healthPermissions(manifest)).toContain('android.permission.health.READ_EXERCISE_ROUTES');
    expect(healthPermissions(manifest)).toContain('android.permission.health.WRITE_EXERCISE_ROUTE');
  });
});

describe('f112 — `routes`가 write에만 있어도 READ_EXERCISE_ROUTES를 선언한다', () => {
  it('write에만 routes: 매니페스트 전용 권한이 나온다 (미선언이면 route가 조용히 null)', async () => {
    const { manifest } = await introspectAsync({
      privacyPolicyUrl: URL,
      read: ['workouts'],
      write: ['workouts', 'routes'],
    });
    expect(healthPermissions(manifest)).toContain(ANDROID_READ_PERMISSIONS.routes);
    expect(healthPermissions(manifest)).toContain(ANDROID_WRITE_PERMISSIONS.routes);
  });

  it('routes가 어디에도 없으면 READ_EXERCISE_ROUTES도 없다 — 과잉 선언하지 않는다', async () => {
    const { manifest } = await introspectAsync({
      privacyPolicyUrl: URL,
      read: ['workouts', 'heartRate'],
      write: ['workouts'],
    });
    expect(healthPermissions(manifest)).not.toContain(ANDROID_READ_PERMISSIONS.routes);
  });
});

describe('§7.3 행 4 — D10 history는 opt-in이다', () => {
  it('history: true → READ_HEALTH_DATA_HISTORY 존재', async () => {
    const { manifest } = await introspectAsync({ privacyPolicyUrl: URL, read: ['workouts'], history: true });
    expect(healthPermissions(manifest)).toContain(ANDROID_HISTORY_PERMISSION);
  });

  it('기본(생략) → 부재. 30일 벽이 기본 현실이라는 계약이 매니페스트에서 보인다', async () => {
    const { manifest } = await introspectAsync({ privacyPolicyUrl: URL, read: ['workouts'] });
    expect(healthPermissions(manifest)).not.toContain(ANDROID_HISTORY_PERMISSION);
  });

  it('history: false는 true와 다르다', async () => {
    const { manifest } = await introspectAsync({ privacyPolicyUrl: URL, read: ['workouts'], history: false });
    expect(healthPermissions(manifest)).not.toContain(ANDROID_HISTORY_PERMISSION);
  });
});

describe('§7.3 행 5 — 모든 조합에서 항상 참이어야 하는 것', () => {
  const combos: { label: string; props: Parameters<typeof introspectAsync>[0] }[] = [
    { label: 'props 최소(기본)', props: { privacyPolicyUrl: URL } },
    { label: "read: ['workouts']", props: { privacyPolicyUrl: URL, read: ['workouts'] } },
    { label: 'totals', props: { privacyPolicyUrl: URL, read: [...WORKOUT_TOTALS_SCOPES] } },
    {
      label: '전수 + history',
      props: { privacyPolicyUrl: URL, read: [...SCOPES], write: [...SCOPES], history: true },
    },
  ];

  for (const { label, props } of combos) {
    describe(label, () => {
      it('<queries>에 Health Connect 제공자 패키지가 있다 (API 28–33 provider 가시성)', async () => {
        const { manifest } = await introspectAsync(props);
        expect(queriesPackages(manifest)).toContain(HEALTH_CONNECT_PACKAGE);
      });

      it('f123 — VIEW_PERMISSION_USAGE alias가 category·permission까지 갖춰 있다', async () => {
        const { manifest } = await introspectAsync(props);
        const alias = activityAlias(manifest, VIEW_PERMISSION_USAGE_ALIAS);
        expect(alias).toBeDefined();
        expect(alias?.$?.['android:targetActivity']).toBe(PERMISSION_USAGE_ACTIVITY);
        expect(alias?.$?.['android:exported']).toBe('true');
        // 시스템 전용 권한으로 잠그지 않으면 아무 앱이나 이 화면을 띄울 수 있다.
        expect(alias?.$?.['android:permission']).toBe(START_VIEW_PERMISSION_USAGE);
        expect(alias?.['intent-filter']?.[0]?.action?.[0]?.$['android:name']).toBe(
          VIEW_PERMISSION_USAGE_ACTION,
        );
        expect(alias?.['intent-filter']?.[0]?.category?.[0]?.$['android:name']).toBe(
          HEALTH_PERMISSIONS_CATEGORY,
        );
      });

      it('RESULTS 261행 — rationale alias는 API 28–33용으로 **유지**된다 (34+에서 발화하지 않을 뿐)', async () => {
        const { manifest } = await introspectAsync(props);
        const alias = activityAlias(manifest, RATIONALE_ALIAS);
        expect(alias).toBeDefined();
        expect(alias?.$?.['android:targetActivity']).toBe(PERMISSION_USAGE_ACTIVITY);
        expect(alias?.$?.['android:exported']).toBe('true');
        // Health Connect 앱이 띄우므로 START_VIEW_PERMISSION_USAGE로 잠그면 **안 된다**.
        expect(alias?.$?.['android:permission']).toBeUndefined();
        expect(alias?.['intent-filter']?.[0]?.action?.[0]?.$['android:name']).toBe(RATIONALE_ACTION);
      });

      it('alias는 정확히 2종이다', async () => {
        const { manifest } = await introspectAsync(props);
        expect((mainApplication(manifest)['activity-alias'] ?? []).map((a) => a.$?.['android:name'])).toEqual([
          VIEW_PERMISSION_USAGE_ALIAS,
          RATIONALE_ALIAS,
        ]);
      });

      it('PRIVACY_POLICY_URL meta-data가 props 값과 정확히 일치한다', async () => {
        const { manifest } = await introspectAsync(props);
        expect(metaDataValue(manifest, PRIVACY_POLICY_META_DATA)).toBe(URL);
      });

      it('타깃 Activity는 **선언하지 않는다** — 라이브러리 매니페스트의 몫이다 (§7.1)', async () => {
        const { manifest } = await introspectAsync(props);
        const activities = (mainApplication(manifest).activity ?? []).map((a) => a.$['android:name']);
        expect(activities).not.toContain(PERMISSION_USAGE_ACTIVITY);
      });
    });
  }
});

describe('멱등 — 플러그인을 두 번 나열해도 매니페스트가 부풀지 않는다', () => {
  it('같은 권한/alias/meta-data가 중복되지 않는다', async () => {
    const props = { privacyPolicyUrl: URL, read: [...SCOPES], write: [...SCOPES], history: true } as const;
    const once = await introspectAsync(props);
    // 두 번 적용은 `introspectAsync`가 아니라 직접 구성해야 한다 — helpers는 1회 적용만 한다.
    const { default: plugin } = await import('../src/index');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { compileModsAsync } = await import('expo/config-plugins');
    let config: Record<string, unknown> = {
      name: 'twice',
      slug: 'twice',
      android: { package: 'com.gjkit.twice' },
      ios: { bundleIdentifier: 'com.gjkit.twice' },
    };
    config = plugin(config as never, props) as never;
    config = plugin(config as never, props) as never;
    const out = (await compileModsAsync(config as never, {
      projectRoot: mkdtempSync(join(tmpdir(), 'gjkit-twice-')),
      platforms: ['ios', 'android'],
      introspect: true,
      assertMissingModProviders: false,
    })) as { _internal?: { modResults?: Record<string, Record<string, unknown>> } };
    const twice = out._internal?.modResults?.['android']?.['manifest'] as typeof once.manifest;
    expect(healthPermissions(twice)).toEqual(healthPermissions(once.manifest));
    expect((mainApplication(twice)['activity-alias'] ?? []).length).toBe(2);
    expect(
      (mainApplication(twice)['meta-data'] ?? []).filter(
        (m) => m.$['android:name'] === PRIVACY_POLICY_META_DATA,
      ).length,
    ).toBe(1);
  });
});
