// tsup 엔트리 → `"./web"` 서브패스(설계 문서 §2.1 · §5.6).
//
// peer **0** — 대신 브라우저 DOM이 필요하다. 웹 드롭존·웹 관리자 도구는 `"./core"` + 이 엔트리
// 둘만으로 전 파이프라인을 돈다(§2.2 소비자 시나리오표).
//
// ⚠ **`.d.ts`에 `/// <reference lib="dom" />`이 각인되는 유일한 엔트리다**(§2.4).
//   각인은 `scripts/stamp-dom-reference.mjs`가 빌드 후처리로 넣는다(rollup-plugin-dts가 소스의
//   삼중슬래시 지시자를 제거하므로 후처리가 유일 경로다). 각인이 없으면 무DOM 소비자에게서
//   `Document` 파라미터가 `any`로 붕괴해 `createBrowserSaveTarget({ document: 'nope' })`가
//   **조용히 통과한다**(§2.4 실측 표) — §6의 "조용히 깨지는 것"에 정면으로 걸린다.
//   각인 대상은 "dist 가드가 실패하는 엔트리"로 기계적으로 결정되며, `./web` 외의 엔트리가
//   가드에 걸리면 **각인이 아니라 소스를 고친다.**
//
// ⚠ `hardening-guard` ⑥: 이 엔트리의 그래프에 네이티브 파일 업로드 호출이 0건이어야 한다.
//   웹 바이너리 업로드의 정본은 `createFetchBinaryTransport`뿐이며, `expo-file-system`의 web
//   셰이프는 그 API가 no-op라 태우면 **조용히 성공한 것처럼 보인다**(§2.3 파생 사실 · §8.5).

export { createFetchBinarySourceLoader } from './web/binarySourceLoader';
export { createBrowserSaveTarget } from './web/browserSave';
export { createFetchBinaryTransport } from './web/fetchTransport';
export { webCanvasVideoPoster } from './web/videoPoster';
