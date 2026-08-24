/**
 * Reference AES-256-GCM `SensitiveValueProtector` — `node:crypto`만 사용한다.
 *
 * 설계 §10이 기각한 것은 "라이브러리 소유 KMS/key material/rotation"이다. 이 모듈은 그
 * 경계를 유지한다: 키 bytes는 호출 앱이 만들어 넘기고(생성·보관·회전·폐기 전부 앱 소유),
 * 라이브러리는 그 키로 seam context(`purpose` + `recordId`)를 AAD에 결속한 AEAD 봉투만
 * 만든다. KMS envelope encryption이 필요하면 앱이 이 모듈 대신 자기 adapter를 쓰면 된다.
 *
 * 봉투 형식(공개 계약 — 다른 언어/도구에서 재구현 가능):
 *   JSON `{ "v": 1, "alg": "A256GCM", "kid"?: string, "iv": b64(12B), "tag": b64(16B), "value": b64 }`
 * AAD — 아래 바이트열을 **그대로** 재현해야 한다(다른 언어의 기본 JSON 직렬화는 공백·키 순서·
 * 비ASCII escaping이 달라 AAD가 어긋나고, 그러면 모든 decrypt가 진단 없는 `authentication-failed`가 된다):
 *   1. ASCII `@gj-kit/toss-payments-postgresql:sensitive-value:A256GCM:v1`
 *   2. 단일 바이트 0x00
 *   3. 다음 규칙의 JSON 객체를 UTF-8로: 공백 없음 · 키 순서 고정 `purpose`, `recordId`, `kid` ·
 *      `kid`는 keyId가 없으면 JSON `null` · 문자열 escaping은 ECMAScript `JSON.stringify`와 동일 —
 *      `"`→`\"`, `\`→`\\`, U+0008/0009/000A/000C/000D→`\b \t \n \f \r`, 그 외 U+0000–U+001F→`\u00XX`
 *      (소문자 hex), 비페어 서로게이트→`\uDXXX`(소문자 hex); 그 밖의 모든 문자(비ASCII·`/`·U+007F·
 *      U+2028/2029 포함)는 escape 없이 UTF-8 원문
 *   예: purpose `billing-key`, recordId `cust_é`, keyId 없음 →
 *   `{"purpose":"billing-key","recordId":"cust_é","kid":null}` (é는 0xC3 0xA9 두 바이트)
 * 평문: well-formed UTF-16(비페어 서로게이트 없음)만 받는다 — UTF-8 인코딩이 U+FFFD로 바꿔
 *   조용히 다른 값을 봉하는 대신 `TypeError`로 거부한다.
 * 키 예산: random 96-bit IV라 한 키로 2^32회 encrypt를 넘기기 전에 keyId를 바꿔 회전해야 한다
 *   (NIST SP 800-38D §8.3). 카운팅·회전은 호스트 소유다.
 *
 * ⚠ 보안 불변식: 오류 메시지·cause 어디에도 키·평문·암호문을 싣지 않는다. 복호화 실패는
 * 원인(잘못된 키 / 다른 행·용도로 옮긴 암호문 / 변조)을 구분하지 않는 단일 code로 보고한다.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { SensitiveValueContext, SensitiveValueProtector } from './sensitive-values';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 1;
const ENVELOPE_ALGORITHM = 'A256GCM';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MAX_KEY_ID_LENGTH = 128;
const AAD_NAMESPACE = '@gj-kit/toss-payments-postgresql:sensitive-value:A256GCM:v1';
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const KEY_HEX_PATTERN = /^[0-9a-fA-F]{64}$/;
/**
 * 비페어 서로게이트(high 뒤에 low가 없거나, low 앞에 high가 없는 code unit). `u` 플래그 없이
 * code unit 단위로 본다 — `String.prototype.isWellFormed`와 같은 판정이지만 lib ES2022에서도 쓸 수 있다.
 */
const LONE_SURROGATE_PATTERN = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Stable failure codes of the reference AES-256-GCM protector. */
export type SensitiveValueProtectorErrorCode =
  /** The stored string is not a `{ v: 1, alg: 'A256GCM', … }` envelope this protector produced. */
  | 'invalid-envelope'
  /** The envelope names a different `kid` than this protector's `keyId` (or one side has none). */
  | 'key-id-mismatch'
  /** Wrong key, ciphertext moved to another purpose/recordId, or tampered bytes — not distinguished. */
  | 'authentication-failed';

const ERROR_NAME = 'SensitiveValueProtectorError';
const KNOWN_CODES: ReadonlySet<string> = new Set<SensitiveValueProtectorErrorCode>([
  'invalid-envelope',
  'key-id-mismatch',
  'authentication-failed',
]);

/**
 * Error thrown by `createAes256GcmSensitiveValueProtector().decrypt`.
 *
 * `code` is the public contract; the message is not. Messages never contain key material,
 * plaintext, or ciphertext. Use `isSensitiveValueProtectorError` instead of `instanceof`.
 */
