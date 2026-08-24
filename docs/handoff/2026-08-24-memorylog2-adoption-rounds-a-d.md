# 핸드오프 — memorylog2 gj-kit 전면 채택 + 라이브러리 라운드 A~D (2026-08-24)

한 세션에서 두 저장소를 함께 진행했다: **memorylog2가 gj-kit을 최대한 쓰도록 이관**하고, 그 과정에서 드러난
공백을 **gj-kit 라운드 A~D**로 즉시 메꿨다. 모든 라이브러리 변경은 구현 → 적대적 리뷰(2렌즈) → 수정의
3단계를 거쳤고, 소비 앱 변경도 레인별로 같은 절차를 거쳤다.

## 1. gj-kit — 이번 세션의 미커밋 변경 (작업 트리)

`main`(80f9774) 위에서 작업했고 **소유자 지시(2026-08-24)로 이 세션이 커밋까지 수행**했다(푸시는 하지 않음).
changeset 7개가 대기 중이며 `changeset version` 결과(임시 클론에서 2회 재현 확인):

| 패키지 | 현재 | 예정 | 핵심 추가 |
|---|---|---|---|
| expo-ui | 0.7.0 | **0.8.0** | KeyValueList · StatGrid · Toolbar · SegmentedControl `underline`(Tabs와 동일한 tabActive/tabInactive 토큰 — 라운드 D 정합) · Text `tabularNums` · DataTable `onRowPress`/`getRowAccessibilityLabel`(비중첩 활성화 패턴 + `UiStrings.rowActivationHint` 신설) · Badge/Section/Accordion/Chip 슬롯(heading·count·trailing) · Dialog/ConfirmDialog/Sheet reduced-motion 보수 정책 · Skeleton 웹 드라이버 · EmptyState `compact` · pressable/selectable Card · DialogPanel `headerStyle/descriptionStyle/hideHeader/closeButtonStyle/closeIcon` · ConfirmActionRow/ConfirmDialog 버튼별 testID·style · Sheet `showCloseButton` · Menu/Select `triggerTestID`·hover 스타일 · Dialog `backdropStyle` |
| expo-media | 0.5.1 | **0.6.0** | `createPendingSelection`(코어 순수 스테이징 선택 모델) + 웹 `pendingItemFromFile` · 에러 코드 수 문서 정정(16→17) |
| toss-payments | 0.5.0 | **0.6.0** | 멱등키 유도(`deriveIdempotencyKey`)·재생 창·query-first 판정(`mustQueryOutcomeBeforeRetry`) · `CARD_ISSUER_NAMES_KO` · `PaymentStateInput`(최소 입력) · `SerializedPaymentStateSnapshot` + parse(단일 읽기·산술 불변식 검증) · `compareLedgerRefund`(**리뷰가 잡은 블로커 수정**: IN_PROGRESS 취소를 settled로 확정하지 않는 실측 모델 + `requestedAmount`/`shortfall`) · `/testing` 스토어 readonly inspection |
| toss-payments-nestjs | 0.4.2 | **0.4.3** | 코어 peer 범위에 `^0.6.0` 추가 |
| toss-payments-postgresql | 0.4.0 | **0.5.0** | `./testing` 서브패스 — `createMemoryTossPaymentsPostgres`(PG READ COMMITTED 의미론 미러링, 잠금 직렬화·기록 이벤트) · `createAes256GcmSensitiveValueProtector`(AAD 정본 바이트 명세 포함) · peer `^0.5.0 || ^0.6.0` |

**검증**: 스냅샷 클론(모든 변경 커밋 + `changeset version` 적용)에서 `corepack pnpm run verify:release` **EXIT 0**
(전 패키지 build/typecheck/unit/type/README 컴파일/pack 계약/packed consumer 스모크 4종/문서 사이트 export).
패키지별 최종 유닛/타입 테스트: expo-ui 746/126 · toss-payments 558/119 · toss-payments-postgresql 255/36 ·
expo-media(신규분 포함) 전체 green · README 코드블록: 53/40/24개 전부 컴파일.

## 2. memorylog2 — 브랜치 `feat/gj-kit-adoption-260824` (worktree `~/project/company/memorylog2-gjkit`)

