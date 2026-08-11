# gj-kit

Reusable TypeScript libraries for Expo, React Native, and Toss Payments.

| Package | Description |
| --- | --- |
| [`@gj-kit/expo-ui`](./expo-ui) | Accessible Expo and React Native UI primitives. |
| [`@gj-kit/expo-media`](./expo-media) | Expo and React Native media pipeline utilities. |
| [`@gj-kit/toss-payments`](./toss-payments) | Type-safe Toss Payments widget and API v2 integration. |
| [`@gj-kit/toss-payments-nestjs`](./toss-payments-nestjs) | NestJS integration for `@gj-kit/toss-payments`. |

## Installation

Packages published to npm install normally:

```bash
npm install @gj-kit/expo-ui
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
