// 테스트 전용 TZ 스위치 — 세 파일이 손으로 복제하던 것을 한 곳으로 모은다.
//
// `process.env.TZ = undefined`는 키를 지우지 않는다. 문자열 `'undefined'`를 대입하고,
// ICU는 그 이름을 해석하지 못해 워커가 조용히 UTC로 이동한다. CI(ubuntu-latest)와 TZ를
// export하지 않은 로컬 머신이 정확히 그 상태이므로, 복원은 반드시 delete여야 한다 —
// 그러지 않으면 이 파일들 아래에 새로 추가되는 `'device'` 테스트가 "기기 시간대"가 아니라
// 날조된 UTC를 상대로 통과하게 된다. 이 패키지가 가시화하려는 축이 바로 그것이다.
import { afterEach } from 'vitest';

const ORIGINAL_TZ = process.env.TZ;

/** 원래 TZ로 되돌린다. 원래 없었으면 **키를 지운다**(빈 문자열도, `'undefined'`도 아니다). */
export function restoreTz(): void {
  if (ORIGINAL_TZ === undefined) {
    delete process.env.TZ;
    return;
  }
  process.env.TZ = ORIGINAL_TZ;
}

/** 해당 시간대에서 한 번 실행한다. 호출자는 `useTzRestore()`로 복원을 걸어 둔다. */
export function underTz<T>(timeZone: string, run: () => T): T {
  process.env.TZ = timeZone;
  return run();
}

/** `afterEach` 복원을 등록한다. TZ를 만지는 파일은 이것 하나만 부르면 된다. */
export function useTzRestore(): void {
  afterEach(restoreTz);
}
