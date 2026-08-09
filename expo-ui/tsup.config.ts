import { defineConfig } from 'tsup';

export default defineConfig({
  // 엔트리 = 서브패스 1:1 (설계 문서 §2)
  entry: ['src/index.ts', 'src/theme.ts', 'src/insets.ts', 'src/tailwind.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  treeshake: true,
  // react/react-native/safe-area-context는 peer — tsup이 자동 external 처리
  platform: 'neutral',
});
