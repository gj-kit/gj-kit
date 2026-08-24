# 핸드오프 — memorylog2 gj-kit 전면 채택 + 라이브러리 라운드 A~E + 신규 패키지 4종 (2026-08-24~25)

이 문서는 `2026-08-24-memorylog2-adoption-rounds-a-d.md`를 대체한다(그 문서는 라운드 A~D 시점 스냅샷).

한 세션에서 두 저장소를 함께 진행했다: **memorylog2가 gj-kit을 최대한 쓰도록 이관**하고, 그 과정에서 드러난
공백을 **라운드 A~E**와 **신규 패키지 4종**으로 즉시 메꿨다. 신규 패키지는 설계 문서 → 설계 심사 2렌즈 →
구현 → 적대적 리뷰 2렌즈 → 수정을 거쳤고, 기존 패키지 변경과 소비 앱 변경도 구현→리뷰→수정 절차를 거쳤다.
**커밋은 이 세션이 수행했고 push는 하지 않았다.**

## 1. gj-kit — main(80f9774) 위 13커밋, 5개 → 9개 패키지

`changeset version` 결과(임시 클론에서 3회 재현):

| 패키지 | 현재 | 예정 | 핵심 |
|---|---|---|---|
| expo-ui | 0.7.0 | **0.8.0** | 라운드 A~E: KeyValueList·StatGrid·Toolbar·MonthCalendar·DateField(순수 CalendarDate 정수 산술, clock-free) · SegmentedControl `underline`(Tabs와 토큰 정합) · Text `tabularNums` · DataTable `onRowPress`(비중첩 활성화)·`activeRow`·`rowStyle` · Menu/Select `renderTrigger`(킷이 a11y 배선 주입, 미부착 시 loud 실패)·네이티브 `anchored` · Badge/Section/Accordion/Chip 슬롯 · reduced-motion 보수 정책 · DialogPanel/Sheet/Dialog 탈출구 |
| expo-media | 0.5.1 | **0.6.0** | `createPendingSelection`(순수 스테이징 선택 모델) |
| toss-payments | 0.5.0 | **0.6.0** | 멱등키 유도·재생 창·query-first 판정 · 카드사 코드표 · `PaymentStateInput`·직렬화 스냅샷 · `compareLedgerRefund`(리뷰가 in-flight 취소를 settled로 확정하던 블로커 수정) · `/testing` inspection |
| toss-payments-nestjs | 0.4.2 | **0.4.3** | 코어 0.6 peer |
| toss-payments-postgresql | 0.4.0 | **0.5.0** | `./testing` 인메모리 집합체(PG READ COMMITTED 미러링) · AES-256-GCM 보호기 |
| **expo-auth** | 0.0.0 | **0.1.0** | 신규 — 토큰 스토리지(exports 조건 포크) + 리프레시 세션(단일 비행·크로스탭 잠금·transient는 로그아웃 안 함) |
| **format** | 0.0.0 | **0.1.0** | 신규 — 명시적 timeZone/locale 포매터, Hermes Intl 매트릭스 실측 |
| **nest-operations-jobs** | 0.0.0 | **0.1.0** | 신규 — 잡 러너 + `JobRunStore` 포트(의무 S1~S7), 프레임워크 무관 코어 |
| **nest-notifications** | 0.0.0 | **0.1.0** | 신규 — 아웃박스 relay·fan-out·Expo 전송 포트, 배달 보장 8종 + 실패 행렬 F1~F10 |
| expo-workouts | 0.1.0 | 유지 | stale changeset 삭제로 릴리스 상태 정정(§4) |

**검증**: 클린 스냅샷(전 커밋 + `changeset version` 적용)에서 `corepack pnpm run verify:release` **EXIT 0**.
패키지별 유닛/타입: expo-ui 853/144 · toss-payments 558/119 · toss-payments-postgresql 255/36 ·
expo-auth 145/16 · format 356/21 · nest-operations-jobs 232/18 · nest-notifications 239/23 · README 블록 전부 컴파일.

