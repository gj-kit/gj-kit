// 설계 문서 §5.3 · §7 하드닝 7 — 기기 사진 업로드용 스테이징 사본.
//
// 전신(`packages/photo-kit/src/deviceUploadCache.ts`) 파일 주석의 이유를 계승한다:
//   "iOS에서는 사진 보관함 파일 URI가 네이티브 URLSession을 종료시킬 수 있으므로, resolve 단계가
//    원본을 **앱 소유 캐시 파일**로 실체화한다. 그 파일은 이 프리픽스로 이름 붙는다.
//    사진 라이브러리 모듈을 import하지 않아 업로드 코어가 모든 플랫폼에서 쓸 수 있다."
//
// 전신 대비 강화된 두 가지:
//   ① 프리픽스가 `namespace` 주입이다 — 호스트 이름(`memorylog-upload-`)이 라이브러리에 박히지 않는다.
//   ② `cleanup`이 **캐시 객체의 메서드**다 — "만든 주체가 지운다"를 구조가 보장한다.
//      자유 함수로 두고 프리픽스만 설정 가능하게 열면 "어떤 프리픽스로 만든 것을 어떤 프리픽스로
//      지우는가"가 호출자 규율이 되고, 그것은 조용히 깨지는 전형이다(§6.1-⑨).

import type { Brand } from './brand';
import type { DeviceAssetRef, FileSystemAdapter } from './adapters';
import { MediaError } from './errors';

/** `/^[a-z0-9][a-z0-9-]{1,30}$/` — §5.3의 확정 규칙. 위반은 부팅 시 즉사시킨다. */
const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

export interface StagingCache extends Brand<'StagingCache'> {
  /** `${namespace}-upload-`. */
  readonly prefix: string;
  /**
   * cleanup의 유일한 판정 근거.
   *
   * 전신은 `uri.includes(PREFIX)` 한 줄이었다(deviceUploadCache.ts:29). 그 술어는
   * `file:///other/dir/memorylog-upload-x.jpg`처럼 **우리가 만들지 않은 경로**도 참으로 만들고,
   * 프리픽스가 중간에 낀 임의의 경로까지 삭제 대상에 넣는다. 3조건으로 좁힌다:
   *   (i) 앱 캐시 디렉토리로 시작 (ii) 파일명이 prefix로 **시작** (iii) 하위 경로 없음
   */
  owns(uri: string | null | undefined): boolean;
  /** 스테이징 사본이 놓일 자리. 캐시 디렉토리가 없으면 `null`. */
  uriFor(asset: DeviceAssetRef): string | null;
  /**
   * 스테이징 사본 삭제. `owns()`가 false면 **no-op**이다.
   * 실패는 삼킨다 — 누수의 대가는 디스크 비용뿐이고, 정리 실패로 업로드 결과를 뒤집을 이유가 없다.
   */
  cleanup(uri: string | null | undefined): Promise<void>;
}

export function createStagingCache(input: {
  /** `/^[a-z0-9][a-z0-9-]{1,30}$/` — 위반 시 `MediaError('config-invalid')`. 부팅 시 즉사. */
  readonly namespace: string;
  readonly files: FileSystemAdapter;
}): StagingCache {
  const { namespace, files } = input;
  if (!NAMESPACE_PATTERN.test(namespace)) {
    // ⚠ `MediaStrings`에는 이 문구의 키가 없다 — §4의 22키는 전부 **사용자 노출** 문구이고
    // 이것은 부팅 시점의 **개발자 대상 단언**이라 화면에 도달할 경로가 없다. §5.2의
    // `assertNeverMediaError`가 같은 이유로 plain Error를 쓴 것과 동종의 예외이며,
    // `string-guard`(§10.3)에는 §7 하드닝 5의 `src/save/**` 예외와 동형의 명시 예외가 필요하다.
    throw new MediaError(
      'config-invalid',
      `Invalid staging namespace ${JSON.stringify(namespace)} — expected ${String(NAMESPACE_PATTERN)}`,
    );
  }

  const prefix = `${namespace}-upload-`;

  const owns = (uri: string | null | undefined): boolean => {
    if (!uri) return false;
    const directory = files.cacheDirectory();
    if (!directory) return false;
    // (i) 우리 캐시 디렉토리 밖의 파일은 우리 것이 아니다.
    if (!uri.startsWith(directory)) return false;
    const name = uri.slice(directory.length);
    // (ii) 프리픽스가 **파일명 앞에** 있어야 한다 — 경로 중간에 낀 것은 우연이다.
    if (!name.startsWith(prefix)) return false;
    // (iii) 하위 디렉토리로 내려간 경로는 우리가 만든 적이 없다.
    return !name.includes('/');
  };

  const cache = {
    prefix,
    owns,

    uriFor(asset: DeviceAssetRef): string | null {
      const directory = files.cacheDirectory();
      if (!directory) return null;
      // 자산 id는 iOS PhotoKit의 `.../L0/001` 같은 슬래시 포함 문자열이다 — 파일명에 그대로 쓰면
      // 존재하지 않는 하위 디렉토리를 가리키게 되므로 안전 문자만 남긴다(전신 규칙 보존).
      const safeId = asset.id.replace(/[^a-zA-Z0-9_-]/g, '-') || 'asset';
      const extension = (asset.filename.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'jpg')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      return `${directory}${prefix}${safeId}.${extension || 'jpg'}`;
    },

    async cleanup(uri: string | null | undefined): Promise<void> {
      if (!uri || !owns(uri)) return;
      try {
        await files.remove(uri);
      } catch {
        // 최선 노력 — 새어 나간 스테이징 파일의 비용은 디스크 공간뿐이다.
      }
    },
  };

  // 브랜드는 **타입 전용 phantom property**라 런타임 값이 없다(§5.3, G14). 따라서 객체 리터럴에
  // 그 키를 쓸 방법이 없고, 여기서 한 번 각인한다. 위조 차단이 목적이므로 이 단언은 모듈 안에만 있다.
  return cache as StagingCache;
}
