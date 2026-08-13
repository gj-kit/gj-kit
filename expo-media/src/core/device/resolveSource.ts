// 설계 문서 §7 하드닝 2(PhotoKit ph:// 핸드오프) · 하드닝 6(iCloud 원본 미다운로드 + 이중
// 타임아웃) · §7.1(정보 조회 실패 2조건)의 **정책 거처**.
//
// 전신 `packages/photo-kit/src/devicePhotoLibrary.ts`의
//   `getDeviceAssetInfo` / `normalizeDeviceAssetUploadUri` / `resolveDeviceAssetSourceForUpload`
// 세 함수를 계승한다. 전신에서는 이 세 함수가 네이티브 모듈을 직접 import했기 때문에 정책만
// 따로 검증할 수 없었다 — I/O를 전부 어댑터로 밀어내면서 순수 코어로 하강했고, 그 결과
// 하드닝 2·6이 처음으로 페이크 fs 위에서 직접 단위 검증된다(§7 표의 "지키는 테스트" 열).
//
// ⚠ 이 파일의 규율(§1-2): DOM 전역 0 · 런타임 의존성 0. I/O는 전부 주입받은 어댑터로만 한다.

import type {
  DeviceAssetInfo,
  DeviceAssetRef,
  DeviceLibraryAdapter,
  FileSystemAdapter,
  PlatformAdapter,
  ResolvedDeviceAsset,
} from '../adapters';
import type { MediaDebugLogger } from '../debug';
import { isPhotoKitUri, summarizeUri } from '../debug';
import { MediaError } from '../errors';
import type { StagingCache } from '../staging';
import type { MediaStrings } from '../strings';

// ── 호스트 전역 타이머 차용 ───────────────────────────────────────────────────
// ⚠ `tsconfig.core.json`의 `lib:["ES2022"]`에는 타이머 전역이 **없다**(§2.4 실측 —
// 미해석 식별자 7종에 `setTimeout`×2·`clearTimeout`×1이 포함돼 있었다). 해소 선택지는 셋이었다:
//   (i) 코어에서 DOM lib을 켠다 → §2.4가 세운 무DOM 규율이 통째로 무너진다.
//   (ii) 타이머를 어댑터 seam으로 올린다 → 3자 어댑터가 하드닝 6의 데드라인을 통째로
//        빠뜨릴 수 있다. §5.4.1-10이 "타임아웃을 거는 주체는 core다"라고 못 박은 이유가 그것이다.
//   (iii) **타입 전용 선언으로 호스트 전역을 빌린다**(채택).
// `declare`는 JS를 방출하지 않으므로 런타임에는 그대로 호스트 전역 타이머이며,
// unit(가짜 타이머)이 그것을 갈아끼워 15s/60s 데드라인을 실시간 대기 없이 검증한다.
declare const setTimeout: (handler: () => void, ms: number) => unknown;
declare const clearTimeout: (handle: unknown) => void;

/** 전신 devicePhotoLibrary.ts:15 — 자산 정보 조회 데드라인(§5.4.1-10). */
export const DEVICE_ASSET_INFO_TIMEOUT_MS = 15_000;
/** 전신 devicePhotoLibrary.ts:16 — iCloud 원본 다운로드 데드라인(§5.4.1-10). */
export const DEVICE_ASSET_NETWORK_DOWNLOAD_TIMEOUT_MS = 60_000;

/**
 * Private wrapper for a rejection that came from a host `DeviceLibraryAdapter`.
 *
 * `MediaError` deliberately uses a global symbol so copies of this package can classify each
 * other’s errors. That makes it useful to callers, but it is not a trust boundary: an adapter can
 * construct or forge one with a signed URL in its message. Keep the raw value inside this module
 * only long enough for debug sanitization and never use its public brand to make policy decisions.
 */
class DeviceAssetInfoAdapterFailure {
  constructor(readonly cause: unknown) {}
}

const MAX_EXIF_SNAPSHOT_DEPTH = 8;
const MAX_EXIF_SNAPSHOT_ENTRIES = 256;

