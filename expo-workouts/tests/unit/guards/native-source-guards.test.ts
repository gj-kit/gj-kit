// 가드 7 — 네이티브 소스 정적 스캔 (설계 §9.3 · §10.5).
//
// 여기 모인 것은 전부 **기기에서만 보이는 실패**를 소스 텍스트로 끌어내린 것이다. Health Connect의
// `aggregate()`는 Phase 0에서 소스 없는 합계를 돌려줬고(f109), `LocalDateTime` 오버로드는 기기
// 타임존에 따라 창을 조용히 옮기며(f108), Swift의 시리즈 빌더 경로는 잠긴 기기에서 고아 route를
// 만든다(f64·f65). 어느 것도 컴파일 에러가 아니고, 어느 것도 시뮬레이터에서 재현되지 않는다.
//
// ⚠ 전부 **주석을 제외한 코드**에 대한 단언이다. 이 저장소의 네이티브 소스는 "왜 이것을 쓰지
//   않는가"를 주석으로 길게 설명하므로, 날 텍스트 스캔은 자기 자신의 근거 주석에 걸린다.

import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PACKAGE_ROOT, read, rel } from '../../guards/ast';
import {
  ANDROID_ROOT,
  findTokens,
  listKotlinFiles,
  listSwiftFiles,
  releaseOnlyText,
  stripNativeComments,
} from '../../guards/nativeText';
import { WORKOUTS_ERROR_CODES } from '../../../src/core/errors';
import { nativeErrorCodeFor, workoutsExceptionClassName } from '../../../src/core/mapErrors';

const swift = listSwiftFiles().map((path) => ({ path, text: read(path) }));
const kotlin = listKotlinFiles().map((path) => ({ path, text: read(path) }));

const report = (hits: readonly { file: string; line: number; token: string }[]): readonly string[] =>
  hits.map((hit) => `${hit.file}:${String(hit.line)} ${hit.token}`);

describe('네이티브 소스가 스캔 가능한 상태다', () => {
  it('Swift 파일과 Kotlin 파일이 실제로 있다 — 가드가 공집합에 대해 통과하지 않는다', () => {
    expect(swift.length).toBeGreaterThanOrEqual(4);
    expect(kotlin.length).toBeGreaterThanOrEqual(10);
  });

  it('주석 스트리퍼가 문자열 안의 `//`를 주석으로 오독하지 않는다', () => {
    const source = 'val url = "https://play.google.com/store" // real comment\nval x = 1\n';
    const code = stripNativeComments(source);
    expect(code).toContain('https://play.google.com/store');
    expect(code).not.toContain('real comment');
    expect(code).toContain('val x = 1');
  });

  it('주석 스트리퍼가 중첩 블록 주석을 끝까지 지운다', () => {
    const code = stripNativeComments('/* outer /* inner */ still */ val kept = 1\n');
    expect(code).not.toContain('inner');
    expect(code).toContain('val kept = 1');
  });
});

describe('android-forbidden-api-guard (f109 · f108 · f119 · idx f37)', () => {
  // `aggregate()`는 **소스 없는** 합계를 돌려주고(f109) 우리는 provenance를 공개 표면에서
  // 약속한다. `LocalDateTime` 오버로드는 기기 로컬 타임존으로 해석돼(f108) 같은 커서가 기기마다
  // 다른 창을 읽는다. 둘 다 컴파일도 되고 테스트도 통과하며, 틀린 데이터만 조용히 준다.
  const FORBIDDEN = ['aggregate(', 'LocalDateTime', 'ACTION_HEALTH_CONNECT_SETTINGS', 'TotalCaloriesBurnedRecord'];

  it.each(FORBIDDEN)('`%s`가 Kotlin 코드에 0건이다', (token) => {
    const hits = kotlin.flatMap(({ path, text }) => findTokens(rel(path), text, [token]));
    expect(report(hits)).toEqual([]);
  });

  it('가드가 실제로 잡는다 — 합성 위반', () => {
    const injected = 'suspend fun total() = client.aggregate(request)\n';
    expect(findTokens('x.kt', injected, FORBIDDEN).length).toBe(1);
  });

  it('가드가 근거 주석은 통과시킨다 — 금지 토큰을 설명하는 주석', () => {
    const commented = '// we never call aggregate( ) — f109 says it drops provenance\nval x = 1\n';
    expect(findTokens('x.kt', commented, FORBIDDEN)).toEqual([]);
  });

  // 설계 §9.3은 `PackageManager.getPackageInfo` 0건을 문자 그대로 요구하지만, §3.4가 요구하는
  // `declaredHealthPermissions()`는 그것 말고 다른 API가 없다 — `checkSelfPermission`은 "선언은
  // 됐지만 미승인"과 "아예 미선언"을 구분하지 못하고, f112가 요구하는 것이 정확히 그 구분이다.
  // f88이 실제로 금지하는 것은 **가용성 판정을 package manager로 하는 것**이므로, 규칙을 그
  // 의도대로 좁힌다 — 호출은 한 파일에만, 가용성 경로는 `getSdkStatus`만.
  it('`getPackageInfo(` 호출이 HealthConnectManifest.kt 한 파일에만 있다 (f88의 의도)', () => {
    const files = kotlin
      .filter(({ path, text }) => findTokens(rel(path), text, ['getPackageInfo(']).length > 0)
      .map(({ path }) => rel(path));
    expect(files).toEqual(['android/src/main/java/kit/gj/workouts/HealthConnectManifest.kt']);
  });

  it('가용성 경로가 package manager를 보지 않는다 — `getSdkStatus`만이 입력이다 (f88)', () => {
    const availability = read(join(ANDROID_ROOT, 'java', 'kit', 'gj', 'workouts', 'WorkoutsAvailability.kt'));
    const code = stripNativeComments(availability);
    expect(code).toContain('sdkStatus');
    expect(code).not.toContain('PackageManager');
    expect(code).not.toContain('getPackageInfo');
  });
});

