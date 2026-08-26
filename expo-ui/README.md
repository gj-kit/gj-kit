# @gj-kit/expo-ui

**English** · [한국어](./README.ko.md)

Accessible, token-driven UI primitives for Expo, React Native, and the web.

## Install

```sh
pnpm add @gj-kit/expo-ui
```

## Use it when

Use it when one design language, controlled component state, overlays, and accessibility behavior must work across native and web targets.

## Do not use it when

Do not use it for product routes, data stores, analytics, or product-specific copy.

## Golden path

Install the package, create your theme once, and place UiProvider at the application root before composing primitives.

```ts
import * as gjKit from '@gj-kit/expo-ui';

void gjKit;
```

## Runtime and peers

| Peer | Supported range |
| --- | --- |
| `react` | `>=18` |
| `react-native` | `>=0.79` |
| `react-native-safe-area-context` | `>=4` |
| `react-native-web` | `>=0.21` |

## Public entry points

- `@gj-kit/expo-ui`
- `@gj-kit/expo-ui/theme`
- `@gj-kit/expo-ui/insets`
- `@gj-kit/expo-ui/insets/pure`
- `@gj-kit/expo-ui/tailwind`

## Safety boundary

Keep optional safe-area and React Native Web peers behind their documented subpaths. Supply application copy through strings rather than baking product copy into primitives.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/expo-ui/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/expo-ui/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/expo-ui.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/expo-ui)
- [npm package](https://www.npmjs.com/package/@gj-kit/expo-ui)
