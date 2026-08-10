// 설계 문서 §5.6 `"./web"` — 브라우저 canvas 포스터 어댑터(`BinaryPosterAdapter` 구현).
//
// 전신 `packages/photo-kit/src/videoPoster.ts`(84줄)의 계승이다. 전신 주석 그대로:
//   "Browser-side video poster extraction: seek ~1s in, draw the frame to a canvas,
//    return it as a JPEG blob. Pure DOM — no backend involved — so it lives outside
//    the uploader factory."
// 백엔드가 개입하지 않는다는 그 성질이 이 파일이 `"./web"`(peer 0)에 사는 이유이며,
// DOM 타입을 공개 시그니처에 노출해도 되는 엔트리가 여기 하나뿐인 이유이기도 하다(§2.4 파생 규칙).
//
// ⚠ 이 파일은 네이티브 파일 업로드 API를 쓰지 않는다(hardening-guard ⑥). 웹 바이너리 전송의
//   정본은 `createFetchBinaryTransport`다 — `expo-file-system`의 web 셰이프는 그 API가 no-op라
//   태우면 **조용히 성공한 것처럼 보인다**(§2.3 파생 사실 · §8.5).

import type { BinaryPosterAdapter, BinarySource } from '../core/adapters';

/**
 * 이벤트 대기 상한. **고정 상수 — 옵션이 아니다**(§5.4.1-3).
 * 전신 `videoPoster.ts:6` `VIDEO_POSTER_EVENT_TIMEOUT_MS`.
 * 옵션으로 열면 3자 소비자가 무한대기를 만들 수 있고, 그 순간 "포스터 실패가 업로드를 막지
 * 않는다"(§7.1)는 하드닝이 **타임아웃 없는 await 하나로 무력화**된다.
 */
const POSTER_EVENT_TIMEOUT_MS = 3000;

/** 전신 `videoPoster.ts:77` `canvas.toBlob(cb, type, 0.84)`. 서버 정책과 무관한 인코딩 취향값이므로 비공개 고정(§5.4.1-6). */
const POSTER_JPEG_QUALITY = 0.84;

/** 전신 `videoPoster.ts:4`. 공개 상수는 `"./core"`의 `POSTER_CONTENT_TYPE`이며 여기서는 인코딩 인자로만 쓴다(§5.4.1-7). */
const POSTER_MIME = 'image/jpeg';

/** 전신 `videoPoster.ts:71-72` — videoWidth/Height가 0일 때의 캔버스 기본 치수. */
const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 360;

/**
 * 짧은 영상 보호. seek 목표가 끝을 넘으면 `onseeked`가 **영영 오지 않는다**(§5.4.1-5 · §7.1).
 * 전신 `videoPoster.ts:57-62`의 `Math.max(video.duration - 0.05, 0)`.
 */
const SEEK_TAIL_MARGIN_SECONDS = 0.05;

function waitForVideoEvent(
  video: HTMLVideoElement,
  eventName: 'onloadedmetadata' | 'onseeked',
  errorMessage: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(errorMessage)), POSTER_EVENT_TIMEOUT_MS);
    const finish = (callback: () => void): void => {
      clearTimeout(timeout);
      video.onerror = null;
      video[eventName] = null;
      callback();
    };
    video[eventName] = () => finish(resolve);
    video.onerror = () => finish(() => reject(new Error(errorMessage)));
  });
}

/**
 * `BinarySource` → `Blob`.
 * 코어는 DOM lib 없이 살기 위해 `BinarySource`(size·type·arrayBuffer)만 안다(§3.3). 그러나
 * `URL.createObjectURL`은 실제 Blob을 요구하므로 경계에서 한 번 실체화한다.
 * 이미 Blob이면 그대로 쓴다 — vitest가 plain object로 이 경로를 돌 수 있게 하는 쪽만 복사한다.
 */
async function toBlob(source: BinarySource): Promise<Blob | null> {
  if (typeof Blob === 'undefined') return null;
  if (source instanceof Blob) return source;
  return new Blob([await source.arrayBuffer()], { type: source.type ?? '' });
}

/**
 * 브라우저 canvas 기반 동영상 포스터 추출기(§5.6).
 *
 * ⚠ 실패는 전부 `null`이다 — 예외를 밖으로 내보내지 않는다. **포스터 실패가 동영상 업로드를
 *   막지 않는다**는 것이 계약이고(§7.1), 그 정책의 절반이 여기(어댑터가 null을 준다),
 *   나머지 절반이 코어(`resolvePoster`의 try/catch)에 있다.
 *
 * `document`는 주입 가능하지만 **호출 시점에** 해석한다. 생성 시점에 붙잡으면 SSR에서
 * 모듈이 평가되는 순간의 `undefined`가 하이드레이션 이후까지 남는다(§8.5 케이스 H 계열의 함정).
 */
export function webCanvasVideoPoster(
  input?: { readonly document?: Document | undefined } | undefined,
): BinaryPosterAdapter {
  return {
    async posterFromBinary({ source, atMs }): Promise<BinarySource | null> {
      const documentRef = input?.document ?? globalThis.document;
      // 전신 `videoPoster.ts:37-43`의 3중 가드 그대로 — SSR·RN 웹뷰처럼 DOM이 없거나
      // objectURL을 만들 수 없는 환경에서는 조용히 포기한다.
      if (
        !documentRef ||
        typeof URL === 'undefined' ||
        typeof URL.createObjectURL !== 'function'
      ) {
        return null;
      }
      const blob = await toBlob(source);
      if (!blob) return null;

      const objectUrl = URL.createObjectURL(blob);
      try {
        const video = documentRef.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.src = objectUrl;
        video.load?.();
        await waitForVideoEvent(video, 'onloadedmetadata', 'video metadata unavailable');

        // 목표 시각(초). `atMs`는 코어가 준다(기본 1000 — §5.4.1-4).
        const targetSeconds = atMs / 1000;
        const seekTime = Math.min(
          targetSeconds,
          Number.isFinite(video.duration) && video.duration > 0
            ? Math.max(video.duration - SEEK_TAIL_MARGIN_SECONDS, 0)
            : targetSeconds,
        );
        // ⚠ 리스너를 **currentTime 대입 전에** 건다. 캐시된 짧은 영상은 seek가 동기적으로
        //   완료돼 이벤트가 대입 직후에 발화할 수 있다(전신 63-69의 순서 그대로).
        const seeked = waitForVideoEvent(video, 'onseeked', 'video frame unavailable');
        video.currentTime = seekTime;
        await seeked;

        const canvas = documentRef.createElement('canvas');
        canvas.width = video.videoWidth || FALLBACK_WIDTH;
        canvas.height = video.videoHeight || FALLBACK_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) return null;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        return await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((frame) => resolve(frame), POSTER_MIME, POSTER_JPEG_QUALITY);
        });
      } catch {
        return null;
      } finally {
        // 성공·실패 무관하게 objectURL을 회수한다 — 누수는 탭 수명 내내 남는다(전신 81-83).
        URL.revokeObjectURL(objectUrl);
      }
    },
  };
}
