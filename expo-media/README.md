# @gj-kit/expo-media

**실기에서 깨져 본 것들만 하드닝으로 남긴** Expo/React Native 사진·동영상 파이프라인. 프리사인 업로드, EXIF 파싱, 기기 라이브러리(iCloud·PhotoKit), 스트리밍 SHA-256, 동영상 포스터, 기기 저장까지 — 전부 어댑터 seam 위에 올라가 있어서 `expo-*` 없이도 돌고, 런타임 의존성은 0이다.

이 라이브러리의 존재 이유는 기능이 아니라 **경계**다. iOS 26에서 앱을 종료시키는 업로드 API, `ph://`를 stat까지는 통과시키고 URLSession에서 죽이는 PhotoKit 핸드오프, `quality<1` 재인코딩 시 원본 크기를 보고하는 Android `fileSize`, 초 단위 duration을 밀리초로 저장하는 웹 피커 — 이런 것들은 전부 프로덕션에서 며칠씩 태워 먹고 알아낸 것이고, 그 사고 이력이 소스 주석에 그대로 남아 있다.

- **런타임 의존성 0** — `js-sha256`도 없다. 순수 TS 증분 SHA-256이 내장돼 있다.
- **peer 6종 전부 optional** — Expo SDK 자체와 네이티브 모듈의 peer 관계까지 명시한다. "어느 엔트리를 import했나"가 실제 peer 그래프를 결정하며, 런타임 마법(지연 `require`)은 0이다.
- **코어는 순수하다** — `src/core/**`에 `react-native`·`expo-*` import 0, DOM 전역 참조 0. 그래서 전 파이프라인이 네이티브 모킹 없이 vitest에서 돈다.
- **문구는 전부 주입** — `MediaStrings` 22키 + 내장 `enMediaStrings`/`koMediaStrings`. 라이브러리 소스에 사용자 노출 리터럴이 없음을 정적 가드가 강제한다.
- **운영 파이프라인 오류는 전부 `code`로 분기 가능** — 업로드·피커·기기·저장 등 공개
  파이프라인이 만드는 실패는 `MediaError` 16코드로 정규화한다. 개발자 단언과 직접 호출한
  저수준 어댑터의 오류는 이 계약 밖이며, 어댑터를 호출하는 파이프라인에서만 안전하게 감싼다.

> **SDK 요구 (엔트리별로 다르다 — 이 두 줄이 전부다)**
> - `.` · `./picker` · `./device` · `./save`는 **Expo SDK 56 의존성 그래프에서 검증**된다 (`expo-file-system@56.0.0`의 `File.upload()` / `expo-media-library@56.0.5`의 `/legacy` 서브패스가 하한을 지배한다). peer의 하한은 이후 SDK 호환성을 자동으로 보장하지 않으며, 새 SDK는 별도 검증 뒤 지원 범위에 추가한다.
> - `./core` · `./web` · `./testing`은 **peer 0**이라 **SDK와 무관하다.** bare RN·웹 전용·Node 스크립트에서 그대로 쓴다.

```sh
pnpm add @gj-kit/expo-media
```

## 1. 골든패스 — `createMediaKit`

백엔드 계약은 메서드 **2개**다. 프리사인 URL을 발급하는 `createUploadIntent`와 업로드 완료를 등록하는 `completeUpload`.

```ts
import { createMediaKit, koMediaStrings } from '@gj-kit/expo-media';

const media = createMediaKit<Photo>({
  api,                        // MediaUploadApi<Photo> — 앱의 프리사인 백엔드
  // 생략 불가. 무제한은 명시적 결정이어야 하므로 'server-enforced'로 적는다.
  limits: { image: { maxBytes: 15 * 1024 * 1024 }, video: { maxBytes: 300 * 1024 * 1024 } },
  strings: koMediaStrings,
  fileNamePrefix: 'memorylog',
});

const { asset, duplicate } = await media.uploadLocalFile({
  uri: 'file:///var/mobile/Containers/Data/Application/…/IMG_0001.HEIC',
  fileName: 'IMG_0001.HEIC',
  // 재시도 간 캐시한 해시가 있으면 넘긴다 — 있으면 hasher를 아예 호출하지 않는다.
  contentHash: undefined,
});
```

`createMediaKit`은 expo 기본 어댑터(platform·files·localTransport·binaryTransport·hasher·staging)를 **이미 채운 채로** 시작한다. peer는 `react-native` + `expo-file-system` 둘뿐이다 — 피커·기기 라이브러리·저장·포스터는 각자의 엔트리에서 부착한다.

> **왜 이 단계를 건너뛸 수 없는가**
> - `limits`는 **생략할 수 없다.** 무제한 업로드는 사고가 아니라 결정이어야 한다. 서버만 검증하는 정책도 정당하므로 `'server-enforced'`로 그 결정을 표현한다(`Number.POSITIVE_INFINITY`는 JSON 직렬화가 안 돼 기각).
> - `UploadResult.duplicate`는 **필수 필드**다. 옵셔널이면 호스트가 판정을 돌려주지 않을 때 킷이 "새로 만들어졌다"로 오독하고, 중복 취소 경로가 **사용자의 예전 사진을 지운다.**
> - 완료 페이로드의 포스터는 `{ objectName, sizeBytes }` **쌍 객체**다. 전신의 `posterObjectName`/`posterSizeBytes` 2필드는 반쪽만 채운 채 등록되는 경로가 있었다.

### 지연 연결 — `createDeferredLocalUploads`

백엔드가 presign URL과 `objectName`만 발급하고, 실제 레코드 생성·수정 트랜잭션에서 나중에
첨부를 연결하는 앱은 `completeUpload`를 꾸며 낼 필요가 없다. `MediaUploadIntentApi`의 유일한
메서드인 `createUploadIntent`만 주면, 같은 크기 검증·해시·동영상 포스터·**네이티브 스트리밍** PUT을
거친 뒤 `MediaUploadCompletion` 형태의 attachment를 돌려준다.

