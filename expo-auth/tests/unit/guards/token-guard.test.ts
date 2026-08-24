// 가드 2/5 — `token-guard` (설계 문서 §4.2 · §5.3).
//
// 계약: 토큰 문자열은 TokenPair 정형 값으로만 흐른다. 어떤 Error.message·console 인자·
// outcome 문자열 필드에도 토큰(부분 문자열 포함)이 들어가지 않는다.

import { describe, expect, it } from 'vitest';

import { join } from 'node:path';

import { PACKAGE_ROOT, listTsFiles, read, rel } from '../../guards/ast';
import { tokenLeakViolations } from '../../guards/detectors';

const SRC_DIR = join(PACKAGE_ROOT, 'src');

describe('token-guard — src/** 정적 스캔 (§4.2 3규칙)', () => {
  const files = listTsFiles(SRC_DIR);

  it('src가 실제로 존재한다', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it('console 호출 0건 · 토큰 식별자 보간 0건 · AuthError 인자는 코드 테이블만', () => {
    const violations = files.flatMap((file) => tokenLeakViolations(rel(file), read(file)));
    expect(violations.map((v) => `${v.file}:${v.line} ${v.detail}`)).toEqual([]);
  });

  // ── 가드가 실제로 잡는지 ────────────────────────────────────────────────
  it('주입된 위반을 잡는다', () => {
    const cases: readonly [string, string][] = [
      ['console.log', "export const f = (x: string) => { console.log(x); };\n"],
      ['console.error', "export const f = (x: string) => { console.error('refresh failed', x); };\n"],
      ['템플릿 치환의 토큰 식별자', 'export const m = (accessToken: string) => `Bearer ${accessToken}`;\n'],
      ['프로퍼티 접근 치환', 'export const m = (t: { refreshToken: string }) => `body=${t.refreshToken}`;\n'],
      ['+ 연결', "export const m = (accessToken: string) => 'Bearer ' + accessToken;\n"],
      ['허용 목록 밖 토큰 단어 텍스트', 'export const k = `stash.accessToken`;\n'],
      ['AuthError 임의 메시지', "export const e = () => new AuthError('token abc leaked' as never);\n"],
      ['AuthError 비리터럴 인자', 'export const e = (code: never) => new AuthError(code);\n'],
    ];
    for (const [label, source] of cases) {
      expect(
        tokenLeakViolations('src/core/__injected__.ts', source).length,
        `${label} 위반을 놓쳤다`
      ).toBeGreaterThan(0);
    }
  });

  it('키 조립 상수는 src/storage/shared.ts에서만 허용된다 (§4.2 허용 목록)', () => {
    const assembly = 'export const key = (p: string) => `${p}.accessToken`;\n';
    expect(tokenLeakViolations('src/storage/shared.ts', assembly)).toEqual([]);
    expect(tokenLeakViolations('src/core/session.ts', assembly).length).toBeGreaterThan(0);
  });

  it('정당한 형태는 오탐하지 않는다 — 정형 값 흐름·코드 리터럴 AuthError', () => {
    const legitimate = [
      "export const pair = (accessToken: string, refreshToken: string) => ({ accessToken, refreshToken });",
      "export const e = () => new AuthError('session-disposed');",
      'export const msg = `Scripted refresh request exhausted: call ${String(1)} exceeds.`;',
      '',
    ].join('\n');
    expect(tokenLeakViolations('src/core/__injected__.ts', legitimate)).toEqual([]);
  });
});
