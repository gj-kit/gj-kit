// 설계 문서 §3.3-② · §5.5 — `FileSystemAdapter & FileDownloadAdapter`의 expo 기본 구현.
//
// Expo SDK 56의 함정: `getInfoAsync`/`readAsStringAsync`/`copyAsync`/`deleteAsync`/`downloadAsync`는
// **`expo-file-system/legacy` 엔트리에서만** 나온다(전신 devicePhotoLibrary.ts:1-5 주석).
// 새 File API는 스트리밍 업로드(§7 하드닝 1 — `localTransport.ts`)를 위해서만 쓴다.
//
// 이 어댑터는 **순수 위임**이다. 후보 URI 순회·스테이징·타임아웃·크기 서열 같은 정책은 전부 코어에
// 있고(§3.3 머리말), 여기 있는 판단은 딱 둘 — "throw하지 않는다"와 "범위를 건드리지 않는다".

import * as FileSystem from 'expo-file-system/legacy';
import type {
  ChunkRange,
  FileDownloadAdapter,
  FileStat,
  FileSystemAdapter,
} from '../core/adapters';

/** §5.5 — 골든패스가 기본으로 채우는 파일 I/O 어댑터. */
export function createExpoFileSystem(): FileSystemAdapter & FileDownloadAdapter {
  return {
    cacheDirectory(): string | null {
      // 전신 `deviceUploadCache.ts:10`과 `saveImages.ts:205-206`이 같은 폴백을 썼다.
      // 둘 다 null인 상황(웹 셰이프)에서는 스테이징도 저장도 성립하지 않으므로 코어가 판단한다.
      return FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    },

    /**
     * ⚠ **throw 금지**(§3.3-② 계약). 코어의 `normalizeUploadUri`가 후보 URI를 순회하며 이 함수를
     * 부르는데, 여기서 예외가 새면 "다음 후보 시도"(§7 하드닝 2-④)가 첫 후보에서 끊긴다.
     * `getInfoAsync`는 스킴이 이상한 URI(`content://` 만료 핸들 등)에서 실제로 던지므로
     * try/catch가 장식이 아니다.
     */
    async stat(uri: string): Promise<FileStat> {
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) return { kind: 'missing' };
        if (info.isDirectory) return { kind: 'directory' };
        // 전신 `hashFile.ts:70` `info.size ?? 0`의 방어를 유지한다 — 타입상으론 존재가 보장되지만
        // 웹/셰이프 구현이 필드를 빠뜨리면 NaN이 해시 청크 계산으로 흘러든다.
        return { kind: 'file', sizeBytes: info.size ?? 0 };
      } catch {
        // 판독 불가는 "없음"과 같은 취급이다 — 코어가 다음 후보로 넘어가거나
        // 후보가 없으면 `device-not-found`로 끝낸다.
        return { kind: 'missing' };
      }
    },

    async copy(input: { readonly from: string; readonly to: string }): Promise<void> {
      // ⚠ 여기서는 삼키지 않는다. 카피 실패는 코어(`normalizeUploadUri`)가 잡아 **다음 후보로
      // 진행**하는 신호이고(§7 하드닝 2-④), 어댑터가 조용히 성공한 척하면 그 다음 단계가
      // 존재하지 않는 파일을 업로드한다.
      await FileSystem.copyAsync({ from: input.from, to: input.to });
    },

    /**
     * 멱등 삭제. `idempotent: true`로도 못 막는 실패(권한·경합)는 삼킨다 —
     * 스테이징 누수의 대가는 디스크 공간뿐이며, 정리 실패로 업로드 결과를 뒤집을 이유가 없다
     * (전신 deviceUploadCache.ts:30-33 · saveImages.ts:233 주석 계승).
     */
    async remove(uri: string): Promise<void> {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch {
        // 최선 노력.
      }
    },

    /**
     * ⚠ **범위를 그대로 넘긴다**(§7 하드닝 9). 코어는 `length`를 항상 3의 배수로 주는데,
     * 어댑터가 이를 재정렬·병합·정렬 보정하면 창 경계에 base64 패딩이 끼어 **해시가 조용히 틀린다**.
     * 어떤 예외도 나지 않고 서버와 클라이언트의 dedup 키만 달라지므로 붙잡을 방법이 없다.
     *
     * legacy API 규약: `position`/`length`는 `encoding: Base64`일 때만 유효하다.
     */
    readBase64(uri: string, range: ChunkRange): Promise<string> {
      return FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        position: range.position,
        length: range.length,
      });
    },

    /**
     * 저장 플로우 전용(§3.3 `FileDownloadAdapter`).
     * ⚠ status를 **판정하지 않고 그대로 올린다**. 2xx 범위 검증과 실패 시 임시 파일 정리는
     * 코어의 `createMediaSaver`가 갖는다(§7.1) — 3xx를 성공으로 보면 0바이트 파일이 사진첩에
     * 저장되는데, 그 판정이 어댑터마다 갈리면 안 된다.
     */
    async download(input: { readonly url: string; readonly to: string }): Promise<{
      readonly uri: string;
      readonly status: number;
    }> {
      const result = await FileSystem.downloadAsync(input.url, input.to);
      return { uri: result.uri, status: result.status };
    },
  };
}