/**
 * Copy the adapter-owned EXIF graph before it crosses the device boundary.
 *
 * Device adapters are application code. Returning their object verbatim leaves getters and
 * Proxies live after `getAssetInfo()` resolves, which means a later metadata read can throw an
 * adapter-owned error (and potentially echo a signed URL) outside the normal error boundary.
 * EXIF needs only JSON-shaped values for this package's metadata parser, so take a bounded,
 * frozen snapshot instead of retaining a host object. EXIF is optional, however: an unfamiliar
 * Core Image value must be dropped rather than making an otherwise uploadable local URI fail.
 */
function snapshotExifValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value;
  }
  if (typeof value !== 'object' || depth >= MAX_EXIF_SNAPSHOT_DEPTH || seen.has(value)) {
    throw new TypeError('Invalid device EXIF value');
  }
  seen.add(value);

  if (Array.isArray(value)) {
    if (value.length > MAX_EXIF_SNAPSHOT_ENTRIES) {
      throw new TypeError('Device EXIF array is too large');
    }
    const snapshot: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      snapshot.push(snapshotExifValue(value[index], depth + 1, seen));
    }
    return Object.freeze(snapshot);
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Invalid device EXIF record');
  }
  const keys = Object.keys(value);
  if (keys.length > MAX_EXIF_SNAPSHOT_ENTRIES) {
    throw new TypeError('Device EXIF record is too large');
  }
  const snapshot: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    snapshot[key] = snapshotExifValue(record[key], depth + 1, seen);
  }
  return Object.freeze(snapshot);
}

/** Snapshot and validate a successful host response while its adapter boundary is still active. */
function snapshotDeviceAssetInfo(value: unknown): DeviceAssetInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Invalid device asset info');
  }
  const record = value as Record<string, unknown>;
  // Read each field exactly once. In particular, do not validate a getter and then read it again
  // into the returned value: a Proxy can return a safe value on the first access and a URL on the
  // second one.
  const localUri = record['localUri'];
  const uri = record['uri'];
  const isNetworkAsset = record['isNetworkAsset'];
  if (
    (localUri !== undefined && typeof localUri !== 'string') ||
    (uri !== undefined && typeof uri !== 'string') ||
    typeof isNetworkAsset !== 'boolean'
  ) {
    throw new TypeError('Invalid device asset info');
  }
  let exifSnapshot: Readonly<Record<string, unknown>> | undefined;
  try {
    // This read and clone are deliberately isolated. Adapter EXIF is optional metadata, not a
    // capability required to resolve bytes. A hostile getter or a native-only value is discarded
    // without exposing its exception or sacrificing an otherwise valid asset.
    const exif = record['exif'];
    exifSnapshot = exif === undefined ? undefined : snapshotExifRecord(exif);
  } catch {
    exifSnapshot = undefined;
  }
  return Object.freeze({
    ...(localUri !== undefined ? { localUri } : {}),
    ...(uri !== undefined ? { uri } : {}),
    ...(exifSnapshot !== undefined ? { exif: exifSnapshot } : {}),
    isNetworkAsset,
  });
}

function snapshotExifRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Invalid device EXIF record');
  }
  const snapshot = snapshotExifValue(value, 0, new WeakSet<object>());
  if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
    throw new TypeError('Invalid device EXIF record');
  }
  return snapshot as Readonly<Record<string, unknown>>;
}

/**
 * 기기 자산 해석 옵션(§5.4-④).
 *
 * ⚠ `downloadFromICloud` 기본 false — 전신 주석(devicePhotoLibrary.ts:48-50) 그대로다:
 * "사용자가 직접 시작한 수동 업로드만 iCloud 전용 원본 가져오기에 옵트인할 수 있다.
 *  백그라운드 동기화는 예기치 않은 셀룰러 전송을 절대 시작하지 않도록 기본값 false를 유지한다."
 */
export type DeviceResolveOptions = {
  readonly downloadFromICloud?: boolean | undefined;
  readonly onICloudDownload?: ((downloading: boolean) => void) | undefined;
  readonly extraCandidates?: readonly (string | null | undefined)[] | undefined;
  readonly infoTimeoutMs?: number | undefined; // 기본 15_000
  readonly downloadTimeoutMs?: number | undefined; // 기본 60_000
};

