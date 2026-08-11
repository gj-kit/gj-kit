// Non-web fallback. Web builds resolve tooltip.web.tsx explicitly.
export { Tooltip } from './tooltip.native';
export type {
  TooltipDirection,
  TooltipPlacement,
  TooltipProps,
  TooltipTriggerSize,
} from './tooltip.types';
