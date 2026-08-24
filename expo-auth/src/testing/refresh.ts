// createScriptedRefreshRequest + createUnsignedTestJwt (design doc §5.1) — the scripted
// refresh callback the unit matrix runs on, and the unsigned JWT fixture factory whose very
// name says it carries no signature.

import type { RefreshRequest, RefreshRequestResult } from '../core/types';

/**
 * A {@link RefreshRequest} that answers from a fixed script, recording every call. A call past
 * the end of the script throws — surfacing as a test failure (via the session it appears as a
 * `'transient'` outcome carrying that error as `cause`, §3.3).
 */
export function createScriptedRefreshRequest(script: readonly RefreshRequestResult[]): {
  readonly request: RefreshRequest;
  readonly calls: readonly { readonly refreshToken: string }[];
} {
  const calls: { readonly refreshToken: string }[] = [];
  let index = 0;
  const request: RefreshRequest = async (input) => {
    calls.push({ refreshToken: input.refreshToken });
    const step = script[index];
    index += 1;
    if (step === undefined) {
      throw new Error(`Scripted refresh request exhausted: call ${String(index)} exceeds the script length ${String(script.length)}.`);
    }
    return step;
  };
  return { request, calls };
}

/**
 * An UNSIGNED test JWT (`header.payload.` with an empty signature) — exp fixture generation
 * for the default TTL strategy. The name says it: there is no signature, and
 * `decodeJwtExpiryEpochSeconds` would not verify one anyway (§3.6).
 */
export function createUnsignedTestJwt(claims: Readonly<Record<string, unknown>>): string {
  const header = base64UrlFromString(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = base64UrlFromString(JSON.stringify(claims));
  return `${header}.${payload}.`;
}

const BASE64_URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Pure TS UTF-8 + base64url encoder — "./testing" is as global-free as the core (§2.1: the
// entry-guard covers src/testing/**, and lib:["ES2022"] has neither btoa nor Buffer).
function base64UrlFromString(text: string): string {
  const bytes = utf8BytesFromString(text);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_URL_ALPHABET[b0 >> 2];
    out += BASE64_URL_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 !== undefined) out += BASE64_URL_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 !== undefined) out += BASE64_URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function utf8BytesFromString(text: string): readonly number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    const codePoint = ch.codePointAt(0) ?? 0;
    if (codePoint < 0x80) {
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint < 0x10000) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f)
      );
    }
  }
  return bytes;
}
