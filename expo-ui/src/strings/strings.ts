/**
 * 문구 주입 체계 — 설계 문서 §4.1.
 *
 * 우선순위: 개별 prop > Provider strings > 내장 en.
 * Partial<UiStrings>는 의도적으로 받지 않는다 — 라이브러리가 키를 추가하면
 * 손조립 번들 소비자에게 컴파일 에러로 표면화된다(누락 키가 조용히 영어로
 * 새는 것 방지). 커스텀은 `{ ...koStrings, retry: '다시 시도' }` 스프레드로.
 */
export interface UiStrings {
  /** Skeleton 접근성 라벨. */
  readonly loading: string;
  /** EmptyState 기본 제목. */
  readonly emptyTitle: string;
  /** ErrorState 기본 제목. */
  readonly errorTitle: string;
  /** ErrorState 기본 본문. */
  readonly errorBody: string;
  /** ErrorState 재시도 버튼. */
  readonly retry: string;
  /** SelectAllRow 미선택 라벨. */
  readonly selectAll: string;
  /** SelectAllRow 선택 해제 라벨. */
  readonly deselectAll: string;
  /** ConfirmActionRow 취소. */
  readonly cancel: string;
  /** ConfirmActionRow 확인. */
  readonly confirm: string;
  /** Dialog 백드롭 접근성 라벨. */
  readonly close: string;
  /** SearchField 기본 플레이스홀더. */
  readonly searchPlaceholder: string;
}

export const enStrings: UiStrings = {
  loading: 'Loading',
  emptyTitle: 'Nothing here yet',
  errorTitle: 'Could not load this content',
  errorBody: 'Something went wrong.',
  retry: 'Retry',
  selectAll: 'Select all',
  deselectAll: 'Clear selection',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  searchPlaceholder: 'Search',
};

export const koStrings: UiStrings = {
  loading: '로딩 중',
  emptyTitle: '아직 항목이 없습니다',
  errorTitle: '내용을 불러오지 못했습니다',
  errorBody: '문제가 발생했습니다.',
  retry: '재시도',
  selectAll: '전체 선택',
  deselectAll: '선택 해제',
  cancel: '취소',
  confirm: '확인',
  close: '닫기',
  searchPlaceholder: '검색',
};
