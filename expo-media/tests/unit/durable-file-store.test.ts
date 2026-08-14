import { describe, expect, it } from 'vitest';

import {
  createDurableFileStore,
  DurableFileError,
  isDurableFileError,
  type DurableFileErrorCode,
} from '../../src/core/durableFileStore';
import { createMemoryFileSystem, fakeBytes } from '../../src/testing';

const SOURCE_URI = 'file:///camera/photo.jpg';
const DESTINATION_URI = 'file:///documents/photos/activity-42/photo-1.jpg';
const DURABLE_FILE_ERROR_TAG = Symbol.for('gjkit-media#DurableFileError');

/** Models the distinct class emitted when another package entry bundles core. */
class OtherCopyDurableFileError extends Error {
  readonly code: string;

  constructor(code: string) {
    super('A durable copy failed.');
    this.name = 'DurableFileError';
    this.code = code;
    Object.defineProperty(this, DURABLE_FILE_ERROR_TAG, { value: true, enumerable: false });
  }
}

async function expectDurableError(
  operation: Promise<unknown>,
  code: DurableFileErrorCode,
): Promise<DurableFileError> {
  const error = await operation.catch((caught: unknown) => caught);
  expect(isDurableFileError(error)).toBe(true);
  if (!isDurableFileError(error)) throw new Error('Expected a DurableFileError.');
  expect(error.code).toBe(code);
  return error;
}

