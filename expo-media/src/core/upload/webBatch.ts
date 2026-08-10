// 설계 문서 §5.4-② `uploadDropped` · §7 하드닝 10 — 혼합 드롭 부분 업로드 방지.
//
// 전신 `uploader.ts:626-635`의 주석이 사고의 전부다:
//
//   "Validate the whole selected batch before the first presign/PUT. Filtering
//    unsupported files used to let a mixed drop partially upload, leaving the person
//    with an unclear result and no way to correct the rejected file."
//
// 즉 **필터링은 조용히 깨지는 부류였다** — 사용자는 5장을 떨궜는데 3장만 올라간 것을 알 수 없고,
// 거절된 2장을 고칠 방법도 없었다. 그래서 검증은 첫 presign **이전**에 배치 전체를 대상으로 한 번,
// 실패는 전체 실패다.
//
// ⚠ 검증 순서도 계약이다: `maxFiles` slice **이후**에 검증한다(전신 623 → 630 순서).
//    반대로 하면 상한 밖의 미지원 파일 때문에 유효한 배치가 통째로 거절된다.

import type { NamedBinarySource } from '../adapters';
import { MediaError } from '../errors';
import { isSupportedMediaFile } from '../mediaTypes';
import type { MediaStrings } from '../strings';
import type { UploadResult } from '../types';
import { DEFAULT_MAX_DROPPED_FILES } from './uploader';

/**
 * 배치 전체 검증. 하나라도 미지원이면 `unsupported-file-type`으로 즉시 실패한다.
 *
 * ⚠ `isSupportedMediaFile`이 DOM `File`이 아니라 `{ name, type? }` 구조 타입을 받는 덕분에
 *    core가 DOM lib 없이 이 하드닝을 갖는다(§7 하드닝 10의 "보존 형태").
 */
export function assertAllSupportedMedia(
  files: readonly NamedBinarySource[],
  strings: MediaStrings,
): void {
  if (files.some((file) => !isSupportedMediaFile(file))) {
    throw new MediaError('unsupported-file-type', strings.unsupportedFileType);
  }
}

/**
 * 웹 드롭 다건 업로드의 본체. `BinaryUploads.uploadDropped`가 이것에 위임한다.
 *
 * 순차 실행이다 — 전신 `uploadWebMediaFiles`(uploader.ts:637-671)의 `for ... await` 루프 보존.
 * 브라우저 탭 하나가 12개 PUT을 동시에 시작하면 각 업로드의 체감 속도가 함께 나빠진다.
 */
export async function uploadDroppedFiles<TAsset, TCollectionId extends string = string>(input: {
  readonly files: readonly NamedBinarySource[];
  readonly options?:
    | {
        readonly collectionId?: TCollectionId | null | undefined;
        readonly maxFiles?: number | undefined;
      }
    | undefined;
  readonly strings: MediaStrings;
  readonly uploadBinary: (item: {
    readonly source: NamedBinarySource;
    readonly collectionId?: TCollectionId | null | undefined;
  }) => Promise<UploadResult<TAsset>>;
}): Promise<readonly UploadResult<TAsset>[]> {
  const maxFiles = input.options?.maxFiles ?? DEFAULT_MAX_DROPPED_FILES;
  const mediaFiles = input.files.slice(0, maxFiles);
  if (!mediaFiles.length) {
    // 전신은 bare `Error`였다(uploader.ts:625) — code로 분류할 방법이 없었다(§5.2 신설 6종).
    throw new MediaError('no-media-selected', input.strings.noMediaFiles);
  }
  assertAllSupportedMedia(mediaFiles, input.strings);

  const uploaded: UploadResult<TAsset>[] = [];
  for (const source of mediaFiles) {
    uploaded.push(
      await input.uploadBinary({
        source,
        collectionId: input.options?.collectionId,
      }),
    );
  }
  return uploaded;
}
