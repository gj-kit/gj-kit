import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const write = process.argv.includes('--write');

const metadata = {
  'expo-auth': {
    description: 'Token lifecycle primitives for Expo, React Native, and web applications with coordinated refresh and platform storage adapters.',
    keywords: ['expo', 'react-native', 'web', 'auth', 'token', 'refresh-token', 'session', 'typescript'],
  },
  'expo-media': {
    description: 'Hardened Expo and React Native media pipeline utilities for upload, picker, metadata, durable files, and device libraries.',
    keywords: ['expo', 'react-native', 'media', 'upload', 'image-picker', 'video', 'file', 'typescript'],
  },
  'expo-ui': {
    description: 'Accessible, token-driven UI primitives for Expo, React Native, and React Native Web.',
    keywords: ['expo', 'react-native', 'react-native-web', 'ui', 'accessibility', 'design-system', 'typescript'],
  },
  'expo-workouts': {
    description: 'HealthKit and Health Connect workout, GPS-route, authorization, and incremental sync bridge for Expo.',
    keywords: ['expo', 'react-native', 'healthkit', 'health-connect', 'workout', 'gps-route', 'fitness', 'sync', 'typescript'],
  },
  format: {
    description: 'Explicit TypeScript formatting for dates, time zones, numbers, bytes, durations, percentages, and Korean won.',
    keywords: ['typescript', 'format', 'intl', 'timezone', 'date', 'number', 'currency', 'krw', 'bytes'],
  },
  'nest-notifications': {
    description: 'NestJS notification relay and dispatch primitives with durable stores, typed outcomes, and Expo push adapters.',
    keywords: ['nestjs', 'notifications', 'outbox', 'push-notifications', 'expo', 'typescript'],
  },
  'nest-operations-jobs': {
    description: 'NestJS primitives for authenticated, durable, observable scheduled and operator-triggered jobs.',
    keywords: ['nestjs', 'jobs', 'scheduler', 'operations', 'cron', 'typescript'],
  },
  'toss-payments': {
    description: 'Type-safe Toss Payments API v2, widget, billing, cancellation, and webhook flows for TypeScript.',
    keywords: ['toss-payments', 'payments', 'payment-widget', 'billing', 'webhook', 'typescript'],
  },
  'toss-payments-nestjs': {
    description: 'NestJS dependency injection and raw-body webhook integration for @gj-kit/toss-payments.',
    keywords: ['toss-payments', 'nestjs', 'payments', 'webhook', 'dependency-injection', 'typescript'],
  },
  'toss-payments-postgresql': {
    description: 'PostgreSQL stores, migrations, webhook inbox, and encryption seams for @gj-kit/toss-payments.',
    keywords: ['toss-payments', 'postgresql', 'payments', 'webhook', 'migrations', 'typescript'],
  },
};

for (const [directory, expected] of Object.entries(metadata)) {
  const manifestPath = path.join(root, directory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const expectedHomepage = `https://gj-kit.github.io/gj-kit/packages/${directory}/`;
  const expectedFiles = [...new Set([...(manifest.files ?? []), 'README.md', 'README.ko.md'])];
  const mismatch = manifest.description !== expected.description ||
    JSON.stringify(manifest.keywords) !== JSON.stringify(expected.keywords) ||
    manifest.homepage !== expectedHomepage ||
    JSON.stringify(manifest.files) !== JSON.stringify(expectedFiles);
  if (!mismatch) continue;
  if (!write) throw new Error(`${manifest.name} package metadata is not synchronized with its documentation page`);
  manifest.description = expected.description;
  manifest.keywords = expected.keywords;
  manifest.homepage = expectedHomepage;
  manifest.files = expectedFiles;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

console.log(write ? 'Synchronized package discoverability metadata.' : 'Package discoverability metadata check passed.');
