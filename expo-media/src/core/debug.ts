// 설계 문서 §5.3 · §7 하드닝 8 — 개발 전용 진단과 **서명 URL 유출 차단**.
//
// 전신(`packages/photo-kit/src/debug.ts`) 파일 주석: "사진 모듈들이 공유하는 개발 전용 진단.
// URI 요약기와 콘솔 로거의 구현이 하나여서 업로드 경로와 기기 라이브러리 경로가 각자의 사본을
// 들고 다니지 않는다."
//
// 전신은 플랫폼 판정을 직접 import했고, **그 한 줄 때문에** 서명 URL 새니타이저를 순수 유닛으로
// 검증할 수 없었다. 주입(`PlatformAdapter`)으로 바꾸면서 이 모듈이 코어로 내려왔고, 하드닝 8이
// 처음으로 직접 단위 검증 대상이 된다.

import type { PlatformAdapter } from './adapters';
import type { MediaDebugOptions } from './types';

/** iOS 사진 보관함 자산 URI인가. 하드닝 2의 `ph://` 후보 스킵 술어가 이것을 쓴다. */
export function isPhotoKitUri(uri?: string | null): boolean {
  return uri?.startsWith('ph://') ?? false;
}

/**
 * ⚠ **원문 URI를 절대 로깅하지 않는다.** 서명 업로드 URL은 쿼리에 임시 자격증명을 담고,
 * 사진 보관함 경로는 사용자의 미디어를 식별한다. 모양(scheme·확장자·길이·종류)만 남긴다.
 *
 * `hardening-guard`가 로거 인자에 `uri`/`url` 원문을 넘기는 것을 정적으로 차단한다 —
 * 이 함수를 **경유하지 않은** 전달은 실패다(§10.3).
 */
