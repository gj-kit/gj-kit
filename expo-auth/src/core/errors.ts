// Typed errors (design doc §3.7). Refresh failures are NOT AuthErrors — they are outcomes
// (§3.4) — and storage adapter exceptions propagate raw (wrapping them would only grow the
// token-leak verification surface, §4.2).

/**
 * - `'invalid-key-prefix'`: a key prefix or lock name was empty/whitespace (runtime validation — §4.1-ⓐ).
 * - `'session-disposed'`: a session method was called after `dispose()` (§4.1-ⓑ).
 */
export type AuthErrorCode = 'invalid-key-prefix' | 'session-disposed';

// §4.2 token-guard rule 3: AuthError messages come only from this fixed table of English
// constants — no interpolation, so no token bytes can ever reach an error message.
const AUTH_ERROR_MESSAGES: Readonly<Record<AuthErrorCode, string>> = {
  'invalid-key-prefix':
    'Expected a non-empty key prefix / lock name; received an empty or whitespace-only string.',
  'session-disposed':
    'This AuthSession has been disposed. Create a new session instead of reusing it.',
};

// Copy-recognition tag: with splitting:false every entry bundles its own copy of this class,
// so `instanceof` breaks across entries (expo-media §0.2 precedent). Symbol.for gives all
// copies the same registry symbol.
const AUTH_ERROR_TAG = Symbol.for('@gj-kit/expo-auth#AuthError');

/**
 * The only error class this library throws for its own misuse conditions. Detect it with
 * `isAuthError` — `instanceof` is unreliable across the package's own bundled entries (§3.7).
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode) {
    super(AUTH_ERROR_MESSAGES[code]);
    this.name = 'AuthError';
    this.code = code;
    Object.defineProperty(this, AUTH_ERROR_TAG, { value: true });
  }
}

/** Structural, cross-entry-safe type guard for {@link AuthError} (§3.7). */
export function isAuthError(value: unknown): value is AuthError {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[AUTH_ERROR_TAG] === true
  );
}
