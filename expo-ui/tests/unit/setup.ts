/**
 * 단위 테스트의 reduce-motion 플랫폼 응답을 결정적으로 고정한다.
 *
 * jsdom에는 matchMedia가 없어 RNW AccessibilityInfo.isReduceMotionEnabled의
 * microtask가 어느 act 창에서 flush되는지가 테스트 진행 속도에 좌우된다 —
 * act 창 밖에서 resolve되면 "not wrapped in act" 노이즈가 된다. 기본값을
 * 영원히 pending으로 고정해 훅의 미해결(null) 상태를 결정적으로 만들고,
 * 선호도 해석이 필요한 테스트는 각자 mockReturnValue로 덮어쓴다.
 * (beforeEach인 이유: 개별 파일의 vi.restoreAllMocks() 이후에도 다시 걸린다.)
 */
import { beforeEach, vi } from 'vitest';
import { AccessibilityInfo } from 'react-native';

beforeEach(() => {
  vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockReturnValue(
    new Promise<boolean>(() => {}),
  );
});
