// App-owned durable attachment files.
//
// Upload staging is intentionally short-lived and cache-backed. This module is
// the other lifecycle: an app can copy a chosen local file into its own durable
// storage, persist that URI in a domain transaction, and later remove only a
// path the store itself could have created.

import type { DurableFileStoreAdapter } from './adapters';

const PATH_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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

export interface DurableFileStore {
  /** True only for a safe, non-empty file path rooted in this store. */
  owns(uri: string | null | undefined): boolean;
  /** Atomically-enough copy: a failed or empty destination is removed before rejection. */
  copy(input: DurableFileStoreCopyInput): Promise<DurableFile>;
  /** Best-effort no-op for paths outside this store. */
  remove(uri: string | null | undefined): Promise<void>;
}

function assertPathSegment(value: string, label: string): void {
  if (!PATH_SEGMENT.test(value) || value === '.' || value === '..') {
    throw new Error(`${label} must be a single safe path segment.`);
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
  assertPathSegment(input.root, 'root');
  const { files, root } = input;

  const rootUri = (): string | null => {
    const base = normalizedRoot(files.rootDirectory());
    return base === null ? null : `${base}${root}/`;
  };

  const destinationFor = (directory: readonly string[], fileName: string): {
    readonly directoryUri: string;
    readonly uri: string;
  } => {
    for (const segment of directory) assertPathSegment(segment, 'directory segment');
    assertPathSegment(fileName, 'fileName');
    const storeRoot = rootUri();
    if (storeRoot === null) throw new Error('DURABLE_FILE_ROOT_UNAVAILABLE');
    const directoryUri = directory.length === 0 ? storeRoot : `${storeRoot}${directory.join('/')}/`;
    return { directoryUri, uri: `${directoryUri}${fileName}` };
  };

  const owns = (uri: string | null | undefined): boolean => {
    if (typeof uri !== 'string' || uri.length === 0) return false;
    const storeRoot = rootUri();
    if (storeRoot === null || !uri.startsWith(storeRoot)) return false;
    return isSafeRelativeFilePath(uri.slice(storeRoot.length));
  };

  return {
    owns,

    async copy(input) {
      if (typeof input.sourceUri !== 'string' || input.sourceUri.trim().length === 0) {
        throw new Error('DURABLE_FILE_SOURCE_REQUIRED');
      }
      const directory = input.directory ?? [];
      const { directoryUri, uri } = destinationFor(directory, input.fileName);
      let destinationConfirmedMissing = false;
      try {
        const destination = await files.stat(uri);
        if (destination.kind !== 'missing') throw new Error('DURABLE_FILE_DESTINATION_EXISTS');
        destinationConfirmedMissing = true;

        const source = await files.stat(input.sourceUri);
        if (source.kind !== 'file' || !Number.isFinite(source.sizeBytes) || source.sizeBytes <= 0) {
          throw new Error('DURABLE_FILE_SOURCE_NOT_FOUND');
        }

        await files.ensureDirectory(directoryUri);
        await files.copy({ from: input.sourceUri, to: uri });

        const copied = await files.stat(uri);
        if (copied.kind !== 'file' || !Number.isFinite(copied.sizeBytes) || copied.sizeBytes <= 0) {
          throw new Error('DURABLE_FILE_COPY_EMPTY');
        }
        return { uri, sizeBytes: copied.sizeBytes };
      } catch (error) {
        if (destinationConfirmedMissing) await files.remove(uri).catch(() => undefined);
        throw error;
      }
    },

    async remove(uri) {
      if (typeof uri !== 'string' || !owns(uri)) return;
      await files.remove(uri).catch(() => undefined);
    },
  };
}
