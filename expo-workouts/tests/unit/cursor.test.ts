// 커서 코덱 · 버저닝 · 불투명성 (설계 §4.2 · §4.3 · §4.5 · §9.1).
//
// 이 스위트의 계약 하나: **어느 입력에도 throw가 0건이다.** 미션 §4.2의
// "expired/invalid cursor → reset:true, never an exception"이 문서 주장이 아니라 사실이 되는 곳.

import { describe, expect, it } from 'vitest';

import scenarios from '../fixtures/sync-scenarios.json';
import { CURSOR_FORMAT_VERSION, READABLE_CURSOR_VERSIONS, describeCursor, workoutsErrorCode } from '../../src/core';
import {
  decodeCursor,
  decodePageToken,
  encodeCursor,
  encodePageToken,
  scopeFingerprint,
} from '../../src/core/sync/cursor';

const TOKEN = 'YnBsaXN0MDDUAQIDBAUGBwpYJHZlcnNpb26=PLATFORM-ANCHOR';
const FINGERPRINT = scopeFingerprint(['android.permission.health.READ_EXERCISE']);
const ISSUED = 1_755_000_000_000;

const cursor = encodeCursor('ios', { k: TOKEN, g: FINGERPRINT, s: ISSUED });

describe('cursor — 왕복과 형태', () => {
  it('gjw1.<tag>.<base64url> 형태다', () => {
    expect(cursor.startsWith('gjw1.i.')).toBe(true);
    // base64url — SQLite TEXT에 그대로 들어가야 하므로 이스케이프가 필요한 문자가 없다.
    expect(/^gjw1\.i\.[A-Za-z0-9_-]+$/.test(cursor)).toBe(true);
  });

  it('디코드가 payload를 그대로 돌려준다 (유니코드 포함)', () => {
    const unicode = encodeCursor('android', { k: '토큰-🏃', g: FINGERPRINT, s: ISSUED });
    const decoded = decodeCursor(unicode, 'android', FINGERPRINT);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.payload.k).toBe('토큰-🏃');
    expect(decoded.payload.s).toBe(ISSUED);
  });

  it('버전 상수가 서로 정합적이다 — 목록을 줄이는 것은 breaking change다', () => {
    expect(CURSOR_FORMAT_VERSION).toBe(1);
    expect(READABLE_CURSOR_VERSIONS).toContain(CURSOR_FORMAT_VERSION);
  });
});