/** `normalizeUploadUri`가 고른 업로드 가능한 바이트의 위치. */
export type NormalizedUploadUri = {
  readonly uri: string;
  /**
   * 캐시 사본을 stat해 얻은 실측 크기 — 같은 파일을 두 번 stat하지 않게 여기서 들고 나간다
   * (전신 devicePhotoLibrary.ts:42-44 주석 계승). 신뢰도 서열은 §7 하드닝 3.
   */
  readonly verifiedSizeBytes?: number | undefined;
  /** 스테이징 사본이면 true — 업로드 후 `StagingCache.cleanup` 대상(§7 하드닝 7). */
  readonly staged: boolean;
};

/** 해석 경로가 필요로 하는 seam 전부. 팩토리가 한 번 조립해 재사용한다. */
export type DeviceResolveDeps = {
  readonly adapter: DeviceLibraryAdapter;
  readonly files: FileSystemAdapter;
  readonly staging: StagingCache;
  readonly platform: PlatformAdapter;
  readonly strings: MediaStrings;
  readonly debug: MediaDebugLogger;
};

/**
 * 전신 `isUsableDeviceUri`(devicePhotoLibrary.ts:26-28).
 *
 * ⚠ **`ph://`는 여기서 탈락한다 — 복사 시도조차 하지 않는다**(§7 하드닝 2-②).
 * iOS에서 `asset.uri`가 정확히 `ph://`이므로 이 스킵이 없으면 매 업로드마다
 * `files.copy({ from: 'ph://…' })`라는 무의미한 네이티브 왕복이 발생하고,
 * 후보가 `ph://` 하나뿐일 때는 **실패 종류 자체가 달라진다**(복사 실패 → 후보 소진이 아니라
 * `device-not-found`가 나와야 한다).
 */
function isUsableDeviceUri(uri?: string | null): uri is string {
  return Boolean(uri) && !isPhotoKitUri(uri);
}

/** 전신 devicePhotoLibrary.ts:30-32. */
function isFileUri(uri: string): boolean {
  return uri.startsWith('file://');
}

/**
 * 후보 목록에서 **업로드 가능한 로컬 파일**을 만들어 낸다(§7 하드닝 2).
 *
 * 규칙 4개 — 순서가 곧 계약이다:
 *   ① 후보 순서는 호출자가 준 순서 그대로 순회한다(`localUri → uri → 자동 후보 → extraCandidates`).
 *   ② `ph://` 후보는 루프 첫 줄에서 탈락 — 위 `isUsableDeviceUri` 참조.
 *   ③ `file://` 이면서 **비-iOS**일 때만 직행한다. iOS는 `file://` 여도 반드시 캐시로 카피한다.
 *      전신 주석(devicePhotoLibrary.ts:106-110) 전문:
 *        "MediaLibrary의 iOS `localUri`는 흔히 이 앱의 컨테이너가 아니라 사진 라이브러리 안을
 *         가리킨다. stat은 성공하지만 업로더에 넘기면 네이티브 URLSession을 종료시킨다.
 *         업로드 작업이 안정적인 샌드박스 소스 파일을 소유하도록 먼저 우리 캐시에 실체화한다.
 *         Android의 로컬 파일 URI에는 이 PhotoKit 핸드오프 문제가 없다."
 *   ④ 카피 실패는 **다음 후보로 진행**한다 — 사용자에게 업로드 실패를 표면화하기 전에
 *      남은 후보를 전부 시도한다(전신 devicePhotoLibrary.ts:157 주석).
 */
