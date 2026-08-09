/**
 * "./tailwind" 엔트리 — react·react-native import 0 (설계 문서 §2, §8).
 * tailwind.config(Node 평가)에서 안전하게 require/import할 수 있다.
 */
export { createTailwindPreset, defaultTailwindPreset } from './tailwind/preset';
export type { TailwindPreset, TailwindPresetOptions } from './tailwind/preset';
