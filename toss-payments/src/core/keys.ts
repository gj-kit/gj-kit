/**
 * 키 4종 — 템플릿 리터럴(형식) × 브랜드(명목성) × EnvTag(test/live phantom).
 *
 * 이 모듈("."에서 도달)은 **client key 파서만** export한다.
 * secret key 파서(parseApiSecretKey/parseWidgetSecretKey)는 server/keys.ts 전용 —
 * 브라우저 번들에서 시크릿 키 타입의 값을 제조할 방법 자체를 없애는 격리 규칙.
 */
import type { Brand, EnvAxis } from './brand';
import { err, ok, type Result } from './result';

export type Env = 'test' | 'live';

/**
 * test/live phantom 태그 — 런타임 표현 없음. `isTestKey`/`isLiveKey`로만 내로잉한다.
 * 상호 배타 축(EnvAxis)이라 `EnvTag<'test'> & EnvTag<'live'>`는 never로 붕괴한다 —
 * 술어 내로잉이 유니언에서 반대 env 멤버를 정확히 걸러내기 위한 구조 (brand.ts 참조).
 */
export type EnvTag<E extends Env> = EnvAxis<E>;

/**
 * 형식(템플릿 리터럴)과 명목성(브랜드)을 동시에 강제 —
 * `'test_ck_oops'` 리터럴도 parse 없이는 대입 불가.
 */
export type ApiClientKey<E extends Env = Env> = (E extends 'test'
  ? `test_ck_${string}`
  : `live_ck_${string}`) &
  Brand<'ApiClientKey'> &
  EnvTag<E>;
export type ApiSecretKey<E extends Env = Env> = (E extends 'test'
  ? `test_sk_${string}`
  : `live_sk_${string}`) &
  Brand<'ApiSecretKey'> &
  EnvTag<E>;
export type WidgetClientKey<E extends Env = Env> = (E extends 'test'
  ? `test_gck_${string}`
  : `live_gck_${string}`) &
  Brand<'WidgetClientKey'> &
  EnvTag<E>;
export type WidgetSecretKey<E extends Env = Env> = (E extends 'test'
  ? `test_gsk_${string}`
  : `live_gsk_${string}`) &
  Brand<'WidgetSecretKey'> &
  EnvTag<E>;

export interface KeyParseError {
  readonly source: 'library';
  readonly kind: 'invalid-key';
  /** 기대한 접두사 형식 — 예: "test_ck_ | live_ck_" */
  readonly expected: string;
  readonly reason: 'bad-prefix' | 'empty-body' | 'bad-length';
  /** 접두사 인식 진단 — 다른 종류의 키를 넣었으면 어떤 키인지 알려준다. */
  readonly message: string;
}

/** 토스 키 접두사 체계: API 개별 키 ck/sk, 결제위젯 키 gck/gsk (각각 test_/live_). */
type KeyKindCode = 'ck' | 'sk' | 'gck' | 'gsk';

const KIND_LABELS: Readonly<Record<KeyKindCode, string>> = {
  ck: 'API 클라이언트 키(ck)',
  sk: 'API 시크릿 키(sk)',
  gck: '위젯 클라이언트 키(gck)',
  gsk: '위젯 시크릿 키(gsk)',
};

interface RecognizedKey {
  readonly env: Env;
  readonly kind: KeyKindCode;
  readonly body: string;
}

function recognize(raw: string): RecognizedKey | null {
  const match = /^(test|live)_(gck|gsk|ck|sk)_([\s\S]*)$/.exec(raw);
  if (match === null) return null;
  const kind = match[2];
  if (kind !== 'ck' && kind !== 'sk' && kind !== 'gck' && kind !== 'gsk') return null;
  return { env: match[1] === 'live' ? 'live' : 'test', kind, body: match[3] ?? '' };
}

/**
 * 공통 파싱 골격 — 접두사 인식 진단 메시지를 만든다.
 * 위젯 키를 API 파서에 넣는 류의 실수에서 "어떤 키를 넣었는지"를 알려주는 것이 목적.
 */
function checkKey(
  raw: string,
  expectedKind: KeyKindCode,
  expected: string,
): Result<Env, KeyParseError> {
  const recognized = recognize(raw);
  if (recognized === null) {
    return err({
      source: 'library',
      kind: 'invalid-key',
      expected,
      reason: 'bad-prefix',
      message: `키 접두사를 인식할 수 없습니다 — ${expected} 형식이어야 합니다.`,
    });
  }
  if (recognized.kind !== expectedKind) {
    return err({
      source: 'library',
      kind: 'invalid-key',
      expected,
      reason: 'bad-prefix',
      message: `${KIND_LABELS[recognized.kind]}를 넣으셨습니다 — 여기에는 ${expected} 형식의 ${KIND_LABELS[expectedKind]}가 필요합니다.`,
    });
  }
  if (recognized.body.length === 0) {
    return err({
      source: 'library',
      kind: 'invalid-key',
      expected,
      reason: 'empty-body',
      message: `접두사 뒤 본문이 비어 있습니다 — ${expected} 형식이어야 합니다.`,
    });
  }
  return ok(recognized.env);
}

export function parseApiClientKey(
  raw: string,
): Result<ApiClientKey<'test'> | ApiClientKey<'live'>, KeyParseError> {
  const checked = checkKey(raw, 'ck', 'test_ck_ | live_ck_');
  if (!checked.ok) return checked;
  // 팬텀 브랜드는 단언으로만 부여 가능 — 이 파서 통과가 브랜드 획득의 유일한 경로
  return checked.value === 'test'
    ? ok(raw as ApiClientKey<'test'>)
    : ok(raw as ApiClientKey<'live'>);
}

export function parseWidgetClientKey(
  raw: string,
): Result<WidgetClientKey<'test'> | WidgetClientKey<'live'>, KeyParseError> {
  const checked = checkKey(raw, 'gck', 'test_gck_ | live_gck_');
  if (!checked.ok) return checked;
  // 팬텀 브랜드는 단언으로만 부여 가능 — 이 파서 통과가 브랜드 획득의 유일한 경로
  return checked.value === 'test'
    ? ok(raw as WidgetClientKey<'test'>)
    : ok(raw as WidgetClientKey<'live'>);
}

/** env 내로잉 가드 — EnvTag는 phantom이라 프로퍼티 판별이 불가능해 접두사로 판정한다. */
export function isTestKey<K extends string>(key: K): key is K & EnvTag<'test'> {
  return key.startsWith('test_');
}

/** env 내로잉 가드 — {@link isTestKey}의 live 대응. */
export function isLiveKey<K extends string>(key: K): key is K & EnvTag<'live'> {
  return key.startsWith('live_');
}