```ts
import {
  createDeferredLocalUploads,
  createExpoFileSystem,
  createExpoLocalFileTransport,
  expoPlatform,
} from '@gj-kit/expo-media';
import type {
  MediaOrphanedUpload,
  MediaUploadCompletion,
  MediaUploadFailureStage,
  MediaUploadIntentApi,
} from '@gj-kit/expo-media';

declare const appApi: {
  createUploadIntent(
    input: Parameters<MediaUploadIntentApi['createUploadIntent']>[0],
  ): ReturnType<MediaUploadIntentApi['createUploadIntent']>;
  updateDraft(input: { readonly draftId: string; readonly cover: MediaUploadCompletion }): Promise<void>;
  reconcileUnattachedUploads(input: {
    readonly stage: MediaUploadFailureStage;
    readonly candidates: readonly MediaOrphanedUpload[];
  }): Promise<void>;
};
declare const localPhotoUri: string;
declare const draftId: string;

const presignOnlyApi: MediaUploadIntentApi = {
  async createUploadIntent({ fileName, contentType, sizeBytes }) {
    const issued = await appApi.createUploadIntent({ fileName, contentType, sizeBytes });
    return {
      uploadUrl: issued.uploadUrl,
      method: 'PUT',
      headers: issued.headers,
      objectName: issued.objectName,
    };
  },
};

const uploads = createDeferredLocalUploads({
  api: presignOnlyApi,             // completeUpload 없음
  limits: { image: { maxBytes: 15 * 1024 * 1024 } },
  platform: expoPlatform(),
  files: createExpoFileSystem(),
  transport: createExpoLocalFileTransport(),
});

const attachment = await uploads.uploadLocalFile({
  uri: localPhotoUri,
  fileName: 'draft-cover.jpg',
});

// 이 호출이 앱의 실제 등록/연결 경계다. 라이브러리는 이 트랜잭션을 대신하거나 흉내 내지 않는다.
await appApi.updateDraft({ draftId, cover: attachment });
```

`attachment`의 PUT 성공은 **스토리지에 객체가 올라갔다는 뜻일 뿐**, 레코드에 연결·검증·공개됐다는
뜻은 아니다. 앱이 트랜잭션 실패·취소 시 orphan object 정리와 재시도 정책을 맡아야 한다. 이 경로는
로컬 URI를 네이티브 transport로 스트리밍하는 용도이며, 원본 URI를 보관하거나 압축·크롭하지 않는다.
웹 `Blob`/`File`은 `createBinaryUploads` 경로를 사용한다. `uploadLocalFile`만 노출하므로, 피커
선택 결과는 앱이 URI를 확보한 뒤 이 함수에 넘기거나 일반 `createMediaKit` 흐름을 사용한다. web/SSR에서
이 메서드는 file stat·presign·PUT **전에** `platform-unsupported`로 끝난다.

#### 실패 후 스토리지 정리 — 일반/지연 흐름 공통

`createLocalUploads`와 `createDeferredLocalUploads` 모두 presign·PUT·등록(finalizer) 실패를
`MediaError('upload-failed')`로 정규화한다. `mediaUploadFailureInfo()`는 code splitting으로 코어 사본이
갈려도 읽히는 URL 없는 recovery metadata다. `objectName`, `contentType`, `sizeBytes`, `storageState`만
주며 presigned URL·헤더·원본 네트워크 에러는 절대 돌려주지 않는다.
`objectName`은 최대 1024자의 ASCII unreserved 경로 세그먼트(`[A-Za-z0-9._~-]`)를 `/`로 잇는
키만 허용한다. URL·query·percent encoding·공백은 받지 않으므로, backend 발급 키도 이 문법을 따라야 한다.

```ts
import { mediaUploadFailureInfo } from '@gj-kit/expo-media';
import type { MediaOrphanedUpload, MediaUploadCompletion } from '@gj-kit/expo-media';

declare const uploads: {
  uploadLocalFile(input: { readonly uri: string }): Promise<MediaUploadCompletion>;
};
declare const localPhotoUri: string;
declare const draftId: string;
declare const appApi: {
  updateDraft(input: { readonly draftId: string; readonly cover: MediaUploadCompletion }): Promise<void>;
  reconcileUnattachedUploads(input: {
    readonly stage: 'intent' | 'put' | 'complete';
    readonly candidates: readonly MediaOrphanedUpload[];
  }): Promise<void>;
};

function attachmentCandidates(attachment: MediaUploadCompletion): readonly MediaOrphanedUpload[] {
  return [
    {
      objectName: attachment.objectName,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      storageState: 'uploaded',
    },
    ...(attachment.poster
      ? [{
          objectName: attachment.poster.objectName,
          contentType: 'image/jpeg' as const,
          sizeBytes: attachment.poster.sizeBytes,
          storageState: 'uploaded' as const,
        }]
      : []),
  ];
}

let attachment: MediaUploadCompletion | null = null;
try {
  attachment = await uploads.uploadLocalFile({ uri: localPhotoUri });
  await appApi.updateDraft({ draftId, cover: attachment });
} catch (error) {
  const failure = mediaUploadFailureInfo(error);
  // deferred attachment가 이미 완성된 뒤 app transaction이 실패한 경우도 같은 서버 경계로 보낸다.
  const candidates = failure?.orphanedObjects ?? (attachment ? attachmentCandidates(attachment) : []);
  if (candidates.length > 0) {
    // 서버가 로그인한 사용자의 소유권과 "아직 어떤 레코드에도 연결되지 않음"을 재검증한다.
    // 이 endpoint는 storageState를 받아도 멱등이어야 한다.
    await appApi.reconcileUnattachedUploads({
      stage: failure?.stage ?? 'complete',
      candidates,
    });
  }
  throw error;
}
```

`uploaded`는 클라이언트가 2xx를 확인한 후보이고, `possibly-uploaded`는 PUT 응답 유실·전송 예외처럼
서버에는 이미 도달했을 수도 있는 후보다. 특히 `stage: 'complete'`는 **서버 등록이 이미 성공했을
가능성도 있다.** cleanup endpoint는 클라이언트 메타데이터만 보고 삭제하면 안 되며, 인증된 소유자,
객체의 현재 attachment 상태를 서버에서 다시 확인해 **미연결인 자기 객체만** 삭제해야 한다. 존재하지
않는 후보도 성공으로 처리하는 멱등 API가 정답이다. 포스터는 no-frame·추출 실패·로컬 cap 초과면 선택적으로
건너뛰지만, presign/PUT이 시작된 뒤 실패하면 possibly-uploaded poster를 숨기지 않고 이 recovery 경로로
전파한다.

## 2. 서브패스 9개와 peer

