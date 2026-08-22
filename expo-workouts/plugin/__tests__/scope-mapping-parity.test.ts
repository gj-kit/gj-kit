// 표류 방지 — §8.8 표가 **세 곳**에 있고, 셋이 갈라지면 아무도 모른다.
//
//   1. `src/core/authorization.ts`  — 런타임(요청 집합)이 쓰는 표
//   2. `plugin/src/scopes.ts`        — 매니페스트가 쓰는 표 (rootDir 경계 때문에 복제본이다)
//   3. `tests/fixtures/scope-mapping.json` — XCTest·JUnit·이 테스트가 공유하는 골든 벡터
//
// 설계 §8.8 마지막 문단이 "표 자체는 공유 골든 벡터로 고정한다. 이것이 없으면 매핑 변경이
// 3방향으로 조용히 표류한다"라고 못 박은 지점이고, 이 파일이 그 고정 장치다.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ANDROID_HISTORY_PERMISSION,
  ANDROID_READ_PERMISSIONS,
  ANDROID_WRITE_PERMISSIONS,
  SCOPES,
} from '../src/scopes';
import {
  ANDROID_HISTORY_PERMISSION as CORE_HISTORY,
  ANDROID_READ_PERMISSIONS as CORE_READ,
  ANDROID_WRITE_PERMISSIONS as CORE_WRITE,
  androidRuntimeRequestPermissions,
} from '../../src/core/authorization';
import { SCOPES as CORE_SCOPES, WORKOUT_TOTALS_SCOPES } from '../../src/core/types';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface Fixture {
  readonly androidRead: Record<string, string>;
  readonly androidWrite: Record<string, string>;
  readonly androidHistory: string;
  readonly manifestOnly: readonly string[];
  readonly $evidence: {
    readonly unverified: readonly string[];
    readonly deviceGranted: readonly string[];
  };
}

const fixture = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, 'tests', 'fixtures', 'scope-mapping.json'), 'utf8'),
) as Fixture;

describe('플러그인 표 == ./core 표', () => {
  it('scope 어휘가 같다 (7종, 같은 순서)', () => {
    expect([...SCOPES]).toEqual([...CORE_SCOPES]);
  });

  it('READ 표가 문자 단위로 같다', () => {
    expect(ANDROID_READ_PERMISSIONS).toEqual(CORE_READ);
  });

  it('WRITE 표가 문자 단위로 같다', () => {
    expect(ANDROID_WRITE_PERMISSIONS).toEqual(CORE_WRITE);
  });

  it('history 권한이 같다', () => {
    expect(ANDROID_HISTORY_PERMISSION).toBe(CORE_HISTORY);
  });
});

describe('§7.3 행 2가 쓰는 coarse 레시피가 ./core의 것과 같다', () => {
  it("WORKOUT_TOTALS_SCOPES == ['workouts','distance','activeEnergy','elevation'] (routes 제외)", () => {
    // introspect 스냅샷은 이 네 이름을 **손으로** 적는다. 그래야 core가 바뀌었을 때
    // 스냅샷이 조용히 따라가는 대신 여기서 터진다.
    expect([...WORKOUT_TOTALS_SCOPES]).toEqual(['workouts', 'distance', 'activeEnergy', 'elevation']);
    expect([...WORKOUT_TOTALS_SCOPES]).not.toContain('routes');
  });
});

describe('플러그인 표 == 공유 골든 벡터', () => {
  it('READ', () => {
    expect(ANDROID_READ_PERMISSIONS).toEqual(fixture.androidRead);
  });
  it('WRITE', () => {
    expect(ANDROID_WRITE_PERMISSIONS).toEqual(fixture.androidWrite);
  });
  it('history', () => {
    expect(ANDROID_HISTORY_PERMISSION).toBe(fixture.androidHistory);
  });
  it('routes의 READ는 매니페스트 전용 목록과 일치한다', () => {
    expect(fixture.manifestOnly).toEqual([ANDROID_READ_PERMISSIONS.routes]);
  });
});

describe('f110 — 매니페스트 선언과 런타임 요청은 **다른 일**이다', () => {
  it('플러그인은 READ_EXERCISE_ROUTES를 선언하지만 런타임 요청 집합에는 없다', () => {
    const runtime = androidRuntimeRequestPermissions({ read: [...CORE_SCOPES] });
    expect(runtime).not.toContain(ANDROID_READ_PERMISSIONS.routes);
    // 반대 방향: 플러그인이 내는 매니페스트 집합에는 반드시 있다 (introspect-android.test.ts).
    expect(fixture.manifestOnly).toContain(ANDROID_READ_PERMISSIONS.routes);
  });
});

describe('§8.8 증거 등급 — [unverified]가 Phase 3에서 닫혔다', () => {
  // Phase 2에서 이 테스트는 "per-type WRITE_* 5종이 `unverified`에 **있다**"를 단언했고, 주석이
  // "목록이 줄어들면 기기 게이트가 실제로 돌았다는 뜻이고 그때 이 테스트를 고쳐야 한다"고 적어
  // 두었다. §9.5 기기 게이트 6번(다섯 줄의 `adb shell pm grant`)이 2026-08-22에 실행됐다 —
  // 다섯 줄 전부 rc=0이고 `dumpsys`가 다섯 문자열 모두 `granted=true`로 보고했다(Pixel_9a_hcprobe,
  // API 36). 그래서 방향을 뒤집는다: 이제 `unverified`는 **비어 있어야** 하고 다섯은 전부
  // `deviceGranted`에 있어야 한다. 가드가 약해진 것이 아니라 증거 등급이 올라간 것이다.
  it('`unverified`가 비었다 — §11-24가 닫혔다', () => {
    expect(fixture.$evidence.unverified).toEqual([]);
  });

  it('per-type WRITE_* 5종이 전부 기기 검증 목록에 있다', () => {
    const granted = new Set(fixture.$evidence.deviceGranted);
    for (const permission of [
      ANDROID_WRITE_PERMISSIONS.distance,
      ANDROID_WRITE_PERMISSIONS.activeEnergy,
      ANDROID_WRITE_PERMISSIONS.elevation,
      ANDROID_WRITE_PERMISSIONS.heartRate,
      ANDROID_WRITE_PERMISSIONS.steps,
    ]) {
      expect(granted.has(permission)).toBe(true);
    }
  });
});
