// 설계 문서 §3.3-⑥ · §5.6 · **§7.1 (iOS 원본 fast path 고정 조합)** — `PickerAdapter`의 expo 구현.
//
// 어댑터는 순수 위임이다: 권한을 "언제" 요청할지, 결과를 `max`로 자를지, 어느 플랫폼 경로로
// 업로드할지는 전부 코어의 `createPickerFlows`가 갖는다(§5.4-③). 여기 남는 판단은 하나뿐 —
// **어떤 옵션으로 OS 피커를 여는가**이고, 그것이 §7.1의 하드닝이다.

import * as ImagePicker from 'expo-image-picker';
import type {
  MediaKind,
  MediaPermission,
  PickedAsset,
  PickerAdapter,
} from '../core/adapters';

/**
 * ⚠ **iOS PhotoKit 원본 표현 fast path의 고정 조합**(§7.1 · 전신 uploader.ts:99-107).
 *
 * 전신 주석: "…so the single-select flow does not silently differ from the multi-select flow."
 * 네 값이 함께여야 의미가 있다:
 *   · `quality: 1`         — 재인코딩 금지. `< 1`이면 iOS/Android가 임시 파일로 다시 인코딩하고,
 *                            그 순간 `asset.fileSize`가 원본 크기를 보고해 presign 크기와
 *                            스토리지 수신 바이트가 어긋난다(§7 하드닝 3의 발원지).
 *   · `exif: true`         — EXIF가 없으면 촬영 시각·위치가 유실된다. 웹 경로의 `fallbackExif`도
 *                            이 값에서 온다(§5.7.4).
 *   · `allowsEditing: false` — 크롭 UI는 원본이 아닌 파생물을 만든다. 다중선택과도 상호배타다.
 *   · `preferredAssetRepresentationMode: Current` — iOS가 HEIC를 JPEG로 트랜스코딩하지 않고
 *                            **현재 표현 그대로** 넘기게 한다. 이것이 "원본 fast path"의 본체다.
 *
 * ⚠ 이 상수는 라이브러리의 **모든 라이브러리 피커 호출이 공유한다**. 단일선택 경로만 한쪽으로
 * 빠지면 같은 사진이 선택 방식에 따라 다른 바이트로 업로드된다 — 서버의 dedup 해시가 갈리고
 * 사용자에겐 아무 단서도 남지 않는다. 배럴(`src/picker.ts`)로 내보내지 않는 이유도 같다:
 * 소비자가 개별 값을 갈아 끼울 수 있으면 고정 조합이 아니게 된다(§5.4.1 원칙 (i)).
 *
 * @internal 스냅샷 unit(§7.1)만 이 심볼을 참조한다.
 */
export const ORIGINAL_LIBRARY_PICKER_OPTIONS = {
  quality: 1,
  exif: true,
  allowsEditing: false,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
} as const;

/**
 * 카메라 캡처 옵션(전신 uploader.ts:1000-1004). fast path를 끈 라이브러리 피커도 이것을 쓴다.
 * `preferredAssetRepresentationMode`가 빠지는 것이 정상이다 — 방금 촬영한 프레임에는
 * "라이브러리 자산 표현"이라는 개념 자체가 없다.
 *
 * ⚠ 세 값이 `ORIGINAL_LIBRARY_PICKER_OPTIONS`와 **글자 그대로 같아야 한다**. 여기서 한 값이라도
 * 갈리면 카메라로 찍은 사진과 라이브러리에서 고른 사진이 서로 다른 크기·메타데이터 규약을 갖게 되고,
 * 그 차이는 서버가 업로드를 거절할 때에야 드러난다(§7 하드닝 3).
 */
const BASE_PICKER_OPTIONS = {
  quality: 1,
  exif: true,
  allowsEditing: false,
} as const;

/**
 * Analysis/crop workflows need a broadly readable local image instead of a PhotoKit original.
 * This is intentionally opt-in: storage uploads should retain their original representation by
 * default, while consumers such as document scanning can request the compatible representation.
 */
