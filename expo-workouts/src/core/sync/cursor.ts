// 커서 코덱 + 버저닝 (설계 §4.2 · §4.3 · §4.5).
//
// 규칙 하나: **읽을 수 있거나, reset한다. 절대 throw하지 않는다.** 적대적 입력이 파서에 닿기 전에
// 매직이 먼저 판정하므로, base64/JSON 디코더는 우리 문자열에만 노출된다.

import { WorkoutsError } from '../errors';
import type { CursorResetReason, WorkoutsPlatform } from '../types';

/** OUR format version, not the platform token's. */
export const CURSOR_FORMAT_VERSION = 1;

/**
 * Every version this build can still READ.
 * 주의: 이 목록을 줄이는 것은 BREAKING change다 — 기존 사용자 전부가 전체 백필로 되돌아간다.
 * CHANGELOG에 그렇게 명시해야 한다.
 */
export const READABLE_CURSOR_VERSIONS: readonly number[] = [1];

/** 동기화 커서의 매직. base64/JSON 디코드 **이전에** 우리 것임을 판정한다. */
const CURSOR_MAGIC = 'gjw';
/** 페이지 토큰의 매직 — 일부러 다르다. 서로 바꿔 넣으면 양방향으로 안전 실패한다(§4.2). */
const PAGE_TOKEN_MAGIC = 'gjp';

const PLATFORM_TAGS: Readonly<Record<WorkoutsPlatform, string>> = { ios: 'i', android: 'a' };
const TAG_PLATFORMS: Readonly<Record<string, WorkoutsPlatform>> = { i: 'ios', a: 'android' };

/** payload v1 — 키는 1글자 고정이다. 커서 길이가 곧 소비자의 저장 비용이다. */
export interface CursorPayloadV1 {
  /** 체크포인트. iOS: NSKeyedArchiver base64 of the HKQueryAnchor. Android: the changes token. */
  readonly k: string;
  /** granted scope 지문 - 정렬된 **권한 문자열** 목록의 FNV-1a 32bit를 base36으로. */
  readonly g: string;
  /** 커서 발급 instant (epoch ms). 진단과 describeCursor 용도. */
  readonly s: number;
}

export interface CursorInfo {
  /** OUR format version, not the platform token's. */
  readonly formatVersion: number;
  readonly platform: WorkoutsPlatform;
  readonly issuedAtMs: number;
}

// -- base64url + UTF-8, 의존성 0 -----------------------------------------------
// Buffer도 atob도 쓰지 않는다: 이 파일은 platform 'neutral' 산출물의 일부이고
// lib ES2022에서 컴파일되어야 한다.

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(text: string): number[] {
  const out: number[] = [];
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return out;
}

function utf8Decode(bytes: readonly number[]): string | null {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const byte = bytes[i] ?? 0;
    let code: number;
    let length: number;
    if (byte < 0x80) {
      code = byte;
      length = 1;
    } else if ((byte & 0xe0) === 0xc0) {
      code = byte & 0x1f;
      length = 2;
    } else if ((byte & 0xf0) === 0xe0) {
      code = byte & 0x0f;
      length = 3;
    } else if ((byte & 0xf8) === 0xf0) {
      code = byte & 0x07;
      length = 4;
    } else return null;
    if (i + length > bytes.length) return null;
    for (let k = 1; k < length; k += 1) {
      const next = bytes[i + k] ?? 0;
      if ((next & 0xc0) !== 0x80) return null;
      code = (code << 6) | (next & 0x3f);
    }
    out += String.fromCodePoint(code);
    i += length;
  }
  return out;
}

function base64UrlEncode(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64_ALPHABET[b0 >> 2] ?? '';
    out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)] ?? '';
    if (b1 === undefined) break;
    out += B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)] ?? '';
    if (b2 === undefined) break;
    out += B64_ALPHABET[b2 & 0x3f] ?? '';
  }
  return out;
}