| 엔트리 | 내용 | 정적 import하는 peer |
|---|---|---|
| `.` | `./core` 전체 재export + `createMediaKit` + expo 기본 어댑터 | `react-native`, `expo-file-system` |
| `./core` | 팩토리 9종, 어댑터 계약, `MediaError`(16코드), durable-file 오류/저장, mediaTypes 테이블, EXIF 파서, 순수 TS SHA-256, `StagingCache`, 서명 URL 새니타이저 | **없음** (DOM lib도 없음) |
| `./picker` | `expoPicker` — OS 피커/카메라, 권한, iOS 원본 fast path | `expo-image-picker`, `react-native` |
| `./device` | `expoDeviceLibrary` — granular 권한·페이지네이션·앨범·자산정보 | `expo-media-library/legacy`, `react-native` |
| `./save` | `expoDeviceSave({ isExpoGo })` — MediaLibrary 저장 | `expo-media-library/legacy`, `react-native` |
| `./video` | `expoVideoPoster` — 로컬 URI → 포스터 프레임 | `expo-video-thumbnails` |
| `./web` | `webCanvasVideoPoster` · `createFetchBinaryTransport` · `createBrowserSaveTarget` · `createFetchBinarySourceLoader` | **없음** (브라우저 DOM 필요) |
| `./testing` | 인메모리 파일시스템, 기록형 transport·telemetry, 페이크 피커·기기 라이브러리·업로드 API, EXIF·서명 URL 픽스처 | **없음** |
| `./storage` | `createExpoDocumentFileStore` — 앱 소유 지속 파일의 byte-size 검증 복사·안전한 정리·URI-safe 오류 | `expo-file-system` |

소비자별로 실제 설치가 필요한 것:

| 소비자 | 필요한 엔트리 | 설치 불필요한 peer |
|---|---|---|
| 백그라운드 동기화(로컬 URI 업로드만) | `.` | image-picker, media-library, video-thumbnails |
| 레코드 트랜잭션에서 나중에 연결 | `.` (`createDeferredLocalUploads`) | image-picker, media-library, video-thumbnails |
| 웹 드롭존 / 웹 관리자 도구 | `./core` + `./web` | expo-* 전부, react-native |
| OS 피커 업로드(이미지 전용) | `.` + `./picker` | media-library, video-thumbnails |
| bare RN 커스텀 어댑터 | `./core` | 전부 |
| 로컬 활동 사진처럼 앱 DB에 URI를 저장할 첨부 파일 | `./storage` | image-picker, media-library, video-thumbnails, react-native |

**`.`은 `./picker`·`./device`·`./save`·`./video`·`./web`을 import하지 않는다** — 단방향이고, 조합은 소비자가 한다. 이 규율이 optional peer 격리의 **정적 근거**다: `.`의 모듈 그래프에는 `expo-media-library`가 문자열로도 없으므로 Metro가 해석을 시도조차 하지 않는다. `dist-peer-graph` 가드가 위 표와 산출물을 조건 3세트(`browser`/`node`/네이티브) × 모듈 2형식(ESM·CJS)으로 대조한다 — "optional peer로 강등했다"가 문서 주장이 아니라 CI 단언이다.

`./device`·`./save`는 **비네이티브 포크**를 갖는다(exports의 `node`·`browser` 조건). 웹·SSR에서는 열거가 빈 결과를 주고 resolve/저장은 `MediaError('platform-unsupported')`를 던진다 — `expo-media-library`를 import하지 않는 별개 산출물이다.

`createExpoDocumentFileStore`의 네이티브 정본 import는 `./storage`다. `./core`와 `.`에는 커스텀
어댑터용 `createDurableFileStore`와 오류 계약만 둔다. 기존 root import는 호환성을 위해 유지하지만, 새
지속 파일 코드는 `./storage`를 사용해 native peer 경계를 읽는 코드만으로도 분명하게 한다.

### 앱 소유 지속 파일

기록 사진처럼 앱의 DB에 오래 보관할 URI는 업로드 스테이징 캐시가 아니라 `./storage`에 복사한다.
경로를 URI 문자열로 직접 조립하지 않고, 검증된 세그먼트로 만든 앱 소유 root만 정리하므로 실패한
복사나 DB 트랜잭션 롤백이 다른 파일을 삭제할 수 없다. 복사 뒤에는 원본·대상 byte size를 비교하며,
오류는 카메라/피커 URI를 담지 않는 `DurableFileError`로만 전달된다.

```ts
import {
  createExpoDocumentFileStore,
  isDurableFileError,
} from '@gj-kit/expo-media/storage';
import type { PickedAsset } from '@gj-kit/expo-media/core';

declare const pickedAsset: PickedAsset;
declare function persistActivityPhoto(file: unknown): Promise<void>;

const photos = createExpoDocumentFileStore({ root: 'photos' });
const copied = await photos.copyPickedAsset({
  asset: pickedAsset,
  directory: ['activity-42'],
  // 앱의 안정 ID만 준다. picker MIME/확장자를 검증해 .heic/.png 등을 보존한다.
  fileNameStem: 'photo-1',
}).catch((error: unknown) => {
  if (isDurableFileError(error)) {
    // code는 durable-file-source-not-found / durable-file-copy-size-mismatch 등 URI-safe 값이다.
  }
  throw error;
});
try {
  // `copied.uri`·`copied.sizeBytes`·`copied.contentType`을 앱의 도메인 트랜잭션에 함께 저장한다.
  await persistActivityPhoto(copied);
} catch (error) {
  // DB 트랜잭션이 실패했을 때만 이 store가 만든 경로를 보상 정리한다.
  await photos.remove(copied.uri);
  throw error;
}
```

카메라/피커 결과가 아니라 기존 `file://` URI만 있는 레거시 경로는 `copy({ sourceUri, fileName })`를
계속 쓸 수 있다. 새 코드에서는 `copyPickedAsset`을 우선해 **호환 표현 선호가 JPEG 보장을 뜻하지
않는** 플랫폼 차이를 파일명까지 보존하는 것이 안전하다.

활동 삭제·보존 기간 만료처럼 DB row가 사라지는 정책도 호스트 도메인의 책임이다. 해당 row가 가리키는
URI만 `remove()`에 넘기면 store는 자기 root 밖을 no-op으로 처리한다. 반대로 DB에 성공적으로 저장된
`copied.uri`를 즉시 지우면 안 된다.

### 배포 artifact 정책

`dist/**/*.map`은 의도적으로 npm tarball에 포함한다. React Native/Metro의 production symbolication과
소비자 앱의 디버그 재현에 필요한 공개 artifact이기 때문이다. 크기 최적화가 필요해지는 릴리스에서만
source map을 별도 artifact로 옮기며, 그때는 `npm pack` 결과와 Metro consumer smoke를 함께 바꾼다.
`dist/gj-kit-provenance.json`에는 package 이름·버전과 **빌드한 Git의 full source commit**만(시간값 없이)
기록된다. 이 파일은 `dist/`와 함께 tarball 안에 들어가며, `check:pack`은 실제
`npm pack --ignore-scripts` tarball에서 그 값을 현재 clean Git `HEAD`와 대조한다. 앱의 vendor manifest는
tarball SHA-256을 추가로 기록할 수 있지만, 이 패키지 내부 stamp를 대신할 수 없다.

