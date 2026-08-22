// 패키지 전체에서 **유일한** `expo` import 지점 (설계 §3.1).
//
// `single-native-import` 가드가 `requireOptionalNativeModule` 문자열이 이 파일 하나에만 있음을
// 단언한다. `src/index.unsupported.ts`는 이 파일을 import하지 않으므로, 비네이티브 런타임의
// 모듈 그래프에는 `expo`가 **들어오지 않는다** — "던지지 않기를 바란다"가 아니라 "던질 코드가
// 그래프에 없다"로 만드는 것이 §1-6의 요구다(V1 실측).

import { requireOptionalNativeModule } from 'expo';

import type { NativeWorkoutsModule } from './core/native-contract';

/** `null` on Expo Go and on any runtime without the development build. Never throws at import time. */
export const nativeWorkouts: NativeWorkoutsModule | null =
  requireOptionalNativeModule<NativeWorkoutsModule>('GjKitWorkouts');
