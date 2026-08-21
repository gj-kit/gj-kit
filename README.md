# gj-kit

Reusable TypeScript libraries for Expo, React Native, and Toss Payments.

| Package | Description |
| --- | --- |
| [`@gj-kit/expo-ui`](./expo-ui) | Accessible Expo and React Native UI primitives. |
| [`@gj-kit/expo-media`](./expo-media) | Expo and React Native media pipeline utilities. |
| [`@gj-kit/toss-payments`](./toss-payments) | Type-safe Toss Payments widget and API v2 integration. |
| [`@gj-kit/toss-payments-nestjs`](./toss-payments-nestjs) | NestJS integration for `@gj-kit/toss-payments`. |
| [`@gj-kit/toss-payments-postgresql`](./toss-payments-postgresql) | PostgreSQL stores, migrations, and webhook inbox for `@gj-kit/toss-payments`. |

## Installation

Packages published to npm install normally:

```bash
npm install @gj-kit/expo-ui
```

For a PostgreSQL-backed Toss Payments server, install the core and adapter
together. Your application owns its chosen PostgreSQL driver:

```bash
npm install @gj-kit/toss-payments @gj-kit/toss-payments-postgresql pg
```

To install from GitHub Packages, authenticate with a GitHub token that has the
`read:packages` scope and add this to the consuming project's `.npmrc`:

```ini
@gj-kit:registry=https://npm.pkg.github.com
```

## Releases

Add a Changeset for every user-facing package change. Merging it into `main`
opens a version PR. Merging that version PR publishes to npm, creates one
GitHub Release per changed package, and publishes the release artifacts to
GitHub Packages.

Repository administrators must add an `NPM_TOKEN` Actions secret with npm
publish permission. GitHub Packages uses the workflow's built-in
`GITHUB_TOKEN`.
