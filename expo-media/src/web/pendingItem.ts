// `"./web"` — DOM `File` → `PendingBinaryItem` (설계 문서 §2.4 · 코어 순수성).
//
// 코어의 `createPendingSelection`은 DOM을 모른다. 바이너리 항목의 preview는 `previewUri`와 `revoke`
// 클로저로 **주입**되며, 그 둘을 실제 `URL.createObjectURL`/`URL.revokeObjectURL`에 묶는 유일한 지점이
// 이 파일이다. 전신 `pendingPhotosFromWebFiles`(memorylog2)의 File 분기를 그대로 옮겼다.
//
// ⚠ HEIC/HEIF에는 object URL을 **만들지 않는다.** 브라우저가 디코딩하지 못해 `<img>`가 영원히 깨진
//   채로 남고, 그 동안 object URL만 메모리를 붙든다. 코어의 `previewUriOf`도 같은 판정으로 게이팅하므로
//   여기서 만들어 봐야 노출되지 않는다.

import type { PendingBinaryItem } from '../core/pending-selection';
import { isPreviewBlockedBinary } from '../core/pending-selection';

/**
 * Wrap a DOM `File` as a `PendingBinaryItem` for `createPendingSelection`.
 *
 * Creates an object URL as `previewUri` (skipped for HEIC/HEIF, which browsers cannot render, and
 * in environments without `URL.createObjectURL`) and a `revoke` closure that releases it. The
 * selection calls `revoke` at most once, when the item is removed or cleared; pass the add result's
 * `releasable` items to `PendingSelection.release` yourself. `File.lastModified` becomes part of
 * the dedup key.
 */
export function pendingItemFromFile(file: File): PendingBinaryItem {
  const previewUri =
    !isPreviewBlockedBinary(file) &&
    typeof URL !== 'undefined' &&
    typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : undefined;
  return {
    kind: 'binary',
    // DOM File은 NamedBinarySource({ name, size, type?, arrayBuffer() })를 구조적으로 만족한다.
    source: file,
    lastModified: file.lastModified,
    ...(previewUri !== undefined
      ? { previewUri, revoke: () => URL.revokeObjectURL(previewUri) }
      : {}),
  };
}
