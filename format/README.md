# @gj-kit/format

**English** · [한국어](./README.ko.md)

Explicit-by-construction date, number, byte, duration, and Korean currency formatting for TypeScript.

## Golden path

> **Outcome:** A stable display label whose timezone and separator are explicit at the call site.

### 1. Install

```sh
pnpm add @gj-kit/format
```

### 2. Keep the app-owned boundary explicit

Choose the timezone and separator in code; do not let persisted or operational values inherit device defaults.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { formatDateTime } from '@gj-kit/format';

export const dateLabel = formatDateTime(Date.UTC(2026, 7, 26, 0, 0), {
  timeZone: 'Asia/Seoul',
  separator: '-',
});
```

## Use it when

Use it when timezone, locale, unit, and currency rendering choices must be visible in the call site.

## Do not use it when

Do not use it to own application copy, user locale preference, or financial rounding policy outside its documented contract.

## Runtime and peers

This package has no peer dependencies.

## Public entry points

- `@gj-kit/format`

## Safety boundary

Do not rely on implicit device timezone or locale defaults for persisted or operational values.

## Documentation

- [Package guide](https://gj-kit.github.io/gj-kit/packages/format/)
- [Complete API reference](https://gj-kit.github.io/gj-kit/api/format/)
- [Machine-readable API JSON](https://gj-kit.github.io/gj-kit/api/format.json)

The documentation references the npm-latest declaration snapshot. Use only documented public entry points; do not deep-import internal source files.

## Release notes and support

- [Changelog](./CHANGELOG.md)
- [GitHub repository](https://github.com/gj-kit/gj-kit/tree/main/format)
- [npm package](https://www.npmjs.com/package/@gj-kit/format)
