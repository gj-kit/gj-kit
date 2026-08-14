import { Directory, File, Paths } from 'expo-file-system';

import { createDurableFileStore } from '../core/durableFileStore';
import type { DurableFileStoreAdapter, FileStat } from '../core/adapters';

function expoDurableFiles(): DurableFileStoreAdapter {
  return {
    rootDirectory(): string | null {
      return Paths.document?.uri ?? null;
    },

    async ensureDirectory(uri): Promise<void> {
      new Directory(uri).create({ intermediates: true, idempotent: true });
    },

    async stat(uri): Promise<FileStat> {
      try {
        const file = new File(uri);
        if (!file.exists) return { kind: 'missing' };
        return { kind: 'file', sizeBytes: file.size };
      } catch {
        // The new File API rejects malformed and non-file URIs. At this seam a
        // source that cannot be inspected is indistinguishable from missing.
        return { kind: 'missing' };
      }
    },

    async copy({ from, to }): Promise<void> {
      await new File(from).copy(new File(to));
    },

    async remove(uri): Promise<void> {
      try {
        const file = new File(uri);
        if (file.exists) file.delete();
      } catch {
        // Removing an app-owned orphan is best-effort; callers must not lose a
        // completed domain transaction because the operating system raced us.
      }
    },
  };
}

/**
 * App-owned persistent local-file store backed by Expo's document directory.
 *
 * It deliberately does not share the cache-backed upload staging store: files
 * returned from `copy()` are safe to persist in an application's database.
 */
export function createExpoDocumentFileStore(input: {
  readonly root: string;
}) {
  return createDurableFileStore({ root: input.root, files: expoDurableFiles() });
}