function base64UrlDecode(text: string): number[] | null {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of text) {
    const value = B64_ALPHABET.indexOf(character);
    if (value < 0) return null;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

/**
 * FNV-1a 32bit, base36. 정렬된 **권한 문자열** 목록에 대한 지문이므로 scope 어휘가 바뀌어도
 * 기존 커서가 무효화되지 않는다 (설계 §8.8 마지막 문단).
 */
export function scopeFingerprint(permissions: readonly string[]): string {
  const joined = [...permissions].sort().join(' ');
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** 동기화 커서를 만든다. */
export function encodeCursor(platform: WorkoutsPlatform, payload: CursorPayloadV1): string {
  const json = JSON.stringify({ k: payload.k, g: payload.g, s: payload.s });
  const body = base64UrlEncode(utf8Encode(json));
  return `${CURSOR_MAGIC}${String(CURSOR_FORMAT_VERSION)}.${PLATFORM_TAGS[platform]}.${body}`;
}

export type CursorDecodeResult =
  | { readonly ok: true; readonly payload: CursorPayloadV1; readonly formatVersion: number }
  | { readonly ok: false; readonly reason: CursorResetReason };

const CURSOR_PATTERN = /^gjw(\d+)\.([a-z])\.([A-Za-z0-9_-]*)$/;

function parsePayload(encoded: string): CursorPayloadV1 | null {
  const bytes = base64UrlDecode(encoded);
  if (bytes === null) return null;
  const json = utf8Decode(bytes);
  if (json === null) return null;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const k = record['k'];
  const g = record['g'];
  const s = record['s'];
  if (typeof k !== 'string') return null;
  if (typeof g !== 'string') return null;
  if (typeof s !== 'number' || !Number.isFinite(s)) return null;
  return { k, g, s };
}

/**
 * Decode a sync cursor. NEVER throws - every failure is a `CursorResetReason`, which is how the
 * mission's "expired/invalid cursor -> reset: true, never an exception" is honoured.
 *
 * The checks run in this order so an adversarial string never reaches the parser: magic, format
 * version, platform tag, base64url/JSON/shape, scope fingerprint.
 */
export function decodeCursor(
  cursor: string,
  platform: WorkoutsPlatform,
  fingerprint: string,
): CursorDecodeResult {
  if (typeof cursor !== 'string' || !cursor.startsWith(CURSOR_MAGIC)) {
    return { ok: false, reason: 'malformed' };
  }
  const match = CURSOR_PATTERN.exec(cursor);
  if (match === null) return { ok: false, reason: 'malformed' };
  const formatVersion = Number(match[1]);
  if (!READABLE_CURSOR_VERSIONS.includes(formatVersion)) {
    return { ok: false, reason: 'formatUnsupported' };
  }
  const taggedPlatform = TAG_PLATFORMS[match[2] ?? ''];
  if (taggedPlatform === undefined) return { ok: false, reason: 'malformed' };
  if (taggedPlatform !== platform) return { ok: false, reason: 'platformMismatch' };
  const payload = parsePayload(match[3] ?? '');
  if (payload === null) return { ok: false, reason: 'malformed' };
  if (payload.g !== fingerprint) return { ok: false, reason: 'scopesChanged' };
  return { ok: true, payload, formatVersion };
}

/**
 * Inspect a cursor for diagnostics and progress UI. Returns `null` for anything this build cannot
 * read - it NEVER throws.
 *
 * It NEVER returns the platform token (HKQueryAnchor / Health Connect changes token): an app that
 * stores its cursor on a server would otherwise be storing the platform's own token. A guard test
 * asserts no substring of the encoded token appears in the returned object.
 */
export function describeCursor(cursor: string): CursorInfo | null {
  if (typeof cursor !== 'string') return null;
  const match = CURSOR_PATTERN.exec(cursor);
  if (match === null) return null;
  const formatVersion = Number(match[1]);
  if (!READABLE_CURSOR_VERSIONS.includes(formatVersion)) return null;
  const platform = TAG_PLATFORMS[match[2] ?? ''];
  if (platform === undefined) return null;
  const payload = parsePayload(match[3] ?? '');
  if (payload === null) return null;
  return { formatVersion, platform, issuedAtMs: payload.s };
}

/** 페이지 토큰 - 커서와 **다른 매직**을 쓴다. 내부 전용이며 소비자는 문자열로만 다룬다. */
export function encodePageToken(platform: WorkoutsPlatform, nativeToken: string): string {
  const body = base64UrlEncode(utf8Encode(nativeToken));
  return `${PAGE_TOKEN_MAGIC}${String(CURSOR_FORMAT_VERSION)}.${PLATFORM_TAGS[platform]}.${body}`;
}

const PAGE_TOKEN_PATTERN = /^gjp(\d+)\.([a-z])\.([A-Za-z0-9_-]*)$/;

/**
 * 페이지 토큰을 푼다. 여기서는 **던진다** - 동기화 커서를 페이지 토큰 자리에 넣은 것은 즉시
 * 발각돼야 하는 호출자 버그다 (설계 §4.2 양방향 안전 실패의 다른 쪽 반).
 */
export function decodePageToken(token: string, platform: WorkoutsPlatform): string {
  const match = PAGE_TOKEN_PATTERN.exec(token);
  if (match === null) {
    throw new WorkoutsError(
      'invalidArgument',
      'pageToken is not a page token. A sync cursor is NOT interchangeable with a page token.',
    );
  }
  if (TAG_PLATFORMS[match[2] ?? ''] !== platform) {
    throw new WorkoutsError('invalidArgument', 'pageToken was minted on a different platform.');
  }
  const bytes = base64UrlDecode(match[3] ?? '');
  const decoded = bytes === null ? null : utf8Decode(bytes);
  if (decoded === null) {
    throw new WorkoutsError('invalidArgument', 'pageToken payload is not decodable.');
  }
  return decoded;
}
