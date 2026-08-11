/**
 * The string injection system — design doc §4.1.
 *
 * Precedence: an individual prop, then Provider strings, then the built-in en.
 * Partial<UiStrings> is deliberately not accepted — when the library adds a key,
 * consumers of a hand-assembled bundle see a compile error instead of a missing
 * key quietly leaking through in English. Customize by spreading:
 * `{ ...koStrings, retry: '다시 시도' }`.
 */
export interface UiStrings {
  /** The Skeleton accessibility label. */
  readonly loading: string;
  /** The default EmptyState title. */
  readonly emptyTitle: string;
  /** The default ErrorState title. */
  readonly errorTitle: string;
  /** The default ErrorState body. */
  readonly errorBody: string;
  /** The ErrorState retry button. */
  readonly retry: string;
  /** The SelectAllRow unselected label. */
  readonly selectAll: string;
  /** The SelectAllRow deselect label. */
  readonly deselectAll: string;
  /** ConfirmActionRow cancel. */
  readonly cancel: string;
  /** ConfirmActionRow confirm. */
  readonly confirm: string;
  /** The Dialog backdrop accessibility label. */
  readonly close: string;
  /** The default SearchField placeholder. */
  readonly searchPlaceholder: string;
  /** The combobox no-results state. */
  readonly noResults: string;
  /** The ascending state of the DataTable compact sort control. */
  readonly sortAscending: string;
  /** The descending state of the DataTable compact sort control. */
  readonly sortDescending: string;
  /** The unsorted state of the DataTable compact sort control. */
  readonly sortUnsorted: string;
  /** The Pagination previous control. */
  readonly previousPage: string;
  /** The Pagination next control. */
  readonly nextPage: string;
}

export const enStrings: UiStrings = {
  loading: "Loading",
  emptyTitle: "Nothing here yet",
  errorTitle: "Could not load this content",
  errorBody: "Something went wrong.",
  retry: "Retry",
  selectAll: "Select all",
  deselectAll: "Clear selection",
  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",
  searchPlaceholder: "Search",
  noResults: "No results found",
  sortAscending: "sorted ascending",
  sortDescending: "sorted descending",
  sortUnsorted: "not sorted",
  previousPage: "Previous page",
  nextPage: "Next page",
};

export const koStrings: UiStrings = {
  loading: "로딩 중",
  emptyTitle: "아직 항목이 없습니다",
  errorTitle: "내용을 불러오지 못했습니다",
  errorBody: "문제가 발생했습니다.",
  retry: "재시도",
  selectAll: "전체 선택",
  deselectAll: "선택 해제",
  cancel: "취소",
  confirm: "확인",
  close: "닫기",
  searchPlaceholder: "검색",
  noResults: "검색 결과가 없습니다",
  sortAscending: "오름차순 정렬됨",
  sortDescending: "내림차순 정렬됨",
  sortUnsorted: "정렬되지 않음",
  previousPage: "이전 페이지",
  nextPage: "다음 페이지",
};
