// Staged media selection — a pure, UI-free model for "pick now, upload later" screens.
//
// 전신: memorylog2 `apps/mobile/src/photos/pendingPhotos.ts`. 그 모듈이 라이브러리에 속하는 부분만
// 올렸다 — identity(dedup 키), 상한과 거절 사유, preview 자원 수명주기, HEIC/HEIF preview 게이팅,
// 촬영 시각 추출. 제품 문구("최대 N장"), notice, React state, 업로드 orchestration은 앱에 남는다.
//
// 이 파일은 `src/core/**`의 순수성 규율을 따른다 — DOM `File`·`URL.createObjectURL`은 여기 없다.
// 바이너리 항목은 `NamedBinarySource`(구조 타입)를 감싸고, object URL의 생성·해제는 `"./web"`의
// `pendingItemFromFile`이 `previewUri`/`revoke` 클로저로 주입한다. 그래서 전 동작이 node vitest에서 돈다.
//
// 설계 결정:
//   · state는 **불변 순서 목록**이다. 모든 연산은 새 state를 돌려주고, 변화가 없으면 **같은 참조**를
//     돌려준다(React `setState` bail-out이 그것에 기댄다).
//   · dedup 1차 키는 `assetId`, 폴백은 `uri`다. 스테이징 사본 uri는 resolve마다 재생성되므로 uri만
//     쓰면 같은 사진을 두 번 골라도 통과한다(`PickedAsset.assetId` TSDoc · §3.3-⑥).
//   · `revoke`는 항목 객체당 **정확히 한 번**이다. React StrictMode의 updater 이중 실행, `remove` 뒤의
//     `clear`처럼 같은 객체가 두 번 떠나는 경로가 실재한다. 레지스트리는 `globalThis`의 전역 심볼에
//     두어 `.`/`./core` 엔트리 사본과 ESM/CJS 사본이 **하나의 WeakSet**을 공유한다(`MediaError` 태그와
//     같은 이유 — `splitting:false`로 코어가 엔트리마다 복제된다).
//   · `add`는 거절 항목을 **해제하지 않는다.** 거절된 중복이 state 안의 항목과 같은 객체일 수 있어
//     (같은 항목을 두 번 add) 자동 해제는 살아 있는 preview를 죽인다. 그래서 `add`가 state에 없는
//     거절 객체만 `releasable`로 골라 주고, 호출자는 `release(result.releasable)`로 명시한다 —
//     전신 호출부(`releasePendingPhotos(rejected)`)의 형태를 같은-객체 중복에 안전하게 만든 것이다.

import type { NamedBinarySource, PickedAsset } from './adapters';
import { MediaError, packageGlobalKey } from './errors';
import { inferMediaContentType } from './mediaTypes';
import { mediaMetadataFromExif, mediaMetadataFromJpeg } from './metadata';

/** A picker, camera, or device-library asset staged for a later upload. */
export type PendingPickedItem = {
  readonly kind: 'picked';
  readonly asset: PickedAsset;
};

/**
 * A binary (web `File`, `Blob`, or any `NamedBinarySource`) staged for a later upload.
 *
 * Core never touches DOM APIs, so the preview resource is injected: `previewUri` is whatever the
 * host can render (typically an object URL) and `revoke` releases it. On web,
 * `pendingItemFromFile` from `@gj-kit/expo-media/web` builds this shape from a DOM `File`.
 */
export type PendingBinaryItem = {
  readonly kind: 'binary';
  readonly source: NamedBinarySource;
  /** Renderable preview URI (for example an object URL). Omit when none exists. */
  readonly previewUri?: string | undefined;
  /**
   * Releases the preview resource. The selection calls it **at most once per item object**, when
   * the item leaves a selection through `remove`/`clear`, or when the host passes it to `release`.
   */
  readonly revoke?: (() => void) | undefined;
  /**
   * Modification timestamp (ms epoch) folded into the dedup key, e.g. DOM `File.lastModified`.
   * Without it two binaries with the same name and size are considered the same file.
   */
  readonly lastModified?: number | undefined;
};

