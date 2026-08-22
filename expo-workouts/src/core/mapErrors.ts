// 네이티브 페이로드 -> 공개 `code` (설계 §5.7 전수표 · 미션 §4.1의 코드 유도 규칙).
//
// Expo 런타임은 **예외 클래스 이름**에서 `ERR_*` 코드를 만든다(idx f8). 그래서 이름이 표류하면
// 조용히 깨진다. 여기서는 세 이름(공개 `code` · `ERR_WORKOUTS_*` · `Workouts*Exception`)을 전부
// **하나의 유니언에서 기계적으로 유도**한다 — 손으로 유지하는 표가 없으면 표류할 표도 없다.
// `error-code-parity` 가드가 Swift/Kotlin의 클래스 이름 집합을 이 유도 결과와 대조한다.
//
// ── Phase 3, 결함 A (실기에서 발견) ────────────────────────────────────────────
// ExpoModulesCore는 `AsyncFunction` 본문이 던진 것을 **한 겹 더 감싼다**. 설치본을 직접 읽어
// 확인한 사실(버전은 example 앱이 빌드한 것):
//
//   iOS   `expo-modules-core/ios/Core/Functions/ConcurrentFunctionDefinition.swift`
//         `catch let error as Exception { throw FunctionCallException(name).causedBy(error) }`
//         `FunctionCallException.code`는 cause가 `Exception`이면 **cause의 code를 되돌려준다**
//         (`ios/Core/Functions/AnyFunctionDefinition.swift`). 그 값은
//         `expo-modules-jsi/.../JavaScriptError.swift`의 `init(_:from:)`이 JS `Error`에
//         `code` 프로퍼티로 붙인다. 다만 `message`는 `String(reflecting:)` =
//         `Exception.debugDescription`이므로 **`"<이름>: <이유> (at <파일>:<줄>)"` +
//         `"\n→ Caused by: …"`** 형태가 되고, 우리 예외의 **클래스 이름이 그 문자열 안에 남는다**.
//   Android `expo/modules/kotlin/exception/CodedException.kt`
//         `DecoratedException(message, cause)`가 `cause.code`를 그대로 물려받고 메시지를
//         `"Call to function 'M.f' has been rejected.\n→ Caused by: <cause 메시지>"`로 만든다.
//         `PromiseImpl.reject` -> `JavaCallback.cpp`의 `makeCodedError`가 JS `CodedError(code, message)`를
//         만든다. 즉 Android는 `code`가 살아남고, `UnexpectedException`으로 떨어진 경우에만
//         `ERR_UNEXPECTED`가 되며 그때는 **메시지에 원래 클래스의 FQCN이 들어 있다**.
//
// 그래서 이 모듈은 이제 (a) `cause` 체인을 끝까지 걷고, (b) 어느 마디의 `code`든 읽고,
// (c) 그래도 못 찾으면 **메시지 텍스트에서 `ERR_WORKOUTS_*` 토큰과 `Workouts*Exception` 클래스
// 이름을 회수**한다. 어느 것도 못 찾으면 `internal`이고, 네이티브 원문은 진단용으로만
// `nativeMessage`/`cause`에 남는다 — 공개 `message`에는 절대 넣지 않는다.

import { WorkoutsError, WORKOUTS_ERROR_CODES, isWorkoutsError, type WorkoutsErrorCode } from './errors';
import type { NativePayloadDto } from './native-contract';

