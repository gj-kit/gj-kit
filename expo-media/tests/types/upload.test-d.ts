// ═══════════════════════════════════════════════════════════════════════════
// 타입 픽스처 — 업로드 팩토리·완료 페이로드·해시. 설계 문서 §6.3 ⑤·⑦·⑨·⑪·⑭ + §10.2.
//
// 여기 모인 픽스처의 공통점: **틀린 조합이 런타임에 조용히 성공하는 부류**를 타입으로 끊는다.
//   ⑤ 반쪽 포스터 → 서버가 반쪽 메타로 등록해 썸네일이 영구 누락된다(§6.1-②).
//   ⑦ 포스터 어댑터 오배치 → 입력 타입이 달라 자연 차단(브랜드 없이, §6.1-⑥).
//   ⑨ `chunkBytes` 인자 → 3의 배수 제약은 타입으로 표현할 수 없으므로 인자 자체를 없앤다(§7 하드닝 9).
//   ⑪ operation 오타 → 대시보드가 조용히 비는 사고(§7.2).
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expectTypeOf, it } from 'vitest';

import {
  POSTER_CONTENT_TYPE,
  computeChunkRanges,
  createBinaryUploads,
  createDeferredLocalUploads,
  createLocalUploads,
  createPickerFlows,
} from '../../src/core';
import type {
  BinaryPosterAdapter,
  BinarySource,
  BinarySourceLoader,
  BinaryTransport,
  BinaryUploads,
  ChunkRange,
  FileSystemAdapter,
  HashAdapter,
  LocalFileTransport,
  LocalPosterAdapter,
  DeferredLocalUpload,
  DeferredLocalUploadConfig,
  DeferredLocalUploads,
  LocalUploadInput,
  LocalUploads,
  MediaContentType,
  MediaOperation,
  MediaTelemetry,
  MediaUploadCompletion,
  MediaUploadConfig,
  MediaUploadIntentRequest,
  MediaUploadIntentApi,
  MediaUploadLimits,
  MediaUploadApi,
  NamedBinarySource,
  PickerAdapter,
  PickerFlows,
  PlatformAdapter,
  StagingCache,
  UploadResult,
  UploadedPoster,
} from '../../src/core';
import { MEDIA_OPERATIONS } from '../../src/core';
import type { MediaKitConfig } from '../../src/index';
import { webCanvasVideoPoster } from '../../src/web';

type StoredAsset = { readonly id: string };

const forge = <T>(): T => undefined as T;

declare const api: MediaUploadApi<StoredAsset>;
declare const presignOnlyApi: MediaUploadIntentApi;
declare const limits: MediaUploadLimits;
declare const platform: PlatformAdapter;
declare const files: FileSystemAdapter;
declare const transport: LocalFileTransport;
declare const binaryTransport: BinaryTransport;
declare const localPoster: LocalPosterAdapter;
declare const completionBase: MediaUploadCompletion;
declare const telemetry: MediaTelemetry;
declare const run: () => Promise<number>;

describe('presign collection id — completion과 같은 불투명 id를 전달한다', () => {
  it('선택적이라 기존 unscoped 어댑터는 계속 대입 가능하다', () => {
    expectTypeOf<MediaUploadIntentRequest>().toMatchTypeOf<{
      readonly fileName: string;
      readonly contentType: MediaContentType;
      readonly sizeBytes: number;
      readonly collectionId?: string | undefined;
    }>();
  });
});

/** `createLocalUploads`가 요구하는 최소 조합 — 픽스처마다 스프레드로 재사용한다. */
declare const localBase: MediaUploadConfig<StoredAsset> & {
  readonly files: FileSystemAdapter;
  readonly transport: LocalFileTransport;
};

/** `createDeferredLocalUploads`가 요구하는 최소 조합 — complete API는 의도적으로 없다. */
declare const deferredLocalBase: DeferredLocalUploadConfig;

/** `createBinaryUploads`가 요구하는 최소 조합. */
declare const binaryBase: MediaUploadConfig<StoredAsset> & {
  readonly transport: BinaryTransport;
};

