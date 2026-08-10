// ═══════════════════════════════════════════════════════════════════════════
// `"."` 엔트리 — 설계 문서 §2.2 · §5.5. **골든패스.**
//
// 내용물: `"./core"` 전체 재export + `createMediaKit` + expo 기본 어댑터.
// peer: `react-native` · `expo-file-system`(+`/legacy`) **둘뿐**이다.
//
// ⚠ **불변식(§2.2): `"."`은 `"./picker"`·`"./device"`·`"./save"`·`"./video"`·`"./web"`을
//   import하지 않는다.** 단방향이며, 조합은 소비자가 `with*`로 한다. 이 규율이 곧
//   optional peer 격리의 정적 근거다(§3.2) — 여기서 기기 라이브러리 peer를 **문자열로도**
//   포함하지 않으므로, Metro는 그 패키지를 해석 시도조차 하지 않는다.
//   `dist-peer-graph` 가드가 이 표를 산출물과 대조한다(§10.3).
//
// ⚠ 이 규율을 깨는 가장 흔한 방식은 "편의를 위해 `expoPicker`를 여기서도 재export"다.
//   그 한 줄이 피커 peer를 골든패스의 정적 그래프에 넣고, 피커를 쓰지 않는
//   백그라운드 동기화 앱까지 그 peer를 설치하게 만든다.
// ═══════════════════════════════════════════════════════════════════════════

// ─── `"./core"` 전체 재export (§5.5) ────────────────────────────────────────
// 명시 나열이 아니라 `export *`인 이유: `"."`의 공개 표면은 정의상 **`"./core"`의 전량 + 아래**이고,
// 손으로 나열하면 코어가 심볼을 추가할 때마다 두 배럴이 조용히 어긋난다.
export * from './core';

import type {
  BinaryTransport,
  BinarySourceLoader,
  DeviceLibraryAdapter,
  FileDownloadAdapter,
  FileSystemAdapter,
  HashAdapter,
  LocalFileTransport,
  BinaryPosterAdapter,
  LocalPosterAdapter,
  MediaLibrarySaveAdapter,
  PickerAdapter,
  PlatformAdapter,
  PutRequest,
} from './core/adapters';
import type { DeviceLibrary } from './core/device/deviceLibrary';
import { createDeviceLibrary } from './core/device/deviceLibrary';
import type { MediaSaver } from './core/save/saver';
import { createMediaSaver } from './core/save/saver';
import type { StagingCache } from './core/staging';
import { createStagingCache } from './core/staging';
import type { BinaryUploads } from './core/upload/binary';
import { createBinaryUploads } from './core/upload/binary';
import type { DeviceUploads } from './core/upload/deviceUploads';
import { createDeviceUploads } from './core/upload/deviceUploads';
import type { PickerFlows } from './core/upload/pickerFlows';
import { createPickerFlows } from './core/upload/pickerFlows';
import type { LocalUploads, MediaUploadConfig } from './core/upload/uploader';
import { createLocalUploads } from './core/upload/uploader';
import { createExpoFileSystem } from './expo/fileSystem';
import { createExpoHasher } from './expo/hasher';
import { createExpoLocalFileTransport } from './expo/localTransport';
import { expoPlatform } from './expo/platform';

// ─── expo 기본 어댑터 (§5.5) ────────────────────────────────────────────────
export { expoPlatform } from './expo/platform';
export { createExpoFileSystem } from './expo/fileSystem';
export { createExpoLocalFileTransport } from './expo/localTransport';
export { createExpoHasher } from './expo/hasher';

/**
 * 호스트 전역 `fetch` 차용.
 *
 * ⚠ `tsconfig.core.json`(`lib:["ES2022"]`)이 `src/web*` **밖의 전 소스**를 검사하므로 여기에는
 * DOM 전역 선언이 없다(§2.4). 해소는 코어 `resolveSource.ts`가 타이머에 쓴 것과 같은 채택안이다 —
 * **타입 전용 선언으로 호스트 전역을 빌린다**. `declare`는 JS를 방출하지 않으므로 런타임에는
 * 그대로 RN/브라우저의 전역 fetch다.
 *
 * 여기 적은 형태는 이 파일이 실제로 쓰는 최소치이며, DOM `fetch`의 대체 선언이 아니다.
 */