베이스: `test/launch-hardening-260823`(9cc252c7). 소유자 지시로 이 세션이 커밋까지 수행했다(푸시는 하지 않음).

- **모바일**: expo-ui 0.1.0→0.8.0. bespoke ConfirmDialog(253줄)→킷 Dialog/DialogPanel/Sheet(+`LegacyConfirmPanel`
  잔존 — 축소됨), Button→킷 어댑터(variant 토큰 오버라이드로 시안 색 보존), 앨범 필터→킷 SegmentedControl
  underline, pendingPhotos→`createPendingSelection` 어댑터, 이중 딤 워크어라운드→`backdropStyle`,
  로그아웃/탈퇴 시트 X 제거(`showCloseButton={false}`). SortDropdown은 구체 공백(임의 트리거 노드·네이티브
  anchored) 기록 후 로컬 유지.
- **어드민**: gj-kit 사용 0 → 전면 채택. `src/ui.tsx` 1,150줄의 자체 디자인 시스템 대부분을 킷으로 교체
  (DataTable/Pagination/Badge/Button/Chip/SearchField/Skeleton/Alert/EmptyState/ProgressBar/Accordion/Section
  /Sheet/Tabs/Avatar/RadioGroup/Checkbox/TextField/Spinner + ConfirmDialog×3가 window.confirm 대체),
  테마는 `createTheme`, jest는 `jest-expo/web`(+실제 DOM role/aria 단정). 2차에서 KeyValueList/StatGrid/
  Toolbar/tabularNums/Section heading·count/onRowPress/compact EmptyState/pressable Card까지 킷으로.
- **서버**: vendor를 0.6.0/0.4.3/0.5.0으로 교체(manifest·sidecar·lockfile — `verify-gj-kit-vendor` 통과).
  멱등 재생 창·query-first·카드사 코드표를 킷 심볼로 교체(발급사명 6건은 앱 표기 유지 오버레이),
  게이트웨이 `toResponse`에 `summarizePaymentState` 채택, 테스트는 킷 `/testing` 더블로 재구성 —
  특히 **recurring-billing 하네스가 pass-through fake 대신 실제 `MemoryLogBillingKeyProjectionStore`를
  인메모리 PG 집합체 위에 올려 실제 fence 코드를 태운다**.
- **정리**: 죽은 `patches/@gj-kit+expo-media+0.4.0.patch`(0.5.1에 업스트림됨)·root expo-media devDep·
  `packages/ui` 잔해·lockfile extraneous 항목·스토리북 stale glob 제거.
- **스토리북**: expo-ui 0.8 웹 조건 분기로 두 가지 dev 서버 문제가 드러나 수정 —
  ① `optimizeDeps.include`에 `react-native-web`(CJS 의존성 interop), ② `uiTheme.shared.js` CJS→ESM
  (소비자 전원이 ESM/jiti 경유임을 전수 확인). Button/underline 탭/ConfirmDialog 스토리 육안 확인 완료.

**최종 게이트**(이 문서 말미 §6에 수치): 모바일 typecheck 0·jest 전부 green, 어드민 jest·웹 export green,
서버 test:offline 2,227+ green, spec:check 통과. 참고: 모바일 jest에서 플레이키 1건이 1회 관측(재실행 green).

## 3. 소비 계약 — vendor 스냅샷의 한계와 재pack 절차 (중요)

memorylog2가 물고 있는 tarball들은 **임시 클론의 스냅샷 커밋에서 pack한 pre-release**다.

| 위치 | 패키지 | sha256 |
|---|---|---|
| `vendor/gj-kit/` | expo-ui 0.8.0 | `3133f473b43912337d0e93b0806fdad7164aff5166591573e1021dd69d81f2cf` |
| `vendor/gj-kit/` | expo-media 0.6.0 | `877eb6665da898fb2752ce1a6b120c5d60fd719e65b7a4eb51b7802892bc3244` |
| `apps/server/vendor/` | toss-payments 0.6.0 | `1b4267c3b5d382d4d2345d7cb38075925e9cae8e00d1ba1015182164c7d20590` |
| `apps/server/vendor/` | toss-payments-nestjs 0.4.3 | `5d4aa8f274c1b17a83f37c105e4772fd7b4d01213b4bde1f88dc8717a2ab9569` |
| `apps/server/vendor/` | toss-payments-postgresql 0.5.0 | `6c7e2af95d189937d54dfecdcb8ed2365326305fc450d4573ba9928f855f8b50` |