describe('§6.3-⑤ poster 쌍 객체 — 한쪽만 채운 상태는 표현 불가능하다', () => {
  it('sizeBytes 누락은 컴파일 에러', () => {
    const completion: MediaUploadCompletion = {
      ...completionBase,
      // @ts-expect-error ⑤ 반쪽 포스터는 서버가 반쪽 메타로 등록해 썸네일을 영구 누락시킨다
      poster: { objectName: 'p.jpg' },
    };
    void completion;
  });

  it('objectName 누락도 마찬가지로 컴파일 에러', () => {
    const completion: MediaUploadCompletion = {
      ...completionBase,
      // @ts-expect-error ⑤ 쌍의 반대쪽도 동일하게 막힌다
      poster: { sizeBytes: 1024 },
    };
    void completion;
  });

  it('쌍이 갖춰지면 통과하고, 포스터 없음은 undefined로 표현한다', () => {
    const withPoster: MediaUploadCompletion = {
      ...completionBase,
      poster: { objectName: 'p.jpg', sizeBytes: 1024 },
    };
    const withoutPoster: MediaUploadCompletion = { ...completionBase, poster: undefined };
    void withPoster;
    void withoutPoster;
    expectTypeOf<MediaUploadCompletion['poster']>().toEqualTypeOf<UploadedPoster | undefined>();
  });

  it('`duplicate`는 필수다 — 옵셔널이면 중복 취소가 사용자의 예전 사진을 지운다(§6.1-⑯)', () => {
    // @ts-expect-error duplicate 누락 — "새로 만들어졌다"로 오독되는 경로를 타입이 막는다
    const result: UploadResult<StoredAsset> = { asset: { id: 'a' } };
    void result;
  });

  it('포스터 contentType은 공개 상수다(§5.4.1-7)', () => {
    expectTypeOf(POSTER_CONTENT_TYPE).toEqualTypeOf<'image/jpeg'>();
    expectTypeOf<typeof POSTER_CONTENT_TYPE>().toExtend<MediaContentType>();
  });
});

describe('§6.3-⑦ 포스터 어댑터 오배치 — 입력 타입이 달라 자연 차단된다', () => {
  it('`BinaryPosterAdapter`는 `LocalPosterAdapter` 자리에 들어가지 못한다', () => {
    createLocalUploads({
      ...localBase,
      // @ts-expect-error ⑦ `webCanvasVideoPoster()`는 `posterFromBinary`뿐이다
      poster: webCanvasVideoPoster(),
    });
  });

  it('반대 방향도 막힌다 — `LocalPosterAdapter`는 바이너리 경로에 못 들어간다', () => {
    createBinaryUploads({
      ...binaryBase,
      // @ts-expect-error ⑦ `posterFromLocalFile`은 바이너리 포스터 계약이 아니다
      poster: localPoster,
    });
  });

  it('제자리에 꽂으면 둘 다 통과한다(브랜드·phantom 각인 없이)', () => {
    createLocalUploads({ ...localBase, poster: localPoster });
    createBinaryUploads({ ...binaryBase, poster: webCanvasVideoPoster() });
    expectTypeOf(webCanvasVideoPoster()).toEqualTypeOf<BinaryPosterAdapter>();
  });

  // 골든패스에도 **두 슬롯이 다 있어야 한다.** 초안은 `binaryPoster`가 없어
  // `createMediaKit` 소비자가 웹 캔버스 포스터를 붙일 방법이 아예 없었고, 그 결과
  // 전신 uploader.ts:566-569의 웹 동영상 포스터 자동 추출이 조용히 사라졌다.
  // 타입이 두 슬롯을 갈라 두므로 서로 바꿔 끼우는 실수는 여전히 컴파일 에러다.
  it('`createMediaKit`은 poster·binaryPoster 두 슬롯을 갖고, 서로 바꿔 끼울 수 없다', () => {
    expectTypeOf<MediaKitConfig<string>['poster']>().toEqualTypeOf<
      LocalPosterAdapter | undefined
    >();
    expectTypeOf<MediaKitConfig<string>['binaryPoster']>().toEqualTypeOf<
      BinaryPosterAdapter | undefined
    >();
  });
});

