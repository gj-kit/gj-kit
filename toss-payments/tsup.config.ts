import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/server.ts',
    'src/webhook.ts',
    'src/browser.ts',
    'src/testing.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node20',
  treeshake: true,
  // server 코드도 내장 fetch/WebCrypto만 사용하므로 neutral 가능 — 문제 생기면 조정
  platform: 'neutral',
  // §3.2 createFileAuditSink의 지연 동적 import('node:fs/promises') 격리 —
  // 번들에 정적 node: 의존이 각인되지 않는다(빌드 후 dist 정적 의존 0 검증 대상)
  external: [/^node:/],
});
