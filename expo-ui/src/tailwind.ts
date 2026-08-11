/**
 * The "./tailwind" entry — zero react and react-native imports (design doc §2, §8).
 * Safe to require or import from tailwind.config, which Node evaluates.
 */
export { createTailwindPreset, defaultTailwindPreset } from './tailwind/preset';
export type { TailwindPreset, TailwindPresetOptions } from './tailwind/preset';
