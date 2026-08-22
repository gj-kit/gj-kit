// `"."` — node/browser 브랜치 (설계 §2.3 · §3.1).
//
// exports 맵의 `node`/`browser` 조건이 이 파일로 라우팅한다. **`./native`를 import하지 않는다** —
// 그것이 이 파일의 존재 이유다: web export · expo-router SSR/RSC · Node CI · vitest node 환경에서
// `expo`가 모듈 그래프에 아예 들어오지 않는다(V1: 순수 Node의 `require('expo')`는 즉시 throw한다).
//
// ⚠ 구조분해 목록은 `src/index.ts`의 것과 **글자 그대로 같아야 한다**(`export-parity-guard`).

import { createWorkoutsApi, type WorkoutsApi } from './core';

export * from './core';

/**
 * `createWorkoutsApi(null)`의 산출물. `getAvailability()`만
 * `{ status: 'unavailable', reason: 'notSupported' }`로 **resolve**하고 나머지 11개는
 * `WorkoutsError('unavailable')`로 reject한다. import는 절대 던지지 않는다.
 */
export const workouts: WorkoutsApi = createWorkoutsApi(null);

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
