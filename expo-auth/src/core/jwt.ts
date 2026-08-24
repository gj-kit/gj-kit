// JWT expiry decoding (design doc §3.6). Pure TS base64url + UTF-8 decoding — no dependency on
// the global `atob` (the predecessor silently fell back to the default TTL where `atob` was
// absent, neutering proactive refresh — design §1 defect 4).

/**
 * ⚠ **This is a payload decode WITHOUT signature verification.** It base64url-decodes the
 * payload and reads the `exp` claim; it guarantees nothing about the token's authenticity or
 * integrity. It exists solely as a proactive-refresh scheduling hint — never use it for
 * authorization decisions or as a trust boundary. The worst a forged `exp` can cause is a
 * mistimed refresh, and the reactive 401 path is the safety net for that (§7-1).
 *
 * Corrupt or non-JWT input returns `null` without throwing (H13).
 */
export function decodeJwtExpiryEpochSeconds(token: string): number | null {
  const parts = token.split('.');
  const payload = parts.length >= 2 ? parts[1] : undefined;
  if (payload === undefined || payload.length === 0) return null;
  const bytes = base64UrlToBytes(payload);
  if (bytes === null) return null;
  const text = utf8BytesToString(bytes);
  if (text === null) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(text);
  } catch {
    return null; // H13 — corrupt payload never throws
  }
  if (typeof claims !== 'object' || claims === null) return null;
  const exp = (claims as { readonly exp?: unknown }).exp;
  return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
}

/**
 * Token summary for logging/telemetry — contains not a single byte of the token itself (§4.2).
 * `expiresAtEpochSeconds` comes from {@link decodeJwtExpiryEpochSeconds} and shares its
 * unverified-decode caveat.
 */
export function describeAccessToken(accessToken: string): {
  readonly length: number;
  readonly expiresAtEpochSeconds: number | null;
} {
  return {
    length: accessToken.length,
    expiresAtEpochSeconds: decodeJwtExpiryEpochSeconds(accessToken),
  };
}

/** Base64url (and plain base64) to bytes. Returns null on any invalid character or length. */
function base64UrlToBytes(input: string): readonly number[] | null {
  let end = input.length;
  while (end > 0 && input[end - 1] === '=') end -= 1; // tolerate padded fixtures
  if (end % 4 === 1) return null; // impossible base64 length
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < end; i += 1) {
    const code = input.charCodeAt(i);
    let value: number;
    if (code >= 65 && code <= 90) value = code - 65; // A-Z
    else if (code >= 97 && code <= 122) value = code - 71; // a-z
    else if (code >= 48 && code <= 57) value = code + 4; // 0-9
    else if (code === 45 || code === 43) value = 62; // '-' or '+'
    else if (code === 95 || code === 47) value = 63; // '_' or '/'
    else return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/** Strict UTF-8 decode. Returns null on malformed sequences instead of replacement characters. */
function utf8BytesToString(bytes: readonly number[]): string | null {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i];
    if (b0 === undefined) return null;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
      continue;
    }
    let extra: number;
    let codePoint: number;
    if ((b0 & 0xe0) === 0xc0) {
      extra = 1;
      codePoint = b0 & 0x1f;
    } else if ((b0 & 0xf0) === 0xe0) {
      extra = 2;
      codePoint = b0 & 0x0f;
    } else if ((b0 & 0xf8) === 0xf0) {
      extra = 3;
      codePoint = b0 & 0x07;
    } else {
      return null;
    }
    if (i + extra >= bytes.length) return null;
    for (let k = 1; k <= extra; k += 1) {
      const bk = bytes[i + k];
      if (bk === undefined || (bk & 0xc0) !== 0x80) return null;
      codePoint = (codePoint << 6) | (bk & 0x3f);
    }
    if (codePoint > 0x10ffff) return null;
    out += String.fromCodePoint(codePoint);
    i += extra + 1;
  }
  return out;
}
