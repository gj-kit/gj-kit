// memorylog2 삼중복(+비-export 1건)의 재현 파라미터 — 설계 문서 §0.1 · §0.2.
//
// 골든 스위트 두 군(동치군 / 의도적 divergence군)이 같은 레시피를 공유해야, 두 군이
// 서로 다른 파라미터를 몰래 쓰는 일이 생기지 않는다. README의 이관 레시피도 같은 값이다.
import type { FormatBytesOptions } from '../src/index';

/** §0.1 #4 — admin `bytes`: 공백 있음, 항상 소수 1자리(고정폭), PB 상한, 0·음수도 렌더. */
export const ADMIN_BYTES: FormatBytesOptions = {
  system: 'decimal',
  unitSpace: true,
  fractionDigits: 1,
  trailingZeros: 'keep',
  nonPositive: 'render',
  maxUnit: 'PB',
};

/** §0.1 #13 — mobile `formatStorageBytes`: MB는 정수, GB/TB는 소수 1자리. */
export const MOBILE_STORAGE_BYTES: FormatBytesOptions = {
  system: 'decimal',
  unitSpace: false,
  minUnit: 'MB',
  maxUnit: 'TB',
  fractionDigits: { MB: 0, GB: 1, TB: 1 },
  trailingZeros: 'trim-exact',
  nonPositive: 'render',
};

/** §0.1 #14 — mobile `formatBytes`: 0 이하는 "크기 미상"이라 `null`, 10 이상은 정수. */
export const MOBILE_BYTES: FormatBytesOptions<null> = {
  system: 'decimal',
  unitSpace: false,
  fractionDigits: 1,
  trailingZeros: 'trim',
  wholeNumberFrom: 10,
  maxUnit: 'GB',
  nonPositive: 'fallback',
  fallback: null,
};

/**
 * §0.2 #20 — OwnershipTransferRequest의 네 번째 구현.
 *
 * `minUnit`을 주지 않는다. §0.4-⑧이 1MB 미만의 라이브러리 출력을 `'500KB'`로 못박고 있고,
 * 그 값은 KB 단위가 살아 있어야만 나오기 때문이다. (§0.2 본문은 같은 행에 `minUnit:'MB'`와
 * 결과 `'0MB'`를 함께 적어 두 값이 서로 모순이다 — `minUnit:'MB'`로 두면 0.5MB가 반올림돼
 * `'1MB'`가 나오지 `'0MB'`가 나오지 않는다. 구현은 §0.4를 정본으로 삼았다.)
 */
export const OWNERSHIP_BYTES: FormatBytesOptions = {
  system: 'decimal',
  unitSpace: false,
  maxUnit: 'GB',
  fractionDigits: { MB: 0, GB: 1 },
  trailingZeros: 'trim-exact',
  nonPositive: 'render',
};

/** §0.2 #20의 대안 — §0.2 본문이 적은 파라미터. 출력 차이를 골든으로 남겨 둔다. */
export const OWNERSHIP_BYTES_MIN_MB: FormatBytesOptions = {
  ...OWNERSHIP_BYTES,
  minUnit: 'MB',
};
