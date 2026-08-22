// `"."` — 네이티브 브랜치 (설계 §3.1 · §5.3).
//
// ⚠ 아래 구조분해 목록은 `src/index.unsupported.ts`의 것과 **글자 그대로 같아야 한다.**
//   한쪽에만 함수를 추가하면 web/Node 호출자는 typed `unavailable`이 아니라
//   `undefined is not a function`을 받는다 — `export-parity-guard`가 두 `.d.ts`를 대조한다.

import { createWorkoutsApi, type WorkoutsApi } from './core';
import { nativeWorkouts } from './native';

export * from './core';

/**
 * The same twelve functions as one object, so an app can inject `WorkoutsApi` and substitute
 * `createFakeWorkouts().api` in tests. It is not a second implementation — the twelve named exports
 * below are literally this object's destructured properties.
 */
export const workouts: WorkoutsApi = createWorkoutsApi(nativeWorkouts);

export const {
  getAvailability,
  requestAuthorization,
  getAuthorizationState,
  listWorkouts,
  syncWorkouts,
  getRoute,
  readHeartRate,
  readSteps,
  saveWorkout,
  deleteWorkout,
  openSettings,
  openStoreListing,
} = workouts;
