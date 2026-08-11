/** The default root entry for React Native and for bundlers with no conditions support. */
import { PLATFORM_RESOLUTION_MARKER } from './build/platform-resolution';

// tsup의 platform 확장자 우선순위가 실제 그래프에 적용되는지 build guard가 확인한다.
void PLATFORM_RESOLUTION_MARKER;

export * from './index.shared';
