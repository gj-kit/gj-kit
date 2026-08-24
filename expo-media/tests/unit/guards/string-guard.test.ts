// 가드 6/7 — `string-guard` (설계 문서 §4 · §10.3).
//
// 규칙: `new MediaError(` 의 **두 번째 인자**가 `strings.` 멤버 접근이 아니면 실패.
//
// 전신 photo-kit은 사용자 문구 24개를 한국어로 하드코딩했고(V6 실측), 그 결과 이 라이브러리를
// 다른 언어권 앱에 넣을 방법이 없었다. 문구가 코드에 박히는 것은 **한 줄씩** 일어나므로
// (급할 때 리터럴 하나) 리뷰로는 막히지 않는다. 그래서 정적으로 못 박는다.
//
// 판정은 "문자열 리터럴이 있느냐"가 아니라 **결과값의 모양**이다. 실제 호출부의 절반은
// `input.kind === 'video' ? strings.videoUploadFailed : strings.imageUploadFailed`처럼
// 분기 조건에 리터럴을 갖고 있고 결과는 전부 주입 문구다. 조건은 사용자에게 보이지 않는다.

import { describe, expect, it } from 'vitest';

import { join } from 'node:path';

import { PACKAGE_ROOT, listTsFiles, read, rel } from '../../guards/ast';
import { mediaErrorMessageViolations } from '../../guards/detectors';

const SRC_DIR = join(PACKAGE_ROOT, 'src');

/**
 * 명시 예외 — §7 하드닝 5의 `src/save/**` 예외와 **동형**이다(규칙을 느슨하게 하는 대신
 * 어긋나는 지점을 좁게 지목한다).
 *
 * `src/core/staging.ts`의 네임스페이스 검증은 **부팅 시점의 개발자 대상 단언**이다.
 * §4의 `MediaStrings` 22키는 전부 사용자 노출 문구이고 이 상황에 대응하는 키가 없다
 * (`assertNeverMediaError`가 같은 이유로 plain Error를 쓴다 — §5.2). 그런데 §7 하드닝 7이
 * 이 실패를 `config-invalid` **MediaError**로 요구하므로 plain Error로 내려갈 수도 없다.
 * 설계 문서의 미결(=`configInvalid` 키 부재)이지 구현의 자유재량이 아니다 — 결과 보고의
 * deviations 참조.
 */
const EXEMPTIONS: readonly { readonly file: string; readonly code: string }[] = [
  { file: 'src/core/staging.ts', code: 'config-invalid' },
  // `createPendingSelection({ max })`의 양의 정수 검증 — staging의 네임스페이스 검증과 동형인
  // 부팅 시점 개발자 단언이다.
  { file: 'src/core/pending-selection.ts', code: 'config-invalid' },
];

describe('string-guard — new MediaError(code, strings.…)', () => {
  const files = listTsFiles(SRC_DIR);

  it('src/**에 MediaError 생성 지점이 실제로 있다 (가드가 빈 집합을 통과시키지 않는다)', () => {
    const sites = files.reduce((count, file) => {
      // 위반 목록이 아니라 "검사한 지점 수"를 세기 위해 예외 없이 한 번 더 돌린다.
      const all = mediaErrorMessageViolations(rel(file), read(file), () => false);
      return count + all.length;
    }, 0);
    // 예외 목록(staging · pending-selection)만 남아야 한다 — 0이면 스캐너가 아무것도 보지 못하고 있다는 뜻이다.
    expect(sites).toBe(EXEMPTIONS.length);
  });

  it('모든 MediaError 문구가 주입 문구에서 온다', () => {
    const violations = files.flatMap((file) =>
      mediaErrorMessageViolations(rel(file), read(file), (input) =>
        EXEMPTIONS.some((e) => e.file === input.file && e.code === input.code),
      ),
    );
    expect(violations.map((v) => `${v.file}:${v.line} ${v.detail}`)).toEqual([]);
  });

  // ── 가드가 실제로 잡는지 ────────────────────────────────────────────────
  it('주입된 하드코딩 문구를 잡는다', () => {
    const bad: readonly [string, string][] = [
      ['문자열 리터럴', `new MediaError('upload-failed', '업로드에 실패했습니다.');`],
      ['템플릿 리터럴', "new MediaError('config-invalid', `bad ${x}`);"],
      ['영어 리터럴', `new MediaError('upload-failed', 'Upload failed.');`],
      ['ternary 한쪽만 리터럴', `new MediaError('upload-failed', kind === 'video' ? strings.videoUploadFailed : '실패');`],
      ['?? 폴백이 리터럴', `new MediaError('upload-failed', strings.imageUploadFailed ?? 'fallback');`],
      ['strings가 아닌 객체', `new MediaError('upload-failed', messages.imageUploadFailed);`],
      ['임의 함수 호출', `new MediaError('upload-failed', t('upload.failed'));`],
      ['에러 메시지 에코', `new MediaError('upload-failed', String(error));`],
      ['인자 누락', `new MediaError('upload-failed');`],
    ];
    for (const [label, source] of bad) {
      expect(
        mediaErrorMessageViolations('src/__injected__.ts', source).length,
        `${label} 위반을 놓쳤다`,
      ).toBeGreaterThan(0);
    }
  });

  it('정상 형태는 통과시킨다 (오탐이 있으면 가드가 우회당한다)', () => {
    const good: readonly [string, string][] = [
      ['단순 멤버', `new MediaError('device-not-found', strings.fileNotFound);`],
      ['주입 객체 경유', `new MediaError('upload-failed', input.strings.imageUploadFailed);`],
      ['별칭 import', `new MediaError('device-not-found', enMediaStrings.fileNotFound);`],
      ['ternary 양쪽 모두 strings', `new MediaError('upload-failed', kind === 'video' ? strings.videoUploadFailed : strings.imageUploadFailed);`],
      ['값이 섞이는 함수 키', `new MediaError('file-too-large', input.strings.fileTooLarge({ maxBytes, kind }));`],
      ['소비자 override ?? strings', `new MediaError('file-too-large', limit.message ?? input.strings.fileTooLarge({ maxBytes, kind }));`],
    ];
    for (const [label, source] of good) {
      expect(mediaErrorMessageViolations('src/__injected__.ts', source), label).toEqual([]);
    }
  });

  it('예외 목록이 파일·코드 쌍으로 좁게 지목돼 있다', () => {
    // 같은 파일의 **다른** 코드, 다른 파일의 **같은** 코드는 여전히 위반이어야 한다.
    const exempt = (input: { readonly file: string; readonly code: string }): boolean =>
      EXEMPTIONS.some((e) => e.file === input.file && e.code === input.code);
    expect(
      mediaErrorMessageViolations('src/core/staging.ts', `new MediaError('config-invalid', \`x\`);`, exempt),
    ).toEqual([]);
    expect(
      mediaErrorMessageViolations('src/core/staging.ts', `new MediaError('upload-failed', '실패');`, exempt).length,
    ).toBeGreaterThan(0);
    expect(
      mediaErrorMessageViolations('src/core/upload/uploader.ts', `new MediaError('config-invalid', '실패');`, exempt).length,
    ).toBeGreaterThan(0);
  });
});