따라서 배포할 때는 source 변경과 version commit을 먼저 commit한 clean checkout에서 `pnpm run verify:release`를
실행한다. 일반 `npm pack`도 `prepack`에서 같은 clean-check를 수행한다. stamp는 공개 런타임 API가 아닌
artifact metadata이므로 이 보호 장치만 추가하는 경우에는 패키지 버전을 임의로 올리지 않는다.

현재 `check:pack`은 export map·실제 packed 파일·내부 provenance stamp를, `check:expo-media-consumer`는 새
Expo SDK 56 소비자의 web/iOS/Android export를 검증한다.

### 역사적 활동의 EXIF 시간

기본 `mediaMetadataFromExif()`는 기존처럼 **현재 기기의 로컬 벽시계**로 EXIF 시간을 읽는다. 활동·여행처럼
기록 당시의 offset을 데이터로 보관하는 앱은 별도 API로 그 정책을 명시한다. 이 함수는 경로 보간·활동
시간대 선택 같은 제품 정책은 소유하지 않고, EXIF wall clock을 UTC instant로 바꾸는 일만 한다.

```ts
import { capturedAtFromExif, parseExifWallClock } from '@gj-kit/expo-media/core';

declare const exif: Readonly<Record<string, unknown>>;

const wallClock = parseExifWallClock(exif.DateTimeOriginal);
const capturedAt = capturedAtFromExif(exif, {
  // 기록을 시작할 때 저장한 offset. KST는 UTC+09:00 = 540이다.
  timeZoneOffsetMinutes: 540,
});
```

`capturedAtFromExif`는 offset이 이미 붙은 ISO 문자열은 재해석하지 않고, 존재하지 않는 날짜나 ±14시간 밖의
offset은 `undefined`로 거부한다. 따라서 사용자가 기기 시간대를 바꿨거나 다른 나라에서 사진을 붙여도
현재 기기 시간대로 조용히 이동하지 않는다.

### 능력 부착 — `with*`

```ts
import { createMediaKit } from '@gj-kit/expo-media';
import { expoPicker } from '@gj-kit/expo-media/picker';

const media = createMediaKit<Photo>({ api, limits: 'server-enforced' });
const picker = media.withPicker(expoPicker());

const picked = await picker.pick({ max: 10, kinds: ['image', 'video'] });
const uploaded = await picker.pickAndUpload({ max: 10, kinds: ['image'] });
// 카메라 캡처는 **항상 최대 1건**이다 — 그래서 옵션 타입에 max가 아예 없다.
const shot = await picker.captureAndUpload({ kind: 'image' });
```

앱이 파일을 직접 자르거나 분석할 때는 업로드 설정 없이 선택 전용 API를 조합한다. 권한 확인,
단일 촬영 제한, 피커 결과 정규화는 라이브러리가 맡고 이후 처리만 앱에 남긴다.

```ts
import { createMediaPickerActions } from '@gj-kit/expo-media';
import { expoPicker } from '@gj-kit/expo-media/picker';

const scannerPicker = createMediaPickerActions({
  picker: expoPicker({
    preferCompatibleRepresentation: true,
    retryWithEditingOnError: true,
  }),
});

const [photo] = await scannerPicker.capture({ kind: 'image' });
const [libraryPhoto] = await scannerPicker.pick({ max: 1, kinds: ['image'] });
```

```ts
import { createMediaKit } from '@gj-kit/expo-media';
import { expoDeviceLibrary } from '@gj-kit/expo-media/device';
import { expoVideoPoster } from '@gj-kit/expo-media/video';

const media = createMediaKit<Photo>({ api, limits: 'server-enforced', poster: expoVideoPoster() });
const device = media.withDeviceLibrary(expoDeviceLibrary());

// 조회 → !granted && canAskAgain일 때만 요청. canAskAgain=false에서 재요청하면
// iOS는 아무 일도 하지 않는다(UI 데드록) — 그 규칙이 여기 한 곳에만 산다.
const permission = await device.ensurePermission();
if (!permission.granted) return;

const page = await device.fetchPage({ pageSize: 60 });   // creationTime 내림차순 + endCursor
const albums = await device.fetchAlbums();               // count>0 필터 + count 내림차순은 core가 강제

const results = await device.uploadDeviceAssets(page.assets.slice(0, 12), {
  downloadFromICloud: true,                              // 기본 false — 무단 셀룰러 전송 차단
  onICloudDownload: (downloading) => setICloudBanner(downloading),
});
```

```ts
import { createMediaKit } from '@gj-kit/expo-media';
import { expoDeviceSave } from '@gj-kit/expo-media/save';

const media = createMediaKit<Photo>({ api, limits: 'server-enforced' });
// Android Expo Go는 사진 권한 요청 자체가 불가하다. 그 판정은 호스트가 하고 값만 넘긴다
// (expo-constants를 peer에서 완전히 제거하는 지점).
const saver = media.withDeviceSave(expoDeviceSave({ isExpoGo }));

const { savedCount, mode } = await saver.saveToDevice([
  { id: 'p_1', url: 'https://cdn.example.com/signed/p_1', contentType: 'image/jpeg' },
  { id: 'p_2', url: 'https://cdn.example.com/signed/p_2' },
]);
```

### 이미 앱이 소유한 원본을 사진첩으로 저장

원격 URL 저장은 위 `createMediaSaver` 경로다. 반대로 이미 앱 documents에 복사해 DB가 가리키는
`file://` 원본은 `createLocalMediaSaver`를 쓴다. 이 경로는 **네트워크 다운로드·source 삭제를 절대
하지 않으며**, 권한은 유효한 파일이 하나 이상 있을 때 배치당 한 번만 요청한다.

```ts
import { createExpoFileSystem } from '@gj-kit/expo-media';
import { createLocalMediaSaver } from '@gj-kit/expo-media/core';
import { expoDeviceSave } from '@gj-kit/expo-media/save';

const localSaver = createLocalMediaSaver({
  files: createExpoFileSystem(),
  library: expoDeviceSave({ isExpoGo }),
});

const saved = await localSaver.saveLocalToDevice([
  { id: 'activity-photo-1', uri: 'file:///…/documents/photos/activity-1/photo-1.heic' },
  { id: 'activity-photo-2', uri: 'file:///…/documents/photos/activity-1/photo-2.jpg' },
]);
// items는 입력 순서 그대로이며 status는 saved | unavailable | failed다.
// unavailable은 원본이 사라졌거나 비어 있는 경우, failed는 사진첩 저장 실패다.
```

