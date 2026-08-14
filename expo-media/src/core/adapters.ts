// ═══════════════════════════════════════════════════════════════════════════
// 설계 문서 §3.3 — 어댑터 계약 전체.
//
// 규약: 공개 옵셔널 필드는 전부 `?: T | undefined` (EOP 소비자 보호 — §1-7)
//       모든 입력 객체는 readonly. **어댑터는 순수 위임이며 정책은 코어가 갖는다.**
//
// 이 파일은 `src/core/**`의 순수성 규율을 따른다 — react/react-native/expo import 0,
// DOM 전역 참조 0, 런타임 의존성 0. `tsconfig.core.json`이 정적으로 강제한다(§2.4).
// ═══════════════════════════════════════════════════════════════════════════

export type MediaKind = 'image' | 'video';
export type MediaPlatform = 'ios' | 'android' | 'web';

/**
 * DOM lib 없이 Blob/File을 받기 위한 구조적 최소 타입.
 * 브라우저 Blob·RN Blob·Node Blob이 전부 구조적으로 만족하며,
 * vitest에서 plain object로 전 경로를 도는 것을 가능하게 한다(§10.1).
 */
export interface BinarySource {
  readonly size: number;
  readonly type?: string | undefined;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** 웹 File의 구조적 최소치 — DOM lib 없이 `isSupportedMediaFile`을 쓰기 위해(§7 하드닝 10). */
export interface NamedBinarySource extends BinarySource {
  readonly name: string;
}

export type ChunkRange = { readonly position: number; readonly length: number };

export type MediaPermission = {
  readonly granted: boolean;
  readonly canAskAgain: boolean;
  /** iOS "선택된 사진" — 일부만 보인다. */
  readonly limited: boolean;
};

// ── ① 플랫폼 ────────────────────────────────────────────────────────────────
/**
 * core에서 `react-native` import를 제거하는 유일한 이유. 필드 2개뿐인 것이 정상이다.
 *
 * 전신 `debug.ts`는 `Platform`을 직접 import했고, 그 한 줄 때문에 서명 URL 새니타이저
 * (§7 하드닝 8)를 순수 유닛으로 검증할 수 없었다. 주입으로 바꾸면서 debug 모듈이 core로 하강했다.
 */
export interface PlatformAdapter {
  readonly os: MediaPlatform;
  /** `__DEV__` 상당. 디버그 로거 게이트(§7 하드닝 8). expo 기본값: `__DEV__ && NODE_ENV !== 'test'`. */
  readonly isDev: boolean;
}

// ── ② 로컬 파일 I/O ─────────────────────────────────────────────────────────
/**
 * 전신의 `{exists, isDirectory, size}`를 판별 유니언으로 교체.
 * `info.exists && !info.isDirectory ? info.size : 0` 패턴 5중복이 좁히기 한 번으로 소멸한다
 * (§7 하드닝 3).
 */
export type FileStat =
  | { readonly kind: 'file'; readonly sizeBytes: number }
  | { readonly kind: 'directory' }
  | { readonly kind: 'missing' };

export interface FileSystemAdapter {
  /** 앱 소유 캐시 디렉토리 URI(끝에 '/'). 없으면 documentDirectory, 그것도 없으면 null. */
  cacheDirectory(): string | null;
  /** ⚠ throw 금지 — 코어가 후보 URI를 순회한다. 없거나 디렉토리면 그 kind를 반환. */
  stat(uri: string): Promise<FileStat>;
  copy(input: { readonly from: string; readonly to: string }): Promise<void>;
  /** 멱등 삭제. 실패해도 throw 금지 — 스테이징 누수는 디스크 비용일 뿐이다. */
  remove(uri: string): Promise<void>;
  /**
   * `[position, position+length)` 구간을 base64로 반환.
   * ⚠ 코어는 length를 **항상 3의 배수**로 준다(§7 하드닝 9 — 3바이트가 base64 4문자에 대응하므로
   * 3의 배수가 아니면 윈도우 경계에 패딩이 끼어 **해시가 조용히 틀린다**).
   * 어댑터가 범위를 재정렬·병합·확장하면 그 하드닝이 무력화된다.
   */
  readBase64(uri: string, range: ChunkRange): Promise<string>;
}

/**
 * App-owned persistent-file storage seam.
 *
 * This is deliberately separate from `FileSystemAdapter`: upload code needs a
 * cache directory plus base64 reads, whereas an application attachment store
 * needs a durable root plus directory creation. Keeping the contracts apart
 * avoids making every upload-only adapter pretend it can persist user files.
 */
export interface DurableFileStoreAdapter {
  /** App-owned durable root URI. It must identify a directory, or return null when unavailable. */
  rootDirectory(): string | null;
  /** Creates a directory and all missing parents. Repeating the call must be safe. */
  ensureDirectory(uri: string): Promise<void>;
  /** Same discriminated stat contract as the upload file-system seam. */
  stat(uri: string): Promise<FileStat>;
  copy(input: { readonly from: string; readonly to: string }): Promise<void>;
  /** Idempotent best-effort removal. */
  remove(uri: string): Promise<void>;
}

/** 저장 플로우 전용 — 업로드만 하는 소비자는 구현할 필요가 없다. */
export interface FileDownloadAdapter {
  download(input: { readonly url: string; readonly to: string }): Promise<{
    readonly uri: string;
    readonly status: number;
  }>;
}

// ── ③ 전송 ──────────────────────────────────────────────────────────────────
export type PutRequest = {
  readonly url: string;
  readonly method: 'PUT';
  readonly headers: Readonly<Record<string, string>>;
};

/**
 * ⚠ **계약: 파일 바이트를 JS 힙으로 읽지 말 것.** 네이티브 스트리밍 업로드여야 한다.
 *
 * 근거(§7 하드닝 1): `FileSystem.uploadAsync`(레거시 URLSession 브리지)가 iOS 26에서 파일 기반
 * 업로드를 **시작하는 중 프로세스를 종료시킨다** — promise가 reject될 기회조차 없으므로
 * 재시도 로직도 에러 보고도 발화하지 않는다. 크래시 리포트에도 앱 코드 프레임이 남지 않아
 * 원인 추적에만 수일이 걸렸다.
 *
 * expo 기본 어댑터는 `new File(uri).upload(url, { sessionType: 'foreground',
 * uploadType: BINARY_CONTENT })`를 쓴다. `hardening-guard`가 `uploadAsync` 문자열의
 * 재등장을 `src/**` 전역에서 정적 차단한다.
 */
export interface LocalFileTransport {
  putLocalFile(input: PutRequest & { readonly uri: string }): Promise<{ readonly status: number }>;
}

/** 웹 Blob PUT · 포스터 PUT. fetch 기반 기본 구현은 `"./web"`이 제공한다. */
export interface BinaryTransport {
  putBinary(input: PutRequest & { readonly body: BinarySource }): Promise<{ readonly status: number }>;
}

// ── ④ 해시 ──────────────────────────────────────────────────────────────────
/**
 * 기본 구현은 core 내장 순수 TS 증분 SHA-256(§9) — `js-sha256` 제거, 런타임 의존성 0.
 * 네이티브 가속이 필요한 호스트만 교체한다.
 *
 * ⚠ 해시는 dedup **최적화**일 뿐이므로 실패가 업로드를 막지 않는다(§7.1). 그 정책은 코어의
 * `hashSafely()`가 갖는다 — 어댑터는 그냥 throw해도 된다.
 */
export interface HashAdapter {
  hashLocalFile(uri: string): Promise<string>;
  hashBinary(source: BinarySource): Promise<string>;
}

// ── ⑤ 포스터 — 입력 타입이 달라 브랜드 없이 자연 분리(§6.1-⑥) ───────────────
/**
 * 로컬 URI → 포스터 프레임. 기본 구현은 `"./video"`(expo-video-thumbnails).
 * `BinaryPosterAdapter`와 입력 타입이 다르므로 자리를 바꿔 끼우면 컴파일 에러가 난다 —
 * 브랜드·phantom 각인 없이 오배치가 차단된다.
 */
export interface LocalPosterAdapter {
  /** ⚠ 실패는 `null`. 포스터 실패가 동영상 업로드를 막지 않는다(§7.1). */
  posterFromLocalFile(input: { readonly uri: string; readonly atMs: number }): Promise<{
    readonly uri: string;
  } | null>;
}

/** 바이너리 → 포스터 바이너리. 기본 구현은 `"./web"`의 canvas 포스터. */
export interface BinaryPosterAdapter {
  /** ⚠ 실패는 `null`. 근거는 `LocalPosterAdapter`와 동일. */
  posterFromBinary(input: {
    readonly source: BinarySource;
    readonly atMs: number;
  }): Promise<BinarySource | null>;
}

// ── ⑤-b 바이너리 로더 (G18) ──────────────────────────────────────────────────
/**
 * uri → 바이너리. 웹 피커가 주는 `blob:`/`data:` URI를 업로드 가능한 소스로 바꾼다.
 * 기본 구현은 `"./web"`의 `createFetchBinarySourceLoader`(peer 0). 경로 전문은 §5.7.4.
 *
 * 이 seam이 없으면 웹에서 피커 자산을 업로드하는 유일한 방법이 로컬 파일 스트리밍인데,
 * 그 경로는 웹에 존재하지 않는다 — `LocalUploads.uploadPickedAsset`이
 * `MediaError('platform-unsupported')`를 던지는 이유다.
 */
export interface BinarySourceLoader {
  fromUri(input: { readonly uri: string; readonly fileName: string }): Promise<NamedBinarySource>;
}

// ── ⑥ 피커 ("./picker") ─────────────────────────────────────────────────────
export type PickedAsset = {
  readonly uri: string;
  /**
   * 기기 라이브러리 원본 식별자(iOS PhotoKit localIdentifier / Android MediaStore id).
   * 없을 수 있다(웹 File 드롭, 카메라 캡처).
   *
   * ⚠ **왜 필요한가**: 소비자의 dedup 1차 키다 —
   *   `apps/mobile/src/photos/pendingPhotos.ts:43`
   *   ``pickerAssetDedupKey = `asset:${asset.assetId ?? asset.uri}` ``
   * uri 폴백만 남으면 스테이징 사본 uri가 resolve마다 재생성되므로(§7 하드닝 2) 같은 사진을
   * 두 번 선택했을 때 dedup이 통과해버린다. 전신은 `resolveDeviceAssetForUpload`가
   * `assetId: asset.id`를 채워 device 자산과 picker 자산의 동일성을 유지했다
   *   — devicePhotoLibrary.ts:364. 새 설계에서는 `toPickedAsset`이 그 역할을 한다(§5.4-④).
   */
  readonly assetId?: string | undefined;
  readonly fileName?: string | undefined;
  readonly mimeType?: string | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  /**
   * ⚠ 어댑터는 **원시값 그대로** 넘긴다. 네이티브는 ms, 웹은 s이며 정규화는 core가 한다
   * (§7 하드닝 4 — 정규화 지점을 하나로 고정. 어댑터가 변환하면 이중 변환이 된다).
   *
   * 전신 사고: expo-image-picker 웹이 `HTMLVideoElement.duration`(초)을 그대로 전달해
   * 20분 영상이 1200ms로 저장됐고, 어떤 길이 캡도 그것을 통과시켰다.
   */
  readonly durationRaw?: number | undefined;
  readonly exif?: Readonly<Record<string, unknown>> | undefined;
  /**
   * 어댑터가 "실제로 스트리밍될 파일"을 stat해 확인한 크기. 있으면 최우선.
   * 전신의 뒷문 프로퍼티 `__photoKitVerifiedSizeBytes`를 정식 필드로 승격(§7 하드닝 3).
   */
  readonly verifiedSizeBytes?: number | undefined;
  /**
   * ⚠ 신뢰 금지 — 최후 폴백이다(§7 하드닝 3).
   * Android가 `quality < 1`로 재인코딩할 때 `asset.fileSize`는 **원본** 크기를 보고하므로
   * 스토리지가 실제로 받은 바이트와 어긋나 서버가 업로드를 거절한다.
   * 필드명이 곧 신뢰도다: `verifiedSizeBytes`(실측) > file-system stat > `reportedSizeBytes`(자칭).
   */
  readonly reportedSizeBytes?: number | undefined;
};

export interface PickerAdapter {
  requestLibraryPermission(kinds: readonly MediaKind[]): Promise<MediaPermission>;
  requestCameraPermission(): Promise<MediaPermission>;
  /**
   * ⚠ iOS 원본 fast path 고정 조합(§7.1): `quality: 1` · `exif: true` ·
   * `allowsEditing: false` · `preferredAssetRepresentationMode: Current`.
   * **단일선택/다중선택이 달라지면 안 된다** — 한쪽만 재인코딩 경로로 빠지면 같은 사진이
   * 선택 방식에 따라 다른 바이트로 업로드된다.
   */
  pickFromLibrary(input: {
    readonly kinds: readonly MediaKind[];
    readonly max: number;
  }): Promise<readonly PickedAsset[]>;
  /**
   * 카메라 캡처.
   * ⚠ 상위 플로우(`captureAndUpload`)는 **항상 최대 1건**으로 자른다
   * (전신 uploader.ts:1008 `result.assets.slice(0, 1)`).
   */
  capture(input: { readonly kind: MediaKind }): Promise<readonly PickedAsset[]>;
}

// ── ⑦ 기기 라이브러리 ("./device") ──────────────────────────────────────────
/**
 * 하드닝된 업로드 resolve가 필요로 하는 최소 정체성. 전체 `MediaLibrary.Asset`이 이것을
 * 구조적으로 만족하며, 동기화 큐는 이 두 필드만 저장해 두고 넘길 수 있다
 * (전신 devicePhotoLibrary.ts:21-24 주석 계승).
 */
export type DeviceAssetRef = { readonly id: string; readonly filename: string };

export type DeviceAsset = DeviceAssetRef & {
  readonly uri: string;
  readonly width: number;
  readonly height: number;
  readonly mediaType: MediaKind;
  readonly creationTime?: number | undefined;
};

export type DeviceAssetPage = {
  readonly assets: readonly DeviceAsset[];
  /**
   * §1-7 규약(`?: T | undefined`)을 따른다 — 초안은 필수-undefined였다(G20-14).
   * 필수로 두면 3자 어댑터 구현자가 값 없는 마지막 페이지에서도 키를 명시해야 한다.
   */
  readonly endCursor?: string | undefined;
  readonly hasNextPage: boolean;
  readonly totalCount: number;
};

export type DeviceAlbum = { readonly id: string; readonly title: string; readonly count: number };

export type DeviceAssetInfo = {
  /** 앱 컨테이너 밖(iOS Photos 컨테이너)일 수 있다 — core가 캐시로 실체화한다(§7 하드닝 2). */
  readonly localUri?: string | undefined;
  readonly uri?: string | undefined;
  readonly exif?: Readonly<Record<string, unknown>> | undefined;
  /** true면 원본이 iCloud에만 있다. core 기본 정책은 여기서 중단(§7 하드닝 6). */
  readonly isNetworkAsset: boolean;
};

export interface DeviceLibraryAdapter {
  /**
   * ⚠ Android 13+에서 granular 목록(`['photo','video']`)을 **반드시** 지정할 것. 생략하면
   * 매니페스트의 모든 권한이 대상이 되어, 거부된 `READ_MEDIA_AUDIO`가 유효한 사진·동영상 허용을
   * 거부처럼 보이게 만든다(Android의 "선택한 사진" 접근 모드 포함) — §7 하드닝 5.
   *
   * ⚠ **순수 위임이다.** "언제 요청할 것인가"(현재 권한 조회 → `!granted && canAskAgain`일 때만
   * 요청)는 어댑터가 아니라 core가 소유한다 — `DeviceLibrary.ensurePermission()`(§5.4-④(c), G17).
   * 어댑터에 두면 (i) 3자 어댑터마다 규칙이 갈리고, (ii) iOS에서 `canAskAgain=false`인데 재요청해
   * 아무 일도 일어나지 않는 **UI 데드록**이 재발한다.
   * 어댑터의 몫은 네이티브 응답을 `MediaPermission`으로 매핑하는 것까지다
   * (`accessPrivileges === 'limited'` → `limited: true` 포함).
   */
  requestPermission(): Promise<MediaPermission>;
  /** 순수 조회 — 요청하지 않는다. 합성 규칙은 core가 갖는다(위 참조). */
  getPermission(): Promise<MediaPermission>;
  /**
   * ⚠ **정렬 계약: creationTime 내림차순(최신 우선).** 전신 `devicePhotoLibrary.ts:220`
   *   `sortBy: [[SortBy.creationTime, false]]`.
   * core는 재정렬하지 않는다 — 페이지 단위 재정렬은 전역 순서를 보장하지 못하면서
   * (다음 페이지가 이전 페이지보다 최신일 수 있다) `endCursor`는 여전히 어댑터 순서를 따라가
   * **커서와 표시 순서가 어긋난다**(§5.4-④(d)). 이 계약을 어기면 그리드 순서와 무한스크롤
   * 커서가 함께 깨지며, **타입도 가드도 그것을 잡지 못한다**.
   *
   * ⚠ 자산별 `getAssetInfo` 호출 금지 — 60개 원본을 직렬 해석하면 페이지당 ~20초다.
   * 그리드는 raw uri(iOS `ph://`)를 그대로 그린다. 네이티브 이미지 로더가 PHImageManager에
   * 뷰 크기 썸네일을 요청하므로 시스템 사진 그리드와 같은 방식이 된다. 원본 바이트는
   * 업로드 시점의 resolve에서만 해석한다(§7.1).
   */
  listAssets(input: {
    readonly albumId?: string | null | undefined;
    readonly after?: string | undefined;
    readonly pageSize: number;
    readonly kinds: readonly MediaKind[];
  }): Promise<DeviceAssetPage>;
  /**
   * 원본 목록을 **그대로** 반환한다 — 필터·정렬 금지.
   * `count > 0` 필터와 count 내림차순 정렬은 core가 수행하므로
   * (전신 `devicePhotoLibrary.ts:243-250`의 정책을 core로 승격) 어댑터가 중복 수행할 이유가 없다.
   * 전량을 한 번에 반환하는 in-memory 목록이라 core가 전역 순서를 보장할 수 있다는 점이
   * `listAssets`와의 차이다(§5.4-④(d)).
   */
  listAlbums(): Promise<readonly DeviceAlbum[]>;
  /**
   * ⚠ `downloadFromNetwork`는 **필수 인자**다(§6.1-④). 옵셔널로 두면 어댑터 구현자가
   * 플랫폼 기본값(Expo legacy API는 `true`)을 흘려 iCloud 원본을 무단으로 셀룰러 다운로드한다 —
   * 전신이 실제로 겪은 사고다.
   * 타임아웃(15s / 60s)도 core가 건다 — 어댑터는 순수 위임(§7 하드닝 6).
   */
  getAssetInfo(
    assetId: string,
    input: { readonly downloadFromNetwork: boolean },
  ): Promise<DeviceAssetInfo>;
}

/**
 * `DeviceLibrary.resolveForUpload`의 결과 — 업로드 가능한 바이트의 위치(§5.4-④).
 * 전신 `DeviceAssetUploadSource`(devicePhotoLibrary.ts:255-259).
 */
export type ResolvedDeviceAsset = {
  readonly uri: string;
  readonly verifiedSizeBytes?: number | undefined;
  /** ⚠ 전신 그대로 `null` 가능이다. `PickedAsset.exif`로 옮길 때 undefined 정규화가 필요하다. */
  readonly exif: Readonly<Record<string, unknown>> | null;
  /** 스테이징 사본이면 true — 업로드 후 `StagingCache.cleanup` 대상(§7 하드닝 7). */
  readonly staged: boolean;
};

/** `DeviceLibrary.resolvePickedAsset` / `toPickedAsset`의 결과(§5.4-④). */
export type ResolvedPickedAsset = PickedAsset & { readonly staged: boolean };

// ── ⑧ 기기 저장 ("./save") — 판별 유니언(§6.1-⑦) ────────────────────────────
export interface MediaLibrarySaveAdapter {
  requestWritePermission(): Promise<MediaPermission>;
  saveToLibrary(uri: string): Promise<void>;
  /**
   * Android Expo Go는 사진 권한 요청 자체가 불가 — 그 판정을 어댑터가 정적으로 노출한다
   * (전신 saveImages.ts:96). `expo-constants` 의존을 라이브러리에서 완전히 제거하는 지점(§0.2):
   * `Constants.appOwnership === 'expo'` 판정은 호스트가 하고 값만 넘긴다.
   */
  readonly skipPermissionRequest: boolean;
}

export interface BrowserSaveAdapter {
  /**
   * DOM 접근을 어댑터 안에 가둔다. `document`/`fetch`는 `"./web"`에서 **필수 주입**(§6.1-⑬) —
   * 전신은 미주입 시 `globalThis.document`로 폴백해 네이티브에서도 조용히 생성됐다.
   */
  saveByDownload(input: { readonly url: string; readonly fileName: string }): Promise<void>;
}

/**
 * 저장 타깃(§6.1-⑦).
 * 전신은 `platformOS:'web'` + `mediaLibrary` 동시 주입이 통과했고, 결과로 보고되는 `mode`와
 * 실제 동작이 어긋날 수 있었다. 판별 유니언이면 무효 조합이 **표현 불가능**해지고
 * `SaveResult.mode`가 `target.kind`에서 파생되므로 보고와 실동작이 어긋날 수 없다.
 */
export type SaveTarget =
  | {
      readonly kind: 'media-library';
      readonly files: FileSystemAdapter & FileDownloadAdapter;
      readonly library: MediaLibrarySaveAdapter;
    }
  | { readonly kind: 'browser-download'; readonly browser: BrowserSaveAdapter };
