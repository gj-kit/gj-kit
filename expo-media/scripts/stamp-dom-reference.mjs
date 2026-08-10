#!/usr/bin/env node
/**
 * dist/web.d.ts · web.d.cts 상단에만 DOM lib 요구를 각인한다 (설계 문서 §2.4).
 *
 * 왜 후처리인가: rollup-plugin-dts가 소스의 삼중슬래시 지시자를 제거하므로
 * 빌드 후처리가 유일한 경로다. tsup의 onSuccess도 쓸 수 없다 — 실측 결과
 * onSuccess는 JS 빌드 직후·DTS 빌드 완료 **전**에 실행되어 ENOENT로 실패한다.
 * 그래서 package.json의 build 스크립트가 `tsup && node scripts/...`로 잇는다.
 *
 * 왜 각인이 필요한가: `./web`의 공개 시그니처는 Document·typeof fetch를 노출한다.
 * DOM lib 없는 소비자가 skipLibCheck:true(gj-kit·memorylog2 양쪽의 기본값)로
 * 이 d.ts를 읽으면 `Cannot find name 'Document'`가 **억제되고 파라미터가 any로
 * 붕괴**해, `createBrowserSaveTarget({ document: 'nope' })`가 통과한다.
 * 각인 후에는 소비자 픽스처 7종이 전부 CLEAN이다.
 *
 * 각인 대상은 "dist 가드(tests/guards)가 실패하는 엔트리"로 기계적으로 결정된다.
 * `./web` 외의 엔트리가 가드에 걸리면 각인이 아니라 **소스를 고친다** — DOM 타입이
 * 공개 시그니처에 나타나도 되는 엔트리는 `./web` 하나뿐이다(§2.4 파생 규칙).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const REF = '/// <reference lib="dom" />\n';

for (const file of ['dist/web.d.ts', 'dist/web.d.cts']) {
  // 파일이 없으면 ENOENT로 즉시 실패한다(의도) — 빌드가 조용히 반쪽나는 것보다 낫다.
  const source = readFileSync(file, 'utf8');
  if (!source.startsWith(REF)) writeFileSync(file, REF + source);
}
