# @gj-kit/expo-media

**English** · [한국어](./README.ko.md)

A hardened Expo and React Native media pipeline with explicit adapters and durable file boundaries.

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
