/** browser·Node SSR용 루트 엔트리. 공개 표면은 기본 엔트리와 항상 같다. */
import { PLATFORM_RESOLUTION_MARKER } from './build/platform-resolution';

// tsup의 platform 확장자 우선순위가 실제 그래프에 적용되는지 build guard가 확인한다.
void PLATFORM_RESOLUTION_MARKER;

export * from './index.shared';
