// App-owned local `file://` → device library save path.
//
// The remote URL saver has a different lifecycle (download into cache, save,
// cleanup). These tests lock the inverse contract: local source files are never
// downloaded/deleted, permission is requested once only when useful, and each
// native save outcome stays correlated without exposing a URI or raw error.

import { describe, expect, it } from 'vitest';

import type { MediaLibrarySaveAdapter, MediaPermission } from '../../src/core/adapters';
import { mediaErrorCode } from '../../src/core/errors';
import { createLocalMediaSaver } from '../../src/core/save/localSaver';
import { createMemoryFileSystem, createRecordingTelemetry, fakeBytes } from '../../src/testing';

const GRANTED: MediaPermission = { granted: true, canAskAgain: true, limited: false };
const DENIED: MediaPermission = { granted: false, canAskAgain: false, limited: false };

function fakeLibrary(input?: {
  readonly permission?: MediaPermission;
  readonly skipPermissionRequest?: boolean;
  readonly request?: () => Promise<MediaPermission>;
  readonly save?: (uri: string) => Promise<void>;
}): MediaLibrarySaveAdapter & { readonly saved: string[]; readonly permissionRequests: number[] } {
  const saved: string[] = [];
  const permissionRequests: number[] = [];
  return {
    saved,
    permissionRequests,
    requestWritePermission() {
      permissionRequests.push(1);
      return input?.request?.() ?? Promise.resolve(input?.permission ?? GRANTED);
    },
    async saveToLibrary(uri) {
      saved.push(uri);
      await input?.save?.(uri);
    },
    skipPermissionRequest: input?.skipPermissionRequest ?? false,
  };
}

