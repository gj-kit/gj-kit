// 설계 문서 §5.3 · §7 하드닝 8 — 서명 URL 로그 유출 차단.
//
// ⚠ 이 파일이 지키는 것: **임시 자격증명이 로그로 새지 않는다.** iOS URLSession 실패는 서명 업로드
//   URL 전문을 그대로 에코하고, 그 쿼리에는 유효한 자격증명이 실려 있다. 전신에서는 이 모듈이
//   `react-native`의 `Platform`을 직접 import했기 때문에 **순수 유닛으로 검증할 수 없었다** —
//   주입(`PlatformAdapter`)으로 바뀌면서 이 파일이 처음 성립한다.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMediaDebugLogger,
  isPhotoKitUri,
  sanitizeMediaErrorMessage,
  summarizeUri,
} from '../../src/core/debug';
import { SIGNED_UPLOAD_URL, fakePlatform, signedUrlErrorMessage } from '../../src/testing';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isPhotoKitUri', () => {
  it('ph:// 만 참이다', () => {
    expect(isPhotoKitUri('ph://ABC-123/L0/001')).toBe(true);
    expect(isPhotoKitUri('file:///cache/a.jpg')).toBe(false);
    expect(isPhotoKitUri(null)).toBe(false);
    expect(isPhotoKitUri(undefined)).toBe(false);
  });
});

describe('summarizeUri — 모양만 남긴다', () => {
  it('서명 URL의 원문이 결과 어디에도 없다', () => {
    const summary = summarizeUri(SIGNED_UPLOAD_URL);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('X-Amz-Signature');
    expect(serialized).not.toContain('X-Amz-Credential');
    expect(serialized).not.toContain('EXAMPLEKEYID');
    expect(serialized).not.toContain('media.example.test');
    // 남는 것은 모양뿐이다 — 길이는 남기되 내용은 남기지 않는다.
    expect(summary).toEqual({
      scheme: 'https',
      extension: 'jpg',
      length: SIGNED_UPLOAD_URL.length,
      isFile: false,
      isContent: false,
      isPhotoKit: false,
    });
  });

  it('file·content·ph 스킴을 구분한다', () => {
    expect(summarizeUri('file:///cache/IMG.JPEG')).toMatchObject({
      scheme: 'file',
      extension: 'jpeg',
      isFile: true,
      isContent: false,
      isPhotoKit: false,
    });
    expect(summarizeUri('content://media/external/images/1')).toMatchObject({
      scheme: 'content',
      extension: null,
      isContent: true,
    });
    expect(summarizeUri('ph://A1/L0/001')).toMatchObject({ scheme: 'ph', isPhotoKit: true });
  });

  it('스킴이 없으면 unknown, 값이 없으면 null', () => {
    expect(summarizeUri('/tmp/a.png')).toMatchObject({ scheme: 'unknown', extension: 'png' });
    expect(summarizeUri(null)).toBeNull();
    expect(summarizeUri(undefined)).toBeNull();
    expect(summarizeUri('')).toBeNull();
  });
});

describe('sanitizeMediaErrorMessage', () => {
  it('URL만 [URL]로 치환하고 플랫폼 코드·설명은 남긴다', () => {
    const sanitized = sanitizeMediaErrorMessage(signedUrlErrorMessage());
    expect(sanitized).toContain('NSURLErrorDomain');
    expect(sanitized).toContain('Code=-1001');
    expect(sanitized).toContain('[URL]');
    expect(sanitized).not.toContain('X-Amz-Signature');
    expect(sanitized).not.toContain('https://');
  });

  it('한 메시지에 여러 URL이 있어도 전부 치환한다', () => {
    const sanitized = sanitizeMediaErrorMessage(
      `first ${SIGNED_UPLOAD_URL} then http://other.test/a?token=abc end`,
    );
    expect(sanitized).toBe('first [URL] then [URL] end');
  });

  it('1000자에서 자른다 — 로그 폭주 차단', () => {
    expect(sanitizeMediaErrorMessage('x'.repeat(5000))).toHaveLength(1000);
  });

  it('URL이 없는 메시지는 그대로 통과한다', () => {
    expect(sanitizeMediaErrorMessage('plain failure')).toBe('plain failure');
  });
});

describe('createMediaDebugLogger — 게이트 platform.isDev && os !== "web"', () => {
  it('네이티브 + isDev 에서만 로그가 나간다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    createMediaDebugLogger({ platform: { os: 'ios', isDev: true } }).log('event', { a: 1 });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toBe('[gj-media]');
    expect(log.mock.calls[0]?.[2]).toMatchObject({ platform: 'ios', a: 1 });
  });

  it('web에서는 isDev여도 완전 no-op — 브라우저 콘솔에 남기지 않는다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createMediaDebugLogger({ platform: { os: 'web', isDev: true } });
    logger.log('event');
    logger.error('event', new Error('x'));
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('프로덕션(isDev=false)에서는 완전 no-op — details를 만드는 비용도 치르지 않는다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = createMediaDebugLogger({ platform: fakePlatform('ios') });
    logger.log('event');
    logger.error('event', new Error('x'));
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('options.enabled=false는 호스트의 명시적 스위치다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    createMediaDebugLogger({
      platform: fakePlatform('ios'),
      options: { enabled: false },
    }).log('event');
    expect(log).not.toHaveBeenCalled();
  });

  it('tag·context가 details에 병합된다', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    createMediaDebugLogger({
      platform: { os: 'android', isDev: true },
      options: { enabled: true, tag: '[host]', context: () => ({ screen: 'grid' }) },
    }).log('event', { extra: 2 });
    expect(log).toHaveBeenCalledWith('[host]', 'event', {
      platform: 'android',
      screen: 'grid',
      extra: 2,
    });
  });

  it('error(): 메시지의 서명 URL이 새니타이즈된다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createMediaDebugLogger({ platform: { os: 'ios', isDev: true } }).error(
      'upload.failed',
      new Error(signedUrlErrorMessage()),
      { fileName: 'a.jpg' },
    );
    const details = warn.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(details['errorName']).toBe('Error');
    expect(String(details['errorMessage'])).toContain('[URL]');
    expect(JSON.stringify(details)).not.toContain('X-Amz-Signature');
  });

  it('error(): 비-Error throw도 처리한다 — 네이티브 브리지는 문자열을 던진다', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createMediaDebugLogger({ platform: { os: 'ios', isDev: true } }).error(
      'upload.failed',
      `rejected ${SIGNED_UPLOAD_URL}`,
    );
    const details = warn.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(details['errorName']).toBeUndefined();
    expect(details['errorMessage']).toBe('rejected [URL]');
  });
});
