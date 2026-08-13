// 설계 문서 §4 — 문구 주입.
//
// 전신의 한국어 하드코딩은 리터럴 24개(V6 실측: uploader 17 · devicePhotoLibrary 4 ·
// saveImages 2 · hashFile 1). 그중 크기 초과 문구만 값이 섞이므로 함수, 나머지는 상수 — **22키**.
// expo-ui의 `UiStrings + enStrings/koStrings` 패턴을 그대로 계승한다.
//
// 우선순위: 개별 옵션 > 팩토리 `strings` > 내장 `enMediaStrings`.
//
// ⚠ `Partial<MediaStrings>`를 받지 않는다(§6.1-⑧). 라이브러리가 키를 추가하면 손조립 소비자에게
// **컴파일 에러로 표면화**되어야 한다 — 부분 객체를 허용하면 새 키가 조용히 영어로 노출된다.
// 커스텀은 `{ ...koMediaStrings, fileNotFound: '…' }` 스프레드가 정답이다.
//
// ⚠ 이 파일 밖에서는 사용자 노출 문구 리터럴을 쓰지 않는다. `new MediaError(code, strings.xxx)`
// 형태만 허용하며 `string-guard`(§10.3)가 정적으로 강제한다.

import type { MediaKind } from './adapters';

export interface MediaStrings {
  // ── 기기 라이브러리 (전신 devicePhotoLibrary.ts 4) ────────────────────────
  /** 자산 정보 조회 15s 데드라인 초과 — `device-timeout`. */
  readonly deviceInfoTimeout: string;
  /** iCloud 원본 다운로드 60s 데드라인 초과 — `device-timeout`. */
  readonly iCloudDownloadTimeout: string;
  /** 원본이 iCloud에만 있고 다운로드 옵트인이 없음 — `device-icloud-only`. */
  readonly iCloudOnly: string;
  /** 로컬 파일 없음/판독 불가 — `device-not-found`. 전신은 hashFile.ts:71과 문구를 공유했다. */
  readonly fileNotFound: string;
  /** 기기 라이브러리 어댑터/OS 호출 실패 — 원본 예외를 공개하지 않는다. */
  readonly deviceLibraryFailed: string;
  /** 피커 어댑터/웹 바이너리 로더 호출 실패 — 원본 예외를 공개하지 않는다. */
  readonly pickerFailed: string;

  // ── 업로드 검증 (전신 uploader.ts) ────────────────────────────────────────
  readonly unsupportedFileType: string;
  /** 전신 uploader.ts:625 — 드롭/선택 결과에 업로드 가능한 미디어가 없음. */
  readonly noMediaFiles: string;
  /** 전신 uploader.ts:678 — 피커가 준 사진 자산에 uri가 없음. */
  readonly pickedPhotoInvalid: string;
  /** 전신 uploader.ts:717 — 피커가 준 미디어 자산에 uri가 없음. */
  readonly pickedMediaInvalid: string;
  readonly imageSizeUnknown: string;
  readonly videoSizeUnknown: string;

  // ── 업로드 실패 ───────────────────────────────────────────────────────────
  readonly imageUploadFailed: string;
  readonly videoUploadFailed: string;
  /** 전신 uploader.ts:237, 295 — 포스터(썸네일) PUT 실패. */
  readonly posterUploadFailed: string;

  // ── 권한 (전신 uploader.ts:918/937/973/998 — 전신은 bare Error였다, §5.2) ──
  readonly photoPermissionRequired: string;
  readonly mediaPermissionRequired: string;
  readonly cameraPermissionRequired: string;

  // ── 저장 (전신 saveImages.ts 2) ───────────────────────────────────────────
  readonly savePermissionDenied: string;
  readonly saveDownloadFailed: string;

  /**
   * `platform-unsupported` — 비네이티브 포크(web·SSR·RSC)에서 네이티브 전용 경로를 호출했을 때.
   * 전신에는 대응 문구가 없다(전신의 web 포크는 영어 `Error`를 던졌다 —
   * devicePhotoLibrary.web.ts:29). 이 코드는 §5.2에서 신설됐는데 §4의 키 목록이 함께
   * 늘지 않아, 초기 구현이 `pickedMediaInvalid`·`fileNotFound`·`saveDownloadFailed` 셋을
   * 돌려 쓰고 있었다 — 전부 원인과 무관한 문구다("파일을 찾을 수 없습니다"는 사용자를
   * 파일 탐색으로 오도한다). 그래서 전용 키로 분리한다.
   */
  readonly platformUnsupported: string;

  /** 크기 초과 — 단위 표기가 언어마다 다르므로 함수. */
  readonly fileTooLarge: (input: { readonly maxBytes: number; readonly kind: MediaKind }) => string;
}

/** 바이트 → MB. 전신 uploader.ts:209의 `Math.round(maxBytes / (1024 * 1024))` 규칙 보존. */
const megabytes = (maxBytes: number): number => Math.round(maxBytes / (1024 * 1024));

