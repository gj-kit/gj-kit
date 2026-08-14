import { describe, expect, it } from 'vitest';

import { createDurableFileStore } from '../../src/core/durableFileStore';
import { createMemoryFileSystem, fakeBytes } from '../../src/testing';

const SOURCE_URI = 'file:///camera/photo.jpg';

describe('createDurableFileStore — persistent app attachment storage', () => {
  it('copies a non-empty source below the configured root and returns its verified byte size', async () => {
    const files = createMemoryFileSystem({ files: { [SOURCE_URI]: fakeBytes(42) } });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    })).resolves.toEqual({
      uri: 'file:///documents/photos/activity-42/photo-1.jpg',
      sizeBytes: 42,
    });
    expect(files.calls.ensureDirectory).toEqual(['file:///documents/photos/activity-42/']);
    expect(files.calls.copy).toEqual([
      { from: SOURCE_URI, to: 'file:///documents/photos/activity-42/photo-1.jpg' },
    ]);
    expect(files.read('file:///documents/photos/activity-42/photo-1.jpg')).toEqual(fakeBytes(42));
  });

  it('does not overwrite an existing destination', async () => {
    const destination = 'file:///documents/photos/activity-42/photo-1.jpg';
    const files = createMemoryFileSystem({
      files: { [SOURCE_URI]: fakeBytes(42), [destination]: fakeBytes(10) },
    });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    })).rejects.toThrow('DURABLE_FILE_DESTINATION_EXISTS');
    expect(files.calls.copy).toEqual([]);
    expect(files.read(destination)).toEqual(fakeBytes(10));
  });

  it('removes a partial destination when the copy operation fails after creating it', async () => {
    const backing = createMemoryFileSystem({ files: { [SOURCE_URI]: fakeBytes(42) } });
    const files = {
      ...backing,
      copy: async (input: { readonly from: string; readonly to: string }): Promise<void> => {
        await backing.copy(input);
        throw new Error('simulated native copy failure');
      },
    };
    const store = createDurableFileStore({ root: 'photos', files });
    const destination = 'file:///documents/photos/activity-42/photo-1.jpg';

    await expect(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    })).rejects.toThrow('simulated native copy failure');
    expect(backing.read(destination)).toBeNull();
    expect(backing.calls.remove).toContain(destination);
  });

  it('rejects empty sources before copying and leaves no output behind', async () => {
    const files = createMemoryFileSystem({ files: { [SOURCE_URI]: new Uint8Array() } });
    const store = createDurableFileStore({ root: 'photos', files });
    const destination = 'file:///documents/photos/activity-42/photo-1.jpg';

    await expect(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['activity-42'],
      fileName: 'photo-1.jpg',
    })).rejects.toThrow('DURABLE_FILE_SOURCE_NOT_FOUND');
    expect(files.calls.copy).toEqual([]);
    expect(files.read(destination)).toBeNull();
  });

  it('validates each path segment and refuses cleanup outside its own root', async () => {
    const files = createMemoryFileSystem({
      files: {
        [SOURCE_URI]: fakeBytes(42),
        'file:///documents/other-app/keep.jpg': fakeBytes(10),
      },
    });
    const store = createDurableFileStore({ root: 'photos', files });

    await expect(store.copy({
      sourceUri: SOURCE_URI,
      directory: ['../other-app'],
      fileName: 'photo-1.jpg',
    })).rejects.toThrow('directory segment must be a single safe path segment.');
    await store.remove('file:///documents/other-app/keep.jpg');

    expect(store.owns('file:///documents/photos/activity-42/photo-1.jpg')).toBe(true);
    expect(store.owns('file:///documents/photos/../other-app/keep.jpg')).toBe(false);
    expect(files.read('file:///documents/other-app/keep.jpg')).toEqual(fakeBytes(10));
  });
});
