# @gj-kit/expo-media

**English** · [한국어](./README.ko.md)

A hardened Expo and React Native media pipeline with explicit adapters and durable file boundaries.

## Install

```sh
pnpm add @gj-kit/expo-media
```

## Use it when

Use it for media selection, upload preparation, hashing, device-library access, and durable local files while your app keeps its own API and storage policy.

## Do not use it when

Do not put record ownership, presign authorization, or orphan-cleanup policy in this library.

## Golden path

Provide the two backend upload operations and explicit limits, then let createMediaKit compose the supported Expo adapters.

```ts
import * as gjKit from '@gj-kit/expo-media';

void gjKit;
```

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
