// App-owned local-file → device-library saver.
//
// This is intentionally separate from `createMediaSaver`: that API owns the
// remote URL → cache download → device-library path and cleans up its temporary
// file afterwards. Here the source is already an app-owned `file://` artifact;
// deleting it after a successful device save would break the application's
// durable attachment lifecycle.
//
// The boundary is deliberately small. Domain ownership, record lookup, batch
// limits, and remote-original fallback remain with the host. This module only
// validates local source availability, asks write permission once, and saves
// the remaining sources serially with URI-free per-item outcomes.

import type { FileStat, MediaLibrarySaveAdapter } from '../adapters';
import { MediaError } from '../errors';
import type { MediaStrings } from '../strings';
import { enMediaStrings } from '../strings';
import type { MediaTelemetry } from '../telemetry';
import { noopMediaTelemetry, trackMediaSafely } from '../telemetry';

/** A host-owned local artifact. `id` is only returned for caller-side correlation. */
export type LocalSaveableMedia = {
  readonly uri: string;
  readonly id?: string | undefined;
};

/**
 * The only per-item failures this local saver exposes. These are batch
 * outcomes, rather than thrown `MediaError`s: one bad file must not stop later
 * files from being saved. Adapter errors and URIs never escape.
 */
export type LocalMediaSaveFailureCode =
  | 'save-local-file-unavailable'
  | 'save-local-file-failed';

export type LocalMediaSaveItemResult =
  | {
      readonly index: number;
      readonly id?: string | undefined;
      readonly status: 'saved';
    }
  | {
      readonly index: number;
      readonly id?: string | undefined;
      readonly status: 'unavailable';
      readonly errorCode: 'save-local-file-unavailable';
    }
  | {
      readonly index: number;
      readonly id?: string | undefined;
      readonly status: 'failed';
      readonly errorCode: 'save-local-file-failed';
    };

export type LocalMediaSaveResult = {
  /** Input order is preserved, including unavailable sources. */
  readonly items: readonly LocalMediaSaveItemResult[];
  readonly savedCount: number;
  readonly unavailableCount: number;
  readonly failedCount: number;
};

/**
 * The local save path only needs an existence/size check. Requiring the full
 * upload `FileSystemAdapter` would make a save-only consumer implement unused
 * cache, copy, base64-read, and download capabilities.
 */
export interface LocalMediaSaveFileAdapter {
  stat(uri: string): Promise<FileStat>;
}

export interface LocalMediaSaver {
  /**
   * Saves app-owned local files in input order. A missing/empty source and an
   * OS save failure are reported per item so one bad item never prevents later
   * files from being attempted. A write-permission failure rejects once with a
   * user-safe `MediaError('save-permission-denied')` before any save attempt.
   */
  saveLocalToDevice(media: readonly LocalSaveableMedia[]): Promise<LocalMediaSaveResult>;
}

type LocalMediaSnapshot = {
  readonly index: number;
  readonly id?: string | undefined;
  readonly uri: string | null;
};

type PreparedLocalMedia =
  | { readonly kind: 'ready'; readonly item: LocalMediaSnapshot & { readonly uri: string } }
  | { readonly kind: 'unavailable'; readonly item: LocalMediaSnapshot };

function isAppOwnedLocalUri(uri: string): boolean {
  // The local-only contract is a security and lifecycle boundary: accepting an
  // https URL here would silently reintroduce an unbounded network request into
  // an API whose callers rely on it being offline/local only.
  return uri.startsWith('file://') && uri.length > 'file://'.length;
}

function snapshotMedia(media: LocalSaveableMedia, index: number): LocalMediaSnapshot {
  // Adapter-facing APIs can receive JS values from a host boundary. Read each
  // field once so a throwing getter/Proxy becomes a normal unavailable item,
  // not an exception whose message may include a local URI.
  try {
    const id = media.id;
    const uri = media.uri;
    return {
      index,
      id: typeof id === 'string' ? id : undefined,
      uri: typeof uri === 'string' ? uri : null,
    };
  } catch {
    return { index, uri: null };
  }
}

