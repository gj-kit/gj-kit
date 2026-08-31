# @gj-kit/expo-media

[![npm](https://img.shields.io/npm/v/@gj-kit/expo-media?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/expo-media)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-media)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-media)
[![license](https://img.shields.io/npm/l/@gj-kit/expo-media?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/expo-media/LICENSE)

**English** · [한국어](./README.ko.md)

> **An upload with no size limit, or an iCloud download nobody asked for, is a compile error.**

## Why this exists

Expo media failures rarely look like failures. On iOS 26 `FileSystem.uploadAsync` ends the process while it is *starting* an upload, so no promise ever rejects and no retry fires; the `localUri` MediaLibrary hands back points inside the photo library rather than your app container, so it passes `stat` and then kills URLSession mid-upload. Android still reports the original `fileSize` after a `quality<1` re-encode, so the presigned size and the bytes storage actually receives disagree.

## What it does about it

- **Unlimited uploads must be spelled out** — `createMediaKit({ api })` does not compile: `limits` is required, and `Number.POSITIVE_INFINITY` is rejected, so unlimited is written `'server-enforced'`.
- **duplicate cannot be forgotten** — `UploadResult.duplicate` is required rather than optional, because a missing flag reads as "newly created" and the cancel path then deletes the user's older photo.
- **Whoever copies owns the cleanup** — `createDeviceLibrary` will not compile without `staging`, so the factory that materializes cache copies of device photos always carries the `StagingCache.cleanup` that deletes them.
- **iCloud downloads never default on** — `adapter.getAssetInfo('id')` is a compile error: the second argument is required and carries `downloadFromNetwork`, so the caller decides on every call and no adapter can quietly inherit the legacy default of `true` that started cellular transfers.
- **Peer isolation is a CI assertion** — The `dist-peer-graph` guard re-extracts each entry's external specifiers from the built output across browser/node/native by ESM/CJS; `./core`, `./image/pure`, `./web` and `./testing` resolve zero peers.

## Golden path

> **Outcome:** An Expo-backed media kit while your application keeps upload authorization.

### 1. Install

```sh
pnpm add @gj-kit/expo-media
```

### 2. Keep the app-owned boundary explicit

Implement `uploadApi` in your app for upload intent and completion, then declare explicit file limits.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { createMediaKit, type MediaUploadApi } from '@gj-kit/expo-media';

type Asset = { readonly id: string };
declare const uploadApi: MediaUploadApi<Asset>; // Your app owns auth and upload URLs.

export const media = createMediaKit({
  api: uploadApi,
  limits: { image: { maxBytes: 15 * 1024 * 1024 } },
});
```

## What that looks like

When an upload dies mid-flight the error narrows into URL-free recovery metadata — a stage plus frozen object records — never the presigned URL and never the native error text.

```ts
import { createMediaKit, mediaUploadFailureInfo } from '@gj-kit/expo-media';
import type { MediaUploadApi, MediaUploadFailureInfo } from '@gj-kit/expo-media';

declare const uploadApi: MediaUploadApi<{ readonly id: string }>; // App owns auth + upload URLs.
declare function reconcile(failure: MediaUploadFailureInfo): Promise<void>; // App owns cleanup.

// `limits` is required, and there is no numeric escape hatch:
//   createMediaKit({ api: uploadApi });
//   -> error TS2345: Argument of type '{ api: MediaUploadApi<...>; }' is not
//      assignable to parameter of type 'MediaKitConfig<...>'.
export const media = createMediaKit({ api: uploadApi, limits: 'server-enforced' });

export async function recover(error: unknown): Promise<void> {
  const failure = mediaUploadFailureInfo(error);
  if (!failure) throw error; // Not an upload failure — never swallow it.
  // failure.stage           : 'intent' | 'put' | 'complete'
  // failure.orphanedObjects : readonly { objectName; contentType; sizeBytes;
  //                             storageState: 'uploaded' | 'possibly-uploaded' }[]
  // No presigned URL and no native error text ever reach this value.
  await reconcile(failure);
  throw error;
}
```

## Verified, not asserted

- 0 runtime dependencies
- 80 @ts-expect-error guards
- 570+ unit tests, no expo mocking
- 17 MediaError codes, one closed union

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

## Use it when

Use it for media selection, upload preparation, hashing, device-library access, and durable local files while your app keeps its own API and storage policy.

## Do not use it when

Do not put record ownership, presign authorization, or orphan-cleanup policy in this library.

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `expo` | `>=56.0.0 <58.0.0` |
| `expo-file-system` | `>=56.0.0` |
| `expo-image-manipulator` | `>=56.0.0` |
| `expo-image-picker` | `>=16.0.0` |
| `expo-media-library` | `>=56.0.5` |
| `expo-video-thumbnails` | `>=8.0.0` |
| `react-native` | `>=0.71.0` |

## Public entry points

- `@gj-kit/expo-media`
- `@gj-kit/expo-media/core`
- `@gj-kit/expo-media/picker`
- `@gj-kit/expo-media/image`
- `@gj-kit/expo-media/image/pure`
- `@gj-kit/expo-media/device`
- `@gj-kit/expo-media/save`
- `@gj-kit/expo-media/video`
- `@gj-kit/expo-media/web`
- `@gj-kit/expo-media/testing`
- `@gj-kit/expo-media/storage`

## Safety boundary

Never expose presigned URLs or native URI details in public errors. Keep cleanup authorization and attachment transactions in the consuming application.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/expo-media/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/expo-media/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/expo-media.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/expo-media)
- [npm package](https://www.npmjs.com/package/@gj-kit/expo-media)
