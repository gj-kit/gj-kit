// 설계 문서 §3.3-③ · §5.5 · **§7 하드닝 1** — `LocalFileTransport`의 expo 기본 구현.
//
// ══════════════════════════════════════════════════════════════════════════════
// 왜 이 파일이 존재하는가 (전신 uploader.ts:134-156 `uploadNativeFile` 주석 이전)
//
//   "`FileSystem`의 레거시 URLSession 브리지는 iOS 26에서 파일 기반 업로드를 **시작하는 중**
//    Expo Go를 종료시킬 수 있다 — 그 promise가 reject될 기회를 갖기 전에. 현재의 File API는
//    Expo가 관리하는 업로드 태스크를 쓰며, 같은 로컬 파일을 **JS로 읽어 올리지 않고** 스트리밍한다."
//
// 이 실패는 재시도 로직도 에러 보고도 발화시키지 못한다(프로세스가 죽으므로). 크래시 리포트에
// 앱 코드 프레임조차 남지 않아 원인 추적에만 수일이 걸렸다. 그래서 이 결정은 취향이 아니라
// **재발 방지 장치**이며, `hardening-guard`가 그 레거시 API 이름의 재등장을 `src/**` 전역에서
// 정적으로 차단한다(§7 하드닝 1).
//
// 파생 계약: `putLocalFile`은 **파일 바이트를 JS 힙으로 읽지 않는다**. 페이크 파일시스템의
// `readBase64`가 호출되지 않는다는 unit 단언이 그 직접 증거다(§7 하드닝 1의 테스트 열).
// ══════════════════════════════════════════════════════════════════════════════

// ⚠ `File`은 DOM 전역과 이름이 겹친다. 전신도 같은 이유로 별칭을 썼다(uploader.ts:9-12) —
//   별칭 없이 쓰면 DOM lib이 켜진 tsconfig에서 어느 쪽인지가 import 순서에 따라 헷갈린다.
import { File as ExpoFile, UploadType as ExpoUploadType } from 'expo-file-system';
import type { LocalFileTransport, PutRequest } from '../core/adapters';

/**
 * §5.5 — 골든패스가 기본으로 채우는 로컬 파일 전송 어댑터.
 *
 * ⚠ **web/SSR에서 쓰지 말 것**(§8.5 · V-B 실측). `expo-file-system`의 web 셰이프에는 이
 * 업로드 경로가 아예 없고 레거시 태스크는 `{ body:'', status:0, headers:{} }`를 돌려주는 no-op다 —
 * 태우면 **조용히 성공한 것처럼 보인다**. 비네이티브의 정본은 `"./web"`의
 * `createFetchBinaryTransport`뿐이다.
 */
export function createExpoLocalFileTransport(): LocalFileTransport {
  return {
    async putLocalFile(
      input: PutRequest & { readonly uri: string },
    ): Promise<{ readonly status: number }> {
      const file = new ExpoFile(input.uri);
      const result = await file.upload(input.url, {
        httpMethod: input.method,
        headers: input.headers,
        // ⚠ `'foreground'`가 계약이다. 기본값 `'background'`는 앱이 종료되면 JS 태스크 인스턴스가
        //   복원되지 않아 promise·진행률·취소가 전부 사라진다 — 코어의 업로드 결과 판정
        //   (status 2xx 검사와 등록 단계)이 영영 실행되지 않는 상태가 된다.
        sessionType: 'foreground',
        // 프리사인 PUT은 몸통이 곧 파일이다. MULTIPART로 보내면 스토리지가 폼 프레이밍까지
        // 객체 바이트로 받아 서명 크기와 어긋난다(§7 하드닝 3의 크기 정합과 같은 종류의 실패).
        uploadType: ExpoUploadType.BINARY_CONTENT,
      });
      // status만 올린다 — 2xx 판정·재시도·에러 문구는 전부 코어 소관이다(§3.3 "어댑터는 순수 위임").
      return { status: result.status };
    },
  };
}