describe('ios-forbidden-api-guard (f64 · f65 · f87 · idx f8 · idx f47)', () => {
  const FORBIDDEN = ['seriesBuilder(', '.discard()', 'try!', '.runOnQueue(', 'strictEndDate'];

  it.each(FORBIDDEN)('`%s`가 Swift 코드에 0건이다', (token) => {
    const hits = swift.flatMap(({ path, text }) => findTokens(rel(path), text, [token]));
    expect(report(hits)).toEqual([]);
  });

  it('가드가 실제로 잡는다 — 합성 위반', () => {
    const injected = 'let b = store.seriesBuilder(for: t)\ntry! b.finish()\n';
    expect(findTokens('x.swift', injected, FORBIDDEN).length).toBe(2);
  });
});

describe('strict-start-date-guard (f87) — 금지만으로는 부족하고 존재도 강제한다', () => {
  it('모든 predicateForSamples 사이트가 `.strictStartDate`를 달고 있고 최소 한 곳은 존재한다', () => {
    const sites = swift.flatMap(({ path, text }) => {
      const code = stripNativeComments(text);
      const out: { file: string; line: number; token: string }[] = [];
      let index = code.indexOf('predicateForSamples(withStart:');
      while (index >= 0) {
        // 한 호출은 한 줄에 다 들어가지 않을 수 있다 — 사이트부터 다음 `)` 이후까지 본다.
        const tail = code.slice(index, index + 400);
        if (!tail.includes('.strictStartDate')) {
          out.push({ file: rel(path), line: code.slice(0, index).split('\n').length, token: 'missing .strictStartDate' });
        }
        index = code.indexOf('predicateForSamples(withStart:', index + 1);
      }
      return out;
    });
    expect(report(sites)).toEqual([]);

    const total = swift.reduce(
      (sum, { path, text }) => sum + findTokens(rel(path), text, ['predicateForSamples(withStart:']).length,
      0,
    );
    expect(total).toBeGreaterThan(0);
  });
});

describe('error-code-parity — Swift/Kotlin 클래스명이 TS 14종과 1:1이다', () => {
  // Expo 런타임이 **예외 클래스 이름에서** JS 쪽 코드를 만든다(idx f8). 이름이 한 글자만 표류해도
  // 컴파일은 통과하고, 소비자는 `ERR_WORKOUTS_*` 대신 익명 에러를 받는다 — 조용한 실패다.
  const expected = [...WORKOUTS_ERROR_CODES].map(workoutsExceptionClassName).sort();

  const classNames = (text: string): readonly string[] =>
    [...stripNativeComments(text).matchAll(/class\s+(Workouts[A-Za-z]+Exception)\b/gu)].map((m) => m[1] as string);

  it('TS 코드 14종이다', () => {
    expect(WORKOUTS_ERROR_CODES.length).toBe(14);
    expect(expected.length).toBe(14);
  });

  it('Swift가 정확히 그 14개를 선언한다', () => {
    const found = swift.flatMap(({ text }) => classNames(text)).sort();
    expect(found).toEqual(expected);
  });

  it('Kotlin이 정확히 그 14개를 선언한다', () => {
    const found = kotlin.flatMap(({ text }) => classNames(text)).sort();
    expect(found).toEqual(expected);
  });

  it('유도되는 네이티브 코드 문자열이 ERR_WORKOUTS_* 14종이다', () => {
    const codes = [...WORKOUTS_ERROR_CODES].map(nativeErrorCodeFor);
    expect(new Set(codes).size).toBe(14);
    expect(codes.every((code) => code.startsWith('ERR_WORKOUTS_'))).toBe(true);
  });
});

