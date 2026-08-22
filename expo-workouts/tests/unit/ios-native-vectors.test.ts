// `tests/fixtures/ios-native-vectors.json`의 TS 절반 (설계 §9.4).
//
// 이 파일 하나를 **두 언어**가 읽는다: 여기와 `ios-tests/`의 XCTest. 그래서 다음 두 가지가 조용히
// 표류할 수 없다.
//
//   1. **커서 지문** — `scopeFingerprint`(TS)와 `WorkoutsScopeFingerprint.compute`(Swift)가 한 글자라도
//      다르면 네이티브가 만든 커서를 JS가 매번 `scopesChanged`로 리셋한다. 컴파일은 통과하고 테스트도
//      각자 통과하며, **기기에서 무한 재백필로만** 드러난다.
//   2. **쓰기 방향 sentinel** — Swift가 `RoutePoint`의 없는 optional을 CoreLocation의 `-1`로 쓰고,
//      읽기 경로가 그 `-1`을 `undefined`로 되접는다. 두 규칙이 서로의 역함수가 아니면 사용자가 쓴
//      루트가 다른 값으로 되돌아온다. 읽기 방향은 `route-vectors.json`의 `sentinels`가 이미 고정하고,
//      여기서는 **왕복 전체**를 고정한다.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sanitizeRoutePointFromNative } from '../../src/core/route';
import { scopeFingerprint } from '../../src/core/sync/cursor';

interface FingerprintVector {
  readonly name: string;
  readonly permissions: readonly string[];
  readonly fingerprint: string;
}

interface LocationFields {
  readonly altitude: number;
  readonly horizontalAccuracy: number;
  readonly verticalAccuracy: number;
  readonly course: number;
  readonly speed: number;
}

interface WriteLocationVector {
  readonly name: string;
  readonly point: {
    readonly t: number;
    readonly lat: number;
    readonly lon: number;
    readonly altM?: number;
    readonly hAccM?: number;
    readonly vAccM?: number;
    readonly speedMps?: number;
    readonly courseDeg?: number;
  };
  readonly location: LocationFields;
  readonly readBack: {
    readonly altM: number | null;
    readonly hAccM: number | null;
    readonly vAccM: number | null;
    readonly speedMps: number | null;
    readonly courseDeg: number | null;
  };
}

const fixture = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'ios-native-vectors.json'), 'utf8'),
) as {
  readonly schemaVersion: number;
  readonly scopeFingerprints: readonly FingerprintVector[];
  readonly writeLocations: readonly WriteLocationVector[];
};

describe('ios-native-vectors — scopeFingerprint', () => {
  it('schemaVersion 1이다', () => {
    expect(fixture.schemaVersion).toBe(1);
    expect(fixture.scopeFingerprints.length).toBeGreaterThanOrEqual(7);
  });

  it.each(fixture.scopeFingerprints.map((vector) => [vector.name, vector] as const))(
    '%s',
    (_name, vector) => {
      expect(scopeFingerprint(vector.permissions)).toBe(vector.fingerprint);
    },
  );

  it('벡터가 실제로 서로 다른 값을 담는다 — 전부 같은 문자열이면 이 표는 아무것도 증명하지 않는다', () => {
    const distinct = new Set(fixture.scopeFingerprints.map((vector) => vector.fingerprint));
    expect(distinct.size).toBeGreaterThanOrEqual(6);
  });
});

describe('ios-native-vectors — 쓰기 sentinel 왕복', () => {
  it.each(fixture.writeLocations.map((vector) => [vector.name, vector] as const))(
    '%s',
    (_name, vector) => {
      // HealthKit은 아무것도 거르지 않고 바이트 동일하게 되돌려준다(f81·f83). 그러므로 Swift가 만든
      // `CLLocation`의 필드값이 곧 읽기 경로가 보게 될 값이고, 이 표의 `location`이 그 접점이다.
      const fromNative = sanitizeRoutePointFromNative({
        t: vector.point.t,
        lat: vector.point.lat,
        lon: vector.point.lon,
        altM: vector.location.altitude,
        hAccM: vector.location.horizontalAccuracy,
        vAccM: vector.location.verticalAccuracy,
        speedMps: vector.location.speed,
        courseDeg: vector.location.course,
      });
      const expected = vector.readBack;
      expect(fromNative.altM).toBe(expected.altM ?? undefined);
      expect(fromNative.hAccM).toBe(expected.hAccM ?? undefined);
      expect(fromNative.vAccM).toBe(expected.vAccM ?? undefined);
      expect(fromNative.speedMps).toBe(expected.speedMps ?? undefined);
      expect(fromNative.courseDeg).toBe(expected.courseDeg ?? undefined);
      expect(fromNative.t).toBe(vector.point.t);
      expect(fromNative.lat).toBe(vector.point.lat);
      expect(fromNative.lon).toBe(vector.point.lon);
    },
  );

  it('없는 optional은 전부 음수 sentinel로 나간다 — altM만 예외이고 그 예외는 표에 적혀 있다', () => {
    const absent = fixture.writeLocations.find((vector) => vector.point.hAccM === undefined);
    expect(absent).toBeDefined();
    const location = (absent as WriteLocationVector).location;
    expect(location.horizontalAccuracy).toBeLessThan(0);
    expect(location.verticalAccuracy).toBeLessThan(0);
    expect(location.course).toBeLessThan(0);
    expect(location.speed).toBeLessThan(0);
    // 고도는 CoreLocation에 sentinel이 없다. 그래서 0으로 나가고 0으로 돌아온다 — 손실이며,
    // 숨기지 않고 여기에 못 박는다.
    expect(location.altitude).toBe(0);
    expect((absent as WriteLocationVector).readBack.altM).toBe(0);
  });
});