export async function normalizeUploadUri(
  asset: DeviceAssetRef,
  candidates: readonly (string | null | undefined)[],
  deps: Pick<DeviceResolveDeps, 'files' | 'platform' | 'staging' | 'debug'>,
): Promise<NormalizedUploadUri | null> {
  const { files, platform, staging, debug } = deps;
  debug.log('upload-uri.normalize.start', {
    assetId: asset.id,
    fileName: asset.filename,
    candidates: candidates.map((candidate) => summarizeUri(candidate)),
  });

  for (const [index, uri] of candidates.entries()) {
    if (!isUsableDeviceUri(uri)) continue;

    if (isFileUri(uri) && platform.os !== 'ios') {
      debug.log('upload-uri.normalize.file-candidate', {
        assetId: asset.id,
        fileName: asset.filename,
        candidateIndex: index,
        uri: summarizeUri(uri),
      });
      return { uri, staged: false };
    }

    const destination = staging.uriFor(asset);
    // 쓸 수 있는 캐시 디렉토리가 없는 기기 — 카피가 불가능하므로 다음 후보로.
    if (!destination) continue;

    try {
      debug.log('upload-uri.copy.start', {
        assetId: asset.id,
        fileName: asset.filename,
        candidateIndex: index,
        from: summarizeUri(uri),
        to: summarizeUri(destination),
      });
      await files.copy({ from: uri, to: destination });
      const stat = await files.stat(destination);
      debug.log('upload-uri.copy.done', {
        assetId: asset.id,
        fileName: asset.filename,
        candidateIndex: index,
        kind: stat.kind,
        size: stat.kind === 'file' ? stat.sizeBytes : undefined,
      });
      if (stat.kind === 'file') {
        return {
          uri: destination,
          // 0바이트는 "확인된 크기"가 아니다 — 전신 devicePhotoLibrary.ts:143-146의
          // `size > 0` 판정을 보존한다. 여기서 undefined로 두면 §7 하드닝 3의
          // 다음 순위(file-system stat → reported)로 자연히 내려간다.
          verifiedSizeBytes: stat.sizeBytes > 0 ? stat.sizeBytes : undefined,
          staged: true,
        };
      }
    } catch (error) {
      debug.error('upload-uri.copy.failed', error, {
        assetId: asset.id,
        fileName: asset.filename,
        candidateIndex: index,
        from: summarizeUri(uri),
        to: summarizeUri(destination),
      });
      // 다음 후보를 시도한다 — 사용자에게 업로드 실패를 표면화하기 전에.
    }
  }

  debug.log('upload-uri.normalize.empty', {
    assetId: asset.id,
    fileName: asset.filename,
  });
  return null;
}

/**
 * 데드라인을 건 자산 정보 조회(§7 하드닝 6).
 *
 * ⚠ **타임아웃을 거는 주체는 core다.** 어댑터는 `getAssetInfo(id, { downloadFromNetwork })`
 * 순수 위임만 한다(§3.3 · §5.4.1-10). 어댑터 소관으로 넘기면 3자 구현이 통째로 빠뜨리고,
 * 그 순간 "응답 없는 PhotoKit 조회"가 업로드 큐를 영구 정지시킨다.
 *
 * 전신 주석(devicePhotoLibrary.ts:59-61) 계승: "레거시 API는 이 옵션의 기본값이 true다.
 * 일반 경로는 로컬 상태를 먼저 조회하며, 전경 업로드의 명시적 옵트인만이 iCloud 원본을
 * 요청할 수 있다 — 그것도 자기 데드라인을 달고."
 */
function deviceAssetInfoFailure(input: {
  readonly strings: MediaStrings;
  readonly platform?: PlatformAdapter | undefined;
}): MediaError {
  // The supported non-native adapter intentionally has no device asset source. Reconstruct the
  // public error from this library’s strings instead of trusting the adapter’s branded Error.
  if (input.platform?.os === 'web') {
    return new MediaError('platform-unsupported', input.strings.platformUnsupported);
  }
  return new MediaError('device-library-failed', input.strings.deviceLibraryFailed);
}