provenance sidecar의 `sourceCommit`은 임시 클론 커밋(expo-ui만 재pack이라 `7d6c87d…`, 나머지는 `106d679…`)이라
**실제 저장소에는 존재하지 않는다**. 소유자가 gj-kit을 커밋·push하면:

1. release.yml + changesets가 자동으로 Version Packages PR → publish까지 수행한다(§4 주의 먼저 볼 것).
2. publish 후 memorylog2에서 `file:vendor/...`를 레지스트리 `^0.8.0` 등으로 교체하고 vendor tarball 삭제
   — 또는 vendor를 유지하려면 **릴리스 커밋에서 재pack**해 sha/provenance를 갱신(서버 vendor는
   `verify-gj-kit-vendor`가 강제한다).

## 4. 릴리스 파이프라인 주의 2건 (소유자 결정)

1. **expo-workouts 릴리스 상태 꼬임 — 해소(2026-08-24, 소유자 결정)**: main이 이미 0.1.0인데 그 버전을 만든
   changeset(`.changeset/nervous-kiwis-listen.md`)이 미소비로 남아 봇 PR이 미배포 패키지를 0.2.0으로 올리던
   문제. changeset 파일을 삭제했다 — `changeset publish`는 npm에 없는 버전이면 changeset 없이도 0.1.0을
   배포한다. 이 변경으로 실제 버전 산출은 expo-workouts 제외 5종만 오른다.
2. **publish-github-packages.mjs에 expo-workouts 부재 — 해소**: 목록에 추가했다.

## 5. 다음 라운드 후보 (백로그 정본: memorylog2 `docs/gj-kit-adoption-backlog.md`)

24개 항목 중 이번에 해소되지 않고 남은 대표: Menu/Select 임의 트리거 노드·네이티브 anchored
presentation(설계 §11의 의도적 보류와 충돌 — 결정 필요), DataTable 행 style 훅/selected wash,
DateTimePicker/Calendar(어드민 결제 캘린더·발송 예약 입력·모바일 날짜 다이얼로그 3곳 수요),
Sheet grab handle, Chip 그룹 단일 선택 의미론, inline Dialog 백드롭, `summarizePaymentState`의
컨슈머 DTO 결합 해소(§3 backlog #3 잔여), billing-key 암호화 킷 이전(듀얼 리드 마이그레이션 설계 필요 —
백로그에 절차 스케치 있음), 환불 엔진 도입(`docs/gj-kit-refund-engine-adoption.md` — 6단계, 소유자 결정).

## 6. 최종 게이트 수치

(세션 종료 시점 통합 실행 결과 — 아래 표가 이 브랜치의 정본이다)

| 게이트 | 결과 |
|---|---|
| gj-kit verify:release (클린 스냅샷, 실버전 적용) | **EXIT 0** |
| memorylog2 spec:check | **PASS** — 67 resources · 170 acceptance criteria |
| admin typecheck / jest / expo export web | clean / **7스위트 20테스트** / 10 라우트 export 성공 |
| mobile typecheck / jest | 0 errors / **119스위트 1,063테스트** (플레이키 1건이 세션 중 1회 관측 — 재실행 green) |
| mobile storybook (재빌드 후 스모크) | **1,462/1,462 렌더 · 실패 0 · 미선언 API 0 · 외부요청 0** (베이스 브랜치는 미선언 2건이었음 — 이관이 1건 해소, 마지막 1건은 기존 선언 누락으로 스토리에 선언 추가) |
| server typecheck / test:offline | clean / **121스위트 2,229테스트** |
| 수동 육안 확인 | 스토리북에서 Button 전 variant 매트릭스(시안 색 정합) · underline 탭(tabActive 2px) · ConfirmDialog(단일 딤) 렌더 확인 |

주의: 스토리북 스모크는 `storybook-static/` **프리빌드**를 서빙한다 — 스토리·설정을 바꾼 뒤에는 반드시
`npm run build:storybook` 후 스모크를 돌릴 것(이번 세션에서 이 함정으로 스모크가 한동안 이전 빌드를 검사하고 있었다).
