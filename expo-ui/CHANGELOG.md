# @gj-kit/expo-ui

## 0.4.0

### Minor Changes

- 68e6250: Add the v0.4 interaction and overlay foundation with Chip, static Card, Link, relational FormField, title-based Collapsible, FloatingActionButton, AspectRatio, controlled single/range Slider, single/multiple ToggleGroup, declarative ToastViewport/useToastQueue, typed adaptive ActionSheet, `Menu<T>`, `Select<T>`, controlled owned-trigger `Popover`, owned icon-action `Tooltip`, and a controlled rich-content `Sheet` that adapts from a mobile bottom edge to a logical desktop side while keeping header, scroll body, and footer ownership explicit. Upgrade Dialog with programmatic naming, explicit close, dismissal reasons and veto, inline composition, opt-in focus refs, and parent-aware topmost dismissal. Upgrade Tabs to own a required, exhaustive typed panel record and add programmatic TextField label, helper, and error relationships.

  Add `DataTable` as a bounded, nonvirtualized data-display primitive. Web table and auto presentations emit a real captioned table with column and row headers, while native uses honest list/listitem semantics for both the visual table and compact list; web auto stays a table and native auto switches below the theme tablet breakpoint. The API requires exactly one of caption or accessibility label, a stable row key, an existing row-header column, and a nonblank scalar extractor for every column. Literal column tuples narrow controlled single-sort state to only `sortable: true` IDs, while consumers continue to own row ordering, filtering, pagination, fetching, and virtualization.

  DataTable also provides controlled include-only multiple checkbox selection. Visible-page select-all changes only selectable rows, preserves off-page keys, and reports only keys whose selected boolean actually changed. Loading, error, ready, and refreshing are mutually exclusive states; explicit list and adaptive presentations require an app-owned compact row renderer. Add `sortAscending`, `sortDescending`, and `sortUnsorted` to the complete `UiStrings` contract. Large editable or virtualized grids, column pinning/resizing, and composite grid keyboard navigation remain reserved for a separate future `DataGrid`.

  Add controlled `Pagination` as an independent navigation primitive rather than a `DataTable` footer. Numbered mode separates item totals (`totalItemCount` + `pageSize`) from precomputed page totals (`pageCount`), keeps the public page 1-based, and reports typed request reasons plus clamped item offsets. Cursor mode requires a visible status and previous/next capabilities without inventing a numeric position. Web renders a semantic `nav > ol > li > button` structure with one `aria-current="page"`; native exposes an honest toolbar and changes numbered `auto` from compact below the tablet breakpoint to full above it. Add deterministic boundary/sibling range generation and `previousPage` / `nextPage` to the complete `UiStrings` contract. Fetching, route synchronization, cursor storage, automatic page clamping, virtualization, and infinite-scroll triggers remain app-owned.

  Raise built-in text contrast to 4.5:1, preserve Card shadow and child clipping together, require an iOS-safe accessible name for required FormField controls, add native Link open-error handling, and use RTL-aware FAB and Slider direction. Slider exposes named adjustable thumbs and full web keyboard control; ToggleGroup exposes a named toolbar, pressed state, orientation-aware roving focus, and icon-only name enforcement. Toast keeps action and close as sibling controls, supports explicit live-announcement modes, and preserves visible lifetime across hover/focus/touch, native AppState, RNW page visibility, and browser window blur.

  Introduce conditional native/web root builds plus an internal stack, position, typeahead, presence, and scoped-host overlay kernel without adding direct runtime dependencies. The web condition imports the optional `react-native-web >= 0.21` peer directly, while native consumers continue to resolve `react-native` without installing React Native Web.

  Expose `OverlayProvider` as the shared Menu/Select/Popover/Tooltip environment and let the root `UiProvider` create it automatically; nested `UiProvider` instances reuse the outer scope, while explicit providers support provider-less or intentionally isolated overlays. Modal Dialog registers once in the optional stack, supplies its layer as the parent of descendant overlays, and routes backdrop, Escape, Back, accessibility escape, and close requests through the same topmost guard; inline Dialog remains outside the stack. The environment also coordinates web Tooltip warm-up and tears down pending timers on unmount. On web, Menu uses menuitem/menuitemcheckbox focus, Select keeps focus on a combobox with an active listbox option, Popover renders a bounded non-modal rich dialog, and Tooltip renders a delayed plain-text description. On native, Menu, Select, and Popover adapt to Dialog surfaces while Tooltip maps its description to the owned icon action's accessibility hint. Public Portal/Host and arbitrary `asChild` trigger composition remain intentionally unpublished. `Sheet` is deliberately an accessible edge-positioned modal rather than a simulated drag surface; snap points and pan gestures remain reserved for a future optional `BottomSheet` adapter backed by a platform-grade gesture implementation.

## 0.3.0

### Minor Changes

- 31개 컴포넌트로 확장하고 접근성·타입 계약을 강화했습니다.
  - `Badge`, `Alert`, `Avatar`, `Divider`, `ListItem`, `Spinner`, `ProgressBar`, `Checkbox`, `Switch`, `RadioGroup`, `Accordion` 추가
  - 상태별 soft·strong·on-color를 포함한 semantic color role 31종 제공
  - Checkbox·RadioGroup·Accordion의 웹 키보드 동작과 ARIA 관계, Switch의 네이티브 의미론 지원
  - determinate·indeterminate 진행 상태와 reduced motion 대응
  - npm 검색 메타데이터와 31개 컴포넌트별 정적 문서·SEO 페이지 추가

## 0.1.0

### Minor Changes

- e7dd3a7: 첫 릴리스: Expo/React Native UI 킷 — 토큰 관통 테마 시스템

  - 테마: Theme/ThemePair 브랜드(createTheme/createThemes 경유 강제), 부분 오버라이드 2단 병합, 라이트/다크 내장, 깊은 동결 + WeakMap 스타일 캐시
  - 토큰 관통: colors(24롤)·spacing·radius·typography(완전 롤)·elevation·metrics가 전 컴포넌트 스타일을 결정 — token-guard 정적 테스트로 강제
  - 컴포넌트 20종: Text/Button/IconButton/TextField/SearchField/Tabs/Selection 3종/Surface/ContentFrame/Section/StickyActionBar/Skeleton/EmptyState/ErrorState/Toast/Dialog 3종
  - Provider 주입: strings(en/ko 번들)·icons 슬롯 — 앱 어댑터 계층 불필요
  - 검증 강제: unstyled?: never, TextField style?: never, IconButton a11y 라벨 필수, EmptyState action 객체, Text 닫힌 색 유니언 등 10종
  - ./theme(React 무관 — tailwind.config에서 안전), ./insets(키보드·safe-area, optional peer 격리), ./tailwind(테마 파생 preset) 서브패스