/** 기본값. 팩토리에 `strings`를 주지 않은 소비자가 받는 문구다. */
export const enMediaStrings: MediaStrings = {
  deviceInfoTimeout: 'Reading the original photo information is taking too long.',
  iCloudDownloadTimeout:
    'Fetching the original from iCloud is taking too long. Check your network and try again.',
  iCloudOnly:
    'The original of the selected photo is in iCloud. Download it in the Photos app and try again.',
  fileNotFound: 'The photo file could not be found.',
  deviceLibraryFailed: 'Could not read the photo library. Please try again in a moment.',
  pickerFailed: 'Could not open the media picker. Please try again in a moment.',

  unsupportedFileType:
    'Unsupported file type. Only JPG, PNG, WebP, HEIC, HEIF images or MP4, MOV, WebM videos can be uploaded.',
  noMediaFiles: 'No media files to upload were found.',
  pickedPhotoInvalid: 'The selected photo could not be read.',
  pickedMediaInvalid: 'The selected media could not be read.',
  imageSizeUnknown: 'The photo file size could not be determined.',
  videoSizeUnknown: 'The video file size could not be determined.',

  imageUploadFailed: 'Photo upload failed.',
  videoUploadFailed: 'Video upload failed.',
  posterUploadFailed: 'Video thumbnail upload failed.',

  photoPermissionRequired: 'Photo access permission is required.',
  mediaPermissionRequired: 'Photo and video access permission is required.',
  cameraPermissionRequired: 'Camera access permission is required.',

  savePermissionDenied: 'Cannot save without photo library access permission.',
  saveDownloadFailed: 'Could not download the photo. Please try again in a moment.',
  platformUnsupported: 'This feature is not available on the current platform.',

  fileTooLarge: ({ maxBytes, kind }) =>
    `${kind === 'video' ? 'Videos' : 'Images'} must be ${megabytes(maxBytes)}MB or smaller.`,
};

/**
 * 전신 문구를 **원문 그대로** 이식 — memorylog2 이관 시 UI 회귀 0(§11).
 * 한 글자라도 바꾸면 사용자가 보던 문구가 바뀐다. 개선은 호스트가 스프레드로 한다.
 */
export const koMediaStrings: MediaStrings = {
  // 전신 devicePhotoLibrary.ts:70
  deviceInfoTimeout: '사진 원본 정보를 확인하는 데 시간이 너무 오래 걸립니다.',
  // 전신 devicePhotoLibrary.ts:69
  iCloudDownloadTimeout:
    'iCloud에서 사진 원본을 가져오는 데 시간이 너무 오래 걸립니다. 네트워크를 확인한 뒤 다시 시도해주세요.',
  // 전신 devicePhotoLibrary.ts:301
  iCloudOnly: '선택한 사진 원본이 iCloud에 있습니다. 사진 앱에서 원본을 내려받은 뒤 다시 시도해주세요.',
  // 전신 devicePhotoLibrary.ts:325 · hashFile.ts:71 (두 곳이 같은 문구를 썼다)
  fileNotFound: '사진 파일을 찾을 수 없습니다.',
  deviceLibraryFailed: '사진 보관함을 읽지 못했습니다. 잠시 후 다시 시도해주세요.',
  pickerFailed: '미디어 선택기를 열지 못했습니다. 잠시 후 다시 시도해주세요.',

  // 전신 uploader.ts:110
  unsupportedFileType:
    '지원하지 않는 파일 형식입니다. JPG, PNG, WebP, HEIC, HEIF 이미지 또는 MP4, MOV, WebM 동영상만 업로드할 수 있습니다.',
  // 전신 uploader.ts:625
  noMediaFiles: '업로드할 미디어 파일을 찾지 못했습니다.',
  // 전신 uploader.ts:678
  pickedPhotoInvalid: '선택한 사진을 확인할 수 없습니다.',
  // 전신 uploader.ts:717
  pickedMediaInvalid: '선택한 미디어를 확인할 수 없습니다.',
  // 전신 uploader.ts:494, 863
  imageSizeUnknown: '사진 파일 크기를 확인할 수 없습니다.',
  // 전신 uploader.ts:558, 781
  videoSizeUnknown: '동영상 파일 크기를 확인할 수 없습니다.',

  // 전신 uploader.ts:425, 518
  imageUploadFailed: '사진 업로드에 실패했습니다.',
  // 전신 uploader.ts:590
  videoUploadFailed: '동영상 업로드에 실패했습니다.',
  // 전신 uploader.ts:237, 295
  posterUploadFailed: '동영상 썸네일 업로드에 실패했습니다.',

  // 전신 uploader.ts:918, 937
  photoPermissionRequired: '사진 접근 권한이 필요합니다.',
  // 전신 uploader.ts:973
  mediaPermissionRequired: '사진 및 동영상 접근 권한이 필요합니다.',
  // 전신 uploader.ts:998
  cameraPermissionRequired: '카메라 접근 권한이 필요합니다.',

  // 전신 saveImages.ts:333
  savePermissionDenied: '사진 보관함 접근 권한이 없어 저장할 수 없습니다.',
  // 전신 saveImages.ts:248
  saveDownloadFailed: '사진을 내려받지 못했습니다. 잠시 후 다시 시도해주세요.',
  platformUnsupported: '현재 환경에서는 지원하지 않는 기능입니다.',

  // 전신 uploader.ts:209 — 원문은 kind를 구분하지 않았다. 구분을 넣으면 문구가 바뀌므로 넣지 않는다.
  fileTooLarge: ({ maxBytes }) => `파일은 ${megabytes(maxBytes)}MB 이하로 업로드해주세요.`,
};
