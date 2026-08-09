/**
 * secret key 파서 — **"./server" 엔트리에서만 export** (§4.2b 격리 규칙).
 *
 * 브랜드 심볼이 비공개이므로 이 파서들이 없는 번들(브라우저)에서는
 * `ApiSecretKey`/`WidgetSecretKey` 타입의 값을 제조할 방법 자체가 없다.
 * core/keys.ts의 진단 골격과 같은 구조지만 core에 두면 "."에서 도달 가능해지므로
 * 여기서 별도 구현한다 (의도된 중복).
 */
import type { ApiSecretKey, Env, KeyParseError, WidgetSecretKey } from '../core/keys';
import { err, ok, type Result } from '../core/result';

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

function badPrefix(expected: string, message: string): Result<never, KeyParseError> {
  return err({ source: 'library', kind: 'invalid-key', expected, reason: 'bad-prefix', message });
}

/** 접두사 인식 진단을 포함한 공통 검사 — 통과 시 인식 결과를 돌려준다. */
function checkSecretKey(
  raw: string,
  expectedKinds: readonly KeyKindCode[],
  expected: string,
): Result<RecognizedKey, KeyParseError> {
  const recognized = recognize(raw);
  if (recognized === null) {
    return badPrefix(expected, `키 접두사를 인식할 수 없습니다 — ${expected} 형식이어야 합니다.`);
  }
  if (!expectedKinds.includes(recognized.kind)) {
    const wanted = expectedKinds.map((k) => KIND_LABELS[k]).join(' 또는 ');
    return badPrefix(
      expected,
      `${KIND_LABELS[recognized.kind]}를 넣으셨습니다 — 여기에는 ${expected} 형식의 ${wanted}가 필요합니다.`,
    );
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
  return ok(recognized);
}

export function parseApiSecretKey(
  raw: string,
): Result<ApiSecretKey<'test'> | ApiSecretKey<'live'>, KeyParseError> {
  const checked = checkSecretKey(raw, ['sk'], 'test_sk_ | live_sk_');
  if (!checked.ok) return checked;
  // 팬텀 브랜드는 단언으로만 부여 가능 — 이 파서 통과가 브랜드 획득의 유일한 경로
  return checked.value.env === 'test'
    ? ok(raw as ApiSecretKey<'test'>)
    : ok(raw as ApiSecretKey<'live'>);
}

export function parseWidgetSecretKey(
  raw: string,
): Result<WidgetSecretKey<'test'> | WidgetSecretKey<'live'>, KeyParseError> {
  const checked = checkSecretKey(raw, ['gsk'], 'test_gsk_ | live_gsk_');
  if (!checked.ok) return checked;
  // 팬텀 브랜드는 단언으로만 부여 가능 — 이 파서 통과가 브랜드 획득의 유일한 경로
  return checked.value.env === 'test'
    ? ok(raw as WidgetSecretKey<'test'>)
    : ok(raw as WidgetSecretKey<'live'>);
}

/** 접두사 자동 판별 — sk는 ApiSecretKey, gsk는 WidgetSecretKey. 클라이언트 키(ck/gck)는 거부. */
export function parseSecretKey(
  raw: string,
): Result<ApiSecretKey | WidgetSecretKey, KeyParseError> {
  const checked = checkSecretKey(raw, ['sk', 'gsk'], 'test_sk_ | live_sk_ | test_gsk_ | live_gsk_');
  if (!checked.ok) return checked;
  return checked.value.kind === 'sk' ? parseApiSecretKey(raw) : parseWidgetSecretKey(raw);
}
