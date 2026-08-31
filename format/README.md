# @gj-kit/format

[![npm](https://img.shields.io/npm/v/@gj-kit/format?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/format)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/format)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/format)
[![license](https://img.shields.io/npm/l/@gj-kit/format?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/format/LICENSE)

**English** · [한국어](./README.ko.md)

> **Timestamps drift between screens only when someone typed them that way — timeZone has no default.**

## Why this exists

One product's admin and mobile apps carried three separate formatters: the same timestamp rendered nine hours apart, the same amount showed as ₩1,000 on one screen and 1,000원 on another, and null silently became 0. The root cause is that each of those choices had a default — new Date('2026-06-08T09:05:00') resolves against the device zone before the formatter ever sees the value, and Intl's currency path renders '1000 KRW' on an es-ES device even when the call site asked for currencyDisplay: 'symbol'.

## What it does about it

- **timeZone has no default** — `formatDateTime(instant)` does not compile, and neither does a call supplying only one of `timeZone` and `separator` — both are required, and `'device'` is a token you type rather than a default you inherit.
- **Date strings cannot reach formatters** — FormatDateInput is Date | number, so an API string must pass parseIsoInstant, whose assumeNoOffset policy ('utc' | 'device' | 'reject') is required; Date.parse is never called.
- **Byte labels cannot lie** — `{ system: 'binary', maxUnit: 'GB' }` does not compile — as a literal or through a const variable — since the two unit systems are separate union members.
- **Relative time takes an explicit clock** — now: Date is required, and maxDays/onOverflow exist only as a pair, so the library never invents an absolute rendering past your cutoff.
- **The ₩ glyph never moves with the locale** — formatKrw composes ₩ and 원 over a plain decimal formatter, and style: 'currency' / 'percent' are scanned out of both src/ and dist/; locale still decides grouping and digit glyphs.

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

## What that looks like

Both @ts-expect-error lines hold against the published dist/index.d.ts under strict + exactOptionalPropertyTypes, and fallback: null widens the return type to exactly string | null.

```ts
import { formatBytes, formatDateTime, parseIsoInstant } from '@gj-kit/format';

declare const createdAt: string; // app-owned: an ISO string straight off the API

// @ts-expect-error 'GB' labels a decimal divisor, but 'binary' divides by 1024.
formatBytes(1, { system: 'binary', maxUnit: 'GB', unitSpace: true, nonPositive: 'render' });

// @ts-expect-error a wall-clock string never reaches a formatter — parse it first.
formatDateTime(createdAt, { timeZone: 'Asia/Seoul', separator: '-' });

const instant = parseIsoInstant(createdAt, { assumeNoOffset: 'utc' });

export const stamp: string = formatDateTime(instant, { timeZone: 'Asia/Seoul', separator: '-' });

// fallback widens the return type by exactly what you passed, and nothing more.
export const sizeChip: string | null = formatBytes(0, {
  system: 'decimal', unitSpace: false, nonPositive: 'fallback', fallback: null,
});
```

## Verified, not asserted

- 0 runtime deps · 0 peers
- 350+ unit tests
- 17 @ts-expect-error misuse guards
- Forbidden-Intl scan on src and dist

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

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
