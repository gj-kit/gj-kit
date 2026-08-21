---
"@gj-kit/toss-payments": patch
"@gj-kit/toss-payments-nestjs": patch
---

CJS 소비자의 masquerading-as-ESM(TS1479) 수정 — exports `types` 조건을 `import`/`require` 분기별로 중첩 선언.

`"type": "module"` 패키지에서 평면 `types` 한 개가 ESM 선언(`.d.ts`)만 가리켜, `moduleResolution: node16/nodenext` CJS 소비자가 런타임은 `.cjs`를 받으면서 타입은 ESM 선언으로 해석해 TS1479가 나던 문제를 고친다. 모든 export 경로(코어 `.`·`./server`·`./webhook`·`./browser`·`./testing`, nestjs `.`)에 `import`→`.d.ts` / `require`→`.d.cts` 중첩 `types`를 선언해, tarball에 실리기만 하고 참조되지 않던 `dist/*.d.cts`를 `require` 타입 경로에 배선했다. `./server`의 Node 전용 런타임 게이트(`node` 조건)·`./browser`의 `browser` 조건·번들러 모드(`moduleResolution: bundler`) 타입 해석은 기존 동작 그대로다.
