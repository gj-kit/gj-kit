# @gj-kit/expo-ui

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