export class SensitiveValueProtectorError extends Error {
  override readonly name = ERROR_NAME;
  readonly code: SensitiveValueProtectorErrorCode;

  constructor(code: SensitiveValueProtectorErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Structural type guard — ESM/CJS dual loading can split class identity, so `instanceof`
 * is unreliable (same reasoning as `isTossPostgresError`).
 */
export function isSensitiveValueProtectorError(value: unknown): value is SensitiveValueProtectorError {
  if (!(value instanceof Error) || value.name !== ERROR_NAME) return false;
  const code = (value as Error & { code?: unknown }).code;
  return typeof code === 'string' && KNOWN_CODES.has(code);
}

export interface Aes256GcmSensitiveValueProtectorOptions {
  /**
   * 32-byte AES-256 key — a `Uint8Array`/`Buffer` of exactly 32 bytes or a 64-character hex
   * string. The host generates it (for example `openssl rand -hex 32`), stores it in its secret
   * manager, and owns rotation. The bytes are copied at construction; mutating the caller's
   * buffer afterwards has no effect.
   */
  readonly key: Uint8Array | string;
  /**
   * Optional nonsecret key identifier written to the envelope as `kid` and bound into the AAD.
   * Rows encrypted under a different `kid` (or without one) are rejected with
   * `'key-id-mismatch'` before any decryption, which lets a host route old rows to a
   * previous-key protector during rotation. 1–128 characters.
   */
  readonly keyId?: string;
}

/**
 * Builds a `SensitiveValueProtector` that seals values with AES-256-GCM, a fresh random
 * 12-byte IV per `encrypt`, and the seam context bound as AAD.
 *
 * The host keeps key custody and rotation: this function never generates, persists, or
 * rotates keys. Because the IV is random, NIST SP 800-38D §8.3 caps a single key at 2^32
 * `encrypt` invocations — rotate to a new `keyId` well before that; the library does not
 * count. Key/config misuse throws `TypeError` synchronously at construction; `encrypt`
 * rejects with `TypeError` for non-string or ill-formed UTF-16 plaintext (lone surrogates
 * would otherwise be silently replaced with U+FFFD and fail to round-trip); undecryptable
 * rows reject with `SensitiveValueProtectorError` (`code` is the contract).
 */
export function createAes256GcmSensitiveValueProtector(
  options: Aes256GcmSensitiveValueProtectorOptions,
): SensitiveValueProtector {
  if (options === null || typeof options !== 'object') {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] createAes256GcmSensitiveValueProtector는 { key, keyId? } 옵션 객체가 필요합니다.',
    );
  }
  const key = normalizeKey(options.key);
  const keyId = normalizeKeyId(options.keyId);

  return Object.freeze({
    async encrypt(plaintext: string, context: SensitiveValueContext): Promise<string> {
      if (typeof plaintext !== 'string') {
        throw new TypeError('[@gj-kit/toss-payments-postgresql] encrypt 평문은 문자열이어야 합니다.');
      }
      if (LONE_SURROGATE_PATTERN.test(plaintext)) {
        // UTF-8 인코더가 비페어 서로게이트를 U+FFFD로 바꿔 원문과 다른 값을 봉하게 된다 — 조용한
        // 손실 대신 거부한다. 메시지에 평문을 싣지 않는다.
        throw new TypeError(
          '[@gj-kit/toss-payments-postgresql] encrypt 평문은 well-formed UTF-16이어야 합니다(비페어 서로게이트 불가).',
        );
      }
      const aad = canonicalAad(context, keyId);
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
      cipher.setAAD(aad, { plaintextLength: Buffer.byteLength(plaintext, 'utf8') });
      const value = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      // 키 순서 고정 — 봉투는 문서화된 공개 형식이다. kid는 있을 때만 쓴다.
      const envelope: Record<string, unknown> = { v: ENVELOPE_VERSION, alg: ENVELOPE_ALGORITHM };
      if (keyId !== undefined) envelope['kid'] = keyId;
      envelope['iv'] = iv.toString('base64');
      envelope['tag'] = tag.toString('base64');
      envelope['value'] = value.toString('base64');
      return JSON.stringify(envelope);
    },

    async decrypt(ciphertext: string, context: SensitiveValueContext): Promise<string> {
      const aad = canonicalAad(context, keyId);
      const envelope = parseEnvelope(ciphertext);
      if (envelope.kid !== keyId) {
        throw new SensitiveValueProtectorError(
          'key-id-mismatch',
          '봉투의 kid가 이 보호기의 keyId와 다릅니다 — 해당 키의 보호기로 복호화하거나 재암호화하세요.',
        );
      }
      try {
        const decipher = createDecipheriv(ALGORITHM, key, envelope.iv, { authTagLength: TAG_BYTES });
        decipher.setAAD(aad, { plaintextLength: envelope.value.length });
        decipher.setAuthTag(envelope.tag);
        return Buffer.concat([decipher.update(envelope.value), decipher.final()]).toString('utf8');
      } catch {
        // 잘못된 키·다른 purpose/recordId로 옮긴 암호문·변조를 구분하지 않는다(단일 code,
        // cause 미보존) — 실패 경로가 어떤 부분이 틀렸는지의 oracle이 되지 않게 한다.
        throw new SensitiveValueProtectorError(
          'authentication-failed',
          '보호된 값을 복호화할 수 없습니다 — 키·AAD(purpose/recordId) 불일치 또는 변조.',
        );
      }
    },
  });
}