declare const fetch: (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Readonly<Record<string, string>>;
    readonly body: ArrayBuffer;
  },
) => Promise<{ readonly status: number }>;

/**
 * `BinaryTransport`의 기본 구현 — 전역 `fetch` 기반 PUT.
 *
 * ⚠ `"./web"`의 `createFetchBinaryTransport`와 **역할이 다르다.** 저쪽은 `fetch`를 주입받는
 * DOM 엔트리의 구현이고, 이쪽은 골든패스가 아무 조립 없이도 동작하게 하는 기본값이다.
 * peer는 늘지 않는다 — RN도 브라우저도 fetch를 전역으로 갖는다.
 *
 * ⚠ **로컬 파일 업로드에는 쓰지 않는다.** 바이트를 JS 힙으로 올리는 순간 §7 하드닝 1이
 * 지키려던 것(대용량 파일의 네이티브 스트리밍)이 사라진다. 로컬 URI의 정본은
 * `createExpoLocalFileTransport`뿐이고, 이 전송은 이미 메모리에 있는 바이너리
 * (웹 Blob·포스터 프레임)만 다룬다.
 */
export function createExpoBinaryTransport(): BinaryTransport {
  return {
    async putBinary(input: PutRequest & { readonly body: { arrayBuffer(): Promise<ArrayBuffer> } }) {
      const response = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: await input.body.arrayBuffer(),
      });
      // status만 올린다 — 2xx 판정·재시도·에러 문구는 전부 코어 소관이다(§3.3 "어댑터는 순수 위임").
      return { status: response.status };
    },
  };
}

// ─── 골든패스 (§5.5) ────────────────────────────────────────────────────────

/** 스테이징 네임스페이스 기본값(§5.5). `/^[a-z0-9][a-z0-9-]{1,30}$/`를 만족한다(§5.3). */
const DEFAULT_NAMESPACE = 'gj-media';

export type MediaKitConfig<TAsset, TCollectionId extends string = string> = Omit<
  MediaUploadConfig<TAsset, TCollectionId>,
  'platform'
> & {
  /**
   * expo 기본 어댑터 위의 **선택 오버라이드**. 각 필드는 개별 교체이며 부분 객체가 아니다 —
   * `platform`만 갈아끼우고 나머지는 기본값을 그대로 쓰는 조합이 정상이다.
   */
  readonly platform?: PlatformAdapter | undefined;
  readonly files?: FileSystemAdapter | undefined;
  readonly localTransport?: LocalFileTransport | undefined;
  readonly binaryTransport?: BinaryTransport | undefined;
  readonly hasher?: HashAdapter | undefined;
  /** 네이티브 경로(로컬 URI → 포스터). 보통 `expoVideoPoster()`(`"./video"`). */
  readonly poster?: LocalPosterAdapter | undefined;
  /**
   * 바이너리 경로(Blob → 포스터). 보통 `webCanvasVideoPoster()`(`"./web"`).
   *
   * ⚠ `poster`와 **입력 타입이 달라 자리를 바꿔 끼우면 컴파일 에러**가 나는 것이 설계다(§6.1-⑥).
   *   그래서 필드도 둘로 나뉜다 — 하나로 합치면 그 검출력이 사라진다.
   * ⚠ 주지 않으면 **웹 동영상에 포스터가 붙지 않는다.** 전신 uploader.ts:566-569는
   *   `posterBlob === undefined`일 때 `createWebVideoPosterBlob(blob)`으로 자동 추출했으므로,
   *   웹 업로드 경로가 있는 앱이 이 필드를 비우면 그 동작이 조용히 사라진다.
   *   (호출자가 `uploadBinary({ poster })`로 직접 주는 경로는 이 필드와 무관하게 항상 동작한다.)
   */
  readonly binaryPoster?: BinaryPosterAdapter | undefined;
  readonly posterAtMs?: number | undefined;
  /** 스테이징 네임스페이스. 기본 `'gj-media'`. `/^[a-z0-9][a-z0-9-]{1,30}$/`(§5.3). */
  readonly namespace?: string | undefined;
};

