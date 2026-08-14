// Durable attachment storage type contract. This imports the implementation
// module directly while the public `./core` barrel is updated by the release
// integration change, so the storage API can be type-checked independently.

import { describe, expectTypeOf, it } from 'vitest';

import {
  DURABLE_FILE_ERROR_CODES,
  DurableFileError,
  isDurableFileError,
} from '../../src/core/durableFileStore';
import type {
  DurableFile,
  DurableFileErrorCode,
  DurableFileStore,
  DurablePickedAssetCopyInput,
  DurablePickedAssetFile,
} from '../../src/core/durableFileStore';
import type { PickedAsset } from '../../src/core/adapters';
import type { MediaContentType } from '../../src/core/mediaTypes';

declare const store: DurableFileStore;
declare const picked: PickedAsset;

describe('durable local-file store — URI-safe errors and picked-asset copy', () => {
  it('has a closed, caller-classifiable error-code union', () => {
    expectTypeOf<DurableFileErrorCode>().toEqualTypeOf<
      | 'durable-file-invalid-path'
      | 'durable-file-root-unavailable'
      | 'durable-file-source-required'
      | 'durable-file-source-not-found'
      | 'durable-file-destination-exists'
      | 'durable-file-copy-empty'
      | 'durable-file-copy-size-mismatch'
      | 'durable-file-copy-failed'
      | 'durable-file-unsupported-asset'
    >();
    expectTypeOf(DURABLE_FILE_ERROR_CODES.length).toEqualTypeOf<9>();
    // @ts-expect-error Consumers cannot manufacture arbitrary durable-file classifications.
    void new DurableFileError('durable-file-network-failed');
  });

  it('narrows unknown caught values with the cross-entry-safe guard', () => {
    const caught: unknown = new DurableFileError('durable-file-copy-failed');
    if (isDurableFileError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<DurableFileError>();
      expectTypeOf(caught.code).toEqualTypeOf<DurableFileErrorCode>();
    }
  });

  it('requires a stable filename stem and returns validated media metadata', () => {
    const input: DurablePickedAssetCopyInput = {
      asset: picked,
      directory: undefined,
      fileNameStem: 'photo-1',
    };
    expectTypeOf(store.copyPickedAsset(input)).toEqualTypeOf<Promise<DurablePickedAssetFile>>();
    expectTypeOf<DurablePickedAssetFile>().toExtend<DurableFile>();
    expectTypeOf<DurablePickedAssetFile['fileName']>().toBeString();
    expectTypeOf<DurablePickedAssetFile['contentType']>().toEqualTypeOf<MediaContentType>();
    expectTypeOf<DurableFile>().toEqualTypeOf<{
      readonly uri: string;
      readonly sizeBytes: number;
    }>();

    // @ts-expect-error Extension selection is store-owned; a caller supplies a stem, not `.jpg`.
    const legacy: DurablePickedAssetCopyInput = { asset: picked, fileName: 'photo-1.jpg' };
    void legacy;
  });
});
