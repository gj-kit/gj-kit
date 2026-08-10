// 가드 7/7 — `hardening-guard` (설계 문서 §7 · §7.1 · §10.3).
//
// "주석은 리팩터링을 이기지 못한다." §7의 11종과 §7.1의 추가 17종 중 **정적으로 붙잡을 수 있는
// 7가지**를 여기서 못 박는다. 일곱 항목의 공통점은 하나다 — 어겨도 **예외가 나지 않는다**:
//   ① iOS 26에서 프로세스가 죽는다(promise가 reject될 기회조차 없다)
//   ② Android 13+에서 허용된 권한이 거부로 **오판정**된다
//   ③ 서명 URL이 로그로 샌다
//   ④ 해시가 **조용히** 틀린다
//   ⑤ 페이지당 20초가 걸린다
//   ⑥ 웹에서 업로드가 **조용히 성공한 것처럼 보인다**
//   ⑦ 그리드 표시 순서와 무한스크롤 커서가 함께 어긋난다
// 전부 런타임 테스트로는 재현할 수 없거나(실기기·SDK 버전), 재현해도 통과처럼 보인다.

import { describe, expect, it } from 'vitest';

import { join } from 'node:path';

import { HASH_CHUNK_BYTES } from '../../../src/core/hashFile';
import {
  PACKAGE_ROOT,
  listTsFiles,
  methodBodies,
  parse,
  parseFile,
  read,
  rel,
  stripComments,
} from '../../guards/ast';
import {
  constantValue,
  granularPermissionViolations,
  loggerUriViolations,
} from '../../guards/detectors';

const SRC = join(PACKAGE_ROOT, 'src');
const SRC_FILES = listTsFiles(SRC);

/**
 * **비네이티브 포크 전수**(§8.4-7 — `.web.`은 "브라우저 전용"이 아니라 "비네이티브"다).
 * `browser`(클라이언트 번들)와 `node`(SSR·RSC) 양쪽이 같은 산출물을 받으므로 둘을 갈라 볼 필요가 없다.
 */
const NON_NATIVE_FILES = [
  ...listTsFiles(join(SRC, 'web')),
  join(SRC, 'web.ts'),
  join(SRC, 'device.web.ts'),
  join(SRC, 'save.web.ts'),
  join(SRC, 'device', 'web.ts'),
  join(SRC, 'save', 'web.ts'),
];

describe('hardening-guard ① — FileSystem.uploadAsync 재등장 차단 (§7 하드닝 1)', () => {
  // iOS 26에서 레거시 URLSession 브리지가 파일 기반 업로드를 **시작하는 중** 프로세스를 종료시킨다.
  // promise가 reject되지 않으므로 재시도도 에러 보고도 발화하지 않고, 크래시 리포트에 앱 코드
  // 프레임조차 남지 않는다 — 원인 추적에만 수일이 걸렸다.
  it('src/** 코드에 uploadAsync 0건', () => {
    const hits = SRC_FILES.filter((file) => stripComments(read(file)).includes('uploadAsync')).map(rel);
    expect(hits).toEqual([]);
  });

  it('주석의 사고 이력은 보존된다 (규율 6 — 코드 스캔이 주석을 잡으면 근거를 지우게 된다)', () => {
    const withRationale = SRC_FILES.filter((file) => read(file).includes('uploadAsync'));
    expect(withRationale.length, '하드닝 1의 근거 주석이 사라졌다').toBeGreaterThan(0);
  });

  it('대체 경로가 계약대로다 — foreground 세션 + BINARY_CONTENT', () => {
    const code = stripComments(read(join(SRC, 'expo', 'localTransport.ts')));
    // `'background'`(기본값)면 앱 종료 시 JS 태스크가 복원되지 않아 2xx 판정 자체가 실행되지 않는다.
    expect(code).toMatch(/sessionType\s*:\s*'foreground'/);
    // MULTIPART면 스토리지가 폼 프레이밍까지 객체 바이트로 받아 서명 크기와 어긋난다.
    expect(code).toContain('BINARY_CONTENT');
  });
});