OS share/file sheet는 사용자가 최종 위치를 결정하는 별도 UX이므로 이 저장 결과에 섞지 않는다.
호스트가 자신의 공유 정책·파일 형식·재시도 문구를 소유한다.

`with*`는 자기 자신을 넓히지 않고 **구체 킷을 새로 반환한다**. 조건부 타입이 0이므로, "타입 애노테이션 한 번에 기능이 통째로 사라지는" capability 교차 타입의 붕괴가 **표현 불가능**하다.

## 3. 어댑터 seam — 갈아끼우기

능력 = 팩토리다. **각 팩토리는 자기가 실제로 쓰는 의존만 필수 인자로 받는다.** 안 쓰는 메서드를 throw 스텁으로 채울 일이 없고, 없는 능력은 "그 팩토리를 호출하지 않았으므로 변수가 없다"로 표현된다 — 오류 메시지가 `Cannot find name 'devUps'`라서 원인이 곧 메시지다.

### bare RN — expo 없이

```ts
import { createLocalUploads, enMediaStrings } from '@gj-kit/expo-media/core';
import type { FileSystemAdapter, LocalFileTransport, PlatformAdapter } from '@gj-kit/expo-media/core';

const platform: PlatformAdapter = { os: 'android', isDev: false };

const files: FileSystemAdapter = {
  cacheDirectory: () => `${rnfs.CachesDirectoryPath}/`,
  // stat은 throw 금지 — 코어가 후보 URI를 순회하기 때문이다.
  async stat(uri) {
    const info = await rnfs.stat(uri.replace('file://', ''));
    return info.isFile() ? { kind: 'file', sizeBytes: info.size } : { kind: 'directory' };
  },
  copy: ({ from, to }) => rnfs.copyFile(from, to),
  remove: (uri) => rnfs.unlink(uri).catch(() => undefined),
  // ⚠ range.length는 코어가 **항상 3의 배수**로 준다. 재정렬·병합·확장하면 해시가 조용히 틀린다.
  readBase64: (uri, range) => rnfs.read(uri, range.length, range.position, 'base64'),
};

// ⚠ 계약: 파일 바이트를 JS 힙으로 읽지 말 것. 네이티브 스트리밍 업로드여야 한다.
const transport: LocalFileTransport = {
  async putLocalFile({ url, method, headers, uri }) {
    const task = rnfs.uploadFiles({ toUrl: url, method, headers, files: [{ filepath: uri }] });
    const { statusCode } = await task.promise;
    return { status: statusCode };
  },
};

const uploads = createLocalUploads<Photo>({
  api,
  limits: 'server-enforced',
  platform,
  files,
  transport,
  strings: enMediaStrings,
  // hasher 생략 = 내장 순수 TS SHA-256. poster 생략 = 동영상 포스터 없음.
});
```

### web-only — expo도 react-native도 없이

```ts
import { createBinaryUploads, koMediaStrings } from '@gj-kit/expo-media/core';
import { createFetchBinaryTransport, webCanvasVideoPoster } from '@gj-kit/expo-media/web';

const uploads = createBinaryUploads<Photo>({
  api,
  limits: { image: { maxBytes: 15 * 1024 * 1024 } },
  platform: { os: 'web', isDev: false },
  strings: koMediaStrings,
  transport: createFetchBinaryTransport(),
  poster: webCanvasVideoPoster(),
});

// DOM File은 NamedBinarySource({size, type?, name, arrayBuffer()})를 구조적으로 만족한다 —
// 코어가 DOM lib 없이도 이 경로를 검증할 수 있는 이유다.
const results = await uploads.uploadDropped(droppedFiles, { maxFiles: 12 });
```

`uploadDropped`는 **첫 presign 이전에 배치 전체를 검증한다.** 미지원 파일이 하나라도 섞여 있으면 `unsupported-file-type`으로 즉시 실패하고 `createUploadIntent`는 **0회** 호출된다 — 부분 업로드는 사용자가 결과를 알 수도, 거절된 파일을 고칠 수도 없게 만든다.

어댑터 계약 전량: `PlatformAdapter`(필드 2개) · `FileSystemAdapter` · `FileDownloadAdapter` · `LocalFileTransport` · `BinaryTransport` · `HashAdapter` · `LocalPosterAdapter` / `BinaryPosterAdapter`(입력 타입이 달라 자리를 바꿔 끼우면 컴파일 에러) · `BinarySourceLoader` · `PickerAdapter` · `DeviceLibraryAdapter` · `MediaLibrarySaveAdapter` / `BrowserSaveAdapter`. **어댑터는 순수 위임이고 정책은 코어가 갖는다** — 타임아웃, iCloud 기본값, 권한 합성 규칙, duration 정규화는 전부 코어 소관이라 3자 어댑터가 하드닝을 끌 수 없다.

## 4. 문구 주입

사용자에게 보이는 문구는 **22키 전부** `MediaStrings`에서 온다. 내장 번들은 `enMediaStrings`(기본)와 `koMediaStrings`.

```ts
import { koMediaStrings } from '@gj-kit/expo-media/core';
import type { MediaStrings } from '@gj-kit/expo-media/core';

const strings: MediaStrings = {
  ...koMediaStrings,
  iCloudOnly: '원본이 iCloud에만 있어요. Wi-Fi에서 다시 시도해 주세요',
  // 단위 표기가 언어마다 다르므로 이 키만 함수다.
  fileTooLarge: ({ maxBytes, kind }) =>
    `${kind === 'video' ? '동영상' : '사진'}은 ${Math.round(maxBytes / 1024 / 1024)}MB까지 올릴 수 있어요`,
};
```

우선순위는 **개별 옵션 > 팩토리 `strings` > 내장 `enMediaStrings`**.

> **왜 `Partial<MediaStrings>`가 아닌가**
> 부분 객체를 허용하면 라이브러리가 새 문구 키를 추가했을 때 손조립 번들이 조용히 영어로 새어 나온다. 완전 객체를 요구하면 그 순간 **컴파일 에러로 표면화**된다 — 커스텀은 언제나 스프레드가 정답이다.

## 5. 에러 — `code` 16종

```ts
import { isMediaError, mediaErrorCode, mediaErrorUserMessage } from '@gj-kit/expo-media/core';

try {
  await media.uploadLocalFile({ uri: assetUri });
} catch (error) {
  if (!isMediaError(error)) throw error;
  const code = mediaErrorCode(error);
  if (code === 'permission-denied') openPermissionSettings();
  else if (code === 'device-icloud-only') promptICloudDownload();
  // message는 이미 사용자 노출 가능 문구다(strings 주입 결과).
  else showToast(mediaErrorUserMessage(error) ?? '');
}
```

