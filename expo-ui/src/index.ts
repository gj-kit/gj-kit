/** React Native 및 조건을 지원하지 않는 번들러용 기본 루트 엔트리. */
import { PLATFORM_RESOLUTION_MARKER } from './build/platform-resolution';

// tsup의 platform 확장자 우선순위가 실제 그래프에 적용되는지 build guard가 확인한다.
void PLATFORM_RESOLUTION_MARKER;

export * from './index.shared';