describe('cursor — CursorResetReason 6종 전수, throw 0건', () => {
  it('픽스처가 나열한 6종이 곧 우리가 낼 수 있는 전부다', () => {
    expect(scenarios.resetReasons).toEqual([
      'noCursor',
      'malformed',
      'formatUnsupported',
      'platformMismatch',
      'expired',
      'scopesChanged',
    ]);
  });

  const cases: readonly (readonly [string, string, string])[] = [
    ['매직 없음', 'not-a-cursor', 'malformed'],
    ['다른 매직(페이지 토큰)', encodePageToken('ios', TOKEN), 'malformed'],
    ['잘린 문자열', cursor.slice(0, 10), 'malformed'],
    ['base64url 아님', 'gjw1.i.@@@@', 'malformed'],
    ['base64인데 JSON 아님', `gjw1.i.${'QUJD'}`, 'malformed'],
    ['미래 버전', cursor.replace('gjw1.', 'gjw9.'), 'formatUnsupported'],
    ['다른 플랫폼 태그', cursor.replace('gjw1.i.', 'gjw1.a.'), 'platformMismatch'],
    ['알 수 없는 태그', cursor.replace('gjw1.i.', 'gjw1.z.'), 'malformed'],
    ['빈 문자열', '', 'malformed'],
  ];

  for (const [name, input, reason] of cases) {
    it(`${name} -> ${reason} (throw 0)`, () => {
      const decoded = decodeCursor(input, 'ios', FINGERPRINT);
      expect(decoded.ok).toBe(false);
      if (decoded.ok) return;
      expect(decoded.reason).toBe(reason);
    });
  }

  it('shape 검증 실패도 malformed다 — 파서는 매직 뒤에서만 돈다', () => {
    // { k: 1 } 은 base64url·JSON 모두 유효하지만 우리 payload가 아니다.
    const body = Buffer.from(JSON.stringify({ k: 1, g: 'x', s: 2 }), 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const decoded = decodeCursor(`gjw1.i.${body}`, 'ios', FINGERPRINT);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toBe('malformed');
  });

  it('지문이 다르면 scopesChanged다 — 넓어지든 좁아지든 마찬가지', () => {
    const wider = scopeFingerprint([
      'android.permission.health.READ_EXERCISE',
      'android.permission.health.READ_STEPS',
    ]);
    const decoded = decodeCursor(cursor, 'ios', wider);
    expect(decoded.ok).toBe(false);
    if (decoded.ok) return;
    expect(decoded.reason).toBe('scopesChanged');
  });

  it('무작위 적대적 입력 1000건에 대해 throw가 0건이다', () => {
    const alphabet = 'gjw01.ia_-@={}"\\ 한🏃';
    for (let i = 0; i < 1000; i += 1) {
      let input = '';
      const length = i % 40;
      for (let k = 0; k < length; k += 1) {
        input += alphabet[(i * 31 + k * 7) % alphabet.length] ?? '';
      }
      expect(() => decodeCursor(input, 'ios', FINGERPRINT)).not.toThrow();
      expect(() => describeCursor(input)).not.toThrow();
    }
  });
});

describe('describeCursor — 불투명성 (cursor-opacity 가드)', () => {
  it('formatVersion · platform · issuedAtMs만 돌려준다', () => {
    expect(describeCursor(cursor)).toEqual({
      formatVersion: 1,
      platform: 'ios',
      issuedAtMs: ISSUED,
    });
  });

  it('플랫폼 토큰의 어떤 부분 문자열도 반환 객체에 등장하지 않는다', () => {
    const serialized = JSON.stringify(describeCursor(cursor));
    for (let length = 6; length <= TOKEN.length; length += 6) {
      expect(serialized.includes(TOKEN.slice(0, length))).toBe(false);
    }
  });

  it('읽을 수 없는 것에는 null이다 — 절대 던지지 않는다', () => {
    expect(describeCursor('nope')).toBeNull();
    expect(describeCursor(cursor.replace('gjw1.', 'gjw7.'))).toBeNull();
  });
});

describe('페이지 토큰 — 양방향 안전 실패 (§4.2)', () => {
  it('페이지 토큰은 다른 매직을 쓰고 왕복한다', () => {
    const token = encodePageToken('android', 'offset:50');
    expect(token.startsWith('gjp1.a.')).toBe(true);
    expect(decodePageToken(token, 'android')).toBe('offset:50');
  });

  it('페이지 토큰 자리에 동기화 커서를 넣으면 invalidArgument로 즉시 발각된다', () => {
    try {
      decodePageToken(cursor, 'ios');
      throw new Error('던졌어야 한다');
    } catch (error) {
      expect(workoutsErrorCode(error)).toBe('invalidArgument');
    }
  });

  it('반대 방향은 자가 치유된다 — 커서 자리의 페이지 토큰은 reset(malformed)이다', () => {
    const decoded = decodeCursor(encodePageToken('ios', 'offset:50'), 'ios', FINGERPRINT);
    expect(decoded.ok).toBe(false);
  });

  it('다른 플랫폼에서 발행된 페이지 토큰도 invalidArgument다', () => {
    try {
      decodePageToken(encodePageToken('ios', 'x'), 'android');
      throw new Error('던졌어야 한다');
    } catch (error) {
      expect(workoutsErrorCode(error)).toBe('invalidArgument');
    }
  });
});

describe('scopeFingerprint — 권한 문자열에 대한 FNV-1a', () => {
  it('순서에 무관하다 — 정렬한 뒤 해싱한다', () => {
    expect(scopeFingerprint(['b', 'a'])).toBe(scopeFingerprint(['a', 'b']));
  });

  it('집합이 달라지면 지문이 달라진다', () => {
    expect(scopeFingerprint(['a'])).not.toBe(scopeFingerprint(['a', 'b']));
  });

  it('짧다 — 커서 길이가 곧 소비자의 저장 비용이다', () => {
    expect(scopeFingerprint(Array.from({ length: 50 }, (_, i) => `perm-${String(i)}`)).length).toBeLessThanOrEqual(8);
  });
});
