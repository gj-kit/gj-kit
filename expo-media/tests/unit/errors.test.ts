// 설계 문서 §5.2 — 타입 있는 에러 14종과 **사본 간 인식**.
//
// ⚠ 이 파일이 지키는 것: `instanceof`가 깨지는 자리에서 `isMediaError`가 살아 있는가.
//   §2.4의 `splitting:false`로 엔트리마다 코어가 복제되므로 `"./device"`가 던진 에러를
//   `"."`이 검사하면 **두 클래스 객체가 서로 다르다**. 전신 소비자
//   `syncStateMachine.ts:36`이 정확히 `error instanceof PhotoUploadError`였고, 그 코드가
//   `isMediaError(error)`로 교체되어야 하는 이유가 이것이다.
//   아래 `OtherCopyMediaError`는 "다른 엔트리에 복제된 코어가 만든 에러"의 정확한 모사다 —
//   같은 전역 심볼(`Symbol.for`)을 각인하되 클래스는 다르다.

import { describe, expect, it } from 'vitest';
import {
  MEDIA_ERROR_CODES,
  MediaError,
  assertNeverMediaError,
  isMediaError,
  mediaErrorCode,
  mediaErrorUserMessage,
} from '../../src/core/errors';

const MEDIA_ERROR_TAG = Symbol.for('@gj-kit/expo-media#MediaError');

/** 엔트리 복제로 생긴 **다른 클래스**의 MediaError. 런타임 각인은 전역 심볼이라 동일하다. */
class OtherCopyMediaError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MediaError';
    this.code = code;
    Object.defineProperty(this, MEDIA_ERROR_TAG, { value: true, enumerable: false });
  }
}

describe('MEDIA_ERROR_CODES', () => {
  it('순서·문자열이 계약이다 — 소비자가 리터럴 Set으로 분기한다', () => {
    // ⚠ 스냅샷이 아니라 인라인 리터럴이다. 스냅샷은 `-u` 한 번으로 조용히 갱신된다.
    expect(MEDIA_ERROR_CODES).toEqual([
      'device-timeout',
      'device-icloud-only',
      'device-not-found',
      'unsupported-file-type',
      'file-too-large',
      'upload-failed',
      'save-permission-denied',
      'save-download-failed',
      'permission-denied',
      'poster-upload-failed',
      'no-media-selected',
      'picked-asset-invalid',
      'config-invalid',
      'platform-unsupported',
    ]);
  });
});

describe('MediaError', () => {
  it('code와 message를 그대로 들고 다닌다', () => {
    const error = new MediaError('upload-failed', 'Photo upload failed.');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('MediaError');
    expect(error.code).toBe('upload-failed');
    expect(error.message).toBe('Photo upload failed.');
  });

  it('태그는 열거되지 않는다 — 호스트가 에러를 직렬화해도 잡음이 남지 않는다', () => {
    const error = new MediaError('upload-failed', 'x');
    expect(Object.keys(error)).not.toContain(String(MEDIA_ERROR_TAG));
    expect(Object.getOwnPropertySymbols(error)).toContain(MEDIA_ERROR_TAG);
    expect(JSON.stringify({ ...error })).not.toContain('gj-kit');
  });
});

describe('isMediaError — 엔트리 복제를 넘어 동작한다', () => {
  it('같은 사본이 만든 에러', () => {
    expect(isMediaError(new MediaError('device-timeout', 'x'))).toBe(true);
  });

  it('다른 사본이 만든 에러도 인식한다 — 그러나 instanceof는 실패한다', () => {
    const fromOtherEntry = new OtherCopyMediaError('device-timeout', 'timed out');
    // 이 두 줄이 `isMediaError`의 존재 이유 전부다.
    expect(fromOtherEntry instanceof MediaError).toBe(false);
    expect(isMediaError(fromOtherEntry)).toBe(true);
    expect(mediaErrorCode(fromOtherEntry)).toBe('device-timeout');
    expect(mediaErrorUserMessage(fromOtherEntry)).toBe('timed out');
  });

  it('MediaError가 아닌 값은 전부 거짓', () => {
    expect(isMediaError(new Error('plain'))).toBe(false);
    expect(isMediaError({ code: 'upload-failed' })).toBe(false);
    expect(isMediaError(null)).toBe(false);
    expect(isMediaError(undefined)).toBe(false);
    expect(isMediaError('upload-failed')).toBe(false);
  });

  it('mediaErrorCode·mediaErrorUserMessage는 비-MediaError에 null', () => {
    expect(mediaErrorCode(new Error('plain'))).toBeNull();
    expect(mediaErrorUserMessage(new Error('plain'))).toBeNull();
  });
});

describe('assertNeverMediaError', () => {
  it('도달하면 그 자체가 버그다 — plain Error를 던진다(사용자 노출 문구가 아니다)', () => {
    expect(() => assertNeverMediaError('nope' as never)).toThrow('Unhandled MediaErrorCode: nope');
    const error = (() => {
      try {
        assertNeverMediaError('nope' as never);
        return null;
      } catch (thrown: unknown) {
        return thrown;
      }
    })();
    expect(isMediaError(error)).toBe(false);
  });
});