export function summarizeUri(uri?: string | null): {
  readonly scheme: string;
  readonly extension: string | null;
  readonly length: number;
  readonly isFile: boolean;
  readonly isContent: boolean;
  readonly isPhotoKit: boolean;
} | null {
  if (!uri) return null;
  const scheme = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1] ?? 'unknown';
  const extension = uri.match(/\.([a-zA-Z0-9]+)(?:[?#].*)?$/)?.[1]?.toLowerCase();
  return {
    scheme,
    extension: extension ?? null,
    length: uri.length,
    isFile: uri.startsWith('file://'),
    isContent: uri.startsWith('content://'),
    isPhotoKit: isPhotoKitUri(uri),
  };
}

/**
 * 전신 `sanitizePhotoErrorMessage`.
 *
 * iOS URLSession 실패는 **서명 업로드 URL 전문을 그대로 에코**한다. 그 쿼리에는 임시 자격증명이
 * 들어 있으므로 개발자 로그에도 활동 로그에도 남겨선 안 된다. 플랫폼 에러 코드와 설명은 남기고
 * URL만 `[URL]`로 치환한 뒤 1000자에서 자른다.
 */
export function sanitizeMediaErrorMessage(message: string): string {
  return message.replace(/https?:\/\/[^\s<>"']+/gi, '[URL]').slice(0, 1_000);
}

// Debug details are an observation boundary, not a serialization API. Keep the snapshot small so
// a malformed adapter object cannot turn an upload failure into an enormous console payload (or
// smuggle a URL through a nested getter). The limits deliberately apply per node rather than to
// the final JSON: logging must work without DOM/Node serialization globals and without invoking
// host `toJSON` implementations.
const MAX_DEBUG_DEPTH = 4;
const MAX_DEBUG_OBJECT_KEYS = 32;
const MAX_DEBUG_ARRAY_ITEMS = 32;
const DEBUG_UNREADABLE = '[unreadable]';
const DEBUG_CIRCULAR = '[circular]';
const DEBUG_TRUNCATED = '[truncated]';

type SafeDebugRecord = Readonly<Record<string, unknown>>;

function safeDebugString(value: string): string {
  return sanitizeMediaErrorMessage(value);
}

function isDebugRecord(value: unknown): value is Record<string, unknown> {
  try {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  } catch {
    // `Array.isArray` may throw for a revoked Proxy. Debugging must not add a new failure path.
    return false;
  }
}

/** Define on a null-prototype clone so a hostile `__proto__` key has no side effect. */
function addSafeDebugField(target: Record<string, unknown>, key: string, value: unknown): void {
  try {
    Object.defineProperty(target, safeDebugString(key), {
      value,
      enumerable: true,
      writable: false,
      configurable: false,
    });
  } catch {
    // A malformed/unusual property key is simply omitted. `key` is normally a primitive string,
    // but this catch also keeps logging best-effort across unusual host runtimes.
  }
}

/**
 * Clone arbitrary debug data without trusting getters, `toJSON`, prototypes, or recursive graphs.
 * Every string (including object keys) goes through the URL redactor; everything returned is a
 * plain frozen graph owned by this module. This is intentionally private: application telemetry
 * should receive the already-safe MediaError, never this diagnostic representation.
 */
function snapshotDebugValue(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  switch (typeof value) {
    case 'string':
      return safeDebugString(value);
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
    case 'undefined':
      return value;
    case 'bigint':
      return `${value.toString()}n`;
    case 'symbol':
      // Symbol descriptions are caller-controlled strings, so do not stringify them.
      return '[symbol]';
    case 'function':
      return '[function]';
    case 'object':
      break;
    default:
      return DEBUG_UNREADABLE;
  }

  if (value === null) return null;
  if (depth >= MAX_DEBUG_DEPTH) return DEBUG_TRUNCATED;
  if (seen.has(value)) return DEBUG_CIRCULAR;
  seen.add(value);

  try {
    if (Array.isArray(value)) {
      const length = value.length;
      if (!Number.isSafeInteger(length) || length < 0) return DEBUG_UNREADABLE;
      const items: unknown[] = [];
      const itemCount = Math.min(length, MAX_DEBUG_ARRAY_ITEMS);
      for (let index = 0; index < itemCount; index += 1) {
        try {
          items.push(snapshotDebugValue(value[index], depth + 1, seen));
        } catch {
          items.push(DEBUG_UNREADABLE);
        }
      }
      if (length > itemCount) items.push(DEBUG_TRUNCATED);
      return Object.freeze(items);
    }

    const result = Object.create(null) as Record<string, unknown>;
    const keys = Object.keys(value);
    const keyCount = Math.min(keys.length, MAX_DEBUG_OBJECT_KEYS);
    for (let index = 0; index < keyCount; index += 1) {
      const key = keys[index];
      // `Object.keys` produces string keys, but an exotic Proxy can still make the indexed read
      // fail. Omit it rather than exposing the proxy's failure message.
      if (typeof key !== 'string') continue;
      let field: unknown;
      try {
        field = (value as Record<string, unknown>)[key];
      } catch {
        field = DEBUG_UNREADABLE;
      }
      addSafeDebugField(result, key, snapshotDebugValue(field, depth + 1, seen));
    }
    if (keys.length > keyCount) addSafeDebugField(result, 'truncated', DEBUG_TRUNCATED);
    return Object.freeze(result);
  } catch {
    return DEBUG_UNREADABLE;
  }
}

function snapshotDebugDetails(value: unknown): SafeDebugRecord {
  const snapshot = snapshotDebugValue(value, 0, new WeakSet<object>());
  return isDebugRecord(snapshot) ? snapshot : Object.freeze(Object.create(null) as Record<string, unknown>);
}

/** Extract an error summary without calling user-defined `toString`/`toJSON` methods. */
function snapshotDebugError(error: unknown): {
  readonly errorName?: string | undefined;
  readonly errorMessage: string;
} {
  try {
    if (error instanceof Error) {
      const name = error.name;
      const message = error.message;
      return {
        ...(typeof name === 'string' ? { errorName: safeDebugString(name) } : {}),
        errorMessage: safeDebugString(typeof message === 'string' ? message : DEBUG_UNREADABLE),
      };
    }
    if (typeof error === 'string') return { errorMessage: safeDebugString(error) };
    if (typeof error === 'number' || typeof error === 'boolean' || typeof error === 'bigint') {
      return { errorMessage: safeDebugString(String(error)) };
    }
  } catch {
    // Host Error subclasses can make `name`/`message` getters throw. Do not stringify the thrown
    // value: it may itself contain a signed URL.
  }
  return { errorMessage: DEBUG_UNREADABLE };
}

function mergeDebugDetails(input: {
  readonly platform: string;
  readonly context: unknown;
  readonly details: unknown;
  readonly error?: { readonly errorName?: string | undefined; readonly errorMessage: string } | undefined;
}): SafeDebugRecord {
  const merged = Object.create(null) as Record<string, unknown>;
  addSafeDebugField(merged, 'platform', safeDebugString(input.platform));
  for (const source of [snapshotDebugDetails(input.context), snapshotDebugDetails(input.details)]) {
    for (const key of Object.keys(source)) {
      // `source` is our own frozen null-prototype clone, so this read cannot execute host code.
      addSafeDebugField(merged, key, source[key]);
    }
  }
  if (input.error) {
    if (input.error.errorName !== undefined) addSafeDebugField(merged, 'errorName', input.error.errorName);
    addSafeDebugField(merged, 'errorMessage', input.error.errorMessage);
  }
  return Object.freeze(merged);
}

/**
 * 전신 `PhotoDebugLogger`(debug.ts:39-47)를 그대로 계승한다. 초안은 반환 타입만 있고 멤버가 없어
 * 구현자가 임의로 정할 수 있었다 — 그러면 하드닝 8의 새니타이즈 지점이 구현마다 달라진다(G14).
 */
export interface MediaDebugLogger {
  log(event: string, details?: Readonly<Record<string, unknown>> | undefined): void;
  /** `errorName` + **새니타이즈된** `errorMessage`를 details에 병합해 기록한다(전신 동작 보존). */
  error(event: string, error: unknown, details?: Readonly<Record<string, unknown>> | undefined): void;
}

/**
 * 콘솔의 구조적 최소치.
 *
 * 코어는 DOM lib 없이 컴파일돼야 하므로(`tsconfig.core.json`, §2.4) 전역 `console` 선언에 기댈 수
 * 없다 — 그 선언은 DOM/노드 타입에만 있다. 구조적으로 집어 오면 타입 경계를 지키면서
 * 콘솔이 없는 런타임에서도 안전하다.
 */
type ConsoleSink = {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

const consoleSink = (globalThis as { readonly console?: ConsoleSink }).console;

/**
 * `options.tag`를 주지 않은 호출자가 로그에서 이 킷을 식별할 수 있게 하는 기본 태그.
 * 패키지명을 그대로 쓰지 않는 이유: `entry-guard`(§10.3)가 `src/core/**`에서 그 이름의 접두사를
 * 금지 문자열로 스캔하기 때문이다. 기본 스테이징 네임스페이스(§5.5)와 같은 이름을 쓴다.
 */
const DEFAULT_TAG = '[gj-media]';

/**
 * 게이트: `platform.isDev && platform.os !== 'web'` (전신 `debugEnabled()` 보존).
 *
 * 전신의 세 번째 조건이던 "테스트 환경 제외"는 `PlatformAdapter.isDev`가 흡수한다
 * (기본 어댑터가 `__DEV__ && NODE_ENV !== 'test'`로 채운다 — §3.3). 코어에는 그 전역이 없다.
 * `options.enabled`는 호스트의 명시적 스위치이며, 생략하면 전신과 동일하게 플랫폼 게이트만 남는다.
 *
 * ⚠ 게이트가 닫혀 있으면 두 메서드 모두 **완전 no-op**이다 — details를 만드는 비용도 치르지 않는다.
 */
export function createMediaDebugLogger(input: {
  readonly platform: PlatformAdapter;
  readonly options?: MediaDebugOptions | undefined;
}): MediaDebugLogger {
  const { platform, options } = input;
  const tag = options?.tag ?? DEFAULT_TAG;
  const context = options?.context;
  const enabled = (options?.enabled ?? true) && platform.isDev && platform.os !== 'web';

  return {
    log(event, details) {
      if (!enabled) return;
      // Debug context and even console shims are host code. Diagnostics must never turn a safe
      // upload/device failure into a new public exception.
      try {
        let contextDetails: unknown;
        try {
          contextDetails = context?.();
        } catch {
          contextDetails = { context: DEBUG_UNREADABLE };
        }
        consoleSink?.log(
          safeDebugString(tag),
          safeDebugString(event),
          mergeDebugDetails({ platform: platform.os, context: contextDetails, details }),
        );
      } catch {
        // no-op
      }
    },
    error(event, error, details) {
      if (!enabled) return;
      try {
        let contextDetails: unknown;
        try {
          contextDetails = context?.();
        } catch {
          contextDetails = { context: DEBUG_UNREADABLE };
        }
        consoleSink?.warn(
          safeDebugString(tag),
          safeDebugString(event),
          mergeDebugDetails({
            platform: platform.os,
            context: contextDetails,
            details,
            error: snapshotDebugError(error),
          }),
        );
      } catch {
        // Error objects, context providers, and console shims can all be hostile. Logging remains
        // best-effort and must not expose or replace the operational outcome.
      }
    },
  };
}