function getDeviceAssetInfoAttempt(input: {
  readonly adapter: DeviceLibraryAdapter;
  readonly strings: MediaStrings;
  readonly assetId: string;
  readonly downloadFromNetwork: boolean;
  readonly infoTimeoutMs?: number | undefined;
  readonly downloadTimeoutMs?: number | undefined;
}): Promise<DeviceAssetInfo> {
  const { adapter, strings, assetId, downloadFromNetwork } = input;
  const timeoutMs = downloadFromNetwork
    ? (input.downloadTimeoutMs ?? DEVICE_ASSET_NETWORK_DOWNLOAD_TIMEOUT_MS)
    : (input.infoTimeoutMs ?? DEVICE_ASSET_INFO_TIMEOUT_MS);

  // Promise.resolve().then also turns a synchronously throwing host implementation into the same
  // private failure channel as a rejected Promise.
  const infoPromise = Promise.resolve().then(() =>
    adapter.getAssetInfo(assetId, { downloadFromNetwork }),
  );

  return new Promise<DeviceAssetInfo>((resolve, reject) => {
    const timer = setTimeout(() => {
      // 문구가 둘로 갈리므로 분기마다 `strings.` 멤버 접근을 인라인한다(§4 · string-guard).
      reject(
        downloadFromNetwork
          ? new MediaError('device-timeout', strings.iCloudDownloadTimeout)
          : new MediaError('device-timeout', strings.deviceInfoTimeout),
      );
    }, timeoutMs);
    void infoPromise.then(
      (info) => {
        clearTimeout(timer);
        try {
          resolve(snapshotDeviceAssetInfo(info));
        } catch (error) {
          reject(new DeviceAssetInfoAdapterFailure(error));
        }
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(new DeviceAssetInfoAdapterFailure(error));
      },
    );
  });
}

/**
 * Public-safe asset-info lookup. Host adapter failures are always reconstructed from injected
 * strings; only the core-owned deadline retains its more specific `device-timeout` code.
 */
export async function getDeviceAssetInfoWithDeadline(input: {
  readonly adapter: DeviceLibraryAdapter;
  readonly strings: MediaStrings;
  readonly platform?: PlatformAdapter | undefined;
  readonly assetId: string;
  readonly downloadFromNetwork: boolean;
  readonly infoTimeoutMs?: number | undefined;
  readonly downloadTimeoutMs?: number | undefined;
}): Promise<DeviceAssetInfo> {
  try {
    return await getDeviceAssetInfoAttempt(input);
  } catch (error) {
    if (error instanceof DeviceAssetInfoAdapterFailure) {
      throw deviceAssetInfoFailure(input);
    }
    // This branch is a `MediaError('device-timeout')` constructed in the attempt above, or an
    // internal runtime failure before a host adapter is called. The public method never exposes
    // the adapter’s global-brand value because attempts wrap it first.
    throw error;
  }
}

/**
 * 하드닝된 "기기 자산 → 업로드 가능한 로컬 파일" 해석. 인앱 피커 시트와 자동 동기화 엔진이
 * 공유한다(전신 devicePhotoLibrary.ts:259-262 주석). 기본값에는 조용한 네트워크 다운로드가
 * 없고, 전경의 사용자 개시 업로드만 옵트인할 수 있다. 두 경로 모두 조회에 데드라인을 걸고
 * iOS 파일은 우리 캐시에 실체화한다.
 *
 * ⚠ **정보 조회 실패 2조건**(§7.1 [개정] · §5.4-④(b)):
 *   ① core가 만든 데드라인(`device-timeout`)은 폴백 후보 유무와 무관하게 항상 재throw한다.
 *      이를 후보로 삼켜버리면 15s/60s 하드닝이 조용히 무력화되고 사용자는 재시도 가능한
 *      원인을 알 수 없다.
 *   ② host adapter 실패는 후보가 있으면 생존하고, 없으면 새 `device-library-failed`로
 *      정규화한다. `MediaError`의 global brand는 사본 간 분류용이지 신뢰 경계가 아니므로,
 *      adapter가 던진 branded error/message를 재throw해서는 안 된다.
 *
 * ⚠ `extraCandidates`는 **정보 조회와 무관하게 존재하는 후보**만 센다. 조회가 실패하면
 * `info.localUri`·`info.uri`는 애초에 없으므로 생존 판정의 근거가 될 수 없다.
 * `resolvePickedAsset`이 `asset.uri`를 자동으로 덧붙이는 것(§7.1 [신설])이 이 규칙을
 * 실제로 발화시키는 값이다.
 */