export type PendingMediaItem = PendingPickedItem | PendingBinaryItem;

/** Ordered, immutable selection. Every operation returns a new array or the same reference. */
export type PendingSelectionState = readonly PendingMediaItem[];

/**
 * Why an item did not enter the selection.
 * - `duplicate`: an item with the same `keyOf` is already staged (or appeared earlier in the batch).
 * - `over-limit`: the selection already holds `max` items.
 */
export type PendingRejectionReason = 'duplicate' | 'over-limit';

export type PendingRejection = {
  readonly item: PendingMediaItem;
  readonly reason: PendingRejectionReason;
};

export type PendingAddResult = {
  /** The next state. Same reference as the input when nothing was added. */
  readonly state: PendingSelectionState;
  /** Items that entered the selection, in input order. */
  readonly added: readonly PendingMediaItem[];
  /**
   * Items that did not enter the selection, in input order, with the reason. Use it for messaging.
   * A `duplicate` entry can be the very object that is already staged (the host re-added it), so
   * do not release this list directly — release `releasable`.
   */
  readonly rejected: readonly PendingRejection[];
  /**
   * Rejected items that are safe to hand to `release`: every rejected item that is not the same
   * object as an item in `state`, each object once, in input order. Their `revoke` has not been
   * called. Picked items and binaries without `revoke` may appear here; `release` ignores them.
   */
  readonly releasable: readonly PendingMediaItem[];
};

export interface PendingSelection {
  /** The configured cap. */
  readonly max: number;
  /**
   * Stable identity of an item: `asset:<assetId>` (falling back to the URI when the picker gave
   * no asset id) for picked items, `binary:<name>:<size>:<lastModified>` for binaries.
   */
  keyOf(item: PendingMediaItem): string;
  /**
   * Stage items. Duplicates (by `keyOf`, including duplicates within `items`) are rejected before
   * the cap is checked, so a re-selected photo reports `duplicate` even when the selection is full.
   * Nothing is revoked here; pass the result's `releasable` to `release`. Neither `state` nor
   * `items` is mutated, and the result object and its arrays are frozen.
   */
  add(state: PendingSelectionState, items: readonly PendingMediaItem[]): PendingAddResult;
  /**
   * Drop every item whose `keyOf` equals `key`, calling `revoke` on removed binaries. Returns the
   * same reference when no item matched.
   */
  remove(state: PendingSelectionState, key: string): PendingSelectionState;
  /** Drop every item, calling `revoke` on each binary that still holds a preview resource. */
  clear(state: PendingSelectionState): PendingSelectionState;
  /**
   * Call `revoke` on binaries that are not staged — typically `PendingAddResult.releasable`.
   * Idempotent per item object; picked items and binaries without `revoke` are ignored. Passing an
   * item that is still staged kills its live preview, which is why `rejected` is not the input here.
   */
  release(items: readonly PendingMediaItem[]): void;
  /** Picked assets in selection order — the input of `uploadPickedAsset` / device resolve paths. */
  toPickedAssets(state: PendingSelectionState): readonly PickedAsset[];
  /** Binary sources in selection order — the input of `uploadBinary` / `uploadDropped`. */
  toBinarySources(state: PendingSelectionState): readonly NamedBinarySource[];
  /**
   * URI the host can render, or `null`. Picked assets always preview through their own URI. A binary
   * previews only when it has a `previewUri` **and** is not HEIC/HEIF — browsers cannot decode those,
   * and an `<img>` that never loads looks like a broken upload.
   */
  previewUriOf(item: PendingMediaItem): string | null;
  /** `previewUriOf(item) !== null`. */
  canPreview(item: PendingMediaItem): boolean;
  /**
   * Capture time as an ISO string, or `null`. Picked items read the picker EXIF dictionary; binaries
   * parse the JPEG APP1 segment from bytes (the same parsers the upload path uses). Never throws.
   */
  capturedAtOf(item: PendingMediaItem): Promise<string | null>;
}