describe('hardening-guard ② — Android 13+ granular 권한 목록 (§7 하드닝 5)', () => {
  const deviceFiles = listTsFiles(join(SRC, 'device'));

  it('src/device/**의 권한 호출에 granular 목록이 있다', () => {
    expect(deviceFiles.length).toBeGreaterThan(0);
    const violations = deviceFiles.flatMap((file) =>
      granularPermissionViolations(rel(file), read(file)).map((v) => `${v.file}:${v.line} ${v.detail}`),
    );
    expect(violations).toEqual([]);
  });

  it('읽기 경로가 실제로 photo·video 목록을 넘긴다', () => {
    const code = stripComments(read(join(SRC, 'device', 'expo.ts')));
    expect(code).toMatch(/requestPermissionsAsync\s*\(\s*false\s*,/);
    expect(code).toMatch(/getPermissionsAsync\s*\(\s*false\s*,/);
    expect(code).toMatch(/\[\s*'photo'\s*,\s*'video'\s*\]/);
  });

  it('src/save/**는 명시 예외다 — writeOnly=true에 목록 없음이 정상 (§0.4 기각 9)', () => {
    // 저장만 하는 앱에 `['photo','video']`를 붙이면 읽기 권한까지 요구하게 되어
    // **사용자에게 보이는 권한 문구가 달라진다**. 그래서 규칙을 느슨하게 하는 대신 범위를 뺀다.
    const saveExpo = join(SRC, 'save', 'expo.ts');
    expect(stripComments(read(saveExpo))).toMatch(/requestPermissionsAsync\s*\(\s*true\s*\)/);
    // 예외가 "가드를 통과해서"가 아니라 "범위 밖이라서" 성립함을 못 박는다 —
    // 같은 판정을 저장 경로에 걸면 실제로 걸린다.
    expect(granularPermissionViolations(rel(saveExpo), read(saveExpo)).length).toBeGreaterThan(0);
    // 그리고 그 파일은 스캔 대상(src/device/**)에 들어 있지 않다.
    expect(listTsFiles(join(SRC, 'device')).includes(saveExpo)).toBe(false);
  });

  it('주입 위반을 잡는다 — 목록 생략 · 빈 배열', () => {
    expect(
      granularPermissionViolations('src/device/expo.ts', `await MediaLibrary.requestPermissionsAsync(false);`).length,
    ).toBe(1);
    expect(
      granularPermissionViolations('src/device/expo.ts', `await MediaLibrary.getPermissionsAsync();`).length,
    ).toBe(1);
    expect(
      granularPermissionViolations('src/device/expo.ts', `await MediaLibrary.getPermissionsAsync(false, []);`).length,
    ).toBe(1);
    expect(
      granularPermissionViolations('src/device/expo.ts', `await MediaLibrary.getPermissionsAsync(false, PERMS);`),
    ).toEqual([]);
  });
});

describe('hardening-guard ③ — 서명 URL 로그 유출 차단 (§7 하드닝 8)', () => {
  // iOS URLSession 실패는 서명 업로드 URL 전문을 그대로 에코한다. 그 쿼리에는 임시 자격증명이
  // 들어 있다. 로거 인자에 원문을 넣는 순간 개발자 로그와 활동 로그 양쪽에 남는다.
  it('로거 인자의 uri/url은 전부 summarizeUri( 경유다', () => {
    const violations = SRC_FILES.flatMap((file) =>
      loggerUriViolations(rel(file), read(file)).map((v) => `${v.file}:${v.line} ${v.detail}`),
    );
    expect(violations).toEqual([]);
  });

  it('로거 호출 자체가 실제로 존재한다 (0건이면 위 단언이 공허하다)', () => {
    const callSites = SRC_FILES.filter((file) => /\bdebug\.(log|error)\(/.test(stripComments(read(file))));
    expect(callSites.length).toBeGreaterThan(0);
  });

  it('주입 위반을 잡는다 — 원문 전달 · shorthand · 중첩', () => {
    const bad: readonly [string, string][] = [
      ['원문 멤버', `debug.log('put.start', { uri: plan.uri });`],
      ['shorthand', `debug.log('put.start', { uri });`],
      ['서명 URL', `debug.log('put.start', { url: intent.uploadUrl });`],
      ['error 경로', `debug.error('put.failed', error, { uri: input.uri });`],
      ['배열 안', `debug.log('normalize', { candidates: candidates.map((c) => c.uri) });`],
      ['logger 별칭', `logger.log('x', { localUri: info.localUri });`],
    ];
    for (const [label, source] of bad) {
      expect(loggerUriViolations('src/core/x.ts', source).length, `${label} 위반을 놓쳤다`).toBeGreaterThan(0);
    }
  });

  it('정상 형태는 통과시킨다', () => {
    const good: readonly [string, string][] = [
      ['경유', `debug.log('put.start', { uri: summarizeUri(plan.uri) });`],
      ['중첩 경유', `debug.log('normalize', { candidates: candidates.map((c) => summarizeUri(c)) });`],
      ['키 이름만 uri', `debug.log('info.done', { localUri: summarizeUri(info.localUri), infoUri: summarizeUri(info.uri) });`],
      ['이벤트 이름에 uri', `debug.log('upload-uri.normalize.start', { fileName });`],
      ['로거 밖', `const target = plan.uri;`],
    ];
    for (const [label, source] of good) {
      expect(loggerUriViolations('src/core/x.ts', source), label).toEqual([]);
    }
  });
});

describe('hardening-guard ④ — base64 청크 3의 배수 (§7 하드닝 9)', () => {
  // 3바이트가 base64 4문자에 대응한다. 3의 배수가 아니면 창 경계에 패딩(`=`)이 끼어
  // 디코딩된 바이트열이 원본과 어긋난다 — **어떤 예외도 나지 않고 해시만 틀린다**.
  it('소스 상수가 3의 배수다 (정적)', () => {
    const file = join(SRC, 'core', 'hashFile.ts');
    const value = constantValue(rel(file), read(file), 'HASH_CHUNK_BYTES');
    expect(value).not.toBeNull();
    expect(value).toBeGreaterThan(0);
    expect((value ?? 1) % 3).toBe(0);
  });

  it('런타임 값도 3의 배수다', () => {
    expect(HASH_CHUNK_BYTES % 3).toBe(0);
  });

  it('상수 계산기가 3의 배수 아님을 실제로 가른다', () => {
    expect(constantValue('x.ts', 'export const HASH_CHUNK_BYTES = 3 * 256 * 1024;', 'HASH_CHUNK_BYTES')).toBe(786_432);
    expect(constantValue('x.ts', 'export const HASH_CHUNK_BYTES = 256 * 1024;', 'HASH_CHUNK_BYTES')! % 3).not.toBe(0);
    expect(constantValue('x.ts', 'export const OTHER = 1;', 'HASH_CHUNK_BYTES')).toBeNull();
  });

  it('공개 API에 chunkBytes 인자가 없다 (§6.1-⑩ — 하드닝 9의 회귀 통로였다)', () => {
    const code = stripComments(read(join(SRC, 'core', 'hashFile.ts')));
    expect(code).toMatch(/computeChunkRanges\s*\(\s*size\s*:\s*number\s*\)/);
  });
});

describe('hardening-guard ⑤·⑦ — listAssets 계약 (§7.1)', () => {
  const deviceFiles = listTsFiles(join(SRC, 'device'));

  it('listAssets 구현부에 getAssetInfo 호출 0건', () => {
    // 전신 주석: "60개 원본을 직렬 해석하면 페이지당 ~20초다." 그리드 썸네일은 raw `asset.uri`
    // (iOS `ph://`)를 그대로 그려야 하고, 원본 바이트는 업로드 시점의 resolve에서만 해석한다.
    // ⚠ 파일 단위가 아니라 **메서드 본문** 단위로 본다 — 같은 파일에 `getAssetInfo` 어댑터
    //   메서드가 정당하게 존재하기 때문이다.
    const bodies = deviceFiles.flatMap((file) =>
      methodBodies(parseFile(file), 'listAssets').map((body) => ({ file: rel(file), body })),
    );
    expect(bodies.length, 'listAssets 구현부를 하나도 찾지 못했다').toBeGreaterThanOrEqual(2);
    expect(bodies.filter((b) => b.body.includes('getAssetInfo')).map((b) => b.file)).toEqual([]);
  });

  it('src/device/expo.ts의 listAssets가 creationTime 내림차순을 리터럴로 고정한다', () => {
    // 코어는 재정렬하지 않는다. 페이지 단위 재정렬은 전역 순서를 보장하지 못하면서 `endCursor`는
    // 어댑터 순서를 따라가므로 **표시 순서와 커서가 함께 어긋난다** — 타입도 런타임도 못 잡는다.
    const bodies = methodBodies(parseFile(join(SRC, 'device', 'expo.ts')), 'listAssets');
    expect(bodies.length).toBe(1);
    const body = bodies[0] ?? '';
    expect(body).toContain('SortBy.creationTime');
    // `false` = 내림차순(최신 우선). `true`로 뒤집히면 그리드가 가장 오래된 사진부터 그린다.
    expect(body).toMatch(/SortBy\.creationTime\s*,\s*false/);
  });

  it('본문 추출기가 파일 단위 스캔과 다르다 (⑤가 오탐 없이 성립하는 근거)', () => {
    // 정상: 같은 객체에 `getAssetInfo` 어댑터 메서드가 있어도 listAssets 본문에는 없다.
    const clean = [
      'export function adapter() {',
      '  return {',
      '    async listAssets(input) { return page(input); },',
      '    async getAssetInfo(id) { return info(id); },',
      '  };',
      '}',
      '',
    ].join('\n');
    expect(clean).toContain('getAssetInfo'); // 파일 단위 스캔이라면 여기서 오탐한다.
    const cleanBodies = methodBodies(parse('x.ts', clean), 'listAssets');
    expect(cleanBodies.length).toBe(1);
    expect(cleanBodies[0]).not.toContain('getAssetInfo');

    // 위반: 그리드 경로가 자산별 원본 정보를 직렬 조회한다(페이지당 ~20초).
    const violating =
      'export const a = { async listAssets(i) { const info = await lib.getAssetInfo(i.id); return info; } };';
    expect(methodBodies(parse('x.ts', violating), 'listAssets')[0]).toContain('getAssetInfo');

    // 주석에만 등장하는 이름은 본문 스캔에서 사라진다(규율 6).
    const commented =
      'export const a = { async listAssets(i) { /* getAssetInfo 는 여기서 호출하지 않는다 */ return page(i); } };';
    expect(methodBodies(parse('x.ts', commented), 'listAssets')[0]).not.toContain('getAssetInfo');
  });
});

describe('hardening-guard ⑥ — 비네이티브 포크에 네이티브 파일 업로드 0건 (§8.5 · §7.1)', () => {
  // `expo-file-system`의 web 셰이프는 `FileSystemUploadTask.start()`가
  // `{ body:'', status:0, headers:{} }`인 **no-op**이다(V-B 실측). 태우면 업로드가
  // "조용히 성공한 것처럼" 보이고, 사용자는 올라가지 않은 사진을 올라간 줄 안다.
  it('src/web/** · 비네이티브 포크에 .upload( 0건', () => {
    expect(NON_NATIVE_FILES.length).toBe(9);
    const hits = NON_NATIVE_FILES.filter((file) => stripComments(read(file)).includes('.upload(')).map(rel);
    expect(hits).toEqual([]);
  });

  it('비네이티브 포크에 expo-file-system·expo-media-library import 0건', () => {
    const hits = NON_NATIVE_FILES.filter((file) => {
      const code = stripComments(read(file));
      return code.includes("'expo-") || code.includes('"expo-');
    }).map(rel);
    expect(hits).toEqual([]);
  });

  it('네이티브 경로에는 그 호출이 실제로 있다 (스캔이 헛돌지 않는다는 증거)', () => {
    expect(stripComments(read(join(SRC, 'expo', 'localTransport.ts')))).toContain('.upload(');
  });
});