### 1.1 설계 심사가 구현 전에 잡은 블로커 4건

신규 패키지는 코드를 쓰기 전에 설계를 심사해, 잘못된 계약이 앱으로 퍼지기 전에 막았다.

1. **format** — 필수 `timeZone`이 *렌더* 시간대만 고정하고 *파싱*은 기기 시간대로 샜다. offset 없는 ISO
   문자열이 실제 앱 호출부에 있었고, 기존 테스트는 로컬 파싱+로컬 렌더가 상쇄돼 통과하고 있었다.
2. **expo-auth** — 웹 읽기 캐시와 크로스탭 잠금의 순서 보장이 없어, 소비된 single-use refresh 토큰을 재사용해
   토큰 패밀리 전체가 서버에서 폐기될 수 있었다(양 탭 로그아웃).
3. **nest-operations-jobs** — `claim()`이 하트비트 워터마크를 정의하지 않아, 규약을 따른 Prisma 구현이
   "영원히 reap 안 되는 행"과 "DB시계/프로세스시계 혼용" 중 하나로 갈렸다. 이중 실행을 결정하는 필드다.
4. **nest-notifications** — `createDelivery`의 충돌 계약이 없어, 문서의 다른 규약(비throw 멱등 삽입)을 따른
   스토어가 잠긴 배달에 항목을 묶고 알림을 조용히 유실했다.

### 1.2 릴리스 게이트가 잡은 결함 1건

신규 3개 패키지의 릴리스 가드가 `version === '0.0.0'`을 하드코딩해, **첫 배포를 만드는 `changeset version`
직후 CI를 실패시키는** 구조였다(713d7e3에서 조건부 불변식으로 수정: 0.0.0이면 changeset 대기, 버전이
매겨졌으면 소비 완료). 클린 스냅샷 게이트가 아니었으면 배포 시점에야 드러났을 결함이다.

## 2. memorylog2 — 브랜치 `feat/gj-kit-adoption-260824` (worktree `~/project/company/memorylog2-gjkit`)

베이스 `test/launch-hardening-260823`(9cc252c7) 위 10커밋. 세 앱 전부 킷 소비자가 됐다.

- **모바일**: expo-ui 0.1.0 → 0.8.0. bespoke ConfirmDialog(253줄)·Button·SortDropdown 5/7 호출부·앨범 필터
  탭·pendingPhotos를 킷으로. **expo-auth 도입**(tokenStorage 122줄 + client.ts 리프레시 머신 교체, 저장 키를
  그대로 재현해 기존 로그인 세션 보존).
- **어드민**: 킷 사용 0 → 전면 채택. `src/ui.tsx` 1,150줄 자체 디자인 시스템 대부분 교체, `window.confirm`
  3곳 → ConfirmDialog, 결제 캘린더 → MonthCalendar(KST 경계 패리티 증명), 예약 입력 → DateField.
- **서버**: toss 3종 최신 vendoring + 킷 심볼·테스트 더블 채택, **환불 엔진 0~3단계 도입**(정책 등록 → gateway
  quoteRefund → 승인 시 quote 저장 + Prisma 마이그레이션 → gateway executeRefund; 실행 경로를 바꾸는 4단계는
  소유자 결정 대기), 하네스가 pass-through fake 대신 실제 fence 코드를 인메모리 PG 집합체 위에서 검증.
  **4차 채택(잡·알림 패키지 실사용)은 이 문서 작성 시점 진행 중** — 완료 시 §6을 갱신할 것.
- **정리**: 죽은 expo-media 패치·`packages/ui` 잔해·lockfile extraneous 항목·스토리북 stale glob 제거.
- **환경 함정 2건**: 스토리북 스모크는 `storybook-static` **프리빌드**를 검사(스토리·설정 변경 후 반드시
  `npm run build:storybook`) · expo-ui 0.8 웹 조건 분기가 Vite CJS interop 문제를 드러내
  `optimizeDeps.include`에 react-native-web 추가 + `uiTheme.shared` CJS→ESM 전환이 필요했다.