/**
 * 골든패스 킷. expo 기본 어댑터(platform·files·localTransport·binaryTransport·hasher·staging)가
 * 이미 채워져 있다.
 *
 * ⚠ 선택 능력은 **구체 킷을 반환하는 `with*`**로 부착한다(§3.1). `with*`는 자기 자신을 넓히지
 * 않고 새 객체를 반환하므로 조건부 타입이 0이다 — V3가 실측한 "타입 애노테이션 한 번에 전 기능이
 * 소멸하는" 붕괴가 **표현 불가능**하다.
 */
export interface MediaKit<TAsset, TCollectionId extends string = string>
  extends LocalUploads<TAsset, TCollectionId>,
    BinaryUploads<TAsset, TCollectionId> {
  readonly platform: PlatformAdapter;
  readonly files: FileSystemAdapter;
  readonly staging: StagingCache;
  /**
   * ⚠ **공개 필드다**(V9 요구). memorylog2 `src/sync/hashFile.ts`가 `hashLocalFile`을 재export하고
   * `src/sync/uploadAsset.ts:14,22`가 그것을 쓴다. 이 필드가 없으면 앱 어댑터가 위임할 대상이
   * 없어 동기화 엔진이 해시 함수를 잃는다(§5.7.2-⑦).
   */
  readonly hasher: HashAdapter;

  withPicker(
    picker: PickerAdapter,
    /**
     * 웹에서 피커 자산을 업로드하는 앱은 `loader`만 주면 된다 — `uploads`는 킷 자신
     * (`BinaryUploads`)이 채운다. 생략 시 웹 피커 업로드는 `platform-unsupported`다(§5.7.4).
     */
    options?: { readonly web?: { readonly loader: BinarySourceLoader } | undefined } | undefined,
  ): PickerFlows<TAsset, TCollectionId>;
  withDeviceLibrary(adapter: DeviceLibraryAdapter): DeviceKit<TAsset, TCollectionId>;
  withDeviceSave(adapter: MediaLibrarySaveAdapter): MediaSaver;
}

/** `DeviceLibrary` + `DeviceUploads`를 한 객체로 — staging·files는 `MediaKit`이 공급한다(§5.5). */
export interface DeviceKit<TAsset, TCollectionId extends string = string>
  extends DeviceLibrary,
    DeviceUploads<TAsset, TCollectionId> {}

/**
 * `SaveTarget`의 `media-library` 분기는 `FileSystemAdapter & FileDownloadAdapter`를 요구하는데
 * (§3.3), `MediaKitConfig.files`는 `FileSystemAdapter`만 요구한다(§5.5 확정 시그니처).
 * 기본 어댑터(`createExpoFileSystem`)는 둘 다 만족하므로 골든패스는 그대로이고,
 * **files를 직접 교체한 소비자만** 다운로드 능력을 갖춰야 한다.
 *
 * ⚠ 타입으로 올리면 §5.5 시그니처가 바뀌므로 조립 시점에 런타임으로 확인해 **즉사**시킨다 —
 * 조용히 `undefined is not a function`으로 죽는 것보다 원인을 말하는 실패가 낫다(§6.1).
 * `MediaStrings`에 대응 키가 없는 **개발자 대상 단언**이라 plain Error다
 * (`createMediaSaver`의 "쓸 수 있는 디렉토리 없음"과 같은 부류).
 */
function requireDownloadableFiles(files: FileSystemAdapter): FileSystemAdapter & FileDownloadAdapter {
  if (typeof (files as Partial<FileDownloadAdapter>).download !== 'function') {
    throw new Error(
      'createMediaKit({ files }) must also implement FileDownloadAdapter to use withDeviceSave().',
    );
  }
  return files as FileSystemAdapter & FileDownloadAdapter;
}

