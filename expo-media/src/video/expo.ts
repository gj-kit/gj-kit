// 설계 문서 §3.3-⑤ · §5.6 — `LocalPosterAdapter`의 expo 구현.
//
// 로컬 동영상 URI에서 포스터(썸네일) 프레임 한 장을 뽑는다. 그 프레임을 어디에 어떻게 올릴지
// (presign · PUT · 텔레메트리 `media.upload.poster.native` · 빈 포스터 `cancel`)는 전부 코어의
// `createLocalUploads`가 갖는다(§7.2) — 어댑터는 "프레임 URI 또는 null"까지만이다.

import * as VideoThumbnails from 'expo-video-thumbnails';
import type { LocalPosterAdapter } from '../core/adapters';

/** §5.6 — `"./video"`의 유일한 공개 심볼. */
export function expoVideoPoster(): LocalPosterAdapter {
  return {
    async posterFromLocalFile(input: {
      readonly uri: string;
      readonly atMs: number;
    }): Promise<{ readonly uri: string } | null> {
      try {
        // `time`은 ms다(전신 uploader.ts:314-316 `VIDEO_POSTER_TIME_MS`). 값은 코어가 정한다 —
        // `posterAtMs` 기본 1000(§5.4.1-4). 어댑터가 상수를 들고 있으면 옵션이 무시되는 함정이 된다.
        const thumbnail = await VideoThumbnails.getThumbnailAsync(input.uri, {
          time: input.atMs,
        });
        // 네이티브가 빈 uri를 돌려주는 경우가 있다(디코딩 실패 · 0프레임 영상).
        // 코어의 "빈 포스터 → `cancel({reason:'empty-poster'})`" 경로(§7.2)로 넘긴다.
        return thumbnail.uri ? { uri: thumbnail.uri } : null;
      } catch {
        // ⚠ **실패는 null이다**(§3.3-⑤ · §7.1 "포스터 실패가 동영상 업로드를 막지 않는다").
        // 포스터는 부가물이고, 여기서 throw하면 동영상 본체 업로드가 함께 죽는다.
        // 전신도 정확히 같은 판단이었다(uploader.ts:329-332 — catch 후 null 반환).
        // ⚠ 에러 객체를 위로 흘리지 않는 대가는 진단 손실이다. 그럼에도 삼키는 쪽을 택한 이유:
        //   네이티브 썸네일러의 실패 메시지는 원본 파일 경로(= 사용자 미디어 식별자)를 담고,
        //   그것을 코어까지 올리면 새니타이즈되지 않은 경로가 로그 경계를 넘게 된다(§7 하드닝 8).
        return null;
      }
    },
  };
}
