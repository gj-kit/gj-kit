// 설계 문서 §5.3 · §5.7.2-③ — 확장자↔MIME 단일 테이블과 감지 술어.
//
// ⚠ 이 테이블은 **서버 zod와 맞물린 계약**이다(§5.1 G15). 클라이언트가 서버보다 넓은 유니언을
//   가지면 presign 단계에서 서버가 거절하는 클라이언트/서버 불일치가 생긴다. 그래서 8종 고정을
//   인라인 리터럴로 못 박는다 — 여기 한 줄이 늘어나는 것은 곧 서버 변경을 동반해야 한다는 뜻이다.

import { describe, expect, it } from 'vitest';
import {
  MEDIA_CONTENT_TYPES,
  MEDIA_FILE_EXTENSIONS,
  detectImageContentType,
  detectMediaContentType,
  extensionForContentType,
  inferImageContentType,
  inferMediaContentType,
  isSupportedImageFile,
  isSupportedMediaFile,
  isSupportedVideoFile,
  mediaFileName,
  mediaKindOf,
} from '../../src/core/mediaTypes';

describe('테이블', () => {
  it('8종 고정 — gif는 없다(G15)', () => {
    expect(MEDIA_CONTENT_TYPES).toEqual([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]);
  });

  it('각 값의 첫 원소가 정규 확장자다 — 순서를 바꾸면 저장 파일명이 함께 바뀐다', () => {
    expect(extensionForContentType('image/jpeg')).toBe('jpg');
    expect(MEDIA_FILE_EXTENSIONS['image/jpeg'][0]).toBe('.jpg');
    expect(extensionForContentType('video/quicktime')).toBe('mov');
    expect(extensionForContentType('video/mp4')).toBe('mp4');
  });

  it('mediaKindOf — video/* 만 video다', () => {
    expect(MEDIA_CONTENT_TYPES.filter((type) => mediaKindOf(type) === 'video')).toEqual([
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]);
  });
});

describe('엄격 감지 (detect*)', () => {
  it('MIME이 지원 형식이면 그것을 쓴다 — 대소문자 무관', () => {
    expect(detectMediaContentType('IMAGE/PNG', 'x.mp4')).toBe('image/png');
  });

  it('MIME이 없거나 미지원이면 경로 확장자로 내려간다', () => {
    expect(detectMediaContentType(null, 'a/b/clip.MOV')).toBe('video/quicktime');
    expect(detectMediaContentType('application/octet-stream', 'a/b/clip.m4v')).toBe('video/mp4');
  });

  it('쿼리·프래그먼트가 붙은 서명 URL에서도 확장자를 집는다', () => {
    expect(detectMediaContentType(null, 'https://x.test/o/p.heic?sig=abc#frag')).toBe('image/heic');
  });

  it('둘 다 지목하지 못하면 null — 데이터 손상 지점에서 쓰는 술어다', () => {
    expect(detectMediaContentType(null, 'https://x.test/token/abcdef')).toBeNull();
    expect(detectMediaContentType('text/plain', 'note.txt')).toBeNull();
  });

  it('이미지 전용 판은 동영상을 통과시키지 않는다', () => {
    expect(detectImageContentType('video/mp4', 'clip.mp4')).toBeNull();
    expect(detectImageContentType(null, 'p.webp')).toBe('image/webp');
  });
});

describe('관대 추론 (infer*)', () => {
  it('폴백은 image/jpeg — 호스트의 HEIC 프리뷰 분기가 이 값을 읽는다', () => {
    expect(inferImageContentType(null, 'token-only')).toBe('image/jpeg');
    expect(inferMediaContentType(null, 'token-only')).toBe('image/jpeg');
  });

  it('동영상을 지목하면 동영상을 준다', () => {
    expect(inferMediaContentType('video/webm', null)).toBe('video/webm');
    expect(inferMediaContentType(null, 'clip.mov')).toBe('video/quicktime');
  });
});

describe('지원 여부 술어 — DOM File이 아니라 { name, type } 구조 타입(§7 하드닝 10)', () => {
  it('type이 지원 형식이면 이름과 무관하게 통과', () => {
    expect(isSupportedImageFile({ name: 'no-extension', type: 'image/heif' })).toBe(true);
    expect(isSupportedVideoFile({ name: 'no-extension', type: 'video/mp4' })).toBe(true);
  });

  it('type이 없으면 확장자로 판정한다', () => {
    expect(isSupportedImageFile({ name: 'PHOTO.JPEG' })).toBe(true);
    expect(isSupportedVideoFile({ name: 'movie.WEBM' })).toBe(true);
    expect(isSupportedMediaFile({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });

  it('name이 빈 문자열이어도 throw하지 않는다 — JS 호출자 방어(전신 동작 보존)', () => {
    expect(isSupportedMediaFile({ name: '' })).toBe(false);
    expect(isSupportedMediaFile({ name: '', type: 'image/png' })).toBe(true);
  });
});

describe('mediaFileName', () => {
  it('fileName이 있으면 그대로 쓴다', () => {
    expect(mediaFileName({ fileName: 'keep-me.png', contentType: 'image/jpeg' })).toBe(
      'keep-me.png',
    );
  });

  it('빈 문자열·null도 폴백 대상이다 — 파일명 없는 웹 드롭', () => {
    expect(mediaFileName({ fileName: '', contentType: 'image/png', now: 42 })).toBe('media-42.png');
    expect(mediaFileName({ fileName: null, contentType: 'video/mp4', now: 42 })).toBe(
      'media-42.mp4',
    );
  });

  it('prefix 기본값은 media, now는 결정론적 테스트를 위한 주입구다', () => {
    expect(mediaFileName({ contentType: 'image/jpeg', now: 1700000000000 })).toBe(
      'media-1700000000000.jpg',
    );
    expect(mediaFileName({ contentType: 'image/jpeg', prefix: 'photo', now: 7 })).toBe(
      'photo-7.jpg',
    );
  });
});