async function isUsableLocalFile(files: LocalMediaSaveFileAdapter, uri: string): Promise<boolean> {
  if (!isAppOwnedLocalUri(uri)) return false;
  try {
    const stat = await files.stat(uri);
    // Snapshot adapter values once as well: a foreign object must not pass a
    // validation read and then change shape when its size is inspected.
    const kind = stat.kind;
    const sizeBytes = kind === 'file' ? stat.sizeBytes : null;
    return kind === 'file' && typeof sizeBytes === 'number' && Number.isFinite(sizeBytes) && sizeBytes > 0;
  } catch {
    return false;
  }
}

function unavailable(item: LocalMediaSnapshot): LocalMediaSaveItemResult {
  return {
    index: item.index,
    id: item.id,
    status: 'unavailable',
    errorCode: 'save-local-file-unavailable',
  };
}

function saved(item: LocalMediaSnapshot): LocalMediaSaveItemResult {
  return { index: item.index, id: item.id, status: 'saved' };
}

function failed(item: LocalMediaSnapshot): LocalMediaSaveItemResult {
  return {
    index: item.index,
    id: item.id,
    status: 'failed',
    errorCode: 'save-local-file-failed',
  };
}

function resultFor(items: readonly LocalMediaSaveItemResult[]): LocalMediaSaveResult {
  return {
    items,
    savedCount: items.filter((item) => item.status === 'saved').length,
    unavailableCount: items.filter((item) => item.status === 'unavailable').length,
    failedCount: items.filter((item) => item.status === 'failed').length,
  };
}

async function requestWritePermissionOnce(
  library: MediaLibrarySaveAdapter,
  strings: MediaStrings,
): Promise<void> {
  try {
    if (library.skipPermissionRequest) return;
    const permission = await library.requestWritePermission();
    if (!permission.granted) throw new Error('LOCAL_SAVE_PERMISSION_DENIED');
  } catch {
    // The adapter can expose native diagnostics or even a forged MediaError.
    // Neither is safe to pass through a UI/telemetry boundary.
    throw new MediaError('save-permission-denied', strings.savePermissionDenied);
  }
}

/**
 * Create a saver for files that are already owned by the application.
 *
 * Unlike the remote `createMediaSaver`, this never downloads or deletes source
 * files. It asks the OS for write permission at most once per non-empty batch,
 * and only after confirming that at least one non-empty `file://` source is
 * available.
 */
export function createLocalMediaSaver(input: {
  readonly files: LocalMediaSaveFileAdapter;
  readonly library: MediaLibrarySaveAdapter;
  readonly strings?: MediaStrings | undefined;
  readonly telemetry?: MediaTelemetry | undefined;
}): LocalMediaSaver {
  const { files, library } = input;
  const strings = input.strings ?? enMediaStrings;
  const telemetry = input.telemetry ?? noopMediaTelemetry;

  const save = async (media: readonly LocalSaveableMedia[]): Promise<LocalMediaSaveResult> => {
    const prepared: PreparedLocalMedia[] = [];
    for (const [index, candidate] of media.entries()) {
      const item = snapshotMedia(candidate, index);
      if (item.uri === null || !(await isUsableLocalFile(files, item.uri))) {
        prepared.push({ kind: 'unavailable', item });
      } else {
        prepared.push({ kind: 'ready', item: { ...item, uri: item.uri } });
      }
    }

    // A fully unavailable batch is a terminal local answer, not a reason to
    // prompt the user for an OS permission that cannot help it succeed.
    if (prepared.some((entry) => entry.kind === 'ready')) {
      await requestWritePermissionOnce(library, strings);
    }

    const items: LocalMediaSaveItemResult[] = [];
    for (const entry of prepared) {
      if (entry.kind === 'unavailable') {
        items.push(unavailable(entry.item));
        continue;
      }

      try {
        // Deliberately serial: native media-library writes can present OS work
        // and a partial failure must not race later calls or lose input order.
        await library.saveToLibrary(entry.item.uri);
        items.push(saved(entry.item));
      } catch {
        // Keep going. The safe failure code is enough for host UI/retry policy;
        // raw native errors commonly embed full file paths and must not escape.
        items.push(failed(entry.item));
      }
    }
    return resultFor(items);
  };

  return {
    saveLocalToDevice(media) {
      return trackMediaSafely({
        telemetry,
        // Keep the established dashboard operation stable; the source marker
        // distinguishes this from the remote URL downloader without widening
        // the closed operation-name contract.
        operation: 'media.save-to-device',
        extra: { itemCount: media.length, source: 'local-file' },
        run: () => save(media),
      });
    },
  };
}
