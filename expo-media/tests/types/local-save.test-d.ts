// App-owned local file save contract — deliberately separate from URL download
// saving so a host cannot accidentally turn an offline durable attachment into
// a network request.

import { describe, expectTypeOf, it } from 'vitest';

import { createLocalMediaSaver } from '../../src/core';
import type {
  LocalMediaSaveFileAdapter,
  LocalMediaSaveItemResult,
  LocalMediaSaveResult,
  LocalMediaSaver,
  LocalSaveableMedia,
  MediaLibrarySaveAdapter,
} from '../../src/core';

declare const files: LocalMediaSaveFileAdapter;
declare const library: MediaLibrarySaveAdapter;

describe('local durable-file saver contract', () => {
  it('needs only stat plus a device-library adapter, not the remote download target', () => {
    const saver = createLocalMediaSaver({ files, library });
    expectTypeOf(saver).toEqualTypeOf<LocalMediaSaver>();
    expectTypeOf(saver.saveLocalToDevice([])).toEqualTypeOf<Promise<LocalMediaSaveResult>>();
  });

  it('keeps the input surface local-only and exposes closed per-item outcomes', () => {
    expectTypeOf<LocalSaveableMedia>().toEqualTypeOf<{
      readonly uri: string;
      readonly id?: string | undefined;
    }>();
    expectTypeOf<LocalMediaSaveItemResult>().toEqualTypeOf<
      | { readonly index: number; readonly id?: string | undefined; readonly status: 'saved' }
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
        }
    >();
    // @ts-expect-error Remote URL fields belong to createMediaSaver, never this local-only API.
    const remote: LocalSaveableMedia = { url: 'https://example.invalid/original.jpg' };
    void remote;
  });
});