export function createMediaKit<TAsset, TCollectionId extends string = string>(
  config: MediaKitConfig<TAsset, TCollectionId>,
): MediaKit<TAsset, TCollectionId> {
  const platform = config.platform ?? expoPlatform();
  const files = config.files ?? createExpoFileSystem();
  const localTransport = config.localTransport ?? createExpoLocalFileTransport();
  const binaryTransport = config.binaryTransport ?? createExpoBinaryTransport();
  // 해시 어댑터를 주지 않은 소비자도 dedup을 얻는다 — 기본값이 이미 동작하는 것이 골든패스다(§9).
  // ⚠ 킷이 만든 `files`를 그대로 넘긴다. 새로 만들면 캐시 디렉토리 판정이 두 벌 생긴다.
  const hasher = config.hasher ?? createExpoHasher({ files });
  // ⚠ 킷이 staging을 **항상** 만든다. `createDeviceLibrary`의 필수 인자이므로(§3.1 · §7 하드닝 7)
  //   "카피는 하는데 지우는 사람이 없는" 조립이 애초에 만들어질 수 없다.
  const staging = createStagingCache({ namespace: config.namespace ?? DEFAULT_NAMESPACE, files });

  const uploadConfig: MediaUploadConfig<TAsset, TCollectionId> = {
    api: config.api,
    limits: config.limits,
    platform,
    strings: config.strings,
    telemetry: config.telemetry,
    fileNamePrefix: config.fileNamePrefix,
    debug: config.debug,
  };

  const localUploads = createLocalUploads<TAsset, TCollectionId>({
    ...uploadConfig,
    files,
    transport: localTransport,
    hasher,
    poster: config.poster,
    posterAtMs: config.posterAtMs,
    staging,
  });

  // 바이너리 경로의 포스터는 `binaryPoster`에서 온다 — `poster`(로컬 URI용)와 입력 타입이
  // 달라 자리를 바꿔 끼우면 컴파일 에러가 나는 것이 설계다(§6.1-⑥).
  // ⚠ 초안은 이 필드 자체가 없어서 골든패스 소비자가 `"./web"`의 `webCanvasVideoPoster`를
  //   붙일 방법이 없었고, 그 결과 **웹 동영상 포스터 자동 추출**(전신 uploader.ts:566-569)이
  //   조용히 사라졌다. `createBinaryUploads`를 직접 조립하라는 우회는 골든패스가 아니다.
  const binaryUploads = createBinaryUploads<TAsset, TCollectionId>({
    ...uploadConfig,
    transport: binaryTransport,
    hasher,
    poster: config.binaryPoster,
    posterAtMs: config.posterAtMs,
  });

  return {
    platform,
    files,
    staging,
    hasher,

    uploadLocalFile: (input) => localUploads.uploadLocalFile(input),
    uploadPickedAsset: (asset, options) => localUploads.uploadPickedAsset(asset, options),
    uploadBinary: (input) => binaryUploads.uploadBinary(input),
    uploadDropped: (sources, options) => binaryUploads.uploadDropped(sources, options),

    withPicker(picker, options) {
      return createPickerFlows<TAsset, TCollectionId>({
        picker,
        uploads: localUploads,
        platform,
        strings: config.strings,
        // 웹 폴백 파일명이 네이티브와 같은 접두사를 쓰게 한다 — 킷이 이미 아는 값이므로
        // 소비자가 두 번 주지 않는다(전신 uploader.ts:701과 동일 접두사).
        fileNamePrefix: config.fileNamePrefix,
        // 웹 라우팅의 두 부품 중 `uploads`는 킷이 채우고 `loader`만 소비자가 준다(§5.5).
        // `loader`가 없으면 `web` 자체를 넘기지 않는다 — 반쪽 조립이 표현되지 않게.
        web: options?.web ? { uploads: binaryUploads, loader: options.web.loader } : undefined,
      });
    },

    withDeviceLibrary(adapter) {
      const device = createDeviceLibrary({
        adapter,
        files,
        staging,
        platform,
        strings: config.strings,
        debug: config.debug,
      });
      const deviceUploads = createDeviceUploads<TAsset, TCollectionId>({
        device,
        uploads: localUploads,
        staging,
      });
      return { ...device, ...deviceUploads };
    },

    withDeviceSave(adapter) {
      return createMediaSaver({
        // 판별 유니언이라 무효 조합(`browser` 타깃에 `library` 주입 등)이 표현 불가능하다(§6.1-⑦).
        target: { kind: 'media-library', files: requireDownloadableFiles(files), library: adapter },
        fileNamePrefix: config.fileNamePrefix,
        strings: config.strings,
        telemetry: config.telemetry,
      });
    },
  };
}