describe('createLocalMediaSaver', () => {
  it('checks local sources first, requests permission once, and saves ready files serially in input order', async () => {
    const first = 'file:///documents/photos/a.jpg';
    const second = 'file:///documents/photos/b.heic';
    const files = createMemoryFileSystem({ files: { [first]: fakeBytes(10), [second]: fakeBytes(20) } });
    const order: string[] = [];
    const library = fakeLibrary({
      save: async (uri) => {
        order.push(`start:${uri}`);
        await Promise.resolve();
        order.push(`finish:${uri}`);
      },
    });
    const saver = createLocalMediaSaver({ files, library });

    await expect(saver.saveLocalToDevice([
      { id: 'a', uri: first },
      { id: 'b', uri: second },
    ])).resolves.toEqual({
      items: [
        { index: 0, id: 'a', status: 'saved' },
        { index: 1, id: 'b', status: 'saved' },
      ],
      savedCount: 2,
      unavailableCount: 0,
      failedCount: 0,
    });

    expect(library.permissionRequests).toEqual([1]);
    expect(library.saved).toEqual([first, second]);
    expect(order).toEqual([
      `start:${first}`,
      `finish:${first}`,
      `start:${second}`,
      `finish:${second}`,
    ]);
    // `FileSystemAdapter` happens to offer download/remove, but this path must
    // use neither: its sources remain application-owned durable artifacts.
    expect(files.calls.download).toEqual([]);
    expect(files.calls.remove).toEqual([]);
  });

  it('returns ordered unavailable results for missing, empty, directory, non-file, and stat-failed sources without prompting', async () => {
    const empty = 'file:///documents/photos/empty.jpg';
    const directory = 'file:///documents/photos/folder/';
    const statFailure = 'file:///documents/photos/stat-failure.jpg';
    const base = createMemoryFileSystem({
      files: { [empty]: new Uint8Array() },
      directories: [directory],
    });
    const files = {
      stat(uri: string) {
        if (uri === statFailure) return Promise.reject(new Error(`native stat ${uri}`));
        return base.stat(uri);
      },
    };
    const library = fakeLibrary();
    const saver = createLocalMediaSaver({ files, library });

    await expect(saver.saveLocalToDevice([
      { id: 'remote', uri: 'https://downloads.example.test/secret?signature=never-public' },
      { id: 'missing', uri: 'file:///documents/photos/missing.jpg' },
      { id: 'empty', uri: empty },
      { id: 'directory', uri: directory },
      { id: 'stat-failure', uri: statFailure },
    ])).resolves.toEqual({
      items: [
        { index: 0, id: 'remote', status: 'unavailable', errorCode: 'save-local-file-unavailable' },
        { index: 1, id: 'missing', status: 'unavailable', errorCode: 'save-local-file-unavailable' },
        { index: 2, id: 'empty', status: 'unavailable', errorCode: 'save-local-file-unavailable' },
        { index: 3, id: 'directory', status: 'unavailable', errorCode: 'save-local-file-unavailable' },
        { index: 4, id: 'stat-failure', status: 'unavailable', errorCode: 'save-local-file-unavailable' },
      ],
      savedCount: 0,
      unavailableCount: 5,
      failedCount: 0,
    });

    expect(library.permissionRequests).toEqual([]);
    expect(library.saved).toEqual([]);
    // A remote URL is rejected before stat: local saving must never acquire a
    // hidden networking fallback.
    expect(base.calls.stat).not.toContain('https://downloads.example.test/secret?signature=never-public');
  });

  it('does not attempt a save when the one permission request is denied, and exposes only a safe typed error', async () => {
    const rawUri = 'file:///documents/photos/secret?token=never-public';
    const files = createMemoryFileSystem({ files: { [rawUri]: fakeBytes(10) } });
    const library = fakeLibrary({ permission: DENIED });
    const saver = createLocalMediaSaver({ files, library });

    const error = await saver.saveLocalToDevice([{ id: 'a', uri: rawUri }]).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('save-permission-denied');
    expect(String((error as Error).message)).not.toContain(rawUri);
    expect(library.permissionRequests).toEqual([1]);
    expect(library.saved).toEqual([]);
  });

  it('normalizes URI-bearing native permission diagnostics to the same safe typed error', async () => {
    const rawUri = 'file:///documents/photos/permission-secret?token=never-public';
    const rawDiagnostic = `native permission failure for ${rawUri}`;
    const files = createMemoryFileSystem({ files: { [rawUri]: fakeBytes(10) } });
    const library = fakeLibrary({ request: () => Promise.reject(new Error(rawDiagnostic)) });
    const saver = createLocalMediaSaver({ files, library });

    const error = await saver.saveLocalToDevice([{ id: 'a', uri: rawUri }]).catch((thrown: unknown) => thrown);

    expect(mediaErrorCode(error)).toBe('save-permission-denied');
    expect(String((error as Error).message)).not.toContain(rawUri);
    expect(String((error as Error).message)).not.toContain(rawDiagnostic);
    expect(library.saved).toEqual([]);
  });

  it('continues after a native save failure and never exposes raw URI-bearing adapter errors', async () => {
    const bad = 'file:///documents/photos/bad.jpg';
    const good = 'file:///documents/photos/good.jpg';
    const rawDiagnostic = `native failure for ${bad}?token=never-public`;
    const files = createMemoryFileSystem({ files: { [bad]: fakeBytes(10), [good]: fakeBytes(20) } });
    const library = fakeLibrary({
      save: (uri) => uri === bad ? Promise.reject(new Error(rawDiagnostic)) : Promise.resolve(),
    });
    const saver = createLocalMediaSaver({ files, library });

    await expect(saver.saveLocalToDevice([{ id: 'bad', uri: bad }, { id: 'good', uri: good }])).resolves.toEqual({
      items: [
        { index: 0, id: 'bad', status: 'failed', errorCode: 'save-local-file-failed' },
        { index: 1, id: 'good', status: 'saved' },
      ],
      savedCount: 1,
      unavailableCount: 0,
      failedCount: 1,
    });
    expect(library.saved).toEqual([bad, good]);
    // The safe result is serializable and contains neither the adapter error nor a URI.
    const result = await saver.saveLocalToDevice([{ id: 'bad', uri: bad }]);
    expect(JSON.stringify(result)).not.toContain(rawDiagnostic);
    expect(JSON.stringify(result)).not.toContain(bad);
  });

  it('honours Expo Go permission skipping for a usable local file', async () => {
    const localUri = 'file:///documents/photos/expo-go.jpg';
    const library = fakeLibrary({ permission: DENIED, skipPermissionRequest: true });
    const saver = createLocalMediaSaver({
      files: createMemoryFileSystem({ files: { [localUri]: fakeBytes(10) } }),
      library,
    });

    await expect(saver.saveLocalToDevice([{ id: 'expo-go', uri: localUri }])).resolves.toMatchObject({
      savedCount: 1,
      unavailableCount: 0,
      failedCount: 0,
    });
    expect(library.permissionRequests).toEqual([]);
    expect(library.saved).toEqual([localUri]);
  });

  it('leaves one stable telemetry span even for an empty batch', async () => {
    const telemetry = createRecordingTelemetry();
    const library = fakeLibrary();
    const saver = createLocalMediaSaver({ files: createMemoryFileSystem(), library, telemetry });

    await expect(saver.saveLocalToDevice([])).resolves.toEqual({
      items: [],
      savedCount: 0,
      unavailableCount: 0,
      failedCount: 0,
    });
    expect(library.permissionRequests).toEqual([]);
    expect(telemetry.spans).toEqual([
      {
        operation: 'media.save-to-device',
        extra: { itemCount: 0, source: 'local-file' },
        kind: 'track',
        outcome: 'succeed',
      },
    ]);
  });
});