## 3. 소비 계약 — vendor 스냅샷과 재pack 절차 (중요)

memorylog2가 물고 있는 tarball은 **커밋된 소스에서 pack한 pre-release**다. 서버 매니페스트 파일명은 이력상
`gj-kit-toss-payments.manifest.json`이지만 **5개 패키지를 모두 덮는다**(앱의 `verify-gj-kit-vendor.mjs`가 강제).

| 위치 | 패키지 |
|---|---|
| `vendor/gj-kit/` | expo-ui 0.8.0 · expo-auth 0.1.0 |
| `apps/server/vendor/` | toss-payments 0.6.0 · toss-payments-nestjs 0.4.3 · toss-payments-postgresql 0.5.0 |
| `apps/server/vendor/` | nest-operations-jobs 0.1.0 · nest-notifications 0.1.0 |

provenance의 `sourceCommit`은 **임시 클론의 스냅샷 커밋**이라 이 저장소에 존재하지 않는다. 소유자가 push하면:
1. release.yml + changesets가 Version Packages PR → publish까지 자동 수행한다.
2. publish 후 memorylog2에서 `file:vendor/...`를 레지스트리 범위로 교체하거나, vendor를 유지하려면 **릴리스
   커밋에서 재pack**해 SHA/provenance를 갱신한다(서버 vendor는 게이트가 강제한다).

## 4. 릴리스 파이프라인 정정 (완료)

1. **expo-workouts** — main이 이미 0.1.0인데 그 버전을 만든 changeset이 미소비로 남아, 봇 PR이 미배포
   패키지를 0.2.0으로 올리던 문제 → stale changeset 삭제(069fb6d). 이제 버전이 오르는 것은 나머지 8종뿐.
2. **publish-github-packages.mjs** — expo-workouts + 신규 4종 등록 완료.
3. 루트 `check:readme` 체인·`check-pack-contents.mjs`에 신규 4종 등록 완료.

## 5. 남은 백로그·결정 대기

백로그 정본: memorylog2 `docs/gj-kit-adoption-backlog.md`(서버·어드민·모바일 3개 절, 해소 이력 주석).
대표 미해소: TimeField · MonthCalendar 요일/그리드 스타일 훅 · Sheet grab handle · Chip 그룹 단일 선택 ·
inline Dialog 백드롭 · Section count 천단위 구분 · SignalStrip/IdentityCell/MonoText 폰트 탈출구 ·
뷰포트 기준 프레젠테이션 분기(SortDropdown 잔여 2곳) · billing-key 암호화 킷 이전(듀얼 리드 설계 필요).
소유자 결정 대기: **환불 엔진 4~5단계**(`docs/gj-kit-refund-engine-adoption.md` §9). 4단계 배선 시
executeRefund의 409 3종을 terminal FAILED가 아니라 재견적 보류로 다뤄야 한다는 후속 사항이 이미 기록돼 있다.

## 6. 최종 게이트 수치

| 게이트 | 결과 |
|---|---|
| gj-kit `verify:release` (클린 스냅샷, 실버전 적용) | **EXIT 0** (9패키지) |
| memorylog2 spec:check | **PASS** — 67 resources · 170 acceptance criteria |
| admin typecheck / jest / expo export web | clean / **9스위트 47테스트** / 10 라우트 |
| mobile typecheck / jest / storybook smoke | 0 errors / **121스위트 1,076테스트** / **1,466 스토리 전부 렌더(실패·미선언 API·외부요청 0)** |
| server typecheck / test:offline | clean / **121스위트 2,245테스트** (4차 채택 후 재측정 필요) |
| 육안 확인 | 스토리북에서 Button variant 매트릭스·underline 탭·ConfirmDialog 단일 딤 |

⚠ 실기기 미검증: 모바일 네이티브 로그인/토큰 갱신(expo-auth 이관 경로), RN Modal 안 Button responder 재확인.