describe('업로드 팩토리 필수 인자 — 누락은 컴파일 에러', () => {
  it('`createLocalUploads`는 api·limits·platform·files·transport를 전부 요구한다', () => {
    // @ts-expect-error transport 누락 — 바이트를 보낼 주체가 없는 조립
    createLocalUploads({ api, limits, platform, files });
    // @ts-expect-error files 누락 — stat·해시 경로가 통째로 사라진다
    createLocalUploads({ api, limits, platform, transport });
    // @ts-expect-error platform 누락 — duration 정규화(하드닝 4)의 근거가 사라진다
    createLocalUploads({ api, limits, files, transport });
    // @ts-expect-error limits 누락(§6.1-③)
    createLocalUploads({ api, platform, files, transport });
    // @ts-expect-error api 누락 — 백엔드 계약이 유일한 seam이다(§5.1)
    createLocalUploads({ limits, platform, files, transport });
    expectTypeOf(createLocalUploads({ api, limits, platform, files, transport })).toEqualTypeOf<
      LocalUploads<StoredAsset, string>
    >();
  });

  it('`createBinaryUploads`는 files를 요구하지 않는다 — 바이너리는 이미 메모리에 있다', () => {
    expectTypeOf(createBinaryUploads({ api, limits, platform, transport: binaryTransport })).toEqualTypeOf<
      BinaryUploads<StoredAsset, string>
    >();
    // @ts-expect-error 로컬 파일 전송기는 바이너리 전송기가 아니다
    createBinaryUploads({ api, limits, platform, transport });
  });

  it('`createPickerFlows`는 picker·uploads·platform을 요구한다', () => {
    // @ts-expect-error uploads 누락 — 고르기만 하고 올릴 곳이 없는 조립
    createPickerFlows({ picker: forge<PickerAdapter>(), platform });
    expectTypeOf(
      createPickerFlows({
        picker: forge<PickerAdapter>(),
        uploads: forge<LocalUploads<StoredAsset>>(),
        platform,
      }),
    ).toEqualTypeOf<PickerFlows<StoredAsset, string>>();
  });

  it('웹 라우팅은 uploads·loader 쌍이다 — 반쪽 조립은 표현 불가능하다(§5.7.4)', () => {
    createPickerFlows({
      picker: forge<PickerAdapter>(),
      uploads: forge<LocalUploads<StoredAsset>>(),
      platform,
      // @ts-expect-error loader만 있고 uploads가 없는 반쪽 웹 조립
      web: { loader: forge<BinarySourceLoader>() },
    });
  });

  it('EOP: 팩토리 옵셔널 필드는 명시 undefined를 받는다', () => {
    createLocalUploads({
      api,
      limits,
      platform,
      files,
      transport,
      hasher: forge<HashAdapter | undefined>(),
      poster: undefined,
      posterAtMs: undefined,
      staging: forge<StagingCache | undefined>(),
      strings: undefined,
      telemetry: undefined,
      fileNamePrefix: undefined,
      debug: undefined,
    });
  });
});

describe('presign-only 지연 연결 — 등록 API를 흉내 내지 않는다', () => {
  it('`MediaUploadIntentApi`에는 createUploadIntent만 있고 deferred 결과는 completion 형태다', () => {
    expectTypeOf<DeferredLocalUpload>().toEqualTypeOf<MediaUploadCompletion>();
    // @ts-expect-error deferred 흐름은 서버 등록 메서드를 요구하거나 갖고 있지 않다
    void presignOnlyApi.completeUpload;
  });

  it('로컬 스트리밍에 필요한 seam은 보통 경로와 같고, 반환은 attachment뿐이다', () => {
    expectTypeOf(createDeferredLocalUploads(deferredLocalBase)).toEqualTypeOf<
      DeferredLocalUploads<string>
    >();
    expectTypeOf(
      createDeferredLocalUploads({
        api: presignOnlyApi,
        limits,
        platform,
        files,
        transport,
      }),
    ).toEqualTypeOf<DeferredLocalUploads<string>>();
  });

  it('api·limits·platform·files·transport 중 하나라도 없으면 조립할 수 없다', () => {
    // @ts-expect-error transport 없이는 로컬 URI를 네이티브 스트리밍할 수 없다
    createDeferredLocalUploads({ api: presignOnlyApi, limits, platform, files });
    // @ts-expect-error files 없이는 크기 검증·해시 경로가 없다
    createDeferredLocalUploads({ api: presignOnlyApi, limits, platform, transport });
    // @ts-expect-error limits는 명시적 정책이어야 한다
    createDeferredLocalUploads({ api: presignOnlyApi, platform, files, transport });
  });
});

