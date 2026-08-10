// 설계 문서 §5.6 `"./save"` — `MediaLibrarySaveAdapter`의 expo 구현.
//
// 전신 `packages/photo-kit/src/saveImages.ts`의 네이티브 분기에서 **네이티브 호출만** 남긴 것이다.
// 흐름 정책(다운로드 → **2xx 범위** 판정 → `saveToLibrary` → 임시 파일 정리, 실패 시 즉시 정리)은
// 코어의 `createMediaSaver`가 소유한다(`src/core/save/saver.ts` — §5.4-⑥ · §7.1).
// 여기 남는 것은 권한 요청 1건, 저장 1건, 그리고 정적 플래그 1개뿐이다.
//
// ⚠ Expo SDK 56 함정: 레거시 API는 반드시 `expo-media-library/legacy`에서 와야 한다(§2.3).

import * as MediaLibrary from 'expo-media-library/legacy';
import { Platform } from 'react-native';

import type { MediaLibrarySaveAdapter, MediaPermission } from '../core/adapters';

/**
 * expo 기기 저장 어댑터(§5.6).
 *
 * @param input.isExpoGo `Constants.appOwnership === 'expo'` 판정 결과.
 *   ⚠ **호스트가 판정하고 값만 넘긴다.** 이것이 라이브러리에서 `expo-constants` 의존을 완전히
 *   걷어내는 지점이다(§0.2). 전신은 `saveImages.ts:96`에서 `Constants`를 직접 import했고,
 *   그 한 줄 때문에 저장 기능을 쓰지 않는 소비자까지 peer 하나를 더 짊어졌다.
 */
export function expoDeviceSave(
  input?: { readonly isExpoGo?: boolean | undefined } | undefined,
): MediaLibrarySaveAdapter {
  return {
    async requestWritePermission(): Promise<MediaPermission> {
      // ⚠ **writeOnly=true, granular 목록 없음이 정상이다.** `hardening-guard` ②의 명시 예외이며
      //   (§7 하드닝 5 · §0.4 기각 9), 여기에 `['photo','video']`를 붙이면 저장만 하는 앱이
      //   읽기 권한까지 요구하게 된다 — 사용자에게 보이는 권한 문구가 달라진다.
      const response = await MediaLibrary.requestPermissionsAsync(true);
      return {
        granted: response.granted,
        canAskAgain: response.canAskAgain,
        // 저장 경로에서는 쓰이지 않지만 계약 필드이므로 채운다 — iOS "선택된 사진" 매핑은
        // 읽기 경로와 동일한 규칙이다(§3.3).
        limited: response.accessPrivileges === 'limited',
      };
    },

    async saveToLibrary(uri: string): Promise<void> {
      await MediaLibrary.saveToLibraryAsync(uri);
    },

    /**
     * 전신 `saveImages.ts:95-110` — "Android Expo Go는 사진 권한 요청 자체가 불가"하므로
     * 요청 단계를 건너뛴다. 건너뛰지 않으면 요청이 거부로 떨어지고, 저장이 **가능한 상황인데도**
     * `save-permission-denied`가 나온다.
     *
     * ⚠ 정적 값인 것이 핵심이다 — 코어의 `createMediaSaver`가 `if (!skipPermissionRequest)`
     *   한 줄로 읽는다. 판정 로직이 아니라 판정 **결과**를 어댑터가 노출한다.
     */
    skipPermissionRequest: Platform.OS === 'android' && (input?.isExpoGo ?? false),
  };
}
