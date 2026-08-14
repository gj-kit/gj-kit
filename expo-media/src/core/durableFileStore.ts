// App-owned durable attachment files.
//
// Upload staging is intentionally short-lived and cache-backed. This module is
// the other lifecycle: an app can copy a chosen local file into its own durable
// storage, persist that URI in a domain transaction, and later remove only a
// path the store itself could have created.

import type { DurableFileStoreAdapter, FileStat, PickedAsset } from './adapters';
import {
  detectMediaContentType,
  extensionForContentType,
  MEDIA_FILE_EXTENSIONS,
  type MediaContentType,
} from './mediaTypes';

const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/**
 * Durable-file failures are deliberately independent from `MediaError`.
 *
 * A durable attachment store has no user-facing upload policy, and its host
 * adapter can receive local URIs that must never reach an error boundary or a
 * log. Every code below is therefore actionable without exposing a source or
 * destination URI.
 */
export const DURABLE_FILE_ERROR_CODES = [
  'durable-file-invalid-path',
  'durable-file-root-unavailable',
  'durable-file-source-required',
  'durable-file-source-not-found',
  'durable-file-destination-exists',
  'durable-file-copy-empty',
  'durable-file-copy-size-mismatch',
  'durable-file-copy-failed',
  'durable-file-unsupported-asset',
] as const;

export type DurableFileErrorCode = (typeof DURABLE_FILE_ERROR_CODES)[number];

const DURABLE_FILE_ERROR_CODE_SET = new Set<string>(DURABLE_FILE_ERROR_CODES);
const DURABLE_FILE_ERROR_MESSAGES: Readonly<Record<DurableFileErrorCode, string>> = {
  'durable-file-invalid-path': 'The durable file path is invalid.',
  'durable-file-root-unavailable': 'Durable storage is unavailable.',
  'durable-file-source-required': 'A source file is required.',
  'durable-file-source-not-found': 'The source file is no longer available.',
  'durable-file-destination-exists': 'A durable file already exists at that destination.',
  'durable-file-copy-empty': 'The durable copy is empty.',
  'durable-file-copy-size-mismatch': 'The durable copy did not match the source file.',
  'durable-file-copy-failed': 'The durable file could not be copied.',
  'durable-file-unsupported-asset': 'The selected asset has an unsupported media type.',
};

// Core is deliberately bundled into more than one entrypoint, so `instanceof`
// is not a reliable cross-entry classification mechanism. This follows the
// same global-symbol pattern as `MediaError`, without sharing its upload-only
// code space.
const DURABLE_FILE_ERROR_TAG: unique symbol = Symbol.for('gjkit-media#DurableFileError');

/** A URI-safe error emitted by durable attachment storage. */
export class DurableFileError extends Error {
  readonly code: DurableFileErrorCode;