describe('§6.3-⑨ computeChunkRanges — chunkBytes 인자는 존재하지 않는다', () => {
  it('두 번째 인자는 컴파일 에러(하드닝 9의 회귀 통로를 없앤다)', () => {
    // @ts-expect-error ⑨ 전신은 기본 인자로 이것을 열어 두었고 테스트가 3의 배수가 아닌 값을 넘겼다
    computeChunkRanges(1024, 100);
  });

  it('인자 1개가 정본이며 반환은 읽기 전용 범위 배열이다', () => {
    expectTypeOf(computeChunkRanges(1024)).toEqualTypeOf<readonly ChunkRange[]>();
    expectTypeOf<ChunkRange>().toEqualTypeOf<{
      readonly position: number;
      readonly length: number;
    }>();
  });
});

describe('§6.3-⑪ 텔레메트리 operation 오타 차단 (§5.1 · §7.2)', () => {
  it("'media.upload.natives'는 `MediaOperation`이 아니다", () => {
    // @ts-expect-error ⑪ 오타는 컴파일 에러 — 대시보드가 조용히 비는 사고를 막는다
    void telemetry.track('media.upload.natives', {}, run);
  });

  it('닫힌 6종은 그대로 통과하고 `track`은 결과를 통과시킨다', () => {
    expectTypeOf(telemetry.track('media.upload.native', {}, run)).toEqualTypeOf<Promise<number>>();
    void telemetry.begin('media.save-to-device');
    expectTypeOf<MediaOperation>().toEqualTypeOf<
      | 'media.upload.native'
      | 'media.upload.web-image'
      | 'media.upload.web-video'
      | 'media.upload.poster.native'
      | 'media.upload.poster.web'
      | 'media.save-to-device'
    >();
    // §7.2 보존 계약 — 목록은 6종으로 닫혀 있다.
    expectTypeOf(MEDIA_OPERATIONS.length).toEqualTypeOf<6>();
  });

  it('호스트 자체 operation은 이 인터페이스의 일이 아니다(§6.2 철회 근거)', () => {
    // @ts-expect-error 임의 문자열을 열어 두면 오타가 잡히지 않는다
    void telemetry.begin('app.gallery.scan');
  });
});

describe('§6.3-⑭ 호출자 제공 해시가 표현 가능하다 (§5.4-① · G2)', () => {
  it('`LocalUploadInput.contentHash`는 `string | undefined`다', () => {
    expectTypeOf<LocalUploadInput['contentHash']>().toEqualTypeOf<string | undefined>();
  });

  it('동기화 큐의 재시도 간 해시 캐시가 그대로 흘러 들어간다', () => {
    const cached: string | undefined = undefined;
    const input: LocalUploadInput = { uri: 'file:///a.jpg', contentHash: cached };
    void input;
    // `collectionId`는 `null`도 받는다 — "앨범 없음"을 명시하는 경로(§5.4-①).
    expectTypeOf<LocalUploadInput['collectionId']>().toEqualTypeOf<string | null | undefined>();
  });

  it('`uri`는 필수다 — 바이트의 위치 없이 업로드가 시작될 수 없다', () => {
    // @ts-expect-error uri 누락
    const input: LocalUploadInput = { fileName: 'a.jpg' };
    void input;
  });
});

describe('바이너리 업로드 입력 — 3상태 포스터와 이름 있는 소스', () => {
  it('poster는 undefined(자동)·null(없음)·값 3상태를 보존한다', () => {
    const uploads = createBinaryUploads({ api, limits, platform, transport: binaryTransport });
    const source = forge<NamedBinarySource>();
    void uploads.uploadBinary({ source });
    void uploads.uploadBinary({ source, poster: null });
    void uploads.uploadBinary({ source, poster: forge<BinarySource>() });
    void uploads.uploadBinary({ source, poster: undefined });
  });

  it('이름 없는 바이너리는 `uploadBinary`에 들어가지 못한다(§7 하드닝 10 — 확장자 판정 근거)', () => {
    const uploads = createBinaryUploads({ api, limits, platform, transport: binaryTransport });
    // @ts-expect-error `BinarySource`에는 name이 없다 — 지원 형식 판정이 불가능해진다
    void uploads.uploadBinary({ source: forge<BinarySource>() });
  });
});
