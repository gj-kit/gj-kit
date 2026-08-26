# @gj-kit/expo-auth

**English** · [한국어](./README.ko.md)

Token lifecycle primitives for Expo, React Native, and the web, including coordinated refresh and storage adapters.

## Install

```sh
pnpm add @gj-kit/expo-auth
```

## Use it when

Use it when an app needs one reusable token refresh and persistence boundary across mobile and browser clients.

## Do not use it when

Do not put application routes, identity-provider policy, telemetry, or API client ownership in the package.

## Golden path

Start from the root token lifecycle API and import the storage subpath only for the platform storage adapter you need.

```ts
import * as gjKit from '@gj-kit/expo-auth';

void gjKit;
```

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `expo-secure-store` | `>=14.0.0` |

## Public entry points

- `@gj-kit/expo-auth`
- `@gj-kit/expo-auth/storage`
- `@gj-kit/expo-auth/testing`

## Safety boundary

Treat tokens as secrets: use the supplied error contracts and never log token strings or raw authorization responses.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/expo-auth/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/expo-auth/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/expo-auth.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/expo-auth)
- [npm package](https://www.npmjs.com/package/@gj-kit/expo-auth)
