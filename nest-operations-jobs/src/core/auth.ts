import { createHash, timingSafeEqual } from 'node:crypto';
import { OperationsJobsError } from './errors';

/** 짧은 시크릿은 이 표면에서 가장 흔한 실질적 취약점이다 — 조립 시점에 죽인다. */
const MIN_SECRET_LENGTH = 32;

/** 실패 분기를 구분해 주지 않는 고정 문자열. 어느 검사에서 떨어졌는지 알려주지 않는다. */
const UNAUTHORIZED_MESSAGE = 'invalid operations job credentials';

const BASE64URL_SEGMENT = /^[A-Za-z0-9_-]+$/u;

/** `Bearer` 스킴 토큰 — RFC 7235 §2.1에 따라 대소문자를 구분하지 않는다. */
const BEARER_SCHEME = /^bearer /iu;

/**
 * Extract the token from an `Authorization: Bearer <token>` header value.
 *
 * The scheme is matched case-insensitively (RFC 7235 §2.1 / RFC 6750 §2.1); the
 * token itself is taken verbatim.
 */
export function bearerToken(
  header: string | readonly string[] | null | undefined,
): string | undefined {
  const raw = Array.isArray(header) ? header[0] : header;
  if (typeof raw !== 'string') return undefined;
  if (!BEARER_SCHEME.test(raw)) return undefined;
  const token = raw.slice('Bearer '.length);
  return token.length > 0 ? token : undefined;
}

/**
 * Constant-time secret comparison.
 *
 * Both sides are SHA-256 hashed first, so the comparison cost never depends on
 * input length and a mismatched length cannot be observed through timing.
 * Non-string inputs return false.
 */
export function timingSafeSecretMatch(expected: string, presented: string): boolean {
  if (typeof expected !== 'string' || typeof presented !== 'string') return false;
  const expectedDigest = createHash('sha256').update(expected, 'utf8').digest();
  const presentedDigest = createHash('sha256').update(presented, 'utf8').digest();
  return timingSafeEqual(expectedDigest, presentedDigest);
}

/**
 * Cheap structural check for a compact JWS: three non-empty base64url segments.
 * Used to keep a mistyped shared secret from reaching a network verifier, which
 * would otherwise turn every bad request into an outbound token-info call.
 * It proves nothing about signature, issuer, audience or expiry.
 */
export function looksLikeJwt(token: string): boolean {
  if (typeof token !== 'string') return false;
  const segments = token.split('.');
  if (segments.length !== 3) return false;
  for (const segment of segments) {
    if (segment.length === 0 || !BASE64URL_SEGMENT.test(segment)) return false;
  }
  return true;
}

export interface JobTriggerIdentity {
  readonly method: 'secret' | 'token';
  /** Who the token proved the caller to be, e.g. a service account email. */
  readonly subject?: string | undefined;
}

/**
 * Host-provided token verification. The library ships no cloud SDK: an adapter
 * over `google-auth-library`'s `verifyIdToken`, a JWKS client or an internal
 * mTLS-derived identity all satisfy this port.
 *
 * Return `null` for "not authenticated". Throwing is reserved for verifier
 * outages, which the guard reports as 503 rather than 401.
 */
export interface JobTriggerTokenVerifier {
  verify(token: string): Promise<JobTriggerIdentity | null>;
}

export interface JobTriggerAuthOptions {
  /** Shared secret. At least 32 characters; shorter values are a construction error. */
  readonly secret?: string | undefined;
  readonly tokenVerifier?: JobTriggerTokenVerifier | undefined;
}

/**
 * Build the authenticator the guard delegates to.
 *
 * Order: read the bearer token, compare it against the shared secret in constant
 * time, and only when the token structurally looks like a JWS hand it to the
 * verifier. Every rejection raises `ERR_JOB_UNAUTHORIZED` with one fixed message.
 *
 * Throws `ERR_JOB_AUTH_MISCONFIGURED` when neither a secret nor a verifier is
 * supplied — an unauthenticated job trigger is never a valid configuration, and
 * this fails at wiring time rather than on the scheduler's first call.
 */
export function createJobTriggerAuthenticator(
  options: JobTriggerAuthOptions,
): (header: string | readonly string[] | null | undefined) => Promise<JobTriggerIdentity> {
  const secret = options.secret;
  const verifier = options.tokenVerifier;

  if (secret === undefined && verifier === undefined) {
    throw new OperationsJobsError(
      'ERR_JOB_AUTH_MISCONFIGURED',
      'operations job triggers need a shared secret or a token verifier: supply auth.secret, auth.tokenVerifier, or both',
    );
  }
  if (secret !== undefined) {
    if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
      throw new OperationsJobsError(
        'ERR_JOB_AUTH_MISCONFIGURED',
        `the operations job shared secret must be at least ${MIN_SECRET_LENGTH} characters: reissue a longer secret`,
      );
    }
  }

  return async (header) => {
    const token = bearerToken(header);
    if (token === undefined) {
      throw new OperationsJobsError('ERR_JOB_UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }
    if (secret !== undefined && timingSafeSecretMatch(secret, token)) {
      return { method: 'secret' };
    }
    if (verifier !== undefined && looksLikeJwt(token)) {
      const identity = await verifier.verify(token);
      if (identity !== null && identity !== undefined) return identity;
    }
    throw new OperationsJobsError('ERR_JOB_UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
  };
}
