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
});
