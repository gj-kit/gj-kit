// Recovery metadata crosses a public error boundary, so its object key grammar must be stricter
// than an arbitrary storage provider's internal key syntax. This one canonical allowlist is used
// both while parsing the backend intent and while reading cross-entry failure metadata.

/** @internal Maximum ASCII storage-key length accepted into a public attachment/recovery record. */
export const MAX_MEDIA_STORAGE_KEY_LENGTH = 1024;

// RFC 3986 "unreserved" characters. A slash is handled only as a separator between non-empty
// segments; percent escapes, query syntax, schemes, whitespace, and controls therefore fail
// closed instead of becoming a signed-URL extraction route.
const UNRESERVED_SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * Whether a backend objectName is safe to expose as attachment/recovery metadata.
 *
 * The grammar is one or more ASCII-unreserved path segments separated by `/`, at most 1024
 * characters. Empty, `.` and `..` segments are deliberately excluded so leading/trailing/double
 * slashes cannot change path meaning in a cleanup endpoint. This is not an authorization check:
 * the server still owns the object and attachment verification.
 *
 * @internal Shared by the intent parser and cross-entry failure inspector. Do not create a second
 * URL deny-list at either call site; percent/double encoded URL text must be rejected identically.
 */
export function isSafeMediaStorageKey(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > MAX_MEDIA_STORAGE_KEY_LENGTH
  ) {
    return false;
  }

  const segments = value.split('/');
  return segments.every(
    (segment) =>
      segment.length > 0 &&
      segment !== '.' &&
      segment !== '..' &&
      UNRESERVED_SEGMENT.test(segment),
  );
}
