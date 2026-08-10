// 가드 2/7 — `nodom-source-guard` (설계 문서 §2.4 무DOM 가드 1 · §10.3).
//
// 규칙: `tsc --noEmit -p tsconfig.core.json`(`lib:["ES2022"]`, `src/web` 계열 제외)이 성공한다.
//
// 왜 `entry-guard`(문자열 스캔)로 충분하지 않은가 — DOM 유출은 식별자 하나가 아니다.
// §2.4의 실측에서 `lib:["ES2022"]`에 없는 것은 `Blob`×5 · `URL`×4 · `Document`×4 ·
// `setTimeout`×2 · `fetch`×2 · `clearTimeout`×1 · `HTMLVideoElement`×1 이었다. 금지 목록을
// 손으로 유지하는 대신 **타입 체커에게 물어보는** 것이 유일하게 새지 않는 방법이다.
//
// 그리고 **tsup은 이 유출을 전혀 잡지 못한다**(§2.4 실측): `dist/core.d.ts`에
// `declare function leakSig(d: Document): number;`를 그대로 방출하고 종료코드 0으로 끝난다.

import { describe, expect, it } from 'vitest';

import { PACKAGE_ROOT, read } from '../../guards/ast';
import { runTsc } from '../../guards/tsc';
import { join } from 'node:path';

describe('nodom-source-guard — tsconfig.core.json', () => {
  it('프로젝트 설정이 무DOM 조건을 유지한다 (가드의 전제)', () => {
    const config = read(join(PACKAGE_ROOT, 'tsconfig.core.json'));
    // 주석 포함 JSONC라 파서 없이 형태만 확인한다 — 여기서 확인하려는 것은 값 하나뿐이다.
    expect(config).toMatch(/"lib"\s*:\s*\[\s*"ES2022"\s*\]/);
    expect(config).toMatch(/"exclude"/);
    // `src/web/**`과 비네이티브 저장 포크만 제외 대상이다. `src/device/web.ts`는 제외가 아니다 —
    // 열거 결과가 상수뿐이라 DOM이 필요할 이유가 없고, SSR에서 `document`를 만지면 즉사한다.
    expect(config).not.toMatch(/"src\/device\/web\.ts"/);
    expect(config).not.toMatch(/"src\/core/);
  });

  it('tsc --noEmit -p tsconfig.core.json 이 성공한다', () => {
    const result = runTsc('tsconfig.core.json');
    expect(result.output).toBe('');
    expect(result.status).toBe(0);
  }, 240_000);
});
