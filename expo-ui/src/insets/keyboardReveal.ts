/**
 * 키보드 리빌 오프셋 순수 함수 — 설계 문서 §7. memorylog2 원명 보존.
 *
 * 기준은 입력의 "아래쪽 가장자리"다 — 멀티라인 입력이 자라도 마지막 줄이
 * 계속 키보드(및 키보드 위로 들린 고정 바) 위에 남는다. 이미 충분히 보이는
 * 입력이면 null을 반환한다(위로 되끌어올리지 않는다 — 스크롤은 드러낼 때만).
 */

/** 구 KEYBOARD_REVEAL_MARGIN(16) 상수의 옵션화(§7). */
const DEFAULT_REVEAL_MARGIN = 16;

export function computeKeyboardRevealOffset({
  currentOffset,
  inputHeight,
  inputTop,
  keyboardInset,
  reservedBottomHeight,
  viewportHeight,
  margin = DEFAULT_REVEAL_MARGIN,
}: {
  /** 현재 스크롤 오프셋(contentOffset.y). */
  currentOffset: number;
  /** 포커스된 입력의 높이. */
  inputHeight: number;
  /** 스크롤 콘텐츠 안에서 포커스된 입력의 top(y). */
  inputTop: number;
  /** 뷰포트 하단을 가리는 키보드 겹침. */
  keyboardInset: number;
  /** 키보드 위로 들린 고정 하단 바의 실측 높이(없으면 0). */
  reservedBottomHeight: number;
  /** 키보드가 없을 때의 스크롤 뷰포트 높이. */
  viewportHeight: number;
  /** 입력 아래 가장자리와 키보드 사이 여백. 기본 16. */
  margin?: number | undefined;
}): number | null {
  if (keyboardInset <= 0) return null;
  const visibleViewportHeight = viewportHeight - keyboardInset - reservedBottomHeight;
  if (visibleViewportHeight <= 0) return null;
  const targetOffset = inputTop + inputHeight + margin - visibleViewportHeight;
  if (targetOffset <= currentOffset + 1) return null;
  return Math.max(0, targetOffset);
}
