// 설계 문서 §5.6 `"./testing"` — PUT을 기록하는 전송 페이크.
//
// 하나의 객체가 `LocalFileTransport`와 `BinaryTransport`를 **둘 다** 만족한다. 네이티브 경로와
// 웹 경로가 같은 기록부를 공유하므로, 한 테스트 안에서 "로컬 업로드 → 웹 드롭 → 포스터"를
// 이어 돌려도 순서가 한 배열에 남는다.
//
// ⚠ **`putLocalFile`은 바이트를 읽지 않는다.** 그것이 §7 하드닝 1의 계약이기 때문이다 —
//   "파일 바이트를 JS 힙으로 읽지 말 것"(§3.3). 이 페이크가 파일 내용을 들여다보지 않으므로,
//   `MemoryFileSystem.calls.readBase64`가 비어 있다는 단언이 곧 "전송이 바이트를 읽지 않았다"는
//   직접 증거가 된다. 페이크가 편의상 파일을 읽었다면 그 증거가 소멸한다.

import type { BinarySource, BinaryTransport, LocalFileTransport, PutRequest } from '../core/adapters';

/**
 * 기록된 PUT 1건.
 *
 * `PutRequest`를 확장한 형태라 `readonly PutRequest[]`로 받는 소비자와 호환된다(§5.6 시그니처).
 * `uri`(로컬 경로)와 `body`(바이너리)는 어느 경로로 들어왔는지에 따라 한쪽만 채워진다 —
 * 그 자체가 "이 업로드가 네이티브였나 웹이었나"의 판별자다.
 */
export type RecordedPut = PutRequest & {
  readonly uri?: string | undefined;
  readonly body?: BinarySource | undefined;
  /** 바이너리 PUT의 크기. presign `sizeBytes`와 실제 전송 바이트의 일치 검증에 쓴다(§7 하드닝 3). */
  readonly sizeBytes?: number | undefined;
};

export type RecordingTransportOptions = {
  /**
   * 이 상태코드로 응답한다. 생략 시 200.
   * ⚠ `upload-failed`·`poster-upload-failed` 경로는 2xx가 아닌 응답으로만 도달한다
   *   (`isSuccessStatus`, §5.4-①). 상태코드 주입구가 없으면 그 두 코드가 영영 검증되지 않는다.
   */
  readonly failWithStatus?: number | undefined;
  /**
   * PUT 본문 실행 훅 — 시작 직후 await된다.
   *
   * ⚠ §7.1의 「기기 자산 업로드 루프의 **의도적 순차 실행**」은 "동시 진행 0"을 단언해야 하는데,
   *   그것은 전송이 실제로 지연될 때만 관측된다. 이 훅에 지연을 넣고 `timeline`을 보면
   *   `start:0, end:0, start:1, end:1`(순차) 과 `start:0, start:1, …`(병렬)이 구분된다.
   */
  readonly onPut?: ((put: RecordedPut, index: number) => Promise<void> | void) | undefined;
};

export interface RecordingTransport extends LocalFileTransport, BinaryTransport {
  readonly puts: readonly RecordedPut[];
  /** `start:<index>` / `end:<index>` 순서. 순차 실행 단언의 직접 증거(위 `onPut` 참조). */
  readonly timeline: readonly string[];
}

export function createRecordingTransport(
  options?: RecordingTransportOptions | undefined,
): RecordingTransport {
  const puts: RecordedPut[] = [];
  const timeline: string[] = [];
  const status = options?.failWithStatus ?? 200;

  async function record(put: RecordedPut): Promise<{ readonly status: number }> {
    const index = puts.length;
    puts.push(put);
    timeline.push(`start:${index}`);
    try {
      await options?.onPut?.(put, index);
      return { status };
    } finally {
      // ⚠ finally다 — 훅이 throw해도 타임라인이 반쪽으로 남지 않게. 반쪽 타임라인은
      //   순차/병렬 판정을 조용히 뒤집는다.
      timeline.push(`end:${index}`);
    }
  }

  return {
    puts,
    timeline,

    putLocalFile(input) {
      return record({
        url: input.url,
        method: input.method,
        headers: input.headers,
        uri: input.uri,
      });
    },

    putBinary(input) {
      return record({
        url: input.url,
        method: input.method,
        headers: input.headers,
        body: input.body,
        sizeBytes: input.body.size,
      });
    },
  };
}