describe('naming-guard — 네이티브 이름이 세 곳에서 일치한다 (미션 §4.1)', () => {
  const buildGradle = readFileSync(join(PACKAGE_ROOT, 'android', 'build.gradle'), 'utf8');

  it("Kotlin group·namespace가 'kit.gj.workouts'다", () => {
    expect(buildGradle).toContain("group = 'kit.gj.workouts'");
    expect(buildGradle).toContain("namespace 'kit.gj.workouts'");
  });

  it("양 플랫폼 모듈 클래스가 GjKitWorkoutsModule이고 Name(\"GjKitWorkouts\")를 등록한다", () => {
    const kotlinModule = read(join(ANDROID_ROOT, 'java', 'kit', 'gj', 'workouts', 'GjKitWorkoutsModule.kt'));
    const swiftModule = read(join(PACKAGE_ROOT, 'ios', 'GjKitWorkoutsModule.swift'));
    expect(kotlinModule).toContain('class GjKitWorkoutsModule');
    expect(kotlinModule).toContain('Name("GjKitWorkouts")');
    expect(swiftModule).toContain('class GjKitWorkoutsModule');
    expect(swiftModule).toContain('Name("GjKitWorkouts")');
  });
});

describe('debug-code-guard (설계 §10.5 — Apple 5.1.3(ii))', () => {
  // 요구는 "디버그 경로가 없을 것"이 아니라 **릴리스 바이너리에서 컴파일 아웃될 것**이다.
  // 조작된 헬스 데이터를 만드는 코드가 릴리스에 남아 있으면 심사에서 거절된다. `./testing`은
  // JS라 네이티브 바이너리와 무관하고, 그래서 이 가드는 `ios/**`·`android/src/main/**`만 본다.
  const SEEDING = ['seed', 'Seed', 'fixture', 'Fixture', 'dummy', 'Dummy', 'fabricate', 'synthetic', 'mockData', 'sampleData'];

  it('Swift 릴리스 경로에 시딩 어휘가 0건이다', () => {
    const hits = swift.flatMap(({ path, text }) =>
      findTokens(rel(path), text, SEEDING, (source) => releaseOnlyText(source, 'swift')),
    );
    expect(report(hits)).toEqual([]);
  });

  it('Kotlin 릴리스 경로에 시딩 어휘가 0건이다', () => {
    const hits = kotlin.flatMap(({ path, text }) =>
      findTokens(rel(path), text, SEEDING, (source) => releaseOnlyText(source, 'kotlin')),
    );
    expect(report(hits)).toEqual([]);
  });

  it('가드가 실제로 잡는다 — `#if DEBUG` 밖의 Swift 시딩', () => {
    const injected = 'func seedWorkouts() { }\n';
    expect(findTokens('x.swift', injected, SEEDING, (s) => releaseOnlyText(s, 'swift')).length).toBeGreaterThan(0);
  });

  it('`#if DEBUG` 안의 Swift 시딩은 통과시킨다 — 컴파일 아웃되므로 릴리스에 없다', () => {
    const guarded = ['#if DEBUG', 'func seedWorkouts() { }', '#endif', ''].join('\n');
    expect(findTokens('x.swift', guarded, SEEDING, (s) => releaseOnlyText(s, 'swift'))).toEqual([]);
  });

  it('중첩 `#if`가 있어도 DEBUG 블록의 끝을 정확히 찾는다', () => {
    const nested = [
      '#if DEBUG',
      '#if os(iOS)',
      'func seedWorkouts() { }',
      '#endif',
      '#endif',
      'func realWork() { }',
      '',
    ].join('\n');
    expect(findTokens('x.swift', nested, SEEDING, (s) => releaseOnlyText(s, 'swift'))).toEqual([]);
    expect(releaseOnlyText(nested, 'swift')).toContain('func realWork()');
  });

  it('가드가 실제로 잡는다 — `BuildConfig.DEBUG` 밖의 Kotlin 시딩', () => {
    const injected = 'fun seedWorkouts() { }\n';
    expect(findTokens('x.kt', injected, SEEDING, (s) => releaseOnlyText(s, 'kotlin')).length).toBeGreaterThan(0);
  });

  it('`BuildConfig.DEBUG` 안의 Kotlin 시딩은 통과시킨다', () => {
    const guarded = 'if (BuildConfig.DEBUG) {\n  seedWorkouts()\n}\nfun realWork() { }\n';
    expect(findTokens('x.kt', guarded, SEEDING, (s) => releaseOnlyText(s, 'kotlin'))).toEqual([]);
    expect(releaseOnlyText(guarded, 'kotlin')).toContain('fun realWork()');
  });
});