interface ParsedEnvelope {
  readonly kid: string | undefined;
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly value: Buffer;
}

function normalizeKey(key: unknown): Buffer {
  if (typeof key === 'string') {
    if (!KEY_HEX_PATTERN.test(key)) {
      throw new TypeError(
        '[@gj-kit/toss-payments-postgresql] AES-256-GCM key 문자열은 64자 hex(32 bytes)여야 합니다.',
      );
    }
    return Buffer.from(key, 'hex');
  }
  if (key instanceof Uint8Array) {
    if (key.byteLength !== KEY_BYTES) {
      throw new TypeError(
        '[@gj-kit/toss-payments-postgresql] AES-256-GCM key는 정확히 32 bytes여야 합니다.',
      );
    }
    // 호출자 버퍼와 분리해 복사한다 — 이후 외부 변경이 보호기에 영향을 주지 않는다.
    return Buffer.from(key);
  }
  throw new TypeError(
    '[@gj-kit/toss-payments-postgresql] AES-256-GCM key는 32-byte Uint8Array 또는 64자 hex 문자열이어야 합니다.',
  );
}

function normalizeKeyId(keyId: unknown): string | undefined {
  if (keyId === undefined) return undefined;
  if (typeof keyId !== 'string' || keyId.length === 0 || keyId.length > MAX_KEY_ID_LENGTH) {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] keyId는 1~128자 문자열이어야 합니다.',
    );
  }
  return keyId;
}

/**
 * context → 결정적 AAD bytes. namespace + NUL + 고정 키 순서 JSON이라 purpose/recordId 경계가
 * 모호해질 수 없다(예: recordId에 구분자 문자가 들어가도 JSON escaping으로 분리된다).
 * 바이트 규칙은 모듈 헤더의 AAD 항목이 정본이다 — 여기의 `JSON.stringify`가 그 규칙의 구현이며,
 * 객체 리터럴의 키 순서가 곧 직렬화 순서다.
 */
function canonicalAad(context: SensitiveValueContext, keyId: string | undefined): Buffer {
  if (
    context === null ||
    typeof context !== 'object' ||
    typeof context.purpose !== 'string' ||
    context.purpose.length === 0 ||
    typeof context.recordId !== 'string' ||
    context.recordId.length === 0
  ) {
    throw new TypeError(
      '[@gj-kit/toss-payments-postgresql] SensitiveValueContext는 비어 있지 않은 purpose와 recordId가 필요합니다.',
    );
  }
  const bound = JSON.stringify({
    purpose: context.purpose,
    recordId: context.recordId,
    kid: keyId ?? null,
  });
  return Buffer.from(`${AAD_NAMESPACE}\u0000${bound}`, 'utf8');
}

function invalidEnvelope(): SensitiveValueProtectorError {
  return new SensitiveValueProtectorError(
    'invalid-envelope',
    '보호된 값이 v1 A256GCM 봉투 형식이 아닙니다.',
  );
}

function decodeBase64(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== 'string' || value.length % 4 !== 0 || !BASE64_PATTERN.test(value)) {
    throw invalidEnvelope();
  }
  const bytes = Buffer.from(value, 'base64');
  if (expectedLength !== undefined && bytes.length !== expectedLength) throw invalidEnvelope();
  return bytes;
}

function parseEnvelope(ciphertext: string): ParsedEnvelope {
  if (typeof ciphertext !== 'string') throw invalidEnvelope();
  let parsed: unknown;
  try {
    parsed = JSON.parse(ciphertext);
  } catch {
    throw invalidEnvelope();
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw invalidEnvelope();
  const envelope = parsed as Record<string, unknown>;
  if (envelope['v'] !== ENVELOPE_VERSION || envelope['alg'] !== ENVELOPE_ALGORITHM) {
    throw invalidEnvelope();
  }
  const kid = envelope['kid'];
  if (kid !== undefined && (typeof kid !== 'string' || kid.length === 0)) throw invalidEnvelope();
  return {
    kid,
    iv: decodeBase64(envelope['iv'], IV_BYTES),
    tag: decodeBase64(envelope['tag'], TAG_BYTES),
    value: decodeBase64(envelope['value']),
  };
}
