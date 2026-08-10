// 설계 문서 §7.2 unit 2·3 — 텔레메트리 기록 페이크.
//
// §7.2가 요구하는 유닛 셋 중 둘이 이 페이크 없이는 성립하지 않는다:
//   2. 전 파이프라인(로컬·웹이미지·웹비디오·포스터×2·저장)을 돌려 **수집된 operation 집합이
//      `MEDIA_OPERATIONS`와 정확히 일치**하는지 — 이름 오타와 호출 누락을 동시에 잡는다.
//   3. 빈 포스터 경로 → `cancel` 1회 + `succeed`/`fail` 0회, `reason:'empty-poster'` 포함.
//
// 그래서 기록은 **종료 상태별로** 남는다. `succeed`/`fail`/`cancel`을 한 배열에 뭉뚱그리면
// 3번 유닛이 검증할 대상 자체가 사라진다 — `cancel`은 "실패가 아닌 중단"이라는 3번째 종료
// 상태이고, 그 구분이 사라지면 빈 포스터가 성공률 지표에 섞여 든다(§5.1 텔레메트리 계약).
//
// ⚠ peer 0 · DOM 0.

import type {
  MediaActivity,
  MediaActivityFinish,
  MediaOperation,
  MediaTelemetry,
} from '../core/telemetry';

export type RecordedSpan = {
  readonly operation: MediaOperation;
  /** `track`은 시작 payload를 항상 주고, `begin`은 생략할 수 있다(§7.2 표). */
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
  readonly kind: 'track' | 'begin';
  /** 아직 끝나지 않았으면 `null`. ⚠ **한 스팬은 정확히 한 번만 종료돼야 한다**(§5.1). */
  readonly outcome: 'succeed' | 'fail' | 'cancel' | null;
  readonly finish?: MediaActivityFinish | undefined;
  readonly error?: unknown;
};

export interface RecordingTelemetry extends MediaTelemetry {
  readonly spans: readonly RecordedSpan[];
  /** 관측된 operation 이름을 등장 순서대로. `MEDIA_OPERATIONS`와의 집합 대조에 쓴다. */
  operations(): readonly MediaOperation[];
}

type MutableSpan = {
  operation: MediaOperation;
  extra?: Readonly<Record<string, unknown>> | undefined;
  kind: 'track' | 'begin';
  outcome: 'succeed' | 'fail' | 'cancel' | null;
  finish?: MediaActivityFinish | undefined;
  error?: unknown;
};

export function createRecordingTelemetry(): RecordingTelemetry {
  const spans: MutableSpan[] = [];

  const finishOnce = (span: MutableSpan, outcome: 'succeed' | 'fail' | 'cancel'): boolean => {
    // ⚠ 이중 종료를 **덮어쓰지 않고 무시**한다. 덮어쓰면 "succeed 후 fail" 같은 버그가
    //   마지막 값으로 위장되어 유닛을 통과한다. 첫 종료가 진실이고, 그 뒤는 결함이다.
    if (span.outcome !== null) return false;
    span.outcome = outcome;
    return true;
  };

  return {
    spans,

    operations() {
      return spans.map((span) => span.operation);
    },

    async track(operation, extra, run) {
      const span: MutableSpan = { operation, extra, kind: 'track', outcome: null };
      spans.push(span);
      try {
        const result = await run();
        finishOnce(span, 'succeed');
        return result;
      } catch (error) {
        if (finishOnce(span, 'fail')) span.error = error;
        // ⚠ 반드시 재throw — 텔레메트리가 업로드 실패를 삼키면 안 된다(§5.1).
        throw error;
      }
    },

    begin(operation, extra): MediaActivity {
      const span: MutableSpan = { operation, extra, kind: 'begin', outcome: null };
      spans.push(span);
      return {
        succeed(finish) {
          if (finishOnce(span, 'succeed')) span.finish = finish;
        },
        fail(error, finish) {
          if (finishOnce(span, 'fail')) {
            span.error = error;
            span.finish = finish;
          }
        },
        cancel(finish) {
          if (finishOnce(span, 'cancel')) span.finish = finish;
        },
      };
    },
  };
}
