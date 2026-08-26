# @gj-kit/expo-ui

**English** · [한국어](./README.ko.md)

Accessible, token-driven UI primitives for Expo, React Native, and the web.

## Golden path

> **Outcome:** A themed, accessible button rendered from one application-wide provider.

### 1. Install

```sh
pnpm add @gj-kit/expo-ui
```

### 2. Keep the app-owned boundary explicit

Create themes once and mount `UiProvider` at the component that wraps your app.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```tsx
import { Button, UiProvider, enStrings } from '@gj-kit/expo-ui';
import { createThemes } from '@gj-kit/expo-ui/theme';

const themes = createThemes();

export function App() {
  return (
    <UiProvider theme={themes} strings={enStrings}>
      <Button label="Get started" onPress={() => {}} />
    </UiProvider>
  );
}
```

## Use it when

Use it when one design language, controlled component state, overlays, and accessibility behavior must work across native and web targets.

## Do not use it when

Do not use it for product routes, data stores, analytics, or product-specific copy.

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