const COMPATIBLE_LIBRARY_PICKER_OPTIONS = {
  ...BASE_PICKER_OPTIONS,
  preferredAssetRepresentationMode:
    ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
} as const;

/** `MediaKind` → expo `MediaType`(16.0.0의 배열 형식 — §2.3 peer 하한 근거표). */
function toMediaTypes(kinds: readonly MediaKind[]): ImagePicker.MediaType[] {
  const types = kinds.map((kind): ImagePicker.MediaType =>
    kind === 'video' ? 'videos' : 'images',
  );
  // 빈 배열은 expo의 기본값 해석을 불확정으로 만든다. 코어는 항상 최소 1종을 주지만
  // 3자 호출자가 직접 어댑터를 쓸 수 있으므로 여기서 전신 기본값('images')으로 접는다.
  return types.length > 0 ? types : ['images'];
}

/**
 * `ImagePickerAsset` → `PickedAsset`.
 *
 * ⚠ 정규화는 **`?? undefined` 뿐**이다(전신은 `null`을 그대로 흘렸다). 특히:
 *   · `durationRaw`는 **변환하지 않는다** — 네이티브는 ms, 웹은 s이며 정규화 지점은 코어의
 *     `normalizeDurationMs` 하나다(§7 하드닝 4). 여기서 곱하면 이중 변환이 된다.
 *   · `reportedSizeBytes`는 **자칭 값**이다. `verifiedSizeBytes`를 채우지 않는 것이 의도다 —
 *     피커는 "실제로 스트리밍될 파일"을 stat하지 않았으므로 그 신뢰도를 주장할 자격이 없다.
 *     코어의 `resolveUploadSize`가 file-system stat을 한 단계 위에 둔다(§7 하드닝 3).
 *   · `exif: asset.exif ?? undefined` — `null`이 새면 EOP 소비자의 `?: T | undefined` 계약이
 *     깨지고, 코어의 `fallbackExif` 병합이 "빈 값 있음"으로 오독한다(§7.1 `mediaMetadataFromJpeg`).
 */
function toPickedAsset(asset: ImagePicker.ImagePickerAsset): PickedAsset {
  return {
    uri: asset.uri,
    // 소비자 dedup의 1차 키다(§3.3 `PickedAsset.assetId` 주석). 웹 드롭·카메라 캡처에는 없다.
    assetId: asset.assetId ?? undefined,
    fileName: asset.fileName ?? undefined,
    mimeType: asset.mimeType,
    width: asset.width,
    height: asset.height,
    durationRaw: asset.duration ?? undefined,
    exif: asset.exif ?? undefined,
    reportedSizeBytes: asset.fileSize,
  };
}

/** expo 권한 응답 → `MediaPermission`. `limited`는 iOS "선택된 사진"·Android 34+ 부분 접근이다. */
function toMediaPermission(response: {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
  readonly accessPrivileges?: 'all' | 'limited' | 'none' | undefined;
}): MediaPermission {
  return {
    granted: response.granted,
    canAskAgain: response.canAskAgain,
    limited: response.accessPrivileges === 'limited',
  };
}