export type PendingSelectionOptions = {
  /** Maximum number of staged items. Must be a positive integer; otherwise `MediaError('config-invalid')`. */
  readonly max: number;
};

const EMPTY_STATE: PendingSelectionState = Object.freeze([]);

/**
 * 항목 객체당 revoke 1회를 지키는 레지스트리의 전역 키. 같은 항목이 두 selection 인스턴스를 거쳐도
 * (예: 화면이 인스턴스를 재생성) preview 자원은 하나뿐이다. 항목 객체가 GC되면 함께 사라진다.
 *
 * 모듈 변수가 아니라 `globalThis`의 전역 심볼인 이유: `splitting:false`(§2.4)로 코어가 엔트리마다
 * 복제되므로 `.`의 selection이 스테이징한 항목을 `./core`의 selection이 clear하는 경로(README 레시피가
 * 정확히 그 둘을 함께 import한다)에서 모듈 WeakSet은 **둘**이 된다. `MediaError` 태그와 같은 해법이다.
 */
const REVOKED_ITEMS_KEY: symbol = Symbol.for(packageGlobalKey('revokedPendingItems'));

type RevokedRegistry = WeakSet<PendingBinaryItem>;

let revokedItems: RevokedRegistry | undefined;

function sharedRevokedRegistry(): RevokedRegistry | undefined {
  if (typeof globalThis !== 'object') return undefined;
  const host = globalThis as unknown as Record<symbol, unknown>;
  const existing = host[REVOKED_ITEMS_KEY];
  if (existing instanceof WeakSet) return existing as RevokedRegistry;
  const created: RevokedRegistry = new WeakSet();
  try {
    // enumerable:false — 호스트가 전역을 열거·직렬화해도 잡음이 되지 않게. 전역이 동결된 환경
    // (SES lockdown 등)에서는 실패하며, 그때는 사본별 레지스트리로 물러난다.
    Object.defineProperty(host, REVOKED_ITEMS_KEY, {
      value: created,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  } catch {
    return undefined;
  }
  return created;
}

function revokedRegistry(): RevokedRegistry {
  revokedItems ??= sharedRevokedRegistry() ?? new WeakSet();
  return revokedItems;
}

function releaseItem(item: PendingMediaItem): void {
  if (item.kind !== 'binary' || typeof item.revoke !== 'function') return;
  const revoked = revokedRegistry();
  if (revoked.has(item)) return;
  revoked.add(item);
  try {
    item.revoke();
  } catch {
    // 해제 실패의 대가는 preview 자원 하나다. 항목 제거 자체를 되돌릴 이유가 없다.
  }
}

function keyOfItem(item: PendingMediaItem): string {
  if (item.kind === 'picked') {
    const { assetId, uri } = item.asset;
    // 빈 문자열 assetId는 정체성이 아니다 — uri로 폴백한다.
    return `asset:${assetId !== undefined && assetId !== '' ? assetId : uri}`;
  }
  return `binary:${item.source.name}:${item.source.size}:${item.lastModified ?? 0}`;
}

/**
 * @internal
 * HEIC/HEIF binaries cannot be decoded by browsers, so the web helper skips creating an object
 * URL for them and `previewUriOf` refuses to hand one out even if the host attached it.
 */
export function isPreviewBlockedBinary(source: NamedBinarySource): boolean {
  const contentType = inferMediaContentType(source.type, source.name);
  return contentType === 'image/heic' || contentType === 'image/heif';
}

function previewUriOfItem(item: PendingMediaItem): string | null {
  if (item.kind === 'picked') return item.asset.uri;
  if (!item.previewUri || isPreviewBlockedBinary(item.source)) return null;
  return item.previewUri;
}

async function capturedAtOfItem(item: PendingMediaItem): Promise<string | null> {
  try {
    if (item.kind === 'picked') {
      return mediaMetadataFromExif(item.asset.exif)?.capturedAt ?? null;
    }
    const metadata = await mediaMetadataFromJpeg(item.source, {
      contentType: inferMediaContentType(item.source.type, item.source.name),
    });
    return metadata?.capturedAt ?? null;
  } catch {
    return null;
  }
}

/**
 * Build a pure staged-selection model: dedup by stable identity, a hard cap with per-item
 * rejection reasons, exactly-once preview release, HEIC/HEIF preview gating, and capture-time
 * extraction. State is an immutable ordered list owned by the host (React state, a store, a
 * plain variable) — the selection holds no items itself.
 *
 * The revoke-once registry is shared through a global symbol, so the guarantee holds per item
 * object across selection instances and across the package's entry copies (`.` and `./core`,
 * ESM and CJS) within one realm.
 *
 * @throws MediaError `config-invalid` when `max` is not a positive integer.
 */
export function createPendingSelection(options: PendingSelectionOptions): PendingSelection {
  const { max } = options;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 1) {
    // ⚠ `MediaStrings`에는 이 문구의 키가 없다 — 부팅 시점의 **개발자 대상 단언**이라 화면에 도달할
    // 경로가 없다. `createStagingCache`의 네임스페이스 검증과 동형이며 `string-guard`에 같은 형태의
    // 명시 예외가 있다.
    throw new MediaError(
      'config-invalid',
      `Invalid pending selection max ${String(max)} — expected a positive integer`,
    );
  }

  return {
    max,
    keyOf: keyOfItem,

    add(state, items) {
      const seen = new Set(state.map(keyOfItem));
      const next: PendingMediaItem[] = [...state];
      const added: PendingMediaItem[] = [];
      const rejected: PendingRejection[] = [];
      for (const item of items) {
        const key = keyOfItem(item);
        // 중복을 상한보다 먼저 본다 — 가득 찬 상태에서 같은 사진을 다시 골라도 사유는 `duplicate`다.
        if (seen.has(key)) {
          rejected.push(Object.freeze({ item, reason: 'duplicate' }));
          continue;
        }
        if (next.length >= max) {
          rejected.push(Object.freeze({ item, reason: 'over-limit' }));
          continue;
        }
        seen.add(key);
        next.push(item);
        added.push(item);
      }
      // 거절 객체 중 결과 state에 **같은 객체로** 들어 있는 것은 preview가 살아 있다 — 같은 항목을
      // 다시 add한 경우(StrictMode 이중 effect, 캐시된 항목 재첨부). 그것만 빼고 한 객체당 한 번.
      const staged = new Set<PendingMediaItem>(next);
      const listed = new Set<PendingMediaItem>();
      const releasable: PendingMediaItem[] = [];
      for (const { item } of rejected) {
        if (staged.has(item) || listed.has(item)) continue;
        listed.add(item);
        releasable.push(item);
      }
      return Object.freeze({
        state: added.length === 0 ? state : Object.freeze(next),
        added: Object.freeze(added),
        rejected: Object.freeze(rejected),
        releasable: Object.freeze(releasable),
      });
    },

    remove(state, key) {
      const next: PendingMediaItem[] = [];
      let removed = false;
      for (const item of state) {
        if (keyOfItem(item) === key) {
          releaseItem(item);
          removed = true;
        } else {
          next.push(item);
        }
      }
      return removed ? Object.freeze(next) : state;
    },

    clear(state) {
      for (const item of state) releaseItem(item);
      return state.length === 0 ? state : EMPTY_STATE;
    },

    release(items) {
      for (const item of items) releaseItem(item);
    },

    toPickedAssets(state) {
      const assets: PickedAsset[] = [];
      for (const item of state) if (item.kind === 'picked') assets.push(item.asset);
      return Object.freeze(assets);
    },

    toBinarySources(state) {
      const sources: NamedBinarySource[] = [];
      for (const item of state) if (item.kind === 'binary') sources.push(item.source);
      return Object.freeze(sources);
    },

    previewUriOf: previewUriOfItem,
    canPreview: (item) => previewUriOfItem(item) !== null,
    capturedAtOf: capturedAtOfItem,
  };
}