function screamingSnake(code: string): string {
  return code.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

function pascal(code: string): string {
  return `${code.charAt(0).toUpperCase()}${code.slice(1)}`;
}

/** `'routeTooLarge'` -> `'ERR_WORKOUTS_ROUTE_TOO_LARGE'`. */
export function nativeErrorCodeFor(code: WorkoutsErrorCode): string {
  return `ERR_WORKOUTS_${screamingSnake(code)}`;
}

/** `'routeTooLarge'` -> `'WorkoutsRouteTooLargeException'` (Swift와 Kotlin에서 동일한 이름). */
export function workoutsExceptionClassName(code: WorkoutsErrorCode): string {
  return `Workouts${pascal(code)}Exception`;
}

/** `ERR_WORKOUTS_*` -> 공개 코드. 14종 전수, 다른 것은 없다. */
export const NATIVE_ERROR_CODES: Readonly<Record<string, WorkoutsErrorCode>> = Object.fromEntries(
  WORKOUTS_ERROR_CODES.map((code) => [nativeErrorCodeFor(code), code] as const),
);

/** `Workouts*Exception` -> 공개 코드. 위와 같은 유도에서 나오므로 손으로 유지할 표가 없다. */
const EXCEPTION_CLASS_CODES: Readonly<Record<string, WorkoutsErrorCode>> = Object.fromEntries(
  WORKOUTS_ERROR_CODES.map((code) => [workoutsExceptionClassName(code), code] as const),
);

/** Health Connect `HealthConnectException` errorCode -> 공개 코드 (idx f39). */
const HEALTH_CONNECT_CODES: Readonly<Record<number, WorkoutsErrorCode>> = {
  // 7은 **두 가지 의미를 겸한다** — 메시지가 판별자다(f99, f101). 아래 `disambiguate`를 보라.
  7: 'rateLimited',
  8: 'busy',
  9: 'internal',
};

/** 네이티브 원문을 진단용으로만 보관한다. 무한 길이 문자열이 로그로 새는 것을 막는다. */
const MAX_NATIVE_MESSAGE_CHARS = 600;
/** `cause` 체인을 걷는 깊이 상한. 순환은 방문 집합이 막는다. */
const MAX_CAUSE_DEPTH = 12;

const ERR_TOKEN_PATTERN = /ERR_WORKOUTS_[A-Z0-9_]+/g;
const EXCEPTION_TOKEN_PATTERN = /Workouts[A-Za-z0-9]*Exception/g;

/**
 * `errorCode = 7`은 rate limiting과 단일 레코드 크기 초과를 겸한다. 메시지에
 * `single record size limit`이 있으면 크기 초과다 — **그때는 `rateLimited`가 아니다**.
 */
function disambiguate(code: WorkoutsErrorCode, message: string): WorkoutsErrorCode {
  if (code === 'rateLimited' && /single record size limit/i.test(message)) return 'routeTooLarge';
  return code;
}

/** 체인 한 마디. `raw`는 `isWorkoutsError` 판정을 위해 남긴다. */
interface ErrorNode extends NativePayloadDto {
  readonly raw: unknown;
}

function readNode(value: unknown): ErrorNode {
  if (typeof value !== 'object' || value === null) {
    return { raw: value, message: typeof value === 'string' ? value : undefined };
  }
  const record = value as Record<string, unknown>;
  const code = typeof record['code'] === 'string' ? record['code'] : undefined;
  const message = typeof record['message'] === 'string' ? record['message'] : undefined;
  const platformCode = typeof record['platformCode'] === 'number' ? record['platformCode'] : undefined;
  const exceptionClass =
    typeof record['exceptionClass'] === 'string' ? record['exceptionClass'] : undefined;
  return { raw: value, code, message, platformCode, exceptionClass };
}

/**
 * 에러와 그 `cause` 체인을 가까운 것부터 나열한다. 브리지가 씌운 래퍼는 언제나 체인의 **앞쪽**에
 * 있으므로, 가까운 마디를 먼저 보는 것이 곧 "가장 구체적인 코드를 고른다"가 된다.
 */
function collectNodes(error: unknown): readonly ErrorNode[] {
  const nodes: ErrorNode[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) break;
      seen.add(current);
    }
    nodes.push(readNode(current));
    if (typeof current !== 'object' || current === null) break;
    const next = (current as Record<string, unknown>)['cause'];
    if (next === undefined || next === null) break;
    current = next;
  }
  return nodes;
}

function firstKnownToken(
  text: string,
  pattern: RegExp,
  table: Readonly<Record<string, WorkoutsErrorCode>>,
): WorkoutsErrorCode | undefined {
  // `RegExp`에 `g` 플래그가 있으므로 `lastIndex`를 매번 초기화한다 — 모듈 상수를 재사용하는 대가다.
  pattern.lastIndex = 0;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    const hit = table[match[0]];
    if (hit !== undefined) return hit;
  }
  return undefined;
}

/**
 * 우선순위: 구조화된 `code` -> 구조화된 클래스 이름 -> 텍스트 안의 `ERR_WORKOUTS_*` ->
 * 텍스트 안의 `Workouts*Exception` -> Health Connect `platformCode` -> `internal`.
 *
 * 텍스트 회수가 뒤에 오는 이유: 구조화된 필드가 있으면 그것이 언제나 더 정확하고, 텍스트는
 * 브리지 버전에 따라 있을 수도 없을 수도 있는 **폴백**이다.
 */
function resolveCode(nodes: readonly ErrorNode[], text: string): WorkoutsErrorCode {
  for (const node of nodes) {
    const byCode = node.code === undefined || node.code === null ? undefined : NATIVE_ERROR_CODES[node.code];
    if (byCode !== undefined) return byCode;
  }
  for (const node of nodes) {
    const name = node.exceptionClass;
    if (name === undefined || name === null) continue;
    const byClass = EXCEPTION_CLASS_CODES[name];
    if (byClass !== undefined) return byClass;
  }
  const byToken = firstKnownToken(text, ERR_TOKEN_PATTERN, NATIVE_ERROR_CODES);
  if (byToken !== undefined) return byToken;
  const byName = firstKnownToken(text, EXCEPTION_TOKEN_PATTERN, EXCEPTION_CLASS_CODES);
  if (byName !== undefined) return byName;
  for (const node of nodes) {
    const platformCode = node.platformCode;
    if (platformCode === undefined || platformCode === null) continue;
    const byPlatform = HEALTH_CONNECT_CODES[platformCode];
    if (byPlatform !== undefined) return byPlatform;
  }
  return 'internal';
}

/**
 * Fold anything the native layer raised into a `WorkoutsError`. Something that is already ours
 * passes through untouched — including one buried in the `cause` chain.
 *
 * The public `message` is ALWAYS `fallbackMessage`, an English sentence this library wrote. The
 * platform's own text reaches the caller only through `nativeMessage` and the standard `cause`, and
 * only for diagnostics; it is never assembled into the message a user might see.
 */
export function mapNativeError(error: unknown, fallbackMessage = 'The health store failed.'): WorkoutsError {
  if (isWorkoutsError(error)) return error;
  const nodes = collectNodes(error);
  for (const node of nodes) {
    if (isWorkoutsError(node.raw)) return node.raw;
  }

  const text = nodes
    .map((node) => node.message ?? '')
    .filter((entry) => entry.length > 0)
    .join('\n');
  const nativeMessage = text.length === 0 ? undefined : text.slice(0, MAX_NATIVE_MESSAGE_CHARS);
  const options = {
    cause: error,
    ...(nativeMessage === undefined ? {} : { nativeMessage }),
  };

  return new WorkoutsError(disambiguate(resolveCode(nodes, text), text), fallbackMessage, options);
}
