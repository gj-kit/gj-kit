# @gj-kit/expo-ui

[![npm](https://img.shields.io/npm/v/@gj-kit/expo-ui?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/expo-ui)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-ui)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-ui)
[![license](https://img.shields.io/npm/l/@gj-kit/expo-ui?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/expo-ui/LICENSE)

**English** · [한국어](./README.ko.md)

> **React Native and web primitives: an unnamed IconButton, Tabs, or Slider is a compile error.**

## Why this exists

In a React Native design system the failures are silent: an IconButton ships with no accessibility label, a Tabs value is typo'd so the panel renders blank, an EmptyState action renders a button whose onPress was never wired, and a hand-assembled theme object leaks undefined into a style prop. None of that fails the build — it fails on a screen reader, in production, on someone else's device.

## What it does about it

- **Accessible names the type demands** — IconButton without accessibilityLabel, a rich-children Button with no name, and a range Slider given one label instead of a two-thumb tuple are all rejected.
- **Dead buttons do not compile** — ButtonInteractionProps is a union: onPress is required unless disabled or loading is literally true, and an EmptyState action must carry both label and onPress.
- **Tabs cannot lose a panel** — panels is typed `Readonly<Record<NoInfer<ItemValue>, NonNullable<ReactNode>>>` and value is NoInfer-wrapped, so a typo’d value, a missing panel, and a null panel all fail typecheck.
- **createTheme is the only door** — UiProvider's theme prop accepts only a branded Theme or ThemePair produced by createTheme or createThemes; a hand-assembled token object is a compile error.
- **No design literals in the source** — A guard test walks every .tsx file under src/components recursively and fails on any quoted hex color, any numeric fontSize, or any quoted numeric fontWeight.

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

## What that looks like

Tabs requires the tablist's accessible name and one non-null panel per item value, so a forgotten panel stops the build instead of rendering blank.

```tsx
import { Tabs, Text, UiProvider, createThemes } from '@gj-kit/expo-ui';

declare const onChange: (value: 'overview' | 'history') => void; // the app owns tab state
const items = [{ label: 'Overview', value: 'overview' }, { label: 'History', value: 'history' }] as const;

export const ProfileTabs = () => (
  <UiProvider theme={createThemes({ light: { colors: { primary: '#1769C2' } } })}>
    <Tabs
      accessibilityLabel="Profile sections"
      items={items}
      value="overview"
      onChange={onChange}
      // Delete the history entry below and tsc stops the build:
      // TS2741: Property 'history' is missing in type '{ overview: JSX.Element; }'
      panels={{ overview: <Text>Overview</Text>, history: <Text>History</Text> }}
    />
  </UiProvider>
);
```

## Verified, not asserted

- 0 runtime dependencies
- 332 @ts-expect-error guards
- 850+ unit tests
- 58 components, 31 color roles

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

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