export async function resolveDeviceAssetSource(
  deps: DeviceResolveDeps,
  asset: DeviceAssetRef,
  extraCandidates: readonly (string | null | undefined)[],
  options: DeviceResolveOptions,
): Promise<ResolvedDeviceAsset> {
  const { adapter, strings, debug } = deps;
  let info: DeviceAssetInfo | undefined;

  try {
    info = await getDeviceAssetInfoAttempt({
      adapter,
      strings,
      assetId: asset.id,
      downloadFromNetwork: false,
      infoTimeoutMs: options.infoTimeoutMs,
      downloadTimeoutMs: options.downloadTimeoutMs,
    });
    debug.log('upload-asset.info.done', {
      assetId: asset.id,
      fileName: asset.filename,
      localUri: summarizeUri(info.localUri),
      infoUri: summarizeUri(info.uri),
      hasExif: Boolean(info.exif),
      isNetworkAsset: info.isNetworkAsset,
    });
  } catch (error) {
    const cause = error instanceof DeviceAssetInfoAdapterFailure ? error.cause : error;
    debug.error('upload-asset.info.failed', cause, {
      assetId: asset.id,
      fileName: asset.filename,
    });
    if (!(error instanceof DeviceAssetInfoAdapterFailure)) throw error;
    // `./device` on web deliberately has no asset source. Do not let its stable unsupported
    // outcome disappear behind a caller-provided file candidate merely because adapter failures
    // are otherwise eligible for native fallback.
    if (deps.platform.os === 'web') {
      throw deviceAssetInfoFailure({ strings, platform: deps.platform });
    }
    if (extraCandidates.length === 0) {
      throw deviceAssetInfoFailure({ strings, platform: deps.platform });
    }
  }

  if (info?.isNetworkAsset) {
    debug.log('upload-asset.info.network-only', {
      assetId: asset.id,
      fileName: asset.filename,
    });
    if (!options.downloadFromICloud) {
      throw new MediaError('device-icloud-only', strings.iCloudOnly);
    }
    try {
      options.onICloudDownload?.(true);
    } catch (error) {
      debug.error('upload-asset.info.network-download.notify.failed', error, {
        assetId: asset.id,
        fileName: asset.filename,
      });
      throw new MediaError('device-library-failed', strings.deviceLibraryFailed);
    }
    try {
      info = await getDeviceAssetInfoWithDeadline({
        adapter,
        strings,
        platform: deps.platform,
        assetId: asset.id,
        downloadFromNetwork: true,
        infoTimeoutMs: options.infoTimeoutMs,
        downloadTimeoutMs: options.downloadTimeoutMs,
      });
      debug.log('upload-asset.info.network-download.done', {
        assetId: asset.id,
        fileName: asset.filename,
        localUri: summarizeUri(info.localUri),
        infoUri: summarizeUri(info.uri),
      });
    } finally {
      // ⚠ finally 보장(§7 하드닝 6). 다운로드가 실패하든 데드라인을 넘기든 호스트의
      // "iCloud에서 가져오는 중" 표시는 반드시 꺼진다 — 아니면 화면이 영구히 스피너를 문다.
      try {
        options.onICloudDownload?.(false);
      } catch (error) {
        // A UI callback is an observer, never an authority over upload resolution. In particular,
        // do not replace a typed deadline/upload error with a host callback’s raw message.
        debug.error('upload-asset.info.network-download.notify.failed', error, {
          assetId: asset.id,
          fileName: asset.filename,
        });
      }
    }
  }

  const resolved = await normalizeUploadUri(
    asset,
    [info?.localUri, info?.uri, ...extraCandidates],
    deps,
  );
  if (!resolved) {
    throw new MediaError('device-not-found', strings.fileNotFound);
  }

  debug.log('upload-asset.resolve.done', {
    assetId: asset.id,
    fileName: asset.filename,
    uri: summarizeUri(resolved.uri),
    verifiedSizeBytes: resolved.verifiedSizeBytes,
    staged: resolved.staged,
  });

  return {
    uri: resolved.uri,
    verifiedSizeBytes: resolved.verifiedSizeBytes,
    // ⚠ 전신 그대로 `null` 가능이다(devicePhotoLibrary.ts:337). `PickedAsset.exif`로 옮길 때
    //   undefined 정규화가 필요하며 그 지점은 `toPickedAsset`이다(§5.4-④).
    exif: info?.exif ?? null,
    staged: resolved.staged,
  };
}
