// 설계 문서 §5.1(텔레메트리 — 스팬 계약) · §7.2(안정적 operation 6종).
//
// 전신 `packages/photo-kit/src/types.ts:68-101`의 `PhotoKitTelemetry{track,begin}` +
// `PhotoKitActivity{succeed,fail,cancel}` + `NOOP_TELEMETRY`를 이름만 바꿔 그대로 계승한다.
// 초안의 `event(name, payload)` 단일 메서드 축소는 **철회**됐다(G1 확정) — 그 축소로는
//   (i) 시작/종료 쌍 (ii) 소요시간 (iii) `cancelled` outcome (iv) 실패 시 에러 객체 전달이
// 전부 표현 불가하여 소비자(memorylog2)의 `source:"media"` 활동로그 스트림이 통째로 사라진다.
// 호스트 브리지는 본문 무변경으로 성립한다:
//   track: (operation, extra, run) => trackClientActivity({ operation, source:'media', extra }, run)
//   begin: (operation, extra)      => beginClientActivity({ operation, source:'media', ...(extra ? { extra } : {}) })

/**
 * 안정적 dotted operation 이름.
 *
 * ⚠ **값 변경 = 소비자 대시보드·알림 규칙 파손**이므로 하드닝과 동급으로 보존한다(§7.2).
 * §7.2의 unit 1번이 이 배열을 **인라인 리터럴로 단언**한다 — 스냅샷은 `-u`로 조용히 갱신되므로
 * 스냅샷을 쓰지 않는다.
 */
export const MEDIA_OPERATIONS = [
  'media.upload.native', // 전신 uploader.ts:341
  'media.upload.web-image', // 전신 uploader.ts:474
  'media.upload.web-video', // 전신 uploader.ts:535
  'media.upload.poster.native', // 전신 uploader.ts:254
  'media.upload.poster.web', // 전신 uploader.ts:222
  'media.save-to-device', // 전신 saveImages.ts:278
] as const;

/**
 * 라이브러리가 방출하는 operation의 닫힌 목록.
 *
 * 리터럴 유니언으로 좁힌 이유(§6.2 기각표의 반대 항목을 철회한 근거): 이 인터페이스는
 * **라이브러리가 방출하는** operation만 다루고 그 목록은 6종으로 닫혀 있다. 호스트가 자기
 * operation을 보고하는 것은 이 인터페이스의 일이 아니다 — memorylog2도 기기 라이브러리 진단
 * 4종을 앱 리포터로 직접 보낸다(`devicePhotoLibraryTelemetry.ts`). 좁히면 오타가 컴파일 에러가 된다.
 *
 * `MediaOperation`은 문자열 리터럴 유니언이므로 호스트의 `operation: string` 슬롯에
 * 그대로 대입된다(가변성 문제 없음).
 */
export type MediaOperation = (typeof MEDIA_OPERATIONS)[number];

export type MediaActivityFinish = {
  readonly extra?: Readonly<Record<string, unknown>> | undefined;
};

/**
 * 하나의 스팬. 정확히 한 번만 종료되어야 한다(라이브러리 내부 규율 — 소비자 검증 대상 아님).
 *
 * `cancel`은 "실패가 아닌 중단"이다: 빈 포스터(전신 uploader.ts:268-271)처럼 사용자에게
 * 오류로 보고하면 안 되지만 성공으로 세어서도 안 되는 **3번째 종료 상태**다.
 * 이 상태가 없으면 포스터 추출이 빈 결과를 낸 경우가 성공률 지표에 섞여 들어간다.
 */
export interface MediaActivity {
  succeed(finish?: MediaActivityFinish | undefined): void;
  fail(error: unknown, finish?: MediaActivityFinish | undefined): void;
  cancel(finish?: MediaActivityFinish | undefined): void;
}

export interface MediaTelemetry {
  /**
   * `run()`을 감싸 성공/예외를 자동 보고하고 결과를 그대로 통과시킨다.
   * ⚠ 예외는 **반드시 재throw**한다 — 텔레메트리가 업로드 실패를 삼키면 안 된다.
   */
  track<T>(
    operation: MediaOperation,
    extra: Readonly<Record<string, unknown>>,
    run: () => Promise<T>,
  ): Promise<T>;
  begin(
    operation: MediaOperation,
    extra?: Readonly<Record<string, unknown>> | undefined,
  ): MediaActivity;
}

/** 전신 `NOOP_ACTIVITY`(types.ts:88-92). */
const noopMediaActivity: MediaActivity = {
  succeed() {},
  fail() {},
  cancel() {},
};

/**
 * 팩토리 기본값. `track`은 run()을 그대로 실행하고 `begin`은 no-op 활동을 준다
 * (전신 `NOOP_TELEMETRY` — types.ts:94-101 계승).
 * 텔레메트리를 주입하지 않은 소비자에게 분기(`telemetry?.track ?? …`)를 강요하지 않기 위한 값이므로,
 * 라이브러리 내부는 항상 이 객체를 통해 호출한다.
 */
export const noopMediaTelemetry: MediaTelemetry = {
  track(_operation, _extra, run) {
    return run();
  },
  begin() {
    return noopMediaActivity;
  },
};
