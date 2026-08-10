// 설계 문서 §5.6 `"./testing"` — 백엔드 계약(`MediaUploadApi`) 페이크.
//
// 킷이 백엔드에서 받는 것은 `MediaUploadApi` 하나뿐이고, 호스트에 보고하는 것은
// `MediaTelemetry` 하나뿐이다(§5.1 전신 주석). 그래서 이 페이크 하나면 **서버 없이**
// presign → PUT → complete 전 구간이 돈다.
//
// 기록부(`intents`·`completions`)가 곧 계약 검증 지점이다:
//   · `intents[i].sizeBytes` — §7 하드닝 3(크기 결정 3분기)의 결과가 그대로 presign에 실린다.
//     "스토리지가 실제로 받는 바이트와 presign에 적은 값이 어긋나면 서버가 거절한다"가
//     그 하드닝의 이유이므로, 이 값과 `RecordingTransport.puts[i].sizeBytes`의 일치가 직접 증거다.
//   · `completions[i].contentHash` — §7.1 「호출자 제공 contentHash 우선」의 직접 증거.
//   · `completions[i].poster` — 쌍 객체(§6.1-②)가 반쪽으로 새지 않았는지.
//
// ⚠ peer 0 · DOM 0.

import type {
  MediaUploadApi,
  MediaUploadCompletion,
  MediaUploadIntent,
  MediaUploadIntentRequest,
  UploadResult,
} from '../core/types';
import { signedUploadUrl } from './fixtures';

export type FakeUploadApiOptions<TAsset> = {
  /** 완료 페이로드 → 호스트 자산. 테스트가 무엇을 자산으로 볼지 직접 정한다. */
  readonly asset: (input: MediaUploadCompletion) => TAsset;
  /**
   * 중복 판정.
   * ⚠ `UploadResult.duplicate`는 **필수 필드**다(§6.1-⑯) — 옵셔널이면 호스트가 판정을
   *   돌려주지 않을 때 킷이 "새로 만들어졌다"로 오독하고, 중복 취소 경로가 사용자의 예전
   *   사진을 지운다. 그 분기를 유닛에서 돌리려면 여기에 주입구가 있어야 한다.
   */
  readonly duplicateWhen?: ((input: MediaUploadCompletion) => boolean) | undefined;
  /** 오브젝트 키 결정. 기본 `objects/<순번>-<fileName>`. */
  readonly objectName?: ((input: MediaUploadIntentRequest, index: number) => string) | undefined;
  /** 서명 URL 발급. 기본은 §7 하드닝 8용 서명 URL 픽스처다. */
  readonly uploadUrl?: ((objectName: string) => string) | undefined;
  /** presign 응답 헤더. 기본 `{ 'content-type': <요청 contentType> }`. */
  readonly headers?:
    | ((input: MediaUploadIntentRequest) => Readonly<Record<string, string>>)
    | undefined;
};

export interface FakeUploadApi<TAsset> extends MediaUploadApi<TAsset> {
  readonly intents: readonly MediaUploadIntentRequest[];
  readonly completions: readonly MediaUploadCompletion[];
  /** 발급한 슬롯 — `intents[i]`와 순번이 같다. PUT된 URL과의 대조에 쓴다. */
  readonly issued: readonly MediaUploadIntent[];
}

export function createFakeUploadApi<TAsset>(
  options: FakeUploadApiOptions<TAsset>,
): FakeUploadApi<TAsset> {
  const intents: MediaUploadIntentRequest[] = [];
  const completions: MediaUploadCompletion[] = [];
  const issued: MediaUploadIntent[] = [];

  return {
    intents,
    completions,
    issued,

    createUploadIntent(input): Promise<MediaUploadIntent> {
      const index = intents.length;
      intents.push(input);
      const objectName = options.objectName?.(input, index) ?? `objects/${index}-${input.fileName}`;
      const intent: MediaUploadIntent = {
        uploadUrl: (options.uploadUrl ?? signedUploadUrl)(objectName),
        method: 'PUT',
        headers: options.headers?.(input) ?? { 'content-type': input.contentType },
        objectName,
      };
      issued.push(intent);
      return Promise.resolve(intent);
    },

    completeUpload(input): Promise<UploadResult<TAsset>> {
      completions.push(input);
      return Promise.resolve({
        asset: options.asset(input),
        duplicate: options.duplicateWhen?.(input) ?? false,
      });
    },
  };
}