/** §5.6 — `"./picker"`의 유일한 공개 심볼. */
export function expoPicker(options?: {
  /**
   * 기본 `true` — iOS PhotoKit 원본 표현 fast path(§7.1).
   *
   * `false`로 내리면 `preferredAssetRepresentationMode`만 빠져 시스템이 표현을 고르게 된다
   * (HEIC → JPEG 트랜스코딩이 일어날 수 있다). `quality`·`exif`·`allowsEditing` 세 값은
   * **어떤 경우에도 바뀌지 않는다** — 그 셋이 흔들리면 크기 정합(§7 하드닝 3)과 메타데이터가
   * 함께 깨지기 때문이다. 즉 이 옵션은 fast path의 on/off이지 옵션 가방이 아니다.
   */
  readonly preferOriginalRepresentation?: boolean | undefined;
  /**
   * When original PhotoKit data is unsuitable for an app-owned processing flow, ask iOS for a
   * compatible representation. This keeps the default upload-oriented original fast path intact.
   */
  readonly preferCompatibleRepresentation?: boolean | undefined;
  /**
   * Retry a failed single-image library launch with UIImagePickerController's editing flow.
   * This is useful for iCloud/HEIC assets that PHPicker cannot materialize. The retry is limited
   * to one selection because Expo does not support editing together with multi-selection.
   */
  readonly retryWithEditingOnError?: boolean | undefined;
}): PickerAdapter {
  if (options?.preferOriginalRepresentation && options?.preferCompatibleRepresentation) {
    throw new TypeError('Only one asset representation preference can be enabled.');
  }
  const preferOriginal = options?.preferOriginalRepresentation ?? true;
  const preferCompatible = options?.preferCompatibleRepresentation ?? false;
  const retryWithEditingOnError = options?.retryWithEditingOnError ?? false;
  // EOP 때문에 `preferredAssetRepresentationMode: undefined`를 넘길 수 없다 — 키 자체를 지운다.
  const libraryOptions = preferCompatible
    ? COMPATIBLE_LIBRARY_PICKER_OPTIONS
    : preferOriginal
      ? ORIGINAL_LIBRARY_PICKER_OPTIONS
      : BASE_PICKER_OPTIONS;

  return {
    /**
     * ⚠ `kinds`를 쓰지 않는 것이 정상이다. expo-image-picker의 권한은 사진/동영상으로 갈리지
     * 않는다(하나의 미디어 라이브러리 권한). granular 목록 하드닝(§7 하드닝 5)은
     * `expo-media-library`를 쓰는 `"./device"` 어댑터의 몫이며, 여기에 옮겨 오면 안 된다.
     */
    async requestLibraryPermission(): Promise<MediaPermission> {
      return toMediaPermission(await ImagePicker.requestMediaLibraryPermissionsAsync());
    },

    async requestCameraPermission(): Promise<MediaPermission> {
      const response = await ImagePicker.requestCameraPermissionsAsync();
      // 카메라 권한에는 부분 접근 개념이 없다.
      return { granted: response.granted, canAskAgain: response.canAskAgain, limited: false };
    },

    async pickFromLibrary(input: {
      readonly kinds: readonly MediaKind[];
      readonly max: number;
    }): Promise<readonly PickedAsset[]> {
      let result: ImagePicker.ImagePickerResult;
      try {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: toMediaTypes(input.kinds),
          ...libraryOptions,
          // 전신 보존: `max === 1`은 단일선택 UI(uploader.ts:921-924), 그 이상은 다중선택
          // + `selectionLimit`(946-950). 고정 조합(위 상수)은 **양쪽이 공유**하므로 §7.1의
          // "단일선택이 다중선택과 조용히 달라지면 안 된다"는 그대로 성립한다 —
          // 달라지는 것은 선택 UI뿐이고 바이트 경로가 아니다.
          allowsMultipleSelection: input.max > 1,
          selectionLimit: input.max,
        });
      } catch (error) {
        if (!retryWithEditingOnError || input.max !== 1 || !input.kinds.includes('image')) {
          throw error;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.9,
          allowsEditing: true,
        });
      }
      // 취소는 빈 배열이다. 실패가 아니므로 throw하지 않는다 — 코어도 빈 결과를 그대로 다룬다.
      if (result.canceled) return [];
      return result.assets.map(toPickedAsset);
    },

    async capture(input: { readonly kind: MediaKind }): Promise<readonly PickedAsset[]> {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: input.kind === 'video' ? ['videos'] : ['images'],
        ...BASE_PICKER_OPTIONS,
      });
      if (result.canceled) return [];
      // 1건 제한은 코어(`captureAndUpload`)가 건다(§5.4.1-12) — 어댑터가 자르면 그 규칙이
      // 두 곳에 생기고, 카메라가 여러 장을 돌려주는 플랫폼에서 어느 쪽이 이겼는지 알 수 없게 된다.
      return result.assets.map(toPickedAsset);
    },
  };
}
