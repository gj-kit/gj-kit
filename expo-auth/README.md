# @gj-kit/expo-auth

[![npm](https://img.shields.io/npm/v/@gj-kit/expo-auth?label=npm&style=flat-square&color=0a7ea4)](https://www.npmjs.com/package/@gj-kit/expo-auth)
[![CI](https://img.shields.io/github/actions/workflow/status/gj-kit/gj-kit/ci.yml?branch=main&label=CI&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/actions/workflows/ci.yml)
[![types included](https://img.shields.io/badge/types-included-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-auth)
[![runtime dependencies: 0](https://img.shields.io/badge/runtime%20deps-0-0a7ea4?style=flat-square)](https://www.npmjs.com/package/@gj-kit/expo-auth)
[![license](https://img.shields.io/npm/l/@gj-kit/expo-auth?label=license&style=flat-square&color=0a7ea4)](https://github.com/gj-kit/gj-kit/blob/main/expo-auth/LICENSE)

**English** · [한국어](./README.ko.md)

> **Token refresh for Expo, React Native and web — a missed transient branch won't compile.**

## Why this exists

Hand-rolled refresh code classifies a 5xx, a timeout or a CORS failure as a definitive rejection and signs the user out, because the refresh result is consumed by a raw `switch` that TypeScript never checks for exhaustiveness — and the branch that goes missing is always the transient one. Meanwhile a `Platform.OS` fork drags expo-secure-store into the web bundle, two tabs race the same single-use refresh token, a boolean re-entry flag lets a 401 retry fall back into the refresh path, and an option-less re-login after signOut silently promotes a session-scoped login to durable storage on a shared machine.

## What it does about it

- **Missing transient case won't compile** — matchRefreshOutcome takes all five endings as handler keys — omit one and the call fails to compile with "Property 'transient' is missing".
- **A 5xx leaves stored tokens alone** — On a `transient` outcome the core writes nothing to storage, and runAuthorized rethrows your original error instead of routing the user to sign-in.
- **Retry twice is unrepresentable** — runAuthorized requires shouldRetryAfterRefresh with no default, and the one retry it performs runs outside the refresh path — the public API has no re-entry switch.
- **signIn cannot forget persistence** — persistence is a required option on signIn's second argument, so "session login → signOut → option-less re-login" cannot silently promote tokens to durable storage.
- **No SecureStore in the web bundle** — One `./storage` subpath forks through exports conditions, so your app writes zero Platform.OS branches and the browser graph contains no expo-secure-store.

## Golden path

> **Outcome:** One app-owned session that persists login state and coordinates concurrent refreshes.

### 1. Install

```sh
pnpm add @gj-kit/expo-auth
```

### 2. Keep the app-owned boundary explicit

Choose the storage adapter once and connect only your refresh-endpoint callback.

### 3. Start with the smallest integration

Copy this first, then replace only the app-owned values named above.

```ts
import { createAuthSession, type RefreshRequest } from '@gj-kit/expo-auth';
import { createTokenStorage, createWebLocksRefreshLock } from '@gj-kit/expo-auth/storage';

declare const refresh: RefreshRequest; // Your API client classifies rotated, invalid, or transient.

export const session = createAuthSession({
  storage: createTokenStorage({ keyPrefix: 'myapp.auth' }),
  lock: createWebLocksRefreshLock({ name: 'myapp.auth' }),
  refresh,
});
```

## What that looks like

The five endings of refresh() are consumed by key, so the omission that turns a network blip into a false logout is rejected at compile time; `tokens` is reachable only after narrowing to refreshed or adopted, and a refresh callback that throws arrives here as `transient` with the thrown value in `cause`.

```ts
import { matchRefreshOutcome, type RefreshOutcome } from '@gj-kit/expo-auth';

declare const outcome: RefreshOutcome; // the app owns this — it is `await session.refresh()`
declare const goToSignIn: () => null; // the app owns navigation
declare const report: (cause: unknown) => void; // the app owns telemetry

export const accessToken = matchRefreshOutcome<string | null>(outcome, {
  refreshed: ({ tokens }) => tokens.accessToken, // `tokens` exists here and on `adopted` only
  adopted: ({ tokens }) => tokens.accessToken,
  'signed-out': () => goToSignIn(),
  invalid: () => goToSignIn(), // a definitive server rejection
  transient: ({ cause }) => {
    report(cause); // stored tokens are left untouched — a 5xx is not a sign-out
    return null;
  },
});
// Delete the `transient` line above and tsc refuses the call:
// error TS2345: ... Property 'transient' is missing in type ... but required in type ...
```

## Verified, not asserted

- 140+ tests passing (unit, native, web)
- 19 @ts-expect-error compile guards
- 0 runtime dependencies, 1 optional peer
- 5 test doubles at ./testing, peer-free

Every code block on this page is type-checked against the published declarations before release; `pnpm verify:release` is the gate all ten packages share.

## Use it when

Use it when an app needs one reusable token refresh and persistence boundary across mobile and browser clients.

## Do not use it when

Do not put application routes, identity-provider policy, telemetry, or API client ownership in the package.

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
