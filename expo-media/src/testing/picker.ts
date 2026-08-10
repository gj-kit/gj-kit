// 설계 문서 §5.6 `"./testing"` — 피커 어댑터 페이크.
//
// `createPickerFlows`(§5.4-③)가 소유하는 정책 셋을 전부 태울 수 있어야 한다:
//   ① 권한 거부 → `MediaError('permission-denied')` (문구는 요청한 kinds가 정한다)
//   ② 선택 결과를 `max`로 자른다 — 그래서 페이크는 **주어진 자산을 자르지 않고 그대로 준다**.
//      어댑터가 미리 자르면 "어댑터가 selectionLimit을 무시해도 코어가 자른다"는 규칙
//      (전신 uploader.ts:946,983)이 검증되지 않는다.
//   ③ 플랫폼별 업로드 라우팅
//
// ⚠ peer 0 · DOM 0.

import type { MediaKind, MediaPermission, PickedAsset, PickerAdapter } from '../core/adapters';

const GRANTED: MediaPermission = { granted: true, canAskAgain: true, limited: false };

export type FakePickerOptions = {
  /** `pickFromLibrary` 전 권한. 기본 허용. */
  readonly libraryPermission?: MediaPermission | undefined;
  /** `capture` 전 권한. 기본 허용. */
  readonly cameraPermission?: MediaPermission | undefined;
  /**
   * 카메라가 돌려줄 자산. 생략 시 라이브러리 자산과 같다.
   * ⚠ 여러 건을 줘야 §5.4.1-12의 "카메라 캡처 1장 제한"이 검증된다 — 1건만 주면
   *   자르는 코드가 있든 없든 결과가 같아서 그 규칙이 통과한 척한다.
   */
  readonly captureAssets?: readonly PickedAsset[] | undefined;
};

export interface FakePicker extends PickerAdapter {
  readonly calls: {
    /** 요청된 kinds 목록 — 권한 거부 문구가 kinds로 갈리므로(§4) 인자를 남긴다. */
    readonly libraryPermission: readonly (readonly MediaKind[])[];
    readonly cameraPermission: number;
    readonly pick: readonly { readonly kinds: readonly MediaKind[]; readonly max: number }[];
    readonly capture: readonly { readonly kind: MediaKind }[];
  };
}

type MutableCalls = {
  libraryPermission: (readonly MediaKind[])[];
  cameraPermission: number;
  pick: { readonly kinds: readonly MediaKind[]; readonly max: number }[];
  capture: { readonly kind: MediaKind }[];
};

export function createFakePicker(
  assets: readonly PickedAsset[],
  options?: FakePickerOptions | undefined,
): FakePicker {
  const calls: MutableCalls = { libraryPermission: [], cameraPermission: 0, pick: [], capture: [] };
  const libraryPermission = options?.libraryPermission ?? GRANTED;
  const cameraPermission = options?.cameraPermission ?? GRANTED;
  const captureAssets = options?.captureAssets ?? assets;

  return {
    calls,

    requestLibraryPermission(kinds) {
      calls.libraryPermission.push(kinds);
      return Promise.resolve(libraryPermission);
    },

    requestCameraPermission() {
      calls.cameraPermission += 1;
      return Promise.resolve(cameraPermission);
    },

    pickFromLibrary(input) {
      calls.pick.push({ kinds: input.kinds, max: input.max });
      // ⚠ 일부러 `max`로 자르지 않는다 — 위 ② 참조.
      return Promise.resolve(assets);
    },

    capture(input) {
      calls.capture.push({ kind: input.kind });
      // ⚠ 일부러 1건으로 자르지 않는다 — 자르는 주체는 `captureAndUpload`다(§5.4.1-12).
      return Promise.resolve(captureAssets);
    },
  };
}
