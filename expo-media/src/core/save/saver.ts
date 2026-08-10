// 설계 문서 §5.4-⑥ — 기기 저장 팩토리(역방향 경로: 서빙된 자산을 기기에 되돌려 저장).
//
// 전신 `packages/photo-kit/src/saveImages.ts`의 `saveImagesToDevice`를 계승한다.
// 전신은 7필드가 전부 옵셔널인 의존성 가방(`SaveImagesDependencies`)을 받았고, 그래서
// `platformOS:'web'` + `mediaLibrary` 동시 주입 같은 **무효 조합이 컴파일을 통과**했다.
// 그 조합에서는 결과로 보고되는 `mode`와 실제 동작이 어긋날 수 있다.
// `SaveTarget` 판별 유니언으로 바꾸면 무효 조합이 **표현 불가능**해지고,
// `SaveResult.mode`가 `target.kind`에서 파생되므로 보고와 실동작이 어긋날 수 없다(§6.1-⑦).
//
// DOM은 전부 `BrowserSaveAdapter` 안에 갇힌다 — anchor 다운로드·`download=1&filename=`
// 리다이렉트 트릭·CORS 실패 시 숨김 iframe 폴백은 웹 어댑터 소관이다(§7.1).

import type { SaveTarget } from '../adapters';
import { MediaError } from '../errors';
import type { MediaContentType } from '../mediaTypes';
import type { MediaStrings } from '../strings';
import { enMediaStrings } from '../strings';
import type { MediaTelemetry } from '../telemetry';
import { noopMediaTelemetry } from '../telemetry';
import { mediaDownloadFileName } from './fileName';

/** §5.4.1-13 — 전신은 `'photo'`였다(§5.7.3). */
const DEFAULT_FILE_NAME_PREFIX = 'media';

export type SaveableMedia = {
  /**
   * 안정 파일명의 1차 소스(G8). 없거나 빈 문자열이면 배열 인덱스+1로 폴백한다 —
   * 전신 규칙 `${prefix}-${image.id || index + 1}.${ext}`(saveImages.ts:71) 보존.
   */
  readonly id?: string | undefined;
  /**
   * ⚠ **단일 진실이다.** `originalUrl || thumbnailUrl` 같은 폴백은 호스트 DTO 지식이므로
   * 라이브러리가 아니라 앱이 소유한다(전신 `imageDownloadUrl` 폐지 — §5.7.3).
   */
  readonly url: string;
  readonly fileName?: string | undefined;
  readonly contentType?: MediaContentType | undefined;
};

export type SaveResult = { readonly savedCount: number; readonly mode: SaveTarget['kind'] };

export interface MediaSaver {
  saveToDevice(images: readonly SaveableMedia[]): Promise<SaveResult>;
}

export function createMediaSaver(input: {
  readonly target: SaveTarget; // 판별 유니언 — 무효 조합 표현 불가(§6.1-⑦)
  readonly fileNamePrefix?: string | undefined;
  readonly strings?: MediaStrings | undefined;
  readonly telemetry?: MediaTelemetry | undefined;
}): MediaSaver {
  const target = input.target;
  const prefix = input.fileNamePrefix ?? DEFAULT_FILE_NAME_PREFIX;
  const strings = input.strings ?? enMediaStrings;
  const telemetry = input.telemetry ?? noopMediaTelemetry;
  // ⚠ 보고되는 mode는 타깃에서 **파생**된다 — 전신처럼 별도 플래그로 계산하지 않는다(§6.1-⑦).
  const mode = target.kind;

  return {
    saveToDevice(images: readonly SaveableMedia[]): Promise<SaveResult> {
      // operation 이름과 payload 키는 소비자 대시보드의 입력이다 — rename = 파괴적 변경(§7.2).
      // 전신 saveImages.ts:277-283과 동일하게 **빈 배열도 스팬을 남긴다**(호출은 있었다는 사실이
      // 지표에서 사라지지 않게).
      return telemetry.track(
        'media.save-to-device',
        { imageCount: images.length, mode },
        async () => {
          if (images.length === 0) return { savedCount: 0, mode };

          if (target.kind === 'browser-download') {
            for (const [index, image] of images.entries()) {
              await target.browser.saveByDownload({
                url: image.url,
                fileName: fileNameFor(image, index, prefix),
              });
            }
            return { savedCount: images.length, mode };
          }

          const { files, library } = target;

          // Android Expo Go는 사진 권한 요청 자체가 불가하다(전신 saveImages.ts:95-110).
          // 그 판정은 호스트가 하고(`Constants.appOwnership === 'expo'`) 어댑터가 값만 노출한다 —
          // 라이브러리에서 expo 상수 의존을 완전히 걷어내는 지점이다(§0.2).
          if (!library.skipPermissionRequest) {
            const permission = await library.requestWritePermission();
            if (!permission.granted) {
              throw new MediaError('save-permission-denied', strings.savePermissionDenied);
            }
          }

          const directory = files.cacheDirectory();
          if (!directory) {
            // ⚠ 여기서만 `MediaError`가 아니라 plain Error를 던진다(errors.ts의
            //   `assertNeverMediaError` 선례). 쓸 수 있는 앱 소유 디렉토리가 하나도 없다는 것은
            //   사용자가 조치할 수 있는 상태가 아니라 호스트 환경 결함이므로 `MediaStrings`에
            //   대응 키가 없고, 문구를 지어내면 string-guard(§10.3)에 걸린다.
            //   전신(saveImages.ts:215)도 정확히 이 bare Error였다.
            throw new Error('No writable file-system directory is available.');
          }

          for (const [index, image] of images.entries()) {
            const fileUri = `${directory}${fileNameFor(image, index, prefix)}`;
            const download = await files.download({ url: image.url, to: fileUri });
            // ⚠ **2xx 범위** 검증(§7.1). `status < 400`이 아니다 — 3xx가 몸통 없이 도착하면
            //   0바이트 파일이 사진첩에 저장된다. 실패한 임시 파일은 즉시 정리한다.
            if (download.status < 200 || download.status >= 300) {
              await files.remove(download.uri);
              throw new MediaError('save-download-failed', strings.saveDownloadFailed);
            }
            await library.saveToLibrary(download.uri);
            // 저장이 성공한 뒤에만 지운다 — 전신 saveImages.ts:251-268의 순서 보존.
            // (저장 실패는 그대로 전파되며 임시 파일은 남는다. 전신 동작이다.)
            await files.remove(download.uri);
          }
          return { savedCount: images.length, mode };
        },
      );
    },
  };
}

function fileNameFor(image: SaveableMedia, index: number, prefix: string): string {
  return mediaDownloadFileName({
    url: image.url,
    index,
    id: image.id,
    fileName: image.fileName,
    contentType: image.contentType,
    prefix,
  });
}