| code | 언제 |
|---|---|
| `device-timeout` | 자산 정보 조회 데드라인 초과(15s / iCloud 옵트인 시 60s) |
| `device-icloud-only` | 원본이 iCloud에만 있고 다운로드 옵트인이 없음 |
| `device-not-found` | 로컬 파일 없음/판독 불가 |
| `device-library-failed` | 기기 라이브러리 adapter/OS 조회 실패 — 원문은 공개하지 않음 |
| `picker-failed` | 피커 adapter/웹 바이너리 로더 실패 — 원문은 공개하지 않음 |
| `unsupported-file-type` | 지원 8형식 밖 |
| `file-too-large` | `limits` 초과 |
| `upload-failed` | presign·스토리지 PUT·등록(finalizer) 실패 — `mediaUploadFailureInfo()`로 정리 후보 확인 |
| `poster-upload-failed` | 포스터 프레임의 로컬 생성/검증 실패(포스터 자체는 선택 사항) |
| `save-permission-denied` | 기기 저장 권한 거부 |
| `save-download-failed` | 저장용 다운로드가 2xx가 아님 |
| `permission-denied` | 사진/미디어/카메라 권한 거부 — 호스트가 "설정으로 이동" UI를 띄울 근거 |
| `no-media-selected` | 선택 결과가 비어 있음 |
| `picked-asset-invalid` | 피커 자산에 필수 정보가 없음 |
| `config-invalid` | 어댑터·네임스페이스 오구성 — 부팅 시 즉사 |
| `platform-unsupported` | 비네이티브 포크(web·SSR·RSC)의 resolve/업로드 경로 |

> **`instanceof MediaError`를 쓰지 마라 — `isMediaError`가 정본이다.**
> `splitting:false`로 엔트리마다 코어가 복제되므로 `./device`가 던진 에러를 `.`이 `instanceof`로 검사하면 **두 클래스 객체가 서로 다르다.** `MediaError`는 `Symbol.for` 태그를 달아 사본 간 인식을 보장한다. (같은 해법을 브랜드 타입에는 쓸 수 없다 — 브랜드의 목적은 위조 차단이라 전역 레지스트리가 금지다. 그래서 브랜드는 런타임 값이 없는 타입 전용 phantom property다.)
>
> `assertNeverMediaError(code)`를 `switch`의 `default`에 두면, 라이브러리가 코드를 추가할 때 소비자에게 컴파일 에러가 난다.

## 6. 텔레메트리 — 스팬 계약

