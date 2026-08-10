// ═══════════════════════════════════════════════════════════════════════════
// 타입 픽스처 — 기기 저장(역방향 경로). 설계 문서 §6.3 ⑧·⑬ + §10.2.
//
// 전신 `saveImages.ts`는 7필드가 전부 옵셔널인 의존성 가방을 받았고, 그래서
// `platformOS:'web'` + `mediaLibrary` 동시 주입이 **컴파일을 통과**했다. 그 조합에서는
// 보고되는 `mode`와 실제 동작이 어긋날 수 있다. `SaveTarget` 판별 유니언으로 바꾸면
// 무효 조합이 **표현 불가능**해지고 `SaveResult.mode`가 `target.kind`에서 파생된다(§6.1-⑦).
// 이 파일은 "표현 불가능"이 실제로 성립하는지를 못 박는다.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expectTypeOf, it } from 'vitest';

import { createMediaSaver, mediaDownloadFileName } from '../../src/core';
import type {
  BrowserSaveAdapter,
  FileDownloadAdapter,
  FileSystemAdapter,
  MediaContentType,
  MediaLibrarySaveAdapter,
  MediaSaver,
  SaveResult,
  SaveTarget,
  SaveableMedia,
} from '../../src/core';

const forge = <T>(): T => undefined as T;

declare const browser: BrowserSaveAdapter;
declare const library: MediaLibrarySaveAdapter;
declare const plainFiles: FileSystemAdapter;
declare const downloadableFiles: FileSystemAdapter & FileDownloadAdapter;

describe('§6.3-⑧ SaveTarget 무효 조합은 표현 불가능하다 (§6.1-⑦)', () => {
  it('browser 타깃에 library를 주입할 수 없다', () => {
    createMediaSaver({
      target: {
        kind: 'browser-download',
        browser,
        // @ts-expect-error ⑧ 전신에서는 이 동시 주입이 통과했고 mode와 실동작이 어긋났다
        library,
      },
    });
  });

  it('media-library 타깃에 browser를 주입할 수도 없다', () => {
    createMediaSaver({
      target: {
        kind: 'media-library',
        files: downloadableFiles,
        library,
        // @ts-expect-error ⑧ 반대 방향도 동일하게 봉쇄된다
        browser,
      },
    });
  });

  it('media-library의 files는 다운로드 능력까지 요구한다', () => {
    createMediaSaver({
      target: {
        kind: 'media-library',
        // @ts-expect-error `FileDownloadAdapter`가 없는 파일시스템은 저장 경로를 완주할 수 없다
        files: plainFiles,
        library,
      },
    });
    // 다운로드 가능한 파일시스템이면 통과한다.
    expectTypeOf(
      createMediaSaver({ target: { kind: 'media-library', files: downloadableFiles, library } }),
    ).toEqualTypeOf<MediaSaver>();
  });

  it('kind 없이는 어느 분기도 고를 수 없다', () => {
    // @ts-expect-error 판별자 누락 — 유니언이 좁혀지지 않는다
    createMediaSaver({ target: { browser } });
    // @ts-expect-error 없는 판별자 값
    createMediaSaver({ target: { kind: 'ios-photos', library } });
  });

  it('target 자체가 필수 인자다', () => {
    // @ts-expect-error target 누락 — 어디에 저장할지 없는 저장기
    createMediaSaver({});
    createMediaSaver({
      target: { kind: 'browser-download', browser },
      fileNamePrefix: undefined,
      strings: undefined,
      telemetry: undefined,
    });
  });

  it('`SaveResult.mode`는 `SaveTarget["kind"]`에서 파생된다 — 보고와 실동작이 어긋날 수 없다', () => {
    expectTypeOf<SaveResult['mode']>().toEqualTypeOf<SaveTarget['kind']>();
    expectTypeOf<SaveResult['mode']>().toEqualTypeOf<'media-library' | 'browser-download'>();
    expectTypeOf<SaveResult>().toEqualTypeOf<{
      readonly savedCount: number;
      readonly mode: 'media-library' | 'browser-download';
    }>();
  });

  it('`platformOS` 같은 전신의 자유 플래그는 존재하지 않는다', () => {
    createMediaSaver({
      target: { kind: 'browser-download', browser },
      // @ts-expect-error 전신의 `platformOS` 플래그 — 판별 유니언이 그 역할을 흡수했다
      platformOS: 'web',
    });
  });
});

describe('§6.3-⑬ 저장 파일명은 index가 필수다 (§5.4-⑥ · G8)', () => {
  it('index 누락은 컴파일 에러', () => {
    // @ts-expect-error ⑬ id가 없을 때 index+1이 유일한 구분자다 — 없으면 파일명이 전부 같아진다
    mediaDownloadFileName({ url: 'https://x/y' });
  });

  it('url + index가 최소 조합이며 나머지는 EOP 옵셔널이다', () => {
    expectTypeOf(mediaDownloadFileName({ url: 'https://x/y', index: 0 })).toBeString();
    mediaDownloadFileName({
      url: 'https://x/y',
      index: 0,
      id: undefined,
      fileName: undefined,
      contentType: undefined,
      prefix: undefined,
    });
  });

  it('contentType은 닫힌 유니언이다 — 임의 MIME는 들어가지 않는다', () => {
    mediaDownloadFileName({ url: 'https://x/y', index: 0, contentType: 'image/heic' });
    // @ts-expect-error 'application/pdf'는 `MediaContentType`이 아니다
    mediaDownloadFileName({ url: 'https://x/y', index: 0, contentType: 'application/pdf' });
  });

  it('호스트 DTO는 시그니처에 새지 않는다 — url 하나뿐이다(§5.7.3 확정 3)', () => {
    expectTypeOf<SaveableMedia>().toEqualTypeOf<{
      readonly id?: string | undefined;
      readonly url: string;
      readonly fileName?: string | undefined;
      readonly contentType?: MediaContentType | undefined;
    }>();
    const media: readonly SaveableMedia[] = [{ url: 'https://x/y' }];
    void forge<MediaSaver>().saveToDevice(media);
  });

  it('전신의 `originalUrl`/`thumbnailUrl` 폴백은 라이브러리 표면에 없다', () => {
    // @ts-expect-error 어느 URL을 고를 것인가는 호스트 DTO 지식이므로 앱이 소유한다
    const bad: SaveableMedia = { originalUrl: 'https://x/y' };
    void bad;
  });
});