describe('createDurableFileStore — persistent app attachment storage', () => {
  it('classifies a tagged durable error from another entry without relying on instanceof', () => {
    const fromOtherEntry = new OtherCopyDurableFileError('durable-file-copy-failed');

    expect(fromOtherEntry instanceof DurableFileError).toBe(false);
    expect(isDurableFileError(fromOtherEntry)).toBe(true);
    expect(isDurableFileError({ code: 'durable-file-copy-failed' })).toBe(false);
    expect(isDurableFileError(new OtherCopyDurableFileError('not-a-real-code'))).toBe(false);
  });

  it('copies a non-empty source below the configured root and returns its verified byte size', async () => {
    const files = createMemoryFileSystem({ files: { [SOURCE_URI]: fakeBytes(42) } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    })).resolves.toEqual({
      uri: DESTINATION_URI,
      sizeBytes: 42,
    });
    expect(files.calls.ensureDirectory).toEqual(['file:///documents/photos/activity-42/']);
    expect(files.calls.copy).toEqual([
      { from: SOURCE_URI, to: DESTINATION_URI },
    ]);
    expect(files.read(DESTINATION_URI)).toEqual(fakeBytes(42));
  });

  it('does not overwrite an existing destination and gives callers a typed classification', async () => {
    const files = createMemoryFileSystem({
      files: { [SOURCE_URI]: fakeBytes(42), [DESTINATION_URI]: fakeBytes(10) },
    });
    const store = createDurableFileStore({ root: 'photos', files });

    await expectDurableError(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    }), 'durable-file-destination-exists');
    expect(files.calls.copy).toEqual([]);
    expect(files.read(DESTINATION_URI)).toEqual(fakeBytes(10));
  });

  it('translates an adapter failure without leaking its URIs and removes a partial destination', async () => {
    const backing = createMemoryFileSystem({ files: { [SOURCE_URI]: fakeBytes(42) } });
    const files = {
      ...backing,
      copy: async (input: { readonly from: string; readonly to: string }): Promise<void> => {
        await backing.copy(input);
        throw new Error(`simulated native copy failure: ${input.from} -> ${input.to}`);
      },
    };
    const store = createDurableFileStore({ root: 'photos', files });

    const error = await expectDurableError(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    }), 'durable-file-copy-failed');
    expect(error.message).not.toContain(SOURCE_URI);
    expect(error.message).not.toContain(DESTINATION_URI);
    expect(backing.read(DESTINATION_URI)).toBeNull();
    expect(backing.calls.remove).toContain(DESTINATION_URI);
  });

  it('verifies source and destination byte sizes, then removes a truncated copy', async () => {
    const backing = createMemoryFileSystem({ files: { [SOURCE_URI]: fakeBytes(42) } });
    const files = {
      ...backing,
      async copy(input: { readonly from: string; readonly to: string }): Promise<void> {
        // Simulate a native provider that reports success after a truncated copy.
        backing.write(input.to, fakeBytes(7));
      },
    };
    const store = createDurableFileStore({ root: 'photos', files });

    await expectDurableError(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    }), 'durable-file-copy-size-mismatch');
    expect(backing.read(DESTINATION_URI)).toBeNull();
    expect(backing.calls.remove).toContain(DESTINATION_URI);
  });

  it('rejects empty sources before copying and leaves no output behind', async () => {
    const files = createMemoryFileSystem({ files: { [SOURCE_URI]: new Uint8Array() } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expectDurableError(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    }), 'durable-file-source-not-found');
    expect(files.calls.copy).toEqual([]);
    expect(files.read(DESTINATION_URI)).toBeNull();
  });

  it('validates each path segment with a typed error and refuses cleanup outside its own root', async () => {
    const files = createMemoryFileSystem({
      files: {
        [SOURCE_URI]: fakeBytes(42),
        'file:///documents/other-app/keep.jpg': fakeBytes(10),
      },
    });
    const store = createDurableFileStore({ root: 'photos', files });

    await expectDurableError(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['../other-app'],
      fileName: 'photo-1.jpg',
    }), 'durable-file-invalid-path');
    await store.remove('file:///documents/other-app/keep.jpg');

    expect(store.owns('file:///documents/photos/activity-42/photo-1.jpg')).toBe(true);
    expect(store.owns('file:///documents/photos/../other-app/keep.jpg')).toBe(false);
    expect(files.read('file:///documents/other-app/keep.jpg')).toEqual(fakeBytes(10));
  });

  it('reports unavailable durable storage without leaking its root URI', async () => {
    const files = createMemoryFileSystem({
      rootDirectory: null,
      files: { [SOURCE_URI]: fakeBytes(42) },
    });
    const store = createDurableFileStore({ root: 'photos', files });

    await expectDurableError(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    }), 'durable-file-root-unavailable');
  });

  it('copies a picked asset with its validated HEIC extension instead of assuming JPEG', async () => {
    const sourceUri = 'file:///camera/IMG_0001.HEIC';
    const files = createMemoryFileSystem({ files: { [sourceUri]: fakeBytes(42) } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copyPickedAsset({
      asset: {
        uri: sourceUri,
        fileName: 'IMG_0001.HEIC',
        mimeType: 'image/heic',
      },
      directory: ['activity-42'],
      fileNameStem: 'photo-1',
    })).resolves.toEqual({
      uri: 'file:///documents/photos/activity-42/photo-1.heic',
      sizeBytes: 42,
      fileName: 'photo-1.heic',
      contentType: 'image/heic',
    });
  });

  it('retains a supported picker extension variant when it agrees with the validated type', async () => {
    const sourceUri = 'file:///camera/IMG_0002.jpeg';
    const files = createMemoryFileSystem({ files: { [sourceUri]: fakeBytes(42) } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copyPickedAsset({
      asset: {
        uri: sourceUri,
        fileName: 'IMG_0002.jpeg',
        mimeType: 'image/jpeg',
      },
      directory: ['activity-42'],
      fileNameStem: 'photo-2',
    })).resolves.toMatchObject({
      uri: 'file:///documents/photos/activity-42/photo-2.jpeg',
      fileName: 'photo-2.jpeg',
      contentType: 'image/jpeg',
    });
  });

  it('uses a canonical validated extension when picker MIME and source filename disagree', async () => {
    const sourceUri = 'file:///camera/IMG_0002.jpg';
    const files = createMemoryFileSystem({ files: { [sourceUri]: fakeBytes(42) } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copyPickedAsset({
      asset: {
        uri: sourceUri,
        fileName: 'IMG_0002.jpg',
        mimeType: 'image/png',
      },
      directory: ['activity-42'],
      fileNameStem: 'photo-2',
    })).resolves.toMatchObject({
      uri: 'file:///documents/photos/activity-42/photo-2.png',
      fileName: 'photo-2.png',
      contentType: 'image/png',
    });
  });

  it('refuses unknown picked-asset types instead of inventing a .jpg extension', async () => {
    const sourceUri = 'file:///camera/attachment.bin';
    const files = createMemoryFileSystem({ files: { [sourceUri]: fakeBytes(42) } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expectDurableError(store.copyPickedAsset({
      asset: {
        uri: sourceUri,
        fileName: 'attachment.bin',
        mimeType: 'application/octet-stream',
      },
      directory: ['activity-42'],
      fileNameStem: 'photo-3',
    }), 'durable-file-unsupported-asset');
    expect(files.calls.copy).toEqual([]);
  });
});