  constructor(code: DurableFileErrorCode) {
    super(DURABLE_FILE_ERROR_MESSAGES[code]);
    this.name = 'DurableFileError';
    this.code = code;
    Object.defineProperty(this, DURABLE_FILE_ERROR_TAG, {
      value: true,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }
}

/** Cross-entry-safe `DurableFileError` guard. */
export function isDurableFileError(error: unknown): error is DurableFileError {
  try {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as Record<string | symbol, unknown>;
    const code = candidate['code'];
    return (
      candidate[DURABLE_FILE_ERROR_TAG] === true &&
      typeof code === 'string' &&
      DURABLE_FILE_ERROR_CODE_SET.has(code)
    );
  } catch {
    // Host adapters can reject with arbitrary values, including Proxies. Error
    // inspection must never create a second failure boundary.
    return false;
  }
}

export type DurableFileStoreCopyInput = {
  readonly sourceUri: string;
  /** Nested folders below the configured root. Every segment is validated independently. */
  readonly directory?: readonly string[] | undefined;
  /** The final file name, including any extension the host chose. */
  readonly fileName: string;
};

export type DurableFile = {
  readonly uri: string;
  readonly sizeBytes: number;
};

/**
 * Copy a picker result with a caller-owned stable filename stem.
 *
 * The source filename is metadata, not a safe destination path. The store
 * validates `fileNameStem` as a path segment and appends an extension from the
 * selected asset's supported content type. This prevents an app from silently
 * relabeling every picked asset as `.jpg` while retaining its own stable ID.
 */
export type DurablePickedAssetCopyInput = {
  readonly asset: PickedAsset;
  /** Nested folders below the configured root. Every segment is validated independently. */
  readonly directory?: readonly string[] | undefined;
  /** Safe, caller-owned destination filename stem; the store adds the validated extension. */
  readonly fileNameStem: string;
};

export type DurablePickedAssetFile = DurableFile & {
  readonly fileName: string;
  readonly contentType: MediaContentType;
};

export interface DurableFileStore {
  /** True only for a safe, non-empty file path rooted in this store. */
  owns(uri: string | null | undefined): boolean;
  /** Atomically-enough copy: a failed, empty, or size-mismatched destination is removed before rejection. */
  copy(input: DurableFileStoreCopyInput): Promise<DurableFile>;
  /** Copy a picker result while retaining a supported, validated media extension. */
  copyPickedAsset(input: DurablePickedAssetCopyInput): Promise<DurablePickedAssetFile>;
  /** Best-effort no-op for paths outside this store. */
  remove(uri: string | null | undefined): Promise<void>;
}

function assertPathSegment(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !PATH_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new DurableFileError('durable-file-invalid-path');
  }
}

function normalizedRoot(uri: string | null): string | null {
  if (typeof uri !== 'string' || uri.trim().length === 0) return null;
  return uri.endsWith('/') ? uri : `${uri}/`;
}

function isSafeRelativeFilePath(value: string): boolean {
  const segments = value.split('/');
  return segments.length > 0 && segments.every((segment) => PATH_SEGMENT.test(segment));
}

function isVerifiedNonEmptyFile(
  stat: FileStat,
): stat is Extract<FileStat, { readonly kind: 'file' }> {
  // A byte count is a count, not merely a finite number. Rejecting a malformed
  // fractional/unsafe host value avoids turning a bogus `stat` result into a
  // successful integrity comparison.
  return stat.kind === 'file' && Number.isSafeInteger(stat.sizeBytes) && stat.sizeBytes > 0;
}

function supportedExtensionFromPickedAsset(
  fileName: string | undefined,
  sourceUri: string,
  contentType: MediaContentType,
): string {
  // MIME wins when the host provides it, matching the library-wide
  // `detectMediaContentType` contract. A filename/URI extension is retained
  // only when it agrees with that validated type; otherwise use the canonical
  // table extension rather than copying an untrusted suffix into the durable
  // path.
  const candidates = [fileName, sourceUri];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const extension = candidate.toLowerCase().match(/(\.[a-z0-9]+)(?:[?#].*)?$/)?.[1];
    if (extension && MEDIA_FILE_EXTENSIONS[contentType].includes(extension)) {
      return extension.slice(1);
    }
  }
  return extensionForContentType(contentType);
}

function pickedAssetCopyDetails(asset: PickedAsset): {
  readonly sourceUri: string;
  readonly contentType: MediaContentType;
  readonly extension: string;
} {
  try {
    // Snapshot every host-provided field once. Besides avoiding getter/Proxy
    // surprises, this keeps all failure paths below URI-safe.
    const sourceUri = asset.uri;
    const mimeType = asset.mimeType;
    const fileName = asset.fileName;
    if (typeof sourceUri !== 'string' || sourceUri.trim().length === 0) {
      throw new DurableFileError('durable-file-source-required');
    }

    const contentType =
      detectMediaContentType(mimeType, fileName) ?? detectMediaContentType(undefined, sourceUri);
    if (contentType === null) {
      throw new DurableFileError('durable-file-unsupported-asset');
    }
    return {
      sourceUri,
      contentType,
      extension: supportedExtensionFromPickedAsset(fileName, sourceUri, contentType),
    };
  } catch (error) {
    if (isDurableFileError(error)) throw error;
    // Do not propagate a host getter's message: it may embed an asset URI.
    throw new DurableFileError('durable-file-unsupported-asset');
  }
}

/**
 * Create a durable, app-owned file store from a host storage adapter.
 *
 * The store never trusts caller-supplied paths as complete URIs. It constructs
 * them from individually validated segments, so a cleanup request cannot turn
 * into deletion of a sibling app file through `..`, encoded separators, or a
 * prefix collision.
 */
export function createDurableFileStore(input: {
  readonly root: string;
  readonly files: DurableFileStoreAdapter;
}): DurableFileStore {
  let root: string;
  let files: DurableFileStoreAdapter;
  try {
    root = input.root;
    files = input.files;
  } catch {
    throw new DurableFileError('durable-file-copy-failed');
  }
  assertPathSegment(root);

  const rootUri = (): string | null => {
    try {
      const base = normalizedRoot(files.rootDirectory());
      return base === null ? null : `${base}${root}/`;
    } catch {
      return null;
    }
  };

  const destinationFor = (directory: readonly string[], fileName: string): {
    readonly directoryUri: string;
    readonly uri: string;
  } => {
    for (const segment of directory) assertPathSegment(segment);
    assertPathSegment(fileName);
    const storeRoot = rootUri();
    if (storeRoot === null) throw new DurableFileError('durable-file-root-unavailable');
    const directoryUri = directory.length === 0 ? storeRoot : `${storeRoot}${directory.join('/')}/`;
    return { directoryUri, uri: `${directoryUri}${fileName}` };
  };

  const owns = (uri: string | null | undefined): boolean => {
    if (typeof uri !== 'string' || uri.length === 0) return false;
    const storeRoot = rootUri();
    if (storeRoot === null || !uri.startsWith(storeRoot)) return false;
    return isSafeRelativeFilePath(uri.slice(storeRoot.length));
  };

  const copy = async (input: DurableFileStoreCopyInput): Promise<DurableFile> => {
    let sourceUri: string;
    let directory: readonly string[];
    let fileName: string;
    try {
      sourceUri = input.sourceUri;
      directory = input.directory ?? [];
      fileName = input.fileName;
    } catch {
      // Treat a hostile input object like an adapter failure; never let a
      // getter-controlled message cross this API boundary.
      throw new DurableFileError('durable-file-copy-failed');
    }
    if (typeof sourceUri !== 'string' || sourceUri.trim().length === 0) {
      throw new DurableFileError('durable-file-source-required');
    }
    if (!Array.isArray(directory)) throw new DurableFileError('durable-file-invalid-path');

    let directoryUri: string;
    let uri: string;
    try {
      ({ directoryUri, uri } = destinationFor(directory, fileName));
    } catch (error) {
      if (isDurableFileError(error)) throw error;
      throw new DurableFileError('durable-file-copy-failed');
    }

    let destinationConfirmedMissing = false;
    try {
      const destination = await files.stat(uri);
      if (destination.kind !== 'missing') {
        throw new DurableFileError('durable-file-destination-exists');
      }
      destinationConfirmedMissing = true;

      let source: FileStat;
      try {
        source = await files.stat(sourceUri);
      } catch {
        throw new DurableFileError('durable-file-source-not-found');
      }
      if (!isVerifiedNonEmptyFile(source)) {
        throw new DurableFileError('durable-file-source-not-found');
      }

      await files.ensureDirectory(directoryUri);
      await files.copy({ from: sourceUri, to: uri });

      const copied = await files.stat(uri);
      if (!isVerifiedNonEmptyFile(copied)) {
        throw new DurableFileError('durable-file-copy-empty');
      }
      if (copied.sizeBytes !== source.sizeBytes) {
        throw new DurableFileError('durable-file-copy-size-mismatch');
      }
      return { uri, sizeBytes: copied.sizeBytes };
    } catch (error) {
      if (destinationConfirmedMissing) await files.remove(uri).catch(() => undefined);
      if (isDurableFileError(error)) throw error;
      // Native file APIs often put their input URI in the thrown message.
      // Translate it before it reaches a screen, telemetry, or caller log.
      throw new DurableFileError('durable-file-copy-failed');
    }
  };

  const copyPickedAsset = async (
    input: DurablePickedAssetCopyInput,
  ): Promise<DurablePickedAssetFile> => {
    let asset: PickedAsset;
    let directory: readonly string[] | undefined;
    let fileNameStem: string;
    try {
      asset = input.asset;
      directory = input.directory;
      fileNameStem = input.fileNameStem;
    } catch {
      throw new DurableFileError('durable-file-copy-failed');
    }

    const { sourceUri, contentType, extension } = pickedAssetCopyDetails(asset);
    assertPathSegment(fileNameStem);
    const fileName = `${fileNameStem}.${extension}`;
    const durable = await copy({ sourceUri, directory, fileName });
    return { ...durable, fileName, contentType };
  };

  const remove = async (uri: string | null | undefined): Promise<void> => {
    if (typeof uri !== 'string' || !owns(uri)) return;
    await files.remove(uri).catch(() => undefined);
  };

  return {
    owns,
    copy,
    copyPickedAsset,
    remove,
  };
}
