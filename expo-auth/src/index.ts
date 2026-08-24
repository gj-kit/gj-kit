// "." barrel (design doc §2.1·§2.2). This entry's graph imports zero react/react-native/expo-*
// modules and references zero DOM globals — every consumer starts here, and custom storage
// implementors need nothing else. It never imports "./storage" (one-way rule — the consumer
// composes the two, §2.2).

export type {
  AuthClock,
  RefreshLock,
  RefreshRequest,
  RefreshRequestResult,
  TokenPair,
  TokenPersistence,
  TokenStorage,
} from './core/types';
export {
  matchRefreshOutcome,
  type EagerRefreshOutcome,
  type RefreshOutcome,
} from './core/outcome';
export { AuthError, isAuthError, type AuthErrorCode } from './core/errors';
export { decodeJwtExpiryEpochSeconds, describeAccessToken } from './core/jwt';
export {
  createAuthSession,
  type AuthSession,
  type AuthSessionOptions,
  type RefreshScheduleOptions,
} from './core/session';