`track`(감싸기)과 `begin`(수동 스팬) 2메서드. `MediaActivity`는 `succeed`/`fail`/**`cancel`** 3상태로 끝난다 — 빈 포스터처럼 "오류로 보고하면 안 되지만 성공으로 세어서도 안 되는" 종료가 실재하기 때문이다.

```ts
import type { MediaTelemetry } from '@gj-kit/expo-media/core';

export const mediaTelemetry: MediaTelemetry = {
  track: (operation, extra, run) => trackClientActivity({ operation, source: 'media', extra }, run),
  begin: (operation, extra) =>
    beginClientActivity({ operation, source: 'media', ...(extra ? { extra } : {}) }),
};
```

| operation | 종류 | payload |
|---|---|---|
| `media.upload.native` | `track` | `{ contentType, sizeBucket, hasPoster }` |
| `media.upload.web-image` | `track` | `{ contentType, sizeBucket }` |
| `media.upload.web-video` | `track` | `{ contentType, sizeBucket }` |
| `media.upload.poster.web` | `begin` | `{ sizeBucket }` → `succeed()` / `fail(error)` |
| `media.upload.poster.native` | `begin` | → `succeed({ extra: { sizeBucket } })` / `fail(error)` / `cancel({ extra: { reason: 'empty-poster' } })` |
| `media.save-to-device` | `track` | `{ imageCount, mode }` |

`operation`은 리터럴 유니언(`MediaOperation`)이라 오타가 컴파일 에러다. **이름과 `sizeBucket` 경계(`under-1mb`/`1-10mb`/`10-100mb`/`over-100mb`)는 계약이다** — 바꾸면 소비자 대시보드와 과거 로그 비교가 깨진다. 유닛 테스트가 `MEDIA_OPERATIONS`를 인라인 리터럴 배열로 단언하고(스냅샷은 `-u`로 조용히 갱신되므로 쓰지 않는다), 전 파이프라인을 페이크 텔레메트리로 돌려 관측된 집합이 정확히 일치하는지 확인한다.

텔레메트리는 관측자다. 호스트의 `track`/`begin` 또는 span 종료 메서드가 throw·reject·미종료여도
업로드·저장 결과를 바꾸거나 멈출 수 없으며, 어댑터 자체가 받은 raw 오류는 public error·다른
telemetry sink로 전달되지 않는다. 구현은 그래도 `run()`의 결과를 그대로 return/rethrow해야 한다.

기기 라이브러리 경로는 **의도적으로 텔레메트리를 방출하지 않는다** — 그 진단은 앱 경계에 두는 것이 전신의 결정이었고, 방출 지점 없는 슬롯은 죽은 인자다. 그래서 `createDeviceLibrary`·`createDeviceUploads`에는 `telemetry` 인자가 아예 없다.

## 7. `./testing` — 네이티브 없이 전 파이프라인

```ts
import { createBinaryUploads } from '@gj-kit/expo-media/core';
import {
  createBinarySource,
  createFakeUploadApi,
  createRecordingTelemetry,
  createRecordingTransport,
  fakeBytes,
  fakePlatform,
} from '@gj-kit/expo-media/testing';

const uploadApi = createFakeUploadApi<Photo>({
  asset: (completion) => ({ id: completion.objectName, url: `https://cdn.test/${completion.objectName}` }),
  duplicateWhen: (completion) => completion.contentHash === 'known-duplicate',
});
const transport = createRecordingTransport();
const telemetry = createRecordingTelemetry();

const uploads = createBinaryUploads<Photo>({
  api: uploadApi,
  limits: 'server-enforced',
  platform: fakePlatform('web'),
  transport,
  telemetry,
});

await uploads.uploadBinary({
  source: createBinarySource(fakeBytes(2048), { name: 'a.jpg', type: 'image/jpeg' }),
});

// transport.puts / transport.timeline(순차 실행 증거) / uploadApi.completions /
// telemetry.spans · telemetry.operations() 로 단언한다.
```

`createMemoryFileSystem`(호출 기록 포함)·`createFakePicker`·`createFakeDeviceLibrary`·EXIF/서명 URL 픽스처도 같은 엔트리에 있다. peer 0이므로 소비 앱의 jest·vitest 어디서든 로드된다.

## 8. 검증된 하드닝 — 왜 이 라이브러리인가

전부 프로덕션에서 실제로 깨졌던 것이고, 각 항목마다 **그것을 지키는 테스트**가 있다(정적 가드 또는 유닛).

| 하드닝 | 무슨 사고였나 | 어떻게 막는가 |
|---|---|---|
| **iOS 26 URLSession 크래시** | `FileSystem.uploadAsync`(레거시 URLSession 브리지)가 파일 업로드를 **시작하는 중 프로세스를 종료**시킨다. promise가 reject될 기회조차 없어 재시도도 에러 보고도 발화하지 않고, 크래시 리포트에 앱 프레임도 안 남는다 | `LocalFileTransport` 계약이 "바이트를 JS 힙으로 읽지 말 것"을 요구. 기본 어댑터는 `new File(uri).upload(…, { sessionType:'foreground', uploadType: BINARY_CONTENT })`. `hardening-guard`가 `uploadAsync` 문자열을 `src/**` 전역에서 0건으로 고정 |
| **PhotoKit `ph://` 핸드오프** | iOS `localUri`가 Photos 컨테이너를 가리켜 stat은 통과하지만 네이티브 URLSession을 죽인다 | `normalizeUploadUri` 순수 함수: `ph://` 후보는 **복사 시도조차 하지 않고** 건너뛰고, iOS는 `file://`이어도 **반드시 앱 캐시로 카피**한다. 카피 실패는 다음 후보로 진행 |
| **Android `fileSize` 불일치** | `quality<1` 재인코딩 시 `asset.fileSize`가 **원본** 크기를 보고해 스토리지 수신 바이트와 어긋나고 서버가 거절한다 | `resolveUploadSize()` 우선순위 verified → file-system stat → reported. **필드명이 곧 신뢰도**(`verifiedSizeBytes`/`reportedSizeBytes`). 전신의 뒷문 프로퍼티 `__photoKitVerifiedSizeBytes`와 캐스트 소멸 |
| **웹 duration 초/밀리초** | expo-image-picker 웹이 `HTMLVideoElement.duration`(초)을 그대로 넘겨 **20분 영상이 1200ms로 저장**되고 어떤 길이 캡도 통과했다 | `normalizeDurationMs(raw, os)` 단일 지점. 필드명이 `durationRaw`이고 TSDoc이 "어댑터는 변환 금지"를 명시해 이중 변환을 차단 |
| **Android 13+ granular 권한** | 목록을 생략하면 매니페스트의 **모든** 권한이 대상이 되어, 거부된 `READ_MEDIA_AUDIO`가 유효한 사진 허용을 거부처럼 보이게 만든다 | 읽기 경로는 `['photo','video']` 고정. `hardening-guard`가 `src/device/**`의 권한 호출에 목록 인자를 강제한다(저장 경로의 `writeOnly` 요청만 명시 예외) |
| **iCloud 원본 무단 다운로드** | 레거시 API는 `shouldDownloadFromNetwork` 기본이 **true**라 백그라운드 동기화가 셀룰러 전송을 시작한다 | 기본 **false** + 전경 옵트인, **15s/60s 이중 타임아웃**, `onICloudDownload`는 `finally` 보장. 어댑터는 `downloadFromNetwork`를 **필수 인자**로 받아 기본값 결정권이 없다 |
| **스테이징 사본 누수** | 정리 누락 시 업로드한 **모든 사진의 원본 사본**이 앱 컨테이너에 영구 축적된다 | `staging`이 `createDeviceLibrary`의 **필수 인자** — 사본을 만드는 주체가 지우는 주체를 반드시 갖는다. 삭제는 프리픽스 3조건(캐시 디렉토리 시작 + 파일명 prefix + 하위 경로 없음)으로 자기 파일만. 호스트 이름 누출(`memorylog-upload-`) 대신 `namespace` 설정 |
| **서명 URL 로그·공개 에러 유출** | iOS URLSession/백엔드/등록 실패가 **임시 자격증명이 든 서명 URL 전문**을 에러 메시지로 에코했다 | debug만 `summarizeUri`/`sanitizeMediaErrorMessage`로 URL→`[URL]` 치환 + 1000자 절단. public error·telemetry에는 새 `MediaError`만 전달하고, recovery API에는 URL 없는 object metadata만 남긴다 |
| **base64 청크 정렬** | 3바이트 = base64 4문자. 청크가 3의 배수가 아니면 윈도우 경계에 패딩이 끼어 **해시가 조용히 틀린다** | `HASH_CHUNK_BYTES = 3*256*1024` 고정 + 가드가 `% 3 === 0`을 단언. 공개 `computeChunkRanges(size)`에서 `chunkBytes` 인자를 **제거**(전신은 기본 인자로 열려 있었고 그게 회귀 통로였다). node:crypto 대조 13종 크기 |
| **혼합 드롭 부분 업로드** | 미지원 파일을 필터링하고 나머지를 올려서, 사용자가 결과도 모르고 거절된 파일을 고칠 수도 없었다 | `uploadDropped`가 **첫 presign 이전에** 배치 전체 검증. 유닛이 `createUploadIntent` 호출 0회를 단언 |
| **EXIF 타임존** | EXIF DateTime에는 타임존이 없다. UTC로 읽으면 12:30 KST 촬영이 경로에 따라 9시간 어긋나 MediaLibrary `creationTime` 경로와 다른 날짜에 묶인다 | 기본 `mediaMetadataFromExif()`는 **기기 로컬 벽시계** 해석을 보존한다. 활동/여행처럼 저장된 offset이 있으면 `capturedAtFromExif(exif, { timeZoneOffsetMinutes })`가 현재 기기 시간대 없이 strict wall clock을 UTC로 바꾼다. GPS 도분초·유리수·부호(S·W), IFD 순환 방지, 경계 검사 전부 보존 |

그 밖에 유지되는 것들: iOS 피커 원본 fast path 고정 조합(`quality:1`+`exif:true`+`allowsEditing:false`+`Current` — 단일/다중 선택이 달라지면 안 된다) · 그리드에서 자산별 `getAssetInfoAsync` 호출 금지(60장 직렬 ≈ 페이지당 20초) · 기기 자산 업로드 루프의 의도적 순차 실행 · dedup 해시 실패가 업로드를 막지 않음 · 호출자 제공 `contentHash`가 있으면 hasher 미호출 · 포스터의 no-frame·추출 실패·로컬 cap 초과만 선택적으로 건너뜀(이미 presign/PUT을 시작한 poster 실패는 recovery metadata와 함께 중단) · 정보 조회 실패 시 **core가 만든 deadline만** 재throw하고, 호스트 어댑터 실패는 후보가 있으면 생존·없으면 URL 없는 `device-library-failed`로 정규화 · 웹 포스터 이벤트 3000ms 타임아웃과 seek 상한 `min(atMs/1000, duration−0.05)` · 웹 저장의 CORS 실패 시 숨김 iframe 폴백(60초 후 제거) · 다운로드 2xx 범위 검증 + 실패 시 임시 파일 정리 · 저장 파일명 우선순위(fileName → contentType → URL 확장자 → jpg, **5자 초과 확장자 거부**).

> **`.`의 `localTransport`를 web/SSR에서 태우지 마라.** `expo-file-system`의 web 셰이프는 업로드가 `{body:'', status:0, headers:{}}`를 반환하는 **no-op**이다. `uploadLocalFile`/`uploadPickedAsset`은 이제 stat·presign·PUT 전에 `platform-unsupported`로 막고, 웹 바이너리 업로드의 정본은 `./web`의 `createFetchBinaryTransport` 하나뿐이다.

## 9. 오용 = 컴파일 에러 요약

| 오용 | 결과 |
|---|---|
| `limits` 생략 | 컴파일 에러 — 무제한은 `'server-enforced'`로 명시 |
| `createDeviceLibrary`에 `staging` 누락 | 컴파일 에러 — 사본을 만드는 주체가 지우는 주체를 갖는다 |
| `getAssetInfo` 어댑터 호출에서 `downloadFromNetwork` 생략 | 컴파일 에러 — iCloud 기본값 결정권이 어댑터에 없다 |
| `strings`에 부분 객체 | 컴파일 에러 — 스프레드로 완전 객체 |
| `LocalPosterAdapter`와 `BinaryPosterAdapter`를 바꿔 끼움 | 컴파일 에러 — 입력 타입이 다르다 |
| `SaveTarget`에 `browser` + `library` 동시 주입 | 컴파일 에러 — 판별 유니언이라 무효 조합이 표현 불가 |
| `captureAndUpload({ max: 5 })` | 컴파일 에러 — 항상 1건이므로 `max`가 옵션에 없다 |
| `telemetry` operation 이름 오타 | 컴파일 에러 — `MediaOperation` 리터럴 유니언 |
| `MediaContentType` 밖의 MIME | 컴파일 에러 — 서버 유니언과 동일한 8형식 |
| `switch`에서 새 에러 코드 누락 | `assertNeverMediaError(code)`를 `default`에 두면 컴파일 에러 |

## 10. 네이티브 실기 체크리스트

유닛·타입 테스트가 잡을 수 없는 것들이다. 외부 서비스가 아니라 **실기기**가 필요해서 CI에 없다 — 이관·업그레이드 때 손으로 한 번씩 돈다.

1. **iOS 26 실기기 대용량(>100MB) 동영상 업로드** — 앱이 살아남는가(하드닝 1).
2. **iCloud 전용 자산 resolve** — 기본은 차단되고, 옵트인하면 다운로드 후 성공하는가(하드닝 6).
3. **Android 재인코딩 자산의 크기 일치** — 스토리지 수신 바이트와 presign 크기가 같은가(하드닝 3).
4. **Android 13+ 권한 3상태** — 전체 허용 / 선택한 사진 / **오디오만 거부**된 상태에서 사진 접근이 정상인가(하드닝 5).
5. **웹 드롭 혼합 배치**(지원+미지원) — 부분 업로드 없이 전체가 거절되는가(하드닝 10).
6. **Hermes에서 15MB 파일 해시 소요 시간** — 순수 TS SHA-256이 실기 예산 안인가(§9).

`pnpm run check:expo-media-consumer`는 release workflow에서 `npm pack --ignore-scripts` 산출물을 새 Expo SDK 56 소비 앱에 설치하고, Metro의 web/iOS/Android export를 실제로 실행한다. web 번들에는 `expo-media-library`가 없어야 하며, iOS/Android는 Hermes bytecode까지 native export branch를 실제 해석해야 한다. 그래서 exports map·optional peer·vendored artifact가 선언만 맞고 실제 소비에서 깨지는 회귀를 배포 전에 잡는다.

## 11. FAQ

**Q. Expo 전용인가?**
아니다. `./core`는 peer 0이고 어댑터 seam이 열려 있어서 bare RN·브라우저·Node에서 그대로 돈다. `expo-*` 어댑터는 "기본 구현"이지 유일한 구현이 아니다.

**Q. 왜 `js-sha256`을 쓰지 않나?**
런타임 의존성 0 원칙과 충돌한다. 순수 TS 증분 SHA-256이 내장돼 있고 node:crypto와 13종 크기로 대조 검증한다. 네이티브 가속이 필요하면 `HashAdapter`를 교체한다.

**Q. 해시 계산이 실패하면 업로드가 죽나?**
아니다. 해시는 dedup **최적화**일 뿐이라 실패해도 업로드는 진행된다. 반대로 호출자가 `contentHash`를 주면 hasher를 **아예 호출하지 않는다** — 동기화 큐가 재시도 간 해시를 캐시하는 경로다.

**Q. 웹에서 피커 자산을 업로드하려면?**
`media.withPicker(picker, { web: { loader: createFetchBinarySourceLoader() } })`. 로더가 `blob:`/`data:` URI를 `NamedBinarySource`로 바꾼다. 로더 없이 웹에서 피커 자산을 올리면 `platform-unsupported`다 — 로컬 파일 스트리밍은 웹에 존재하지 않기 때문이다.

**Q. `MediaError`를 `instanceof`로 잡으면?**
잡히지 않는 조합이 있다. `isMediaError`를 써라(§5의 근거 참조).

**Q. 기기 라이브러리 정렬을 라이브러리가 보장하나?**
`fetchAlbums`는 보장한다(전량 in-memory라 `count>0` 필터 + count 내림차순을 core가 수행). `fetchPage`는 **보장하지 않는다** — 페이지 단위 재정렬은 전역 순서를 만들지 못하면서 `endCursor`와 표시 순서만 어긋나게 해 원 결함보다 나빠진다. 대신 어댑터 계약(TSDoc)과 정적 가드가 `creationTime` 내림차순을 강제한다.

## 라이선스

MIT
