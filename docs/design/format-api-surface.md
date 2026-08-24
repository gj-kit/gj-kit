# @gj-kit/format — 공개 API 표면 설계

> 작성: 2026-08-24. 개정: 2026-08-24(리뷰 20건 반영, r2). 형식·깊이 기준: `docs/design/expo-media-api-surface.md` · `docs/design/toss-payments-postgresql-v1.md`. 한국어 산문 + 영어 식별자/JSDoc.
>
> 소스 정본 3파일 (memorylog2 삼중복):
> - `apps/admin/src/format.ts` (118줄) — text·number·won·bytes·storageRatio·storageUsage·storagePair·date·dateOnly·dateShort·relative·duration. **날짜는 전부 로컬 시간**.
> - `apps/mobile/src/utils/format.ts` (56줄) — formatStorageBytes(decimal SI)·formatBytes·formatCurrency(`'원'` 접미)·formatUtcDate(**UTC**).
> - `apps/mobile/src/utils/datetime.ts` (51줄) — formatKoreanDate/DateTime(`.` 구분자, 로컬)·formatRelativeTime(무공백 `분전`, 7일 컷오프).
>
> 실측 표기 규약: `[실측 A~L]` = 이 세션에서 로컬 파일·로컬 실행으로 직접 확인(부록에 재현 명령). `[문서 D]` = facebook/hermes `doc/IntlAPIs.md`(main, 2026-08-24 fetch). 표기 없는 주장 중 검증 못한 것은 본문에 `[unverified]`를 붙였다 — 붙지 않은 문장은 소스 코드 또는 위 근거에서 직접 나온 것이다.

---

## 0. 채택 맵

### 0.1 소스 export 전수 19종 → 목적지

세 파일의 **export 전수**다. 하나라도 암묵적으로 떨어뜨리지 않는다. 비-export 로컬 구현 2건은 §0.2에 따로 적는다 — 그것들도 "같은 데이터가 화면마다 다르게 보이는" 불일치의 실사례이므로 이 문서의 사각지대가 되어선 안 된다.

**비고의 ⚠ 표시는 소스와 출력이 달라지는 의도적 변경이며, 전량이 §0.4 변경표에 입력→소스출력→라이브러리출력→사유로 다시 나온다.** 표시 없는 행만이 "바이트 단위 동일"의 대상이다.

| # | 소스 | 함수 | 목적지 | 재현 파라미터 · 비고 |
|---|---|---|---|---|
| 1 | admin | `text` | `formatText` | `unknown` → `string \| number`로 좁힘 (§4-7) |
| 2 | admin | `number` | `formatNumber` + `{ locale:'ko-KR' }` | locale이 필수 인자가 됨. ⚠ `number(null)`이 `'0'` → `'-'`(§0.4-①) |
| 3 | admin | `won` | `formatKrw` + `{ style:'symbol', locale:'ko-KR' }` | `Number(v ?? 0)` 코어션은 호출부 책임으로 이동. ⚠ `won(null)`이 `'₩0'` → `'-'`, `won(-0)`이 `'-₩0'` → `'₩0'`(§0.4-②③) |
| 4 | admin | `bytes` | `formatBytes` + `{ system:'decimal', unitSpace:true, fractionDigits:1, trailingZeros:'keep', nonPositive:'render', maxUnit:'PB' }` | PB 상한 동일. `trailingZeros:'keep'`이 `toFixed(1)` 고정폭을 재현한다. ⚠ `bytes(null)`이 `'0 B'` → `'-'`(§0.4-④) |
| 5 | admin | `storageRatio` | `storageRatio` | 시그니처 유지, `unknown` → `number`. **채택 근거**: 소비자 3곳(`app/index.tsx:121`·`app/users.tsx:368`·`src/ui.tsx:438`)이 progress bar에 숫자로 직접 먹인다 `[실측 E]` — 문자열 렌더러가 아니라 산술이 실제 재사용 단위다. 그 산술의 화면 출력은 `formatPercent`가 받는다(§3.9) |
| 6 | admin | `storageUsage` | **제외** — README 조합 예제 | §6-6. 단일 앱 카피(`(63%)` 괄호 표기)이자 **호출부 0건의 사문**(정의 외 참조 없음) `[실측 E]` |
| 7 | admin | `storagePair` | **제외** — README 조합 예제 | §6-6. 호출부 1건(`app/users.tsx:414`) |
| 8 | admin | `date` | `formatDateTime` + `{ timeZone:'device', separator:'-' }` | 로컬 시간이 **명시 토큰**이 됨. ⚠ 문자열 인자는 `parseIsoInstant(v, { assumeNoOffset:'device' })`를 통과해야 한다(§0.4-⑤) |
| 9 | admin | `dateOnly` | `formatDateOnly` + 동일 옵션 | ⚠ 동일 |
| 10 | admin | `dateShort` | `formatMonthDayTime` + 동일 옵션 | ⚠ 동일 |
| 11 | admin | `relative` | `formatRelativeKo` + `{ suffixSpace:true, fallback:'', onFuture:'empty' }` | `방금`·`3분 전`·개월/년 스케일. ⚠ 소스는 `now`에 기본값 `new Date()`가 있고 **프로덕션 호출부 5건 전부 생략**한다 `[실측 E]` — 이관 시 5곳이 `now`를 명시해야 한다(§0.4-⑥) |
| 12 | admin | `duration` | `formatDurationKo(endMs - startMs)` | (from,to) 2-타임스탬프 → **ms 단일 인자**로 원시화 |
| 13 | mobile/format | `formatStorageBytes` | `formatBytes` + `{ system:'decimal', unitSpace:false, minUnit:'MB', maxUnit:'TB', fractionDigits:{ MB:0, GB:1, TB:1 }, trailingZeros:'trim-exact', nonPositive:'render' }` | 플랜 용량 표기 재현. **단위별 반올림이 다르다**(MB는 항상 정수, GB/TB는 1자리) — 그래서 `fractionDigits`가 단위별 맵을 받는다(§3.7). `trailingZeros:'trim-exact'`가 `Number.isInteger(v) ? v : v.toFixed(1)`을 재현한다 — 이 규칙은 `1.04GB`를 `'1.0GB'`로 낸다(`'1GB'`가 아니다) `[실측 F]` |
| 14 | mobile/format | `formatBytes` | `formatBytes` + `{ system:'decimal', unitSpace:false, fractionDigits:1, trailingZeros:'trim', wholeNumberFrom:10, maxUnit:'GB', nonPositive:'fallback', fallback:null }` | `null` 패스스루는 제네릭 fallback으로. **`nonPositive:'fallback'`이 소스의 `bytes <= 0 → null`을 재현한다** — 0은 유효값이 아니라 "크기 미상"이다 |
| 15 | mobile/format | `formatCurrency` | `formatKrw` + `{ style:'suffix-ko', locale:'device' }` | 기기 로케일 의존이 **명시 토큰**이 됨. ⚠ 소스는 `toLocaleString()`이라 소수를 그대로 낸다 — `1000.5` → `'1,000.5원'` vs 라이브러리 `'1,001원'` `[실측 G]`(§0.4-⑦) |
| 16 | mobile/format | `formatUtcDate` | `formatDateTime`/`formatDateOnly` + `{ timeZone:'UTC', separator }` | 제네릭 `fallback: T` 계약 채택. ⚠ 문자열 인자는 `parseIsoInstant(v, { assumeNoOffset:'utc' })`를 통과해야 한다 — **프로덕션 호출부 4곳(2파일)이 API 문자열을 그대로 넘기고 있다** — `components/cards/plans.tsx:1219·1223·1228` 외 1건 `[실측 E]`(§0.4-⑤) |
| 17 | mobile/datetime | `formatKoreanDate` | `formatDateOnly` + `{ timeZone:'device', separator:'.' }` | ⚠ 문자열 인자 동일 |
| 18 | mobile/datetime | `formatKoreanDateTime` | `formatDateTime` + `{ timeZone:'device', separator:'.' }` | ⚠ 문자열 인자 동일 |
| 19 | mobile/datetime | `formatRelativeTime` | `formatRelativeKo` + `{ suffixSpace:false, justNowLabel:'방금 전', yesterdayLabel:'어제', maxDays:7, onOverflow, onFuture, fallback:'-' }` | 7일 컷오프·어제·미래=절대시각 전부 표현 가능 |

### 0.2 비-export 구현 2건 — §0.1의 사각지대

`export` 키워드가 없다는 이유로 §0.1에서 빠졌지만, **화면에는 §0.1의 함수들과 똑같이 출력된다**. 목적지를 명시하지 않으면 이관 후에도 살아남아 통합의 목적을 부분적으로 무산시킨다.

| # | 위치 | 무엇 | 목적지 |
|---|---|---|---|
| 20 | `apps/mobile/src/albums/OwnershipTransferRequest.tsx:27` | **네 번째** 바이트 포매터. GB는 `Number.isInteger ? v : v.toFixed(1)`, MB는 **`Math.ceil`**, 그 미만은 **KB를 건너뛰고** 원시 `${bytes}B` `[실측 E]` | **흡수하되 정책 변경 2건을 감수한다** — `formatBytes` + `{ system:'decimal', unitSpace:false, minUnit:'MB', maxUnit:'GB', fractionDigits:{MB:0,GB:1}, trailingZeros:'trim-exact', nonPositive:'render' }`. ⚠ `ceil`→`round`, 1MB 미만이 `'500000B'`→`'0MB'`로 바뀐다(§0.4-⑧) |
| 21 | `apps/admin/src/format.ts:39` | private `percent()` — `${Math.round(ratio*100)}%`. 같은 식이 `app/users.tsx:407`·`src/ui.tsx:423`·`src/ui.tsx:451`에도 **인라인으로 3번 더** 복제돼 있다 `[실측 E]` | `formatPercent` (§3.9) — `storageRatio` → `formatPercent` 파이프를 패키지 안에서 닫는다 |

**#20의 `ceil`을 축으로 승격하지 않는 이유.** `rounding: 'round'|'ceil'|'floor'` 축을 추가해도 **중간 단위(KB) 스킵은 여전히 표현 불가**하다 — `minUnit`/`maxUnit`은 범위를 자를 뿐 중간을 건너뛰지 못한다. 즉 축을 하나 늘려도 재현은 완성되지 않는다. 호출부가 1곳(소유권 이전 다이얼로그)이고 "사용량을 과소표시하지 않는다"는 요구는 `ceil`이 아니어도 호출부에서 `Math.ceil(bytes/1e6)*1e6`으로 만족되므로, **축 추가 없이 호출부 정책 변경**으로 닫는다. 이 판단은 §8 이관 계획의 되돌리기 지점 3에 걸려 있다.

### 0.3 사용자 가시 불일치 — 이 패키지의 존재 이유

삼중복은 단순 중복이 아니라 **같은 데이터가 화면마다 다르게 보이는** 불일치다. 라이브러리는 어느 쪽도 조용히 승자로 만들지 않는다 — **갈라진 축은 전부 필수 옵션**이 된다(§1-1). (이 표는 §0.1 export 19종 + §0.2 비-export 2건을 합친 21종 기준이다. 초판은 "export 전수"를 "전수"로 잘못 적어 #20의 네 번째 바이트 표기를 누락했다.)

| 축 | admin | mobile | 사용자 가시 결과 | 강제 방식 |
|---|---|---|---|---|
| ① 시간대(렌더) | 로컬(`getHours`) | `formatUtcDate`는 UTC, `datetime.ts`는 로컬 | **같은 타임스탬프가 화면마다 다른 시각** — KST에서 9시간 차 | `timeZone` 필수 인자 (`'UTC' \| 'device' \| IANA`) — 생략 = 컴파일 에러 |
| ①' 시간대(입력 해석) | `new Date(String(v))` | `new Date(input)` | **offset 없는 문자열은 기기 시간대로 해석된다** — `'2026-06-08T09:05:00'`이 서울에선 `00:05Z`, 뉴욕에선 `13:05Z` `[실측 H]`. `timeZone` 옵션이 이 단계를 막지 못한다 | 포매터가 **문자열을 받지 않는다**(`FormatDateInput = Date \| number`). 파싱은 `parseIsoInstant`의 필수 `assumeNoOffset` 축이 흡수(§3.2) |
| ② 통화 | `₩1,000` (Intl currency) | `1,000원` (toLocaleString + 접미) | 두 통화 표기 공존 | `style: 'symbol' \| 'suffix-ko'` 필수 |
| ③ 그룹핑 로케일 | `'ko-KR'` 고정 | 기기 기본(`toLocaleString()`) | 해외 기기에서 `1.000원` 가능성 | `locale` 필수 (`'device'`도 명시 토큰). **`locale`은 그룹핑만 정한다** — 기호 글리프·위치는 §3.8이 로케일에서 떼어 고정한다 |
| ④ 날짜 구분자 | `-` | `.`(datetime.ts) / `-`·`.` 선택(formatUtcDate) | `2026-06-08` vs `2026.06.08` | `separator: '-' \| '.'` 필수 |
| ⑤ 상대시간 카피 | `방금`·`3분 전`(공백)·미래=`''`·개월/년 | `방금 전`·`3분전`(무공백)·`어제`·7일 후 절대날짜·미래=절대시각 | 동일 시각이 다른 문구 | `suffixSpace`·`onFuture`·`fallback` 필수, 나머지는 옵션으로 표현 |
| ⑥ 바이트 표기 | `1.5 GB`(공백, 항상 소수 1) | `1.5GB`(무공백, trim, ≥10은 정수) + `formatStorageBytes`는 **단위별로 다른 반올림** + #20은 `ceil`·KB 스킵 | 단위 표기 4종 공존 | `system`·`unitSpace` 필수, 반올림 정책은 `fractionDigits`(단위별 맵 가능)·`trailingZeros`·`wholeNumberFrom` |
| ⑦ 비양수 바이트 | `0`·음수 전부 렌더(`'0 B'`·`'-5 B'`) | `<= 0`이면 `null` → **칩이 사라진다** | 크기 미상(0)이 `'0B'`로 보이거나 숨거나 | `nonPositive: 'render' \| 'fallback'` **필수** |
| ⑧ invalid 폴백 | `-`(날짜)·`''`(relative) | `-`·`null`·제네릭 `T` | 빈 셀 표현 상이 | 날짜/바이트는 제네릭 `fallback?: T \| undefined`(기본 `'-'`), relative는 **필수** |

### 0.4 의도적 출력 변경표 — "소스와 동일"의 예외 전수

§5.1의 골든 벡터는 **이 표에 없는 모든 케이스**에 대해서만 "소스와 바이트 단위 동일"을 주장한다. 이 표의 행들은 별도 기대값으로 고정되며, 골든 스위트를 쓰는 구현자가 "소스 동일"과 "의도된 변경" 중 무엇을 기대값으로 둘지 표에서 판정할 수 있어야 한다. (expo-media §11.7 "파괴적 변경 3건" 선례.)

| # | 입력 | 소스 출력 | 라이브러리 출력 | 사유 |
|---|---|---|---|---|
| ① | `number(null)` / `number(undefined)` | `'0'` `[실측 I]` | `'-'` | §4-7. `Number(value \|\| 0)` 코어션이 사라진다 — null은 "모름"이지 0이 아니다. admin 전 테이블에서 빈 수치 셀 표기가 `0`→`-`로 바뀐다(호출부 73건 영향) |
| ② | `won(null)` | `'₩0'` | `'-'` | 동일 |
| ③ | `won(-0)` | `'-₩0'` `[실측 G]` | `'₩0'` | `-0`을 `0`으로 정규화한다(§3.7·§3.8 공통 규칙). 실데이터 도달 불가에 가까운 경계지만 골든에 명시한다 |
| ④ | `bytes(null)` / `bytes(undefined)` | `'0 B'` | `'-'` | ①과 동일. `bytes(-5)` → `'-5 B'`는 **변경 아님**(`nonPositive:'render'`로 재현) |
| ⑤ | 날짜 3종에 **문자열** 인자 | `new Date(String(v))` — offset 없으면 기기 시간대 | 컴파일 에러. `parseIsoInstant(v, { assumeNoOffset })`를 거쳐야 한다 | ①'축. `assumeNoOffset:'device'`를 고르면 **출력은 소스와 동일**하고, 기기 의존이 호출부에 글자로 남는다. `'utc'`를 고르면 출력이 바뀐다 — 이관 시 API가 무엇을 의미하는지 결정해야 한다는 뜻이며, 그 결정을 강제하는 것이 목적이다 |
| ⑥ | `relative(v)` (now 생략) | 암묵 `new Date()` | 컴파일 에러 — `now` 필수 | §1-2. 호출부 5건이 `now`를 명시하게 된다. 출력은 동일 |
| ⑦ | `formatCurrency(1000.5)` | `'1,000.5원'` `[실측 G]` | `'1,001원'` | KRW에 minor unit이 없다. `maximumFractionDigits: 0`으로 정규화 — admin `won`과 mobile `formatCurrency`가 비정수 금액에서 갈라져 있던 것을 admin 쪽으로 통일 |
| ⑧ | #20 `formatBytes(500_000)` (소유권 이전) | `'500000B'` | `'500KB'` | KB 스킵은 표현 불가(§0.2). 500000B라는 원시 표기는 제품 의도라기보다 누락으로 판단 |
| ⑨ | #20 `formatBytes(1_200_000)` | `'2MB'`(`ceil`) | `'1MB'`(`round`) | 동일. 과소표시 방지가 요구면 호출부가 입력을 올림한다 |
| ⑩ | 연도 < 1 또는 > 9999 | `getFullYear()` 그대로 렌더 | `fallback` | §3.4 지원 연도 범위. IANA 경로와 UTC/device 경로의 출력을 일치시키려면 범위를 닫아야 한다(연도 폭 논의) |

### 0.5 패키지 경계 — 왜 expo-ui가 아니라 새 패키지인가

초판은 이 질문을 다루지 않았다. **`admin`이 expo-ui를 못 쓴다는 암묵 전제는 거짓이다** — admin은 브라우저 전용 React 앱이 아니라 `expo-router` + `react-native-web` Expo 앱이고, 이미 `@gj-kit/expo-ui`를 tarball로 벤더링한다(`apps/admin/package.json`: `"@gj-kit/expo-ui": "file:../../vendor/gj-kit/gj-kit-expo-ui-0.8.0.tgz"`) `[실측 E]`. 그러므로 경계는 소비 가능성이 아니라 **의존성 전이**로 논증해야 한다.

1. **peer 전이가 실제 비용이다.** expo-ui의 peer는 `react`·`react-native`·`react-native-safe-area-context`다. 이 패키지의 소비자에는 Node 스크립트·서버 렌더러·백오피스 배치가 포함될 수 있고(§1-5의 platform neutral 불변식이 그 약속이다), 포매터 하나를 쓰려고 RN peer 3종을 요구하는 것은 계약 거짓말이다. **peer 0을 유지할 수 있는 계층은 분리한다.**
2. **`./insets/pure` 선례를 왜 따르지 않는가.** expo-ui에는 peer-free 순수 서브패스 선례가 있다(`expo-ui/package.json:114`) `[실측 E]`. 따르지 않는 이유는 **package.json 최상위 peer는 서브패스 단위로 완화되지 않기 때문**이다 — `./insets/pure`를 import해도 npm은 expo-ui의 peer 경고를 그대로 낸다. 그 선례는 "번들에 RN이 안 섞인다"를 보장할 뿐 "설치에 RN이 필요 없다"를 보장하지 못한다. 이 패키지가 필요로 하는 것은 후자다.
3. **파괴적 변경 주기가 다르다.** expo-ui는 Expo SDK 메이저를 따라 peer 범위를 올리는 패키지고, format은 SDK와 무관하게 안정적이어야 한다. 결합하면 SDK 승격이 포매터 소비자에게 전파된다.

**expo-ui와의 날짜 어휘 충돌 — 계약으로 정리한다.** expo-ui는 이미 날짜 도메인을 소유한다: `CalendarDate`(평면 `{year,month,day}`)·`formatCalendarDateKey`(YYYY-MM-DD 생성)·`parseCalendarDateKey`, 그리고 README에 "JS `Date`는 공개 API 어디에도 등장하지 않는다"를 명시 규칙으로 박아 놨다 `[실측 E]`.

- **역할 분담이 규칙의 근거다.** expo-ui의 규칙은 **입력 위젯의 계약**에 대한 것이다 — 사용자가 고른 "날"은 시간대에 따라 달라지는 순간값이면 안 되므로 `CalendarDate`여야 한다. format은 반대편, **이미 확정된 순간(instant)을 사람이 읽는 문자열로 내리는 출력 계층**이다. 순간을 다루는 타입은 `Date`(또는 epoch ms)일 수밖에 없고, 그래서 `FormatDateInput = Date | number`다. 두 규칙은 충돌이 아니라 **입력=civil date / 출력=instant**라는 한 문장의 양면이다.
- **출력 중복.** `formatDateOnly(v, { timeZone, separator:'-' })`의 출력은 `formatCalendarDateKey(cd)`와 문자열이 같다. 중복은 인정하되 **입력 타입이 다르므로 서로를 대체하지 않는다**: 전자는 순간+시간대 → 문자열, 후자는 civil date → 키. 라이브러리 간 브리지(`toCalendarDate(instant, timeZone)`)는 **양쪽 어디에도 넣지 않는다** — 넣는 순간 format이 expo-ui 타입에 의존하거나 그 역이 되어 peer 0이 깨진다. 소비 앱이 세 줄로 만든다(README 레시피).

**패키지명.** `formatKrw`·`formatRelativeKo`·`formatDurationKo`가 한국어/한국 통화 전용이고 §6이 다국어·타통화·compact를 배제하므로 `@gj-kit/format`이 계약보다 넓다는 지적은 타당하다. 그럼에도 이름을 유지한다: (a) 표면의 과반(`formatDateTime`·`formatDateOnly`·`formatMonthDayTime`·`formatBytes`·`formatNumber`·`formatPercent`·`formatText`·`storageRatio`)은 언어 중립이고, (b) 한국어 의존은 **함수 이름**(`Ko` 접미)과 **옵션 값**(`'suffix-ko'`)에 전부 드러나 있어 패키지명이 그것을 다시 말할 필요가 없으며, (c) 다국어 카피 팩이 생기면 §2.1대로 additive 서브패스로 들어오는데 그때 `@gj-kit/format-ko`라는 이름이 오히려 거짓이 된다. 대신 **명명 규약을 §1.3에 문서화**해 어떤 함수가 한국어 카피인지 이름만 보고 판정 가능하게 한다.

### 0.6 기각 결정 (재론 금지)

| 기각안 | 이유 |
|---|---|
| `Intl.RelativeTimeFormat` 기반 상대시간 | Hermes 미지원(§1.1) — 지원 목록에 없음 `[문서 D]`. 소스 앱 둘 다 한국어 카피를 수제로 만들고 있고, 그 카피가 곧 계약이다 |
| `Intl.NumberFormatOptions` passthrough | `notation:'compact'`(iOS 미지원)·`signDisplay`(iOS 미지원) 같은 Hermes 불안전 옵션이 타입 검사를 통과해 버린다 `[문서 D]`. 허용 옵션을 화이트리스트로 좁힌다(§4-8) |
| `dateStyle`/`timeStyle` 사용 | 소스 앱들이 고정폭 패턴을 수제로 만든 이유가 바로 `toLocaleString`의 가변폭 출력이었다(admin 주석 실증). 로케일 데이터에 출력을 맡기지 않는다 |
| timeZone 기본값 `'device'` | "명시 없으면 로컬"이 바로 삼중복 불일치 ①의 원인. 기본값 제공 = 설계 실패 |
| 서브패스 분리 (`./date`, `./bytes` …) | 플랫폼 포크·optional peer·무거운 엔트리가 전무한 순수 함수 패키지. `sideEffects:false` + ESM tree-shaking으로 충분(§2.1) |
| `deviceTimeZone()` 헬퍼 export | 구현이 `resolvedOptions().timeZone`인데 Hermes 반환값을 실측 못함 [unverified]. `'device'` 토큰이 요구를 흡수하므로 표면에서 뺀다(§6-5) |
| ~~날짜 파싱 유틸 공개~~ **(개정 — 부분 철회)** | 초판은 "출력 전용이므로 파싱은 `Date` 생성자 의미론을 그대로 쓴다"였다. **그 문장이 §1-2·§1-4와 양립하지 않는다**: `Date` 생성자는 offset 없는 문자열을 기기 시간대로 해석하고(§0.3 ①'), 비-ISO 문자열의 파싱 결과는 엔진마다 다르다. 출력 전용이라는 이유는 **문자열을 포매터에서 뺄** 근거는 되어도 **암묵적으로 삼킬** 근거는 되지 않는다. → `parseIsoInstant` **하나만** 공개하되, 엔진 파서를 쓰지 않는 자체 구현으로 두어 Hermes 편차를 0으로 만든다(§3.2) |
| `formatKrw('symbol')`의 `Intl` currency 스타일 | locale이 기호 글리프와 위치를 바꾼다 — `de-DE` → `1.000 ₩`, **`es-ES` → `1000 KRW`** `[실측 G]`. `{ style:'symbol', locale:'device' }`가 타입을 통과하면서 `1000 KRW`를 렌더할 수 있다는 뜻이고, 이는 §0.3 ②·③을 required로 올린 목적을 무너뜨린다. → `style:'decimal'` + 리터럴 `₩` 합성으로 출력 형태를 고정(§3.8). Android 11 currency 결함(§7-4)도 동시에 소멸 |
| `Intl.NumberFormat` `style:'percent'` | 같은 이유. `fr-FR`은 `63 %`(NBSP 포함)를 낸다. `formatPercent`도 decimal + 리터럴 `%`로 합성한다(§3.9) |

---

## 1. 설계 원칙

1. **갈라진 축은 필수, 합의된 축은 기본값.** 두 앱이 다르게 렌더한 모든 축(§0.3)은 required 옵션이다 — 호출부가 쓰지 않으면 컴파일되지 않는다. 두 앱이 일치한 것(예: 폴백 `'-'` 대세, `HH:mm` 24시간제)만 기본값을 가진다. `nonPositive`가 required인 것도 이 규칙의 기계적 적용이다(§0.3 ⑦).
2. **암묵적 환경 읽기 금지.** 시계(`new Date()`), 기기 시간대, 기기 로케일을 함수가 몰래 읽지 않는다. `now: Date`는 인자, 시간대는 `timeZone` 인자, 기기 로케일은 `locale: 'device'`라는 **글자로 적어야 하는** 토큰이다. **문자열 파싱도 같은 규칙 아래 있다** — offset 없는 문자열의 해석은 `assumeNoOffset: 'utc' | 'device' | 'reject'`라는 필수 축이며, 기기 의존을 고르려면 `'device'`라고 적어야 한다. 전 함수가 순수(same input → same output)이고, 예외인 `'device'` 토큰 경로조차 호출부 코드에 그 의존이 문자열로 남는다.
3. **오류 3분류 — 데이터는 폴백, 코드는 throw, 환경은 사전 질의 가능한 throw.**
   - **값 오류(데이터)**: `null`·invalid Date·`NaN`·범위 밖 연도 → `fallback` 반환. 절대 던지지 않는다.
   - **설정 오류(코드)**: 잘못된 IANA 이름 → `FormatError('ERR_TIMEZONE_INVALID')`. 프로그래머가 고칠 수 있다.
   - **환경 오류(런타임 Intl 결함)**: `ERR_INTL_UNUSABLE`·`ERR_INTL_FIELD_OUTPUT`. **프로그래머가 고칠 수 없으므로** 세 번째 분류로 분리한다. 초판은 이것을 "설정 오류"에 묶어 놓고 렌더 도중 화면 전체가 죽는 경로를 남겼다. 완화 3종: (a) `canFormatTimeZone(zone)` probe를 export해 앱 부팅 시 1회 질의 가능하게 하고, (b) 검사 결과를 성공·실패 모두 캐시해 존당 1회·프로세스당 1회로 고정하며, (c) README에 "부팅 시 probe → 실패하면 `'UTC'`로 폴백" 패턴을 싣는다. `onIntlUnavailable` 옵션은 **두지 않는다** — probe가 이미 같은 선택지를 주면서 옵션 개수를 늘리지 않고, 렌더 경로마다 정책을 반복 서술하게 만들지도 않는다.
4. **Hermes 최소공배수 Intl만 쓴다.** 이 패키지가 호출하는 Intl 표면은 §1.2의 **2항목**이 전부다. `Intl.NumberFormat{style:'decimal'}`과 `Intl.DateTimeFormat`의 단일 숫자 필드는 둘 다 Hermes 지원 목록에 있다 `[문서 D]`. ⚠ **단, `hourCycle`/`hour12`는 `doc/IntlAPIs.md`에 한 번도 등장하지 않는다** — 지원 목록에도, iOS/Android 미지원 옵션 목록에도 없다 `[문서 D 재확인]`. 초판의 "셋 다 지원 목록에 있다"는 문장은 이 한 옵션에 대해 사실이 아니었다. §1.1 표에 `[unverified]` 행으로 올리고, §7-9에 잔존 리스크로 승격하며, §3.4의 Intl 자기검사가 이 실패를 **런타임에 결정적으로 탐지**한다. 금지 목록(§5.3 guard)이 정적 스캔으로 화이트리스트 밖 사용을 막는다 — "Node에서 테스트가 통과했다"가 "Hermes에서 동작한다"를 의미하지 않는 격차를 아키텍처로 막는다.
5. **런타임 의존성 0, 순수 함수, platform neutral.** Intl은 플랫폼 내장이므로 의존성이 아니다. React/RN/DOM/Node API를 일절 import하지 않는다 — admin(브라우저/RNW)·mobile(Hermes)·서버(Node) 셋 다 같은 빌드를 소비한다. **이 불변식은 선언이 아니라 강제된다**: `tsconfig.src.json`이 `types: []`·`lib: ["ES2022"]`로 `@types/node` 전역을 `src/**`에서 차단하고(§2.2), guard가 Node/DOM 전역 식별자를 스캔하며(§5.3), release-artifact 테스트가 `dist/**` 문자열까지 확인한다(§5.4). expo-media §2.4 V-A가 "빌드 tsconfig의 lib은 이 규율을 강제하지 못한다"를 실측으로 남긴 선례를 그대로 따른다.
6. **제품 카피는 표현 가능하되 내장하지 않는다.** `어제`·`방금 전`·7일 컷오프는 mobile 제품 결정이다. 라이브러리는 이를 옵션(`yesterdayLabel`·`justNowLabel`·`maxDays`)으로 표현 가능하게 하되 기본값으로 승격하지 않는다 (AGENTS.md §1 — 제품 copy는 소비 앱 소유).
7. **공개 옵셔널 필드는 전부 `?: T | undefined`, 입력 객체는 전부 `readonly`.** 모노레포 EOP 소비자 보호 규약 — expo-ui §2 → expo-media §1-7 → expo-auth §1-7 → expo-workouts §4가 모두 원칙 목록에 올린 계약이며, 초판은 이것만 빠져 있었다. 규약을 어기면 두 가지가 실제로 재현된다 `[실측 K]`: (a) EOP를 켠 소비 앱이 `string | undefined`를 옵셔널 필드에 넘기면 **TS2379로 컴파일이 깨지고**, (b) 제네릭 `fallback`에 `string | undefined`가 들어오면 `TFallback`이 `string | undefined`로 추론돼 **반환 타입이 조용히 `string | undefined`로 넓어진다**(기본값 `'-'`가 문자열을 보장한다는 §3 계약과 모순). 두 소비 앱 모두 `typescript: ~6.0.3`이고 루트 `tsconfig.base.json`이 `exactOptionalPropertyTypes: true`다 `[실측 E]`.

### 1.1 Intl 지원 매트릭스 (정본)

**타깃 런타임과 근거.**

- **Expo SDK 56 = react-native 0.85.3 = Hermes `hermes-v0.16.0`** — memorylog2 `node_modules/react-native/sdks/.hermesversion` `[실측 A]`.
- Android Hermes는 **Intl 켜서 빌드된다**: `ReactAndroid/hermes-engine/build.gradle.kts`의 `-DHERMES_ENABLE_INTL=True` + 주석 "We intentionally build Hermes with Intl support only" `[실측 B]`. 구현은 `lib/Platform/Intl/java` — 즉 Android는 `android.icu` 위임이다.
- RN 0.85의 `minSdk = 24` (`gradle/libs.versions.toml`) `[실측 C]` — 아래 표의 API < 24 결함은 Expo SDK 56 소비자에게 도달 불가.
- Node 20+: full-icu 기본 내장(공식 빌드 기준) — 커스텀 small-icu 빌드는 예외이나 이 저장소의 `engines: node >=20` 대상에서는 전제해도 된다.
- 브라우저(admin): 모던 브라우저는 아래 사용 표면 전부 지원.

**Hermes ECMA-402 지원 표** `[문서 D]` — facebook/hermes `doc/IntlAPIs.md`(main 브랜치, 2026-08-24 fetch). **주의: v0.16 태그 시점 문서와의 diff는 미확인 [unverified]** — 단 아래 "지원" 항목은 수년째 문서에 있던 안정 표면이고, 이 패키지는 지원 목록의 교집합만 쓰므로 방향은 안전하다.

| API / 옵션 | Hermes | 비고 |
|---|---|---|
| `Intl.NumberFormat` — `format`·`resolvedOptions`·`supportedLocalesOf` | ✅ 양 플랫폼 | `formatToParts`는 **Android 전용** |
| `Intl.DateTimeFormat` — `format`·`resolvedOptions`·`supportedLocalesOf` | ✅ 양 플랫폼 | **`formatToParts` 지원 목록에 없음** — 이 부재가 §3.4 구현 전략을 결정했다 |
| **`hourCycle` / `hour12`** | **`[unverified — 문서 D에 언급 없음]`** | **지원 목록에도, iOS/Android 미지원 목록에도 나오지 않는다.** 이 패키지의 IANA 경로 시각 렌더 전체가 여기 걸려 있다 → §7-9 리스크 + §3.4 자기검사 ③이 런타임 탐지 |
| `Intl.Collator`, `Intl.getCanonicalLocales`, `String/Number/Array/Date.prototype.toLocale*` | ✅ | 이 패키지는 미사용 |
| `Intl.RelativeTimeFormat` · `PluralRules` · `ListFormat` · `DisplayNames` · `Segmenter` · `Intl.Locale` · `DurationFormat` | ❌ 지원 목록에 없음 | 사용 금지 — guard 스캔 대상(§5.3) |
| iOS `NumberFormat` 옵션 | `notation:'compact'`·`'engineering'`·`compactDisplay`·`signDisplay` 미지원 | 이 패키지는 해당 옵션 미사용 (§0.6) |
| iOS `DateTimeFormat` 옵션 | `numberingSystem`·`formatMatcher` 미지원 | 미사용 |
| Android `DateTimeFormat` 옵션 | `dayPeriod`·`fractionalSecondDigits`·`formatMatcher` 미지원 | 미사용 |
| Android 11(API 30) | `NumberFormat`의 `style:'unit'`·compact·signDisplay·**currency 포맷 관련 결함** 보고 | **이 패키지는 `style:'currency'`를 더 이상 쓰지 않는다**(§0.6 마지막 두 행) — 초판의 §7-4 리스크는 소멸 |
| Android API 24–29 | 과학표기·`formatToParts` 파트 수·구 CLDR 편차 등 | 이 패키지 사용 표면과 무관 (과학표기·unit 미사용) |

### 1.2 이 패키지가 호출하는 Intl 전량 (전수 — 이 목록 밖 호출은 guard 위반)

1. `new Intl.NumberFormat(locales?, { style: 'decimal', maximumFractionDigits?, minimumFractionDigits? })` → `.format()` — `formatNumber`, `formatPercent`, `formatKrw`(**두 스타일 모두**).
2. `new Intl.DateTimeFormat('en-US', { timeZone, <단일 숫자 필드>, hourCycle: 'h23', hour12: false })` → `.format()` — IANA 시간대 wall-clock 분해(§3.4). **`formatToParts`가 아니라 `format`이다** — Hermes에 DateTimeFormat.formatToParts가 없기 때문. `hourCycle`과 `hour12`를 **함께** 지정한다: 스펙상 `hour12`가 우선하고 둘은 같은 결과(h23)를 지시하므로, 엔진이 어느 한쪽만 인식해도 정답이 나온다.

`'UTC'`·`'device'` 토큰 경로는 Intl을 **전혀 호출하지 않는다** (`getUTC*`/`get*` getter만) — 두 소스 앱의 실제 구현과 바이트 단위로 같은 계열이고, Hermes 편차의 영향권 밖이다. `parseIsoInstant`도 Intl을 쓰지 않으며 **`Date` 문자열 파서도 쓰지 않는다**(정규식 + `Date.UTC` 산술) — 엔진 파싱 편차가 이 패키지 안에 존재하지 않는다.

### 1.3 명명 규약

형제 패키지는 공개 타입에 도메인 접두를 붙인다 — expo-media는 `MediaError`·`MediaErrorCode`·`MediaUploadLimits`·`MediaMetadata`, expo-ui는 `CalendarDate`·`ButtonProps` `[실측 E]`. 두 소비 앱이 expo-ui·expo-media와 format을 **같은 파일에서 import**하므로 무접두 이름(`DateInput`·`RelativeBucket`)은 앱 타입과 충돌하기 쉽다. 0.x 단계인 지금이 비용 0의 유일한 시점이다.

1. **공개 타입은 전부 `Format` 접두.** `FormatDateInput`·`FormatTimeZone`·`FormatLocale`·`FormatError`·`FormatErrorCode`·`FormatRelativeBucket`·`FormatDecimalByteUnit`·`FormatBinaryByteUnit`.
2. **옵션 타입은 전부 `Format<Domain>Options`.** `FormatDateOptions`·`FormatRelativeKoOptions`·`FormatDurationKoOptions`·`FormatBytesOptions`·`FormatKrwOptions`·`FormatNumberOptions`·`FormatPercentOptions`·`IsoParseOptions`. 초판의 `*FormatOptions`/`*Options` 혼용을 없앤다. 특히 `NumberFormatOptions`는 §3.9가 "`Intl.NumberFormatOptions`의 passthrough가 **아니다**"라고 경고하는 대상과 이름이 같았다 — 그 이름은 쓰지 않는다.
3. **한국어 카피 함수는 `Ko` 접미.** 출력 문자열에 **한국어 리터럴이 박혀 있으면** `Ko`를 붙인다 — `formatRelativeKo`(`분 전`), `formatDurationKo`(`초`·`분`·`시간`). 예외는 `formatKrw`: `KRW`는 언어가 아니라 ISO 4217 통화 코드이고, 한국어 리터럴은 `style: 'suffix-ko'`라는 **옵션 값**에만 나타난다(`'symbol'` 경로의 출력 `₩1,000`에는 한국어가 없다). 즉 한국어성은 세 자리 중 정확히 한 자리에만 인코딩된다: 리터럴이 항상 나오면 이름, 스타일에 따라 나오면 옵션 값.
4. **`storageRatio`는 `format` 접두가 없다** — 문자열을 만들지 않는 산술이기 때문이다. 이 규칙이 §0.1 #5와 §3.9의 역할 분리를 이름으로 드러낸다.

---

## 2. 모듈 구조와 exports 맵

### 2.1 단일 `'.'` 엔트리로 충분한가 — 충분하다

서브패스 분리를 정당화하는 세 조건을 형제 패키지에서 역산하면: (a) optional peer 격리(`toss-payments-postgresql/nestjs`), (b) 플랫폼 조건 포크(`expo-media/device`의 node/browser), (c) 무겁고 선택적인 표면(`expo-media/testing`). 이 패키지는 **셋 다 없다** — peer 0, 플랫폼 분기 0(§1.2의 토큰 분기는 런타임 값 분기), 전 함수가 수 KB 순수 함수. `sideEffects: false` + ESM `treeshake`로 미사용 함수는 소비자 번들에서 탈락한다. 단일 `'.'` 확정. 훗날 다국어 카피 팩 같은 무거운 표면이 생기면 그때 additive 서브패스로 낸다(0.x minor).

### 2.2 디렉토리 트리

```
format/
├── package.json                # version 0.0.0 (§2.5)
├── tsconfig.json               # extends ../tsconfig.base.json, include: [src, tests] — 편집기/기본 검사
├── tsconfig.src.json           # include: [src], types: [], lib: ["ES2022"] — platform neutral 강제(§1-5)
├── tsconfig.tests.json         # include: [src, tests], @types/node 허용 (테스트가 process.env.TZ를 쓴다)
├── tsup.config.ts              # entry: ['src/index.ts'], esm+cjs, dts, target es2022, platform neutral
├── vitest.config.ts            # projects: unit / types (toss-payments-postgresql 복제)
├── README.md                   # 한국어 산문 — ```ts 블록 전부 check:readme가 dist 타입으로 컴파일
├── scripts/
│   ├── stamp-provenance.mjs    # 루트 scripts/stamp-package-provenance.mjs 위임 래퍼 (형제 복제)
│   ├── check-provenance.mjs    # 루트 check-package-provenance.mjs 위임 래퍼
│   └── check-readme.mjs        # expo-media 패턴 개조 — paths 매핑은 '.' 1개, JSX 분기 제거
├── src/
│   ├── index.ts                # 재수출 전용 (public 표면 = 이 파일의 export 전부)
│   ├── types.ts                # FormatDateInput · FormatTimeZone · FormatLocale
│   ├── errors.ts               # FormatError + 코드 3종 + isFormatError
│   ├── parse.ts                # parseIsoInstant (자체 ISO 파서 — 엔진 Date 문자열 파싱 미사용)
│   ├── zone.ts                 # (internal) IANA wall-clock 엔진 + 포매터 캐시 + Intl 자기검사 — canFormatTimeZone만 공개
│   ├── date.ts                 # formatDateTime · formatDateOnly · formatMonthDayTime
│   ├── relative.ts             # relativeBucket · formatRelativeKo
│   ├── duration.ts             # formatDurationKo
│   ├── bytes.ts                # formatBytes
│   ├── currency.ts             # formatKrw
│   ├── number.ts               # formatNumber · formatPercent · storageRatio
│   └── text.ts                 # formatText
└── tests/
    ├── unit/                   # *.test.ts — §5.1
    │   └── guards/             # source-guard · nodom-source-guard · release-artifact (§5.3·§5.4)
    └── types/                  # *.test-d.ts — §5.2
```

`tsconfig` 3분할은 형제 관행이다 — expo-media·expo-workouts의 `typecheck`은 3~4개 프로젝트를 돌리고, expo-auth는 2개다 `[실측 E]`. 초판은 1개였고, `devDependencies`의 `@types/node`가 `src/**`에서도 그대로 보였다. 그 상태에서는 `process.env`·`Buffer`가 `src`에 들어와도 타입 검사가 통과하고 Hermes에서만 크래시한다.

### 2.3 package.json (확정 형태)

```jsonc
{
  "name": "@gj-kit/format",
  "version": "0.0.0",
  "description": "명시성 강제 포매팅 유틸 — 시간대·로케일·통화 스타일·바이트 단위를 전부 명시 인자로 받아, 로컬/UTC·₩/원 같은 앱 간 표기 불일치를 타입으로 차단한다. 런타임 의존성 0, Hermes 안전 Intl 부분집합만 사용",
  "keywords": ["format", "formatter", "intl", "timezone", "hermes", "react-native", "expo", "korean", "krw", "bytes"],
  "homepage": "https://github.com/gj-kit/gj-kit/tree/main/format",
  "repository": { "type": "git", "url": "git+https://github.com/gj-kit/gj-kit.git", "directory": "format" },
  "bugs": { "url": "https://github.com/gj-kit/gj-kit/issues" },
  "license": "MIT",
  "type": "module",
  "sideEffects": false,
  "engines": { "node": ">=20" },
  "publishConfig": { "access": "public" },
  "files": ["dist"],
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./package.json": "./package.json"
  },
  "scripts": {
    "build": "tsup && node scripts/stamp-provenance.mjs",
    "prepack": "npm run build && node scripts/check-provenance.mjs --require-clean",
    "typecheck": "tsc --noEmit -p tsconfig.src.json && tsc --noEmit -p tsconfig.tests.json",
    "test": "vitest run --project unit",
    "test:types": "vitest run --project types",
    "check:readme": "corepack pnpm run build && node scripts/check-readme.mjs",
    "test:all": "pnpm run test && pnpm run test:types"
  },
  "devDependencies": { "@types/node": "^24", "tsup": "^8", "typescript": "~6.0.3", "vitest": "^3" }
}
```

- **peerDependencies 없음** — gj-kit 최초의 peer 0 패키지.
- **`typescript: "~6.0.3"` 확정.** 초판의 `^5`는 서버 전용 패키지(toss-payments, toss-payments-postgresql)의 관행이고, RN/Expo 소비자를 갖는 형제(expo-media·expo-workouts·expo-auth)는 전부 `~6.0.3`이다 `[실측 E]`. 실제 소비 앱도 `~6.0.3`이다. **컴파일러 버전 차이가 설계안의 타입 주장을 뒤집은 전례가 이 저장소에 있다** — expo-workouts §0 V2는 TS 6.0.3 실측으로 초안의 `@ts-expect-error` 픽스처가 그 자체로 컴파일 실패함을 밝혀냈다. §4·§5.2 픽스처는 6.0.3에서 검증된다(§4 검증 방법 열).
- **`publishConfig.access: "public"`·`keywords` 확정.** 초판은 "넣어도 무해 — 구현 시 형제 최신 관행을 따른다"로 미결이었고, 이는 "(확정 형태)"라는 절 제목과 어긋났다. 형제 2종(expo-media·expo-workouts)에 둘 다 존재한다 `[실측 E]`.
- tsup: `entry: ['src/index.ts']`, `format: ['esm','cjs']`, `dts`, `sourcemap`, `clean`, `target: 'es2022'`(형제 동일 — Expo 소비자는 babel이 node_modules를 변환), `platform: 'neutral'`, `treeshake: true`. external 불필요(peer 0).

### 2.4 provenance / prepack 배선 (형제 패턴 복제)

- `scripts/stamp-provenance.mjs`·`check-provenance.mjs`는 toss-payments-postgresql의 **루트 위임 래퍼를 그대로 복제**한다 — 구현은 루트 `scripts/stamp-package-provenance.mjs`/`check-package-provenance.mjs`가 소유하고, 래퍼는 패키지 루트를 cwd로 공급한다.
- `build`가 `dist/gj-kit-provenance.json`을 스탬프하고, `prepack`이 `--require-clean`으로 dirty tree pack을 차단한다. AGENTS.md §3 — provenance 검증 우회 금지.

### 2.5 버전·changeset (03e4c50 선례)

`package.json`은 `version: "0.0.0"`으로 커밋하고 minor changeset을 동봉한다 — `changeset version`이 0.1.0을 만든다 (toss-payments-postgresql 도입 커밋 03e4c50과 동일 경로).

`.changeset/format-v0-1.md`:

```md
---
"@gj-kit/format": minor
---

신규 패키지 — memorylog2 admin/mobile에 3중복돼 있던 포매팅 유틸의 통합. 두 앱이 갈라진 축(로컬/UTC 시간대, ₩1,000/1,000원 통화 표기, 날짜 구분자, 상대시간 카피, 바이트 단위 표기, 0바이트 처리)을 전부 **필수 옵션**으로 승격해, 어느 쪽도 조용한 기본값이 되지 않게 한다.

- 날짜 3종(`formatDateTime`·`formatDateOnly`·`formatMonthDayTime`): `timeZone`('UTC'|'device'|IANA) 필수 — 생략은 컴파일 에러. 입력은 `Date | number`(instant)만 받는다.
- `parseIsoInstant`: offset 없는 ISO 문자열의 해석(`assumeNoOffset: 'utc'|'device'|'reject'`)을 필수 축으로 만든다 — 같은 문자열이 기기마다 다른 순간이 되던 문제를 호출부에 드러낸다. 자체 파서라 엔진 편차가 없다.
- 상대시간(`formatRelativeKo`·`relativeBucket`): `now` 명시 — 시계 없는 순수 함수. 두 앱의 카피 차이(공백·방금 전·어제·7일 컷오프)를 옵션으로 전부 표현.
- `formatKrw`: `style: 'symbol' | 'suffix-ko'` + `locale` 필수. 출력 형태는 로케일에 위임하지 않는다(`₩` 글리프·위치 고정).
- `formatBytes`: `system: 'decimal' | 'binary'` 필수(KB vs KiB), `nonPositive` 필수, 단위별 `fractionDigits`로 네 소스 구현의 반올림 정책을 표현.
- 런타임 의존성 0. Intl은 Hermes(Expo SDK 56 / RN 0.85) 지원 부분집합만 사용 — `DateTimeFormat.formatToParts`·`RelativeTimeFormat` 등 미지원 API는 guard 테스트가 정적으로 금지하고, 런타임 Intl 결함은 프로세스 1회 자기검사가 탐지한다(`canFormatTimeZone`으로 사전 질의 가능).
- 값 오류(null·invalid)는 `fallback` 반환, 설정 오류(잘못된 IANA 이름)는 typed `FormatError`로 즉시 throw.
```

---

## 3. 공개 API 전체 시그니처

`src/index.ts`가 재수출하는 전부다. 여기 없는 심볼은 internal이며 deep import 불가(§2 exports가 차단). JSDoc은 영어(공개 계약), 설계 해설은 한국어 주석. **모든 옵셔널 필드는 `?: T | undefined`, 모든 입력 객체는 `readonly`**(§1-7).

### 3.1 공유 타입 — `src/types.ts`

```ts
/**
 * Accepted date inputs: an instant, never a wall-clock string.
 *
 * Strings are deliberately absent. `new Date('2026-06-08T09:05:00')` resolves
 * an offset-less string against the *device* zone, so the same API payload
 * becomes a different instant on different phones — and no `timeZone` option
 * can undo that, because it happened before the formatter saw the value.
 * Parse strings with {@link parseIsoInstant}, which makes that choice explicit.
 */
export type FormatDateInput = Date | number;

/**
 * Explicit time zone selector. There is deliberately no default:
 * - `'UTC'`        — UTC wall clock (no Intl involved).
 * - `'device'`     — the runtime's local time (no Intl involved). This is an
 *                    explicit opt-in, not a silent fallback: the dependency on
 *                    device state is visible at every call site.
 * - IANA zone name — e.g. `'Asia/Seoul'`; resolved via `Intl.DateTimeFormat`.
 *                    An unknown name throws `FormatError('ERR_TIMEZONE_INVALID')`.
 *                    Ask {@link canFormatTimeZone} first if the runtime's Intl
 *                    is not known to be healthy.
 */
export type FormatTimeZone = 'UTC' | 'device' | (string & {});

/**
 * Explicit locale selector for the Intl-backed formatters.
 *
 * It selects **digit grouping and the decimal separator only**. Currency
 * symbols, symbol position and the percent sign are pinned by this package and
 * do not vary with the locale — see {@link formatKrw} and {@link formatPercent}.
 * `'device'` opts into the runtime default locale (grouping then varies by
 * device settings — an explicit, visible choice).
 */
export type FormatLocale = 'device' | (string & {}) | readonly string[];
```

### 3.2 ISO 파싱 — `src/parse.ts`

초판은 파싱을 "출력 전용 패키지이므로 제외"했다. 그 결정은 **문자열을 포매터 인자에서 빼는 근거**는 되지만, 문자열을 받아 `Date` 생성자로 조용히 삼키는 것을 정당화하지 못한다. 지금 표면은 정확히 그 구분을 따른다 — 포매터는 instant만 받고, 파싱은 **명시적으로 호출해야 하는 함수 하나**로 분리된다.

```ts
export interface IsoParseOptions {
  /**
   * Required policy for ISO strings that carry no UTC offset, e.g.
   * `'2026-06-08T09:05:00'`. There is no safe default: the `Date` constructor
   * resolves these against the device zone, so the same string is a different
   * instant on a Seoul phone (`00:05Z`) and a New York phone (`13:05Z`).
   * - `'utc'`    — read the wall clock as UTC.
   * - `'device'` — read it as device-local time. Same behaviour the source apps
   *                had, now spelled out at the call site.
   * - `'reject'` — return null; the caller renders its fallback.
   *
   * Date-only strings (`'2026-06-08'`) are always UTC midnight — that reading is
   * unambiguous per ECMA-262 and this option does not affect them.
   */
  readonly assumeNoOffset: 'utc' | 'device' | 'reject';
}

/**
 * Strict ISO 8601 → instant. Returns null for null/undefined/empty input and
 * for anything outside the accepted grammar — parsing failure is a data error,
 * never a throw.
 *
 * Accepted: `YYYY-MM-DD` | `YYYY-MM-DD(T| )HH:mm[:ss[.fff]][Z|±HH:MM|±HHMM]`,
 * year 1–9999, calendar-valid components (no rollover: `'2026-02-30'` is null).
 *
 * Implemented with a regular expression and `Date.UTC` arithmetic — the engine's
 * own string parser is never used, so the result does not vary between V8,
 * JavaScriptCore and Hermes the way `new Date(str)` does.
 */
export function parseIsoInstant(
  value: string | null | undefined,
  options: IsoParseOptions,
): Date | null;
```

- `assumeNoOffset: 'device'`는 로컬 필드 생성자(`new Date(y, m - 1, d, h, min, s, ms)`)로 만든다 — 기기 시간대를 읽는 유일한 경로이며 호출부에 글자로 남는다.
- `'utc'`·offset 명시·date-only는 `Date.UTC` 산술이다 — 순수하고 결정적이다.
- **에러 코드를 새로 만들지 않는다.** 초판 리뷰는 `ERR_DATE_INPUT_AMBIGUOUS` throw를 제안했으나, 문자열이 포매터에 도달할 수 없게 된 이상 애매한 입력은 "파싱 실패"라는 **데이터 오류**로만 존재한다 → `null` 반환 + 호출부 폴백. §1-3의 3분류를 어기지 않는 최소 표면이다.

### 3.3 에러와 환경 probe — `src/errors.ts`

```ts
/** Stable machine-readable codes. Never emitted for data problems. */
export type FormatErrorCode =
  /** Configuration error: `timeZone` is not 'UTC' | 'device' | a zone name the
   *  runtime's Intl accepts. A programmer can fix this. */
  | 'ERR_TIMEZONE_INVALID'
  /** Configuration error: `locale` is not a tag the runtime's Intl accepts
   *  (`'ko_KR'`, `'en US'`, `'ko-KR-'`). `FormatLocale` accepts any string, so
   *  this is the runtime half of that axis. A programmer can fix this. */
  | 'ERR_LOCALE_INVALID'
  /** Configuration error: `minimumFractionDigits`/`maximumFractionDigits` is not
   *  an integer in 0–100, or the minimum exceeds the maximum. A programmer can
   *  fix this. */
  | 'ERR_FRACTION_DIGITS_INVALID'
  /** Environment error: the runtime's Intl failed this package's self-test —
   *  it ignores the `timeZone` option, or ignores `hourCycle`/`hour12`.
   *  A programmer cannot fix this; ask {@link canFormatTimeZone} up front. */
  | 'ERR_INTL_UNUSABLE'
  /** Environment error: a single-field formatter produced a non-numeric or
   *  out-of-range string for this specific zone. */
  | 'ERR_INTL_FIELD_OUTPUT';

/**
 * Thrown for configuration and environment errors only. Data problems — null,
 * invalid dates, NaN, unparsable strings — never throw; they render `fallback`.
 */
export class FormatError extends Error {
  readonly code: FormatErrorCode;
  constructor(code: FormatErrorCode, message: string);
}

/** Type guard usable across realms/bundles. */
export function isFormatError(value: unknown): value is FormatError;

/**
 * Non-throwing probe: can this runtime render the given zone?
 *
 * `'UTC'` and `'device'` are always true (no Intl involved). For an IANA name it
 * runs the same checks the formatters run and returns false instead of throwing,
 * so an app can decide its own policy once at boot — e.g.
 * `const zone = canFormatTimeZone('Asia/Seoul') ? 'Asia/Seoul' : 'UTC'`.
 *
 * Results are cached: the process-wide Intl self-test runs at most once, and each
 * zone is checked at most once. Repeated calls are a map lookup.
 */
export function canFormatTimeZone(timeZone: FormatTimeZone): boolean;
```

`isFormatError`는 형제 패키지 관행대로 `instanceof` 대신 태그 검사(예: `Symbol.for('gj-kit.format.error')` 프로퍼티)로 구현해 듀얼 번들(ESM+CJS 동시 로드) 환경에서도 참을 유지한다.

### 3.4 날짜 3종 — `src/date.ts` (+ internal `src/zone.ts`)

```ts
export interface FormatDateOptions<TFallback = string> {
  /** Required. See {@link FormatTimeZone} — omission is a compile error. */
  readonly timeZone: FormatTimeZone;
  /**
   * Required separator between year/month/day segments.
   * The source apps disagreed (`2026-06-08` vs `2026.06.08`), so neither
   * spelling is a silent default.
   */
  readonly separator: '-' | '.';
  /**
   * Rendered for null/undefined/invalid input and for years outside 1–9999.
   * Default `'-'`.
   */
  readonly fallback?: TFallback | undefined;
}

/**
 * `YYYY-MM-DD HH:mm` (or `YYYY.MM.DD HH:mm`) in the given zone. 24-hour clock,
 * no seconds. Month, day, hour and minute are always two digits; the year is
 * rendered unpadded (`999-06-08`), matching the source apps and keeping the
 * IANA path byte-identical to the `'UTC'`/`'device'` paths. Column width is
 * therefore fixed for years 1000–9999, which is the range real data occupies.
 */
export function formatDateTime<TFallback = string>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
): string | TFallback;

/** `YYYY-MM-DD` (or `YYYY.MM.DD`) — date without the time-of-day. */
export function formatDateOnly<TFallback = string>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
): string | TFallback;

/** `MM-DD HH:mm` (or `MM.DD HH:mm`) — dense tables covering a short window. */
export function formatMonthDayTime<TFallback = string>(
  value: FormatDateInput | null | undefined,
  options: FormatDateOptions<TFallback>,
): string | TFallback;
```

**구현 각서 ① — 필드 폭.** 초판은 "`padStart` 재적용"만 적고 **폭을 말하지 않았다**. 폭이 미명세면 IANA 경로와 UTC/device 경로가 같은 인스턴트에 다른 문자열을 낼 수 있다.

- `month`·`day`·`hour`·`minute` → **2자리 zero-pad**. 방어가 필요하다: Node에서 `{ minute: '2-digit' }` 단독 출력은 실제로 `"5"`를 반환한다 `[실측 J]` — `2-digit` 요청이 단일 필드에서 지켜지지 않는다.
- `year` → **패딩 없음**. 소스 앱들이 `getFullYear()`를 그대로 쓰고, Node의 `{ year: 'numeric' }`도 999년에 `"999"`를 반환하므로 `[실측 J]` 두 경로가 자연히 일치한다. 4자리 패딩을 넣으면 IANA 경로만 `0999`가 되어 경로 간 불일치가 생긴다.
- **지원 연도 범위는 1–9999**다(expo-ui `CalendarDate`의 키 공간과 같다). 범위 밖은 `fallback` — 값 오류이므로 던지지 않는다(§0.4-⑩). 범위를 닫는 이유는 en-US `year:'numeric'`이 서기 1년 이전에 era 접미(`"1 BC"`)를 붙일 수 있어 순수 숫자 가정이 깨지기 때문이다.

**구현 각서 ② — IANA wall-clock 엔진 (`src/zone.ts`, internal).**

- `'UTC'` → `getUTCFullYear()` 등 getter 5종. `'device'` → `getFullYear()` 등. **Intl 무관** — mobile `formatUtcDate`·admin `date`와 동일 계열.
- 그 외 IANA 문자열 → `Intl.DateTimeFormat.formatToParts`가 Hermes에 없으므로(§1.1) **단일 필드 포매터 5종**을 쓴다: `new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' })`, `{ month: '2-digit' }`, `{ day: '2-digit' }`, `{ hour: '2-digit', hourCycle: 'h23', hour12: false }`, `{ minute: '2-digit' }` — 각각 `.format(date)`가 순수 숫자 문자열을 반환한다. 합성 문자열 파싱(`'en-CA'` 트릭 등)보다 로케일 데이터 변동에 훨씬 둔감하다.
- 캐시: `Map<string /* timeZone */, ZoneFormatters>` 모듈 레벨 캐시. 포매터 생성은 비싸고(수 ms) `.format()`은 싸다 — 테이블 수백 행 렌더의 실효 비용을 고정한다. 상한 초과 시 LRU 축출(§7-7).

**구현 각서 ③ — Intl 자기검사: 모양이 아니라 값을 본다.**

초판의 sanity check는 `/^\d+$/`만 봤다. 그것은 **이 패키지가 막으려는 실패를 구조적으로 탐지하지 못한다**: 엔진이 `timeZone`을 무시하고 기기 wall-clock을 돌려주면 출력은 여전히 순수 숫자라 검사를 통과하고, `formatDateTime(v, { timeZone: 'Asia/Seoul' })`이 조용히 기기 로컬 시각을 렌더한다 — §0.3 축 ①의 버그가 라이브러리 안에서 부활하며, 호출부에는 IANA 이름이 적혀 있으니 리뷰로도 안 잡힌다. 값 비교는 비용이 같은데 탐지력만 버린 셈이다.

**프로세스 1회 자기검사** (첫 IANA 사용 시 실행, 성공·실패 모두 캐시). 프로브 인스턴트 `P = 2021-01-01T00:00:00Z`, `Q = 2021-01-01T13:05:00Z`(둘 다 DST 무관).

| 검사 | 기대값 | 잡는 실패 |
|---|---|---|
| ① `timeZone:'UTC'`로 P의 5필드 | `getUTC*`와 **정확히 일치** | `timeZone` 옵션 무시(기기 로컬 반환) — 기기가 UTC+0이 아닐 때 |
| ② `timeZone:'Etc/GMT-9'`(= UTC+9 고정)로 P | 정확히 `2021`/`01`/`01`/`09`/`00` `[실측 L]` | 동일 실패 — 기기가 UTC+9일 때. **한 기기가 ①②를 동시에 통과시킬 수 없으므로 쌍이 결정적이다** |
| ③ `timeZone:'UTC'`로 Q의 hour | 정확히 `'13'` `[실측 L]` | `hourCycle`/`hour12` 무시(h11/h12 폴백) — 이 검사가 없으면 13시가 `'01'`로 조용히 렌더된다(§1-4·§7-9) |

- 실패 → `FormatError('ERR_INTL_UNUSABLE')`.
- ②의 존 이름을 엔진이 거부하면(생성자 `RangeError`) ②는 **결론 없음**으로 처리하고 ①③만으로 판정한다 — 그 축소된 탐지력을 §7-10에 리스크로 남긴다.

**존별 검사** (캐시 미스 1회, 성공·실패 모두 캐시).

- 5필드가 전부 `/^\d+$/`.
- 필드를 `Date.UTC(...)`로 재합성한 값과 P의 차가 **정확히 분 단위 정수**이고 `-12:00 ~ +14:00` 범위 안. (1970년 이후 모든 IANA 오프셋은 정수 분이다.)
- 실패 → `FormatError('ERR_INTL_FIELD_OUTPUT')`. 잘못된 zone 이름은 생성자 단계의 `RangeError`를 잡아 `FormatError('ERR_TIMEZONE_INVALID')`로 감싼다.
- 이 검사들이 **존당 1회**라는 것이 §1-3(c)의 계약이다 — 테이블 수백 행 렌더 도중 반복 비용도, 반복 throw도 없다.

### 3.5 상대시간 — `src/relative.ts`

```ts
/** Structured relative-time classification; render copy yourself or via formatRelativeKo. */
export type FormatRelativeBucket =
  | { readonly kind: 'future'; readonly ms: number }
  | { readonly kind: 'just-now'; readonly seconds: number }
  | { readonly kind: 'minutes'; readonly count: number }
  | { readonly kind: 'hours'; readonly count: number }
  | { readonly kind: 'days'; readonly count: number }
  | { readonly kind: 'months'; readonly count: number }
  | { readonly kind: 'years'; readonly count: number };

/**
 * Pure bucket selection against an explicit clock. Returns null for
 * null/undefined/invalid input. Thresholds: <60s just-now, <60m minutes,
 * <24h hours, <30d days, <12mo months, then years.
 *
 * Calendar-unaware by construction: a month is exactly 30 days and a year is
 * exactly 12 such months — 360 days, not 365. This reproduces both source apps
 * bit for bit; see §7-6 for the size of the drift it accepts.
 */
export function relativeBucket(
  value: FormatDateInput | null | undefined,
  now: Date,
): FormatRelativeBucket | null;

export type FormatRelativeKoOptions = {
  /** Required explicit clock — this family never reads `new Date()` itself. */
  readonly now: Date;
  /** Required: `true` → `'3분 전'`, `false` → `'3분전'`. The apps disagreed. */
  readonly suffixSpace: boolean;
  /** Required: rendered for null/invalid input. The apps disagreed (`''` vs `'-'`). */
  readonly fallback: string;
  /**
   * Required policy for timestamps after `now`:
   * `'empty'` returns `''`; a function renders an absolute form instead.
   */
  readonly onFuture: 'empty' | ((date: Date) => string);
  /** Label for the <60s bucket. Default `'방금'`. */
  readonly justNowLabel?: string | undefined;
  /** When set, the 1-day bucket renders this literal (e.g. `'어제'`) instead of `'1일 전'`. */
  readonly yesterdayLabel?: string | undefined;
} & (
  | { readonly maxDays?: undefined; readonly onOverflow?: undefined }
  | {
      /** Elapsed days >= maxDays switch to onOverflow (e.g. 7 → absolute date). */
      readonly maxDays: number;
      /** Required together with maxDays — there is no built-in absolute rendering. */
      readonly onOverflow: (date: Date) => string;
    }
);

/** Korean relative time. Both app renderings are expressible; neither is a default. */
export function formatRelativeKo(
  value: FormatDateInput | null | undefined,
  options: FormatRelativeKoOptions,
): string;
```

- admin 재현: `{ now, suffixSpace: true, fallback: '', onFuture: 'empty' }`.
- mobile 재현: `{ now, suffixSpace: false, fallback: '-', justNowLabel: '방금 전', yesterdayLabel: '어제', maxDays: 7, onFuture: d => formatDateTime(d, { timeZone: 'device', separator: '.' }), onOverflow: d => formatDateOnly(d, { timeZone: 'device', separator: '.' }) }`.
- `maxDays`/`onOverflow`의 쌍 강제는 인터섹션-유니언 타입으로 구현 — 절대시각 렌더링을 라이브러리가 임의로 정하는 일이 타입상 불가능하다(§4-6, `[실측 K]`로 확인).

### 3.6 소요시간 — `src/duration.ts`

```ts
export interface FormatDurationKoOptions<TFallback = string> {
  /** Rendered for NaN/negative/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * Elapsed milliseconds as Korean text: `'0.8초'`, `'5분'`, `'1.2시간'`.
 * Takes a duration, not two timestamps — clock-free like the rest of the family.
 */
export function formatDurationKo<TFallback = string>(
  milliseconds: number,
  options?: FormatDurationKoOptions<TFallback>,
): string | TFallback;
```

admin `duration(from, to)`는 파싱을 겸했다 — 라이브러리는 ms 원시값만 받고, 타임스탬프 차는 호출부가 계산한다(§0.1 #12).

### 3.7 바이트 — `src/bytes.ts`

```ts
export type FormatDecimalByteUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB';
export type FormatBinaryByteUnit = 'B' | 'KiB' | 'MiB' | 'GiB' | 'TiB' | 'PiB';

/** Exact fraction digits above the B unit. */
type ByteFractionDigits = 0 | 1 | 2;

export type FormatBytesOptions<TFallback = string> = {
  /** Required: `'1.5 GB'` vs `'1.5GB'` — the source apps disagreed. */
  readonly unitSpace: boolean;
  /**
   * Required policy for zero and negative input — the source apps disagreed and
   * the difference is visible: admin renders `'0 B'`/`'-5 B'`, mobile treats
   * anything `<= 0` as "size unknown" and hides the chip.
   * `'render'` formats the value; `'fallback'` returns `fallback`.
   */
  readonly nonPositive: 'render' | 'fallback';
  /**
   * How trailing zeros are handled. Default `'keep'`.
   * - `'keep'`       → `'1.0 GB'` — fixed column width (`toFixed` semantics).
   * - `'trim'`       → `'1GB'` — drops trailing zeros after rounding.
   * - `'trim-exact'` → drops the fraction only when the value was an exact
   *                    integer *before* rounding, so `1.04 GB` still renders
   *                    `'1.0GB'`. This is not the same as `'trim'`; it is what
   *                    `Number.isInteger(v) ? v : v.toFixed(1)` does.
   */
  readonly trailingZeros?: 'keep' | 'trim' | 'trim-exact' | undefined;
  /** Values >= this (in the chosen unit) render as integers (e.g. 10 → `'12MB'`). */
  readonly wholeNumberFrom?: number | undefined;
  /** Rendered for null/undefined/non-finite input, and for non-positive input
   *  when `nonPositive` is `'fallback'`. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
} & (
  | {
      /** Decimal SI: 1 KB = 1000 B. Unit labels KB/MB/…/PB. */
      readonly system: 'decimal';
      /**
       * Exact fraction digits above the B unit — a single value, or a per-unit
       * map when the policy differs by unit. Default 1.
       * The per-unit form exists because a real source app rounds MB to whole
       * numbers while giving GB/TB one decimal, and no numeric threshold can
       * separate those two ranges (both span 1–999 in their own unit).
       */
      readonly fractionDigits?:
        | ByteFractionDigits
        | Partial<Record<FormatDecimalByteUnit, ByteFractionDigits>>
        | undefined;
      readonly minUnit?: FormatDecimalByteUnit | undefined;
      readonly maxUnit?: FormatDecimalByteUnit | undefined;
    }
  | {
      /** Binary: 1 KiB = 1024 B. Unit labels KiB/MiB/…/PiB. */
      readonly system: 'binary';
      readonly fractionDigits?:
        | ByteFractionDigits
        | Partial<Record<FormatBinaryByteUnit, ByteFractionDigits>>
        | undefined;
      readonly minUnit?: FormatBinaryByteUnit | undefined;
      readonly maxUnit?: FormatBinaryByteUnit | undefined;
    }
);

/**
 * Byte quantity with an explicit unit system. `system: 'decimal'` divides by
 * 1000 and labels KB/MB; `system: 'binary'` divides by 1024 and labels
 * KiB/MiB — the label always tells the truth about the divisor.
 */
export function formatBytes<TFallback = string>(
  value: number | null | undefined,
  options: FormatBytesOptions<TFallback>,
): string | TFallback;
```

`system`과 단위 라벨을 유니언으로 묶어 `{ system: 'binary', maxUnit: 'GB' }` 같은 **거짓말하는 라벨이 컴파일되지 않는다** — 리터럴에서도, 변수 간접에서도, 단위별 `fractionDigits` 맵의 키에서도 차단된다(§4-5, `[실측 K]`). 네 소스 구현 재현 파라미터는 §0.1 #4·#13·#14 · §0.2 #20.

**연산 순서와 반올림 — 명세한다.** 초판은 `fractionDigits`를 "Max fraction digits"라고 적어 `trailingZeros`(당시 `trimZeroFraction`)를 무의미하게 만들고 admin의 고정폭 `toFixed(1)`을 표현 불가능하게 했다. 지금 정의는 **exact(`toFixed` 의미)**이고, 후행 0 처리는 `trailingZeros`가 단독으로 소유한다.

1. **단위 선택 → 반올림** 순서다. 반올림 결과가 1000(또는 1024)을 넘어도 **단위를 재승격하지 않는다** — 두 소스 앱 모두 그렇고, 실제로 아티팩트를 낸다: `999999 B`가 admin에서 `'1000.0 KB'`, mobile `formatBytes`에서 `'1000KB'`다 `[실측 F]`(`'1.0 MB'`가 아니다). 소스 동치가 우선 계약이므로 이 아티팩트를 보존하고 §5.1 경계값에 못 박는다.
2. 단위 선택은 `value >= threshold` 비교를 **부호 있는 값**에 적용한다 — 그래서 음수는 항상 최소 단위에 머문다(`-5000` → `'-5000 B'`, admin 동치).
3. 반올림 연산은 소스와 동일하게 `toFixed`/`Math.round`를 그대로 쓴다. 즉 half-way 처리도 이진 부동소수 표현을 따른다(`(1.005).toFixed(2) === '1.00'`) — "half-up으로 정규화"하지 **않는다**. 골든이 소스와 어긋나지 않게 하려면 이 선택이 필요하다.
4. 반올림 결과가 `-0`이면 `0`으로 정규화한다(`'-0MB'` 방지). §3.8·§3.9도 같은 규칙을 쓴다.
5. `B` 단위는 항상 정수다(`fractionDigits`와 무관) — 세 소스 구현 공통.

### 3.8 통화 — `src/currency.ts`

```ts
export interface FormatKrwOptions<TFallback = string> {
  /**
   * Required rendering style — the source apps disagreed:
   * `'symbol'` → `'₩1,000'`, `'suffix-ko'` → `'1,000원'`.
   */
  readonly style: 'symbol' | 'suffix-ko';
  /**
   * Required **grouping** locale; `'device'` is the explicit opt-in to the
   * runtime default. It selects grouping and the decimal separator only — the
   * `₩` glyph, its position and the `원` suffix are fixed by this package and
   * never vary with the locale.
   */
  readonly locale: FormatLocale;
  /** Rendered for null/undefined/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * Korean won. Fractions are never shown — KRW has no minor unit, so the value is
 * rounded to whole won first (`1000.5` → `'₩1,001'`). Negative values render the
 * sign before the symbol (`'-₩1,000'`).
 */
export function formatKrw<TFallback = string>(
  value: number | null | undefined,
  options: FormatKrwOptions<TFallback>,
): string | TFallback;
```

**`'symbol'`은 Intl currency 스타일을 쓰지 않는다.** 초판은 `locale`을 "grouping locale"이라 부르면서 `style:'currency'`를 쓰게 했는데, 그 경로에서 locale은 그룹핑뿐 아니라 **기호 글리프와 위치**를 정한다 — `ko-KR`/`en-US`/`ja-JP` → `₩1,000`, `de-DE` → `1.000 ₩`, `fr-FR` → `1 000 ₩`, **`es-ES` → `1000 KRW`** `[실측 G]`. 즉 타입을 통과하는 `{ style:'symbol', locale:'device' }`가 해외 기기에서 `1000 KRW`를 렌더할 수 있었고, 이는 §0.3 ②·③을 required로 올린 목적을 조합 하나로 무너뜨린다.

구현은 `Intl.NumberFormat(locale, { style: 'decimal', maximumFractionDigits: 0 })`로 절대값을 그룹핑하고 `(음수면 '-') + '₩' + 숫자`를 합성한다. `ko-KR`에서 admin `won`과 **바이트 단위로 같다** — `1000`→`₩1,000`, `-1000`→`-₩1,000`, `1000.5`→`₩1,001`, `1234567`→`₩1,234,567` `[실측 G]`. 유일한 차이는 `-0`이며 §0.4-③에 기록했다. 부수 효과로 §1.1의 Android 11 currency 결함이 이 패키지의 영향권에서 완전히 빠진다.

`'suffix-ko'`는 같은 decimal 포매터 + 리터럴 `'원'`이다. mobile `formatCurrency`와 비정수 금액에서 갈라지는 점은 §0.4-⑦.

### 3.9 수·비율·텍스트 — `src/number.ts` · `src/text.ts`

```ts
export interface FormatNumberOptions<TFallback = string> {
  /** Required grouping locale; `'device'` opts into the runtime default. */
  readonly locale: FormatLocale;
  /** Default: Intl's own default (max 3). */
  readonly maximumFractionDigits?: number | undefined;
  readonly minimumFractionDigits?: number | undefined;
  /** Rendered for null/undefined/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/** Locale-grouped plain number (`12,345`). Deliberately NOT a passthrough to
 *  `Intl.NumberFormatOptions` — only Hermes-safe options are accepted. */
export function formatNumber<TFallback = string>(
  value: number | null | undefined,
  options: FormatNumberOptions<TFallback>,
): string | TFallback;

/** Usage as a 0–1 fraction, or null when the limit is missing/zero/invalid.
 *  Arithmetic, not rendering — pair it with {@link formatPercent}. */
export function storageRatio(
  used: number | null | undefined,
  limit: number | null | undefined,
): number | null;

export interface FormatPercentOptions<TFallback = string> {
  /** Required grouping locale — grouping and decimal separator only. */
  readonly locale: FormatLocale;
  /** Exact fraction digits. Default 0 (`'63%'`). */
  readonly fractionDigits?: 0 | 1 | 2 | undefined;
  /** Rendered for null/undefined/non-finite input. Default `'-'`. */
  readonly fallback?: TFallback | undefined;
}

/**
 * A 0–1 fraction as a percentage: `0.63` → `'63%'`. Closes the
 * `storageRatio` → screen pipe inside this package.
 *
 * The `%` sign is a literal suffix with no space, pinned like the `₩` glyph in
 * {@link formatKrw} — `Intl`'s own percent style moves and spaces the sign by
 * locale (`fr-FR` renders `63 %` with a no-break space).
 */
export function formatPercent<TFallback = string>(
  ratio: number | null | undefined,
  options: FormatPercentOptions<TFallback>,
): string | TFallback;

/** `'-'` (or the given fallback) for null/undefined/empty-string; String(value) otherwise. */
export function formatText(
  value: string | number | null | undefined,
  fallback?: string,
): string;
```

**`formatPercent` 채택 근거.** 초판은 산술(`storageRatio`)만 export하고 그것을 화면에 올리는 포매팅을 뺐다 — format 패키지에서 책임이 뒤집힌 유일한 지점이었고, §6-6이 약속한 "한 줄 조합" README 레시피에도 `Math.round(ratio * 100)`이 앱 코드로 남았다. 실제로 admin에는 같은 식이 **4곳에 복제**돼 있다: `src/format.ts:41`(private `percent`)·`app/users.tsx:407`·`src/ui.tsx:423`·`src/ui.tsx:451` `[실측 E]`. `fractionDigits: 0`이 admin 전량을 바이트 단위로 재현한다.

---

## 4. 오용 차단

**검증 방법 열은 빈칸을 남기지 않는다.** 형제 문서에는 타입안전 대표 주장이 실측으로 거짓 판명된 전례가 두 건 있다 — expo-media §0.3 V3(조건부 타입이 애노테이션에서 붕괴), expo-workouts §0 V2(`@ts-expect-error` 픽스처 자체가 컴파일 실패). 초판의 §4는 10개 컴파일 에러를 주장하면서 실측이 하나도 붙어 있지 않았다. 아래 `[실측 K]`는 **소비 앱과 같은 tsc `6.0.3`** + 루트 `tsconfig.base.json` 플래그(strict + exactOptionalPropertyTypes + noUncheckedIndexedAccess)로 §3의 시그니처를 그대로 옮겨 돌린 결과다.

| # | 오용 시나리오 (실제 삼중복이 저지른 것) | 차단 장치 | 검증 픽스처 · 검증 방법 |
|---|---|---|---|
| 1 | 시간대 생각 없이 날짜 렌더 → 화면마다 로컬/UTC 혼재 | `timeZone` required — 옵션 객체 자체도 required | `@ts-expect-error` — `formatDateTime(d)` · `formatDateTime(d, { separator: '-' })` — **`[실측 K]` 둘 다 에러** |
| 2 | 상대시간이 몰래 `new Date()` 읽음 → 테스트 불가·스냅샷 불안정 | `now: Date` required, 함수 내부 시계 읽기 0 | `@ts-expect-error` — now 누락 + unit: 같은 인자 재호출 결과 동일 — **`[실측 K]` 에러** |
| 3 | `₩1,000` vs `1,000원` 임의 선택 | `style` required | `@ts-expect-error` — `formatKrw(1000, { locale: 'ko-KR' })` — **`[실측 K]` 에러** |
| 4 | 그룹핑이 기기 로케일에 몰래 의존 | `locale` required — 기기 의존은 `'device'` 글자로만 가능 | `@ts-expect-error` — `formatNumber(1, {})` — **`[실측 K]` 에러** |
| 5 | "1.5 GB"라 쓰고 1024로 나누기(단위 거짓말) | `system` required + system별 단위 라벨 유니언 | `@ts-expect-error` — `{ system:'binary', maxUnit:'GB' }`(리터럴) · **동일 객체를 변수로 우회**(`const o = {...} as const`) · `{ system:'binary', fractionDigits:{ GB:0 } }` — **`[실측 K]` 3종 전부 에러.** 유니언 멤버 불일치라 EPC(excess property check)에 의존하지 않으므로 변수 간접도 막힌다 |
| 6 | `maxDays`만 주고 절대시각 렌더를 라이브러리에 떠넘김 | `maxDays ⇄ onOverflow` 쌍 강제 유니언 | `@ts-expect-error` — `{ maxDays: 7 }`(onOverflow 누락) — **`[실측 K]` 에러** |
| 7 | `unknown`을 받아 `Number(value \|\| 0)` — null이 `₩0`으로 렌더 | 입력 타입을 `number \| null \| undefined`·`FormatDateInput`으로 좁힘. null은 폴백, 0으로 승격 안 함 | `@ts-expect-error` — `formatKrw(u as unknown, ...)` · `formatDateTime(true, ...)` + unit: `formatKrw(null, ...)` → `'-'` — **`[실측 K]` 에러** |
| 7b | 날짜 문자열을 그대로 포매터에 — offset 없으면 기기 시간대로 파싱 | `FormatDateInput`에 `string` 없음 | `@ts-expect-error` — `formatDateTime('2026-06-08T09:05:00', { timeZone:'UTC', separator:'-' })` — **`[실측 K]` 에러**. 올바른 경로는 `parseIsoInstant` |
| 8 | Hermes 불안전 Intl 옵션 유입(`notation:'compact'` 등) | `Intl.NumberFormatOptions` passthrough 없음 — 화이트리스트 옵션만 존재 | `@ts-expect-error` — `formatNumber(1, { locale:'ko', notation:'compact' })` — **`[실측 K]` 에러. 단 차단 범위는 신선한 객체 리터럴 한정(EPC)이다**: `const o = { locale:'ko' as const, notation:'compact' as const }; formatNumber(1, o)`는 **에러가 나지 않는다** `[실측 K]`. 변수 간접 경로는 타입이 아니라 §5.3 guard(소스 스캔)가 커버하며, **guard는 `src/**`만 스캔하므로 소비 앱 코드에는 효력이 없다**. expo-auth §5가 같은 한계를 이미 문서화하고 있다 |
| 9 | 오타 IANA 이름이 조용히 이상한 출력 | 설정 오류는 throw — `FormatError('ERR_TIMEZONE_INVALID')` | unit: `formatDateTime(d, { timeZone: 'Asia/Seoul ', ... })` throws + `isFormatError` 참 |
| 10 | 소비자가 internal 엔진 deep import | exports 맵에 `'.'`뿐 — `dist/zone` 해석 불가 | release-artifact 테스트(§5.4)가 exports 표면 고정 |
| 11 | EOP 소비자가 `string \| undefined`를 넘기면 컴파일이 깨진다 | 전 옵셔널 필드 `?: T \| undefined`(§1-7) | type: `justNowLabel: maybeLabel`(string\|undefined) 통과 **+ 반환은 여전히 `string`** — **`[실측 K]` 규약 준수 시 CLEAN, 위반 시 TS2379 3건 + TS2322 1건** |

값 오류/설정 오류/환경 오류의 경계(§1-3)가 이 표의 배후 원칙이다: **9번만 프로그래머가 고칠 수 있는 throw**이고, 환경 오류는 `canFormatTimeZone`으로 사전 질의 가능하며, 나머지 데이터 문제는 전부 `fallback`이다.

## 5. 테스트 전략

3계층(CLAUDE.md) 중 integration은 없다 — 네트워크·외부 시스템이 0이므로 unit + type 2계층이 전부이고, 그 대신 guard·oracle을 unit 계층 안에 둔다.

### 5.1 unit (`pnpm test`, 네트워크 0)

- **골든 벡터 (2군으로 분리).**
  - **(A) 소스 동치군** — §0.1·§0.2의 재현 파라미터 21조합 중 §0.4에 나오지 않는 모든 케이스에 대해 소스 앱 구현이 내던 문자열과 **바이트 단위로 같은 출력** 고정.
  - **(B) 의도적 divergence군** — §0.4 변경표 10행 각각을 **별도 기대값**으로 고정하고, 테스트 이름에 §0.4 행 번호를 넣는다.
  - 초판은 "19조합 전부 소스와 동일"이라고 적었는데 그 약속은 검증 불가였다 — #2·#13·#14·#15 등이 실제로는 소스와 다르게 나온다. 두 군으로 갈라야 구현자가 기대값을 표에서 판정할 수 있다.
- **시간대 매트릭스**: `UTC`·`device`·`Asia/Seoul`(무DST)·`America/New_York`(DST 경계 인스턴트 spring-forward/fall-back 전후 1분)·`Asia/Kathmandu`(+5:45)·`Pacific/Chatham`(+12:45/+13:45) × 날짜 3종. 자정(`hourCycle:'h23'` → `00`)·13시(`'13'`, h11/h12 폴백 탐지) 포함.
- **연도 폭**: 연도 999·1000·9999를 IANA 경로와 `'UTC'` 경로 **양쪽에서** 렌더해 문자열이 서로 같은지 확인 — 기대값은 `'999-06-08'`(패딩 없음)로 명시한다. 연도 0·10000은 `fallback`(§0.4-⑩).
- **oracle 교차검증**: IANA 경로의 단일 필드 합성 결과를 **Node full-icu의 `formatToParts`** (테스트 전용 — 런타임 코드는 guard가 금지) 출력과 대조. 구현 전략(§3.4)이 정답과 어긋나면 여기서 죽는다.
- **Intl 자기검사**: `timeZone`을 무시하는 가짜 `Intl.DateTimeFormat`, `hourCycle`을 무시하는 가짜, 비숫자를 내는 가짜 3종을 주입해 각각 `ERR_INTL_UNUSABLE`/`ERR_INTL_FIELD_OUTPUT`이 나오는지 + `canFormatTimeZone`이 `false`를 돌려주는지 + **검사가 프로세스/존당 1회만 실행되는지**(스파이 호출 수) 확인.
- **경계값**:
  - relative 버킷 59s/60s·59m/60m·23h/24h·29d/30d·11mo/12mo, 미래 ±1ms, `maxDays` 정확히 그 날; 360일=1년 근사의 실제 출력(`days=360` → `'1년 전'`)을 기대값으로 고정(§7-6).
  - bytes `999`/`1000`/`1023`/`1024` (원시 경계) **+ `999999`·`999950`·`1023999` (반올림 승격 경계)** — 기대값은 각각 admin `'1000.0 KB'`, mobile `'1000KB'`, mobile `'1MB'` `[실측 F]`. `0`·`-1`·`-5000`을 `nonPositive` 양쪽 값으로. min/maxUnit 상호작용·`wholeNumberFrom` 경계·단위별 `fractionDigits` 맵·`trailingZeros` 3종(특히 `'trim'` vs `'trim-exact'`를 가르는 `1.04GB`)·`NaN`/`Infinity`.
  - duration 59.9s/60s/3600s; `storageRatio` clamp·limit 0; `formatPercent` 0/1/0.005 반올림.
- **파싱**: `parseIsoInstant`의 문법 수용/거부 전수(date-only, `T`/공백 구분자, `Z`/`±HH:MM`/`±HHMM`, 초·밀리초 유무, `'2026-02-30'` → null, 연도 0/10000 → null) × `assumeNoOffset` 3값.
- **에러 계약**: 잘못된 zone → `FormatError` + code + `isFormatError`; **값 오류는 어떤 입력에도 throw하지 않음**(널·빈 문자열·invalid Date·범위 밖 연도 전수).
- **결정성**: 동일 인자 2회 호출 동일 출력. `'device'` 미사용 경로는 `process.env.TZ` 변경에도 불변 — **인스턴트 입력뿐 아니라 문자열 입력도 포함한다**: `parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'utc' })`를 `TZ=Asia/Seoul`과 `TZ=America/New_York`에서 각각 실행해 같은 인스턴트가 나오는지 확인하고, `assumeNoOffset: 'device'`는 반대로 **달라지는지**를 확인한다. 초판의 결정성 테스트는 "인스턴트 기반 검증"이라고 스스로 문자열 경로를 회피해서, 이 구멍이 골든·결정성 양쪽에서 구조적으로 관측되지 않았다.

### 5.2 type (`pnpm test:types`)

`expectTypeOf` + `@ts-expect-error` 픽스처 — §4 표의 11항목 전부. 추가로:

- 제네릭 `fallback` 추론(`formatBytes(v, { ..., fallback: null })` → `string | null`).
- **EOP 소비자 보호 2종**(expo-media §6.3 ⑩, expo-workouts §2387 ⑫ 선례): ① 모든 옵셔널 필드에 `T | undefined` 값을 넘겨도 **컴파일된다**, ② 그때 반환 타입은 **여전히 `string`**이다(제네릭 `TFallback`이 `undefined`를 흡수해 넓어지지 않는다).
- `FormatRelativeBucket` 닫힌 유니언 전수 스위치(source compatibility — AGENTS.md §2).
- `FormatBytesOptions`의 system↔단위 라벨 교차(§4-5 3종).

픽스처는 `typescript@~6.0.3`에서 검증된다(§2.3).

### 5.3 guard (unit 계층 — 최소공배수의 정적 강제)

expo-workouts §9.3 선례의 축소판. `src/**` 소스 텍스트를 스캔해 다음이 나타나면 실패:

**(a) Hermes 미지원 Intl API·결함 옵션** — `formatToParts` · `RelativeTimeFormat` · `PluralRules` · `ListFormat` · `DisplayNames` · `Segmenter` · `DurationFormat` · `Intl.Locale` · `dateStyle` · `timeStyle` · `notation` · `signDisplay` · `compactDisplay` · `dayPeriod` · `fractionalSecondDigits` · `numberingSystem` · `toLocaleString` · `toLocaleDateString` · `toLocaleTimeString` · `localeCompare`

**(b) 로케일 데이터에 출력 형태를 위임하는 스타일** — `style: 'currency'` · `style: 'percent'` · `style: 'unit'` · `currencyDisplay`. §0.6의 두 기각 결정이 코드로 되돌아오는 것을 막는다.

**(c) 엔진 날짜 문자열 파싱** — `Date.parse` 전면 금지. `new Date(` 는 **`src/parse.ts` 밖에서 금지**하고, `src/parse.ts` 안에서도 인자가 `Date.UTC(` 또는 숫자 표현식인 형태만 허용한다(문자열 리터럴/변수 직접 전달 금지). §0.3 축 ①'가 구현 안에서 부활하는 것을 막는 유일한 정적 장치다.

**(d) Node/DOM 전역** — `process` · `Buffer` · `__dirname` · `require(` · `document` · `window` · `navigator` · `localStorage` · `setTimeout` · `setInterval` · `fetch(`. §1-5의 platform neutral 불변식은 선언이 아니라 이 목록 + `tsconfig.src.json`의 `types: []`가 강제한다. 초판은 guard 목록이 Intl 20종뿐이었고 `@types/node`가 `src`에서 그대로 보였다 — Node API 유입이 타입 검사를 통과하고 Hermes에서만 크래시하는 상태였다.

§1.2의 화이트리스트 밖 Intl 사용이 리뷰가 아니라 CI에서 죽게 만든다. 화이트리스트가 **허용**하는 것은 `hourCycle`·`hour12`·`style: 'decimal'`뿐이다.

### 5.4 release artifact / README

- `tests/unit/guards/release-artifact.test.ts` (toss-payments-postgresql 선례): package.json exports·files·sideEffects·engines·publishConfig 계약 고정, 스크립트 배선(`prepack`이 check-provenance를 부르는지) 검사. **추가로 `dist/**`를 문자열 스캔해 §5.3 (a)(b)(d) 목록이 산출물에도 없는지 확인한다**(expo-media entry-guard 선례) — 소스와 산출물 양쪽이 닫힌다.
- `check:readme`: README의 전 ```ts 블록을 dist d.ts에 paths 매핑해 tsc --noEmit — expo-media 스크립트 개조(단일 엔트리·JSX 분기 제거). README에는 §0.1·§0.2의 재현 레시피가 코드 블록으로 실리므로, **이관 가이드 자체가 컴파일 검증된다**.
- README 필수 내용: §1.1 Intl 매트릭스의 소비자용 요약(Hermes에서 무엇이 왜 안전한지, `hourCycle` 미문서화 리스크), `'device'`·`'UTC'` 토큰 의미, `parseIsoInstant`의 `assumeNoOffset` 선택 가이드, 값/설정/환경 오류 3분류와 **부팅 시 `canFormatTimeZone` probe 패턴**, expo-ui `CalendarDate`와의 역할 분담(§0.5).

### 5.5 남는 검증 (이 패키지 밖 — handoff 단계)

Hermes 실기기(또는 시뮬레이터) 스모크: memorylog2 vendoring 시 iOS/Android에서 §5.1 골든 벡터 일부를 실행하는 자기검증 화면 1개. **필수 벡터**: (a) IANA 존 3종의 wall-clock, (b) **13시 렌더**(`hourCycle` 무시 탐지 — §7-9), (c) `canFormatTimeZone` 반환값, (d) `formatKrw` 양 스타일 × `locale:'device'`, (e) `parseIsoInstant` 문법 수용 전수. Node 테스트가 Hermes 동작을 증명하지 못하는 잔여 격차(§7-1·7-2·7-9)는 이 단계에서만 닫힌다.

## 6. 의도적으로 뺀 것

| # | 뺀 것 | 이유 |
|---|---|---|
| 1 | 다국어 상대시간 (`Intl.RelativeTimeFormat`) | Hermes 미지원 `[문서 D]` + 소스 앱 카피는 한국어 수제. 다국어가 필요해지는 날 `relativeBucket`(구조화 출력)이 이미 그 절반이다 — additive로 확장 |
| 2 | KRW 외 통화 | 소스에 존재하지 않는 요구. `'suffix-ko'` 스타일은 KRW에만 의미가 있어 일반화하면 계약이 거짓말이 된다 |
| 3 | `dateStyle`/`timeStyle`·로케일 의존 날짜 문구 | 소스 앱들이 고정폭 수제 패턴으로 **도망쳐 나온 지점**(admin 주석 실증) + Android API<24 미구현 이력 `[문서 D]` |
| 4 | 일반 날짜 파싱 유틸·Temporal | **`parseIsoInstant` 하나는 포함한다**(§3.2 · §0.6). 뺀 것은 그 밖의 관용 파싱(비-ISO 형식·자연어·`Date` 생성자 위임)이다 — 초판의 "출력 전용이므로 파싱 전체 제외"는 §1-4와 양립하지 않았다. Temporal은 Hermes 미탑재 [unverified — 도입 시점 재조사] |
| 5 | `deviceTimeZone()` | Hermes의 `resolvedOptions().timeZone` 반환값 미실측 [unverified] — `'device'` 토큰이 Intl 없이 요구를 흡수(§0.6) |
| 6 | `storageUsage`·`storagePair` 문자열 조합 | admin 단독 카피(`(63%)` 괄호 등)이고 `storageUsage`는 호출부 0건 `[실측 E]`. `formatBytes` + `storageRatio` + `formatPercent` 조합 한 줄 — README 예제로 제공. **§3.9가 추가되면서 이 레시피에 앱 코드가 남지 않는다** |
| 7 | 앱 카피의 기본값 승격(`어제`·`방금 전`·7일 컷오프) | 제품 결정은 소비 앱 소유(AGENTS.md §1). 옵션으로 표현만 가능하게 |
| 8 | compact 표기(`1.2만`, `1.2M`) | `notation:'compact'`는 iOS Hermes 미지원 `[문서 D]` — 수제 구현 요구가 실제로 생기면 그때 설계 |
| 9 | React hook·컴포넌트 | 이 패키지는 순수 함수 계층. UI 결합은 expo-ui 영역(패키지 경계 논증은 §0.5) |
| 10 | 바이트 `rounding: 'ceil' \| 'floor'` 축 | 요구처가 §0.2 #20 한 곳인데, 축을 추가해도 그 구현의 **KB 스킵**은 여전히 표현 불가라 재현이 완성되지 않는다. 호출부 정책 변경으로 닫는다(§0.4-⑧⑨) |
| 11 | `onIntlUnavailable` 옵션 | `canFormatTimeZone` probe가 같은 선택지를 옵션 증가 없이 준다(§1-3). 렌더 경로마다 환경 정책을 반복 서술하게 만들지 않는다 |
| 12 | expo-ui `CalendarDate` ↔ instant 브리지 | 어느 쪽에 넣어도 패키지 간 타입 의존이 생겨 peer 0이 깨진다(§0.5). 소비 앱이 3줄로 만든다 — README 레시피 |

## 7. 잔존 리스크

| # | 리스크 | 완화 |
|---|---|---|
| 1 | Hermes Intl 문서는 main 브랜치 기준 — RN 0.85가 실제 싣는 hermes-v0.16 시점과의 차이 [unverified] | 사용 표면을 "수년째 문서화된 최소 교집합" 2종(§1.2)으로 제한 + §3.4 자기검사가 런타임 탐지 + §5.5 실기기 스모크가 최종 게이트 |
| 2 | Hermes에서 IANA zone 이름 처리(대소문자 정규화·별칭)가 ECMA-402와 다를 가능성 [unverified] | README에 정식 표기(`Area/City`) 사용 권고 + 스모크 벡터에 zone 케이스 포함 + 오프 스펙 입력은 `ERR_TIMEZONE_INVALID`로 즉사(조용한 오출력 없음) + `canFormatTimeZone`으로 사전 질의 |
| 3 | 단일 필드 `format()` 출력이 숫자가 아닐 엔진/로케일 데이터 변동 | `'en-US'` 고정 + 숫자 필드만 요청 + **값 동등 자기검사**(§3.4 각서 ③) → `ERR_INTL_UNUSABLE`/`ERR_INTL_FIELD_OUTPUT`. oracle 테스트(§5.1)가 Node 세대 업그레이드마다 재검증 |
| 4 | ~~Android 11(API 30) Hermes `NumberFormat` currency 결함~~ | **종결.** `style:'currency'`를 더 이상 쓰지 않는다(§0.6 · §3.8) — `formatKrw`의 두 경로 모두 `style:'decimal'` + 리터럴 합성이다. guard (b)가 재유입을 막는다 |
| 5 | `'device'`·`locale:'device'`·`assumeNoOffset:'device'` 경로는 정의상 비결정적 — 골든 테스트 불가 | 그 비의존 경로들과 코드 공유(같은 합성 함수에 getter만 주입) + 결정 경로 골든이 간접 커버 + §5.1 결정성 테스트가 **`'device'`는 TZ에 따라 달라진다는 것 자체를 기대값으로** 고정. 토큰이 호출부에 글자로 남아 리뷰 가시성 확보 |
| 6 | 상대시간 근사가 **1개월=30일, 1년=12개월(=360일)** — 달력 비인지 | 소스 앱과 동일한 근사(골든 일치가 우선 계약). **오차 크기를 정확히 적는다**: 연 단위에서 약 5일/년의 체계적 **조기 표시**이고 선형 누적한다 — `days=360`(11.8개월)에 이미 `'1년 전'`이 뜨고, `days=3600`(9.86년)에 `'10년 전'`이 떠서 10년 지점의 오차는 약 52일이다. 초판이 적은 "월말 경계 ±1일"은 이 크기를 과소 기술한 것이었다. 달력 인지 diff는 요구 발생 시 `relativeBucket` v2로 additive 확장 |
| 7 | 포매터 캐시가 zone 수만큼 자람 (이론상 unbounded) | 실사용 zone은 한 자릿수. 상한(예: 32) 초과 시 LRU 축출 — 구현 시 주석으로 상한 근거 명시 |
| 8 | tsup `target: 'es2022'` 문법이 구형 Hermes에 직접 로드될 가능성 | Expo/Metro는 node_modules를 babel로 변환(형제 expo-media 동일 전제) — 순수 JS 패키지라 추가 노출면 없음. 비-Expo RN 소비자는 README에 transpile 주의 명시 |
| 9 | **`hourCycle`/`hour12`가 Hermes 문서에 없다** `[문서 D 재확인]` — IANA 경로의 모든 시각 렌더가 여기 걸려 있다 | (a) 두 옵션을 **함께** 지정해 엔진이 어느 하나만 알아도 정답이 나오게 한다(§1.2). (b) §3.4 자기검사 ③이 13시→`'13'`을 값으로 확인하므로, 무시되면 `ERR_INTL_UNUSABLE`로 **부팅 시 probe에서 잡힌다**(렌더 도중 무작위 실패가 아니다). (c) **Plan B**: 실기기 스모크에서 실패가 확인되면 hour 필드를 Intl에 맡기지 않고, 존 오프셋만 얻어 `Date` 산술로 wall-clock을 합성하는 구현으로 교체한다 — `hourCycle` 의존이 0이 되며 공개 표면은 변하지 않는다(내부 교체). (d) §5.5 스모크 필수 벡터 (b) |
| 10 | 자기검사 ②의 프로브 존(`Etc/GMT-9`)을 엔진이 모를 가능성 [unverified] | 생성자 `RangeError`는 "결론 없음"으로 처리하고 ①③만으로 판정 — **기기가 정확히 UTC+0일 때 `timeZone` 무시를 놓칠 수 있다**(그 기기에서는 UTC 렌더가 우연히 맞으므로 피해가 UTC 존에 한해 없다). 스모크가 최종 게이트 |
| 11 | `parseIsoInstant`가 소스보다 **좁다** — `new Date(str)`가 받던 비-ISO 문자열(`'2026/06/08'`, RFC 2822 등)이 null이 된다 | 좁힌 것이 목적이다(엔진 편차 제거). 이관 시 API 응답 형식을 1회 확인하고, 형식이 ISO가 아니면 §8의 되돌리기 지점 2에서 멈춘다. README에 수용 문법을 전량 게재 |
| 12 | `nonPositive` required가 바이트 포매터 호출부 31곳 전부를 건드린다 `[실측 E]` | §1-1의 기계적 적용이라 예외를 두지 않는다. 이관은 §8의 단계 4·5에서 codemod 없이 수동으로 — 31곳 각각이 "0바이트를 어떻게 보일 것인가"라는 제품 질문에 답해야 하고, 그것이 이 축을 required로 만든 이유다 |

---

## 8. memorylog2 이관 계획

expo-media §11 선례. §0.4 변경표가 이 계획의 근거다 — 되돌리기 지점은 전부 "변경표의 어느 행이 실제로 화면에 나타나는가"로 판정한다.

### 8.1 호출부 인벤토리 `[실측 E]`

**정의 파일과 테스트를 제외한 프로덕션 호출부**다(`grep -rnE '(^|[^A-Za-z0-9_.])<name>\('`).

| 앱 | 심볼 | 호출 | 파일 | 비고 |
|---|---|---|---|---|
| admin | `text` | 52 | 5 | 순수 이관 |
| admin | `number` | 72 | 6 | ⚠ §0.4-① null→`'-'` — 영향 최대 |
| admin | `won` | 20 | 3 | ⚠ §0.4-②③ |
| admin | `bytes` | 8 | 5 | ⚠ §0.4-④ |
| admin | `date` · `dateOnly` · `dateShort` | 24 · 18 · 11 | 7 · 2 · 3 | ⚠ §0.4-⑤ — 전부 문자열 인자 |
| admin | `relative` | 5 | 3 | ⚠ §0.4-⑥ — 5곳 전부 `now` 생략 |
| admin | `duration` | 1 | 1 | (from,to) → ms |
| admin | `storageRatio` | 3 | 3 | 순수 이관 |
| admin | `storagePair` | 1 | 1 | 앱에 남김(§6-6) |
| admin | `storageUsage` | **0** | 0 | 사문 — 삭제 |
| admin | percent 인라인 | 3 | 3 | `app/users.tsx:407` · `src/ui.tsx:423` · `src/ui.tsx:451` → `formatPercent` |
| **admin 소계** | | **218** | **9** | `@/format`·`./format` 소비 파일 9개 |
| mobile | `formatStorageBytes` | 19 | 5 | ⚠ 단위별 반올림 재현 검증 필수(§0.1 #13) |
| mobile | `formatBytes` (export) | 1 | 1 | `ImageViewerDialog.tsx:272` — ⚠ `nonPositive:'fallback'`이 없으면 0바이트가 `'0B'`로 뜬다 |
| mobile | `formatBytes` (로컬 #20) | 3 | 1 | ⚠ §0.4-⑧⑨ |
| mobile | `formatCurrency` | 7 | 1 | ⚠ §0.4-⑦ |
| mobile | `formatUtcDate` | 4 | 2 | ⚠ §0.4-⑤ — `cards/plans.tsx:1219·1223·1228`이 API 문자열 직결 |
| mobile | `formatKoreanDate` · `formatKoreanDateTime` | 4 · 2 | 4 · 2 | ⚠ §0.4-⑤ |
| mobile | `formatRelativeTime` | 6 | 5 | `now` 기본값 제거 |
| **mobile 소계** | | **46** | **18** | |

총 **264 호출 / 27 파일**. 바이트 포매터 계열만 **31 호출**(admin 8 + storage 19 + mobile 1 + #20 3)이고, 이들 전부가 `nonPositive`를 명시하게 된다(§7-12).

### 8.2 소비 방식

expo-ui·expo-media와 동일하게 **tarball 벤더링**: `vendor/gj-kit/gj-kit-format-0.1.0.tgz` → 두 앱 package.json의 `file:` 의존. `pnpm pack` 후 tarball 안에 `dist/gj-kit-provenance.json`이 있는지, `dist` 외 파일이 없는지 확인한다.

### 8.3 이관 순서 (각 단계가 독립 커밋 = 되돌리기 지점)

1. **어댑터 레이어 생성.** 두 앱에 기존 시그니처를 그대로 유지하는 얇은 래퍼를 만든다(`apps/admin/src/format.ts`를 라이브러리 호출로 다시 구현, `apps/mobile/src/utils/format.ts`·`datetime.ts` 동일). **호출부 0수정.** 이 단계에서 §0.4 변경표의 ①②④⑦이 실제로 화면에 나타난다 — 앱 테스트 스위트가 여기서 빨개지면 변경표가 맞다는 뜻이고, 빨개지지 않으면 테스트 커버리지 문제다.
   - **되돌리기 지점 1**: 어댑터만 revert하면 원상복구.
2. **문자열 인자 처리.** 어댑터 안에서 `parseIsoInstant`를 호출한다. admin은 `assumeNoOffset:'device'`(소스 동치), mobile `formatUtcDate` 경로는 `'utc'`. **여기서 API 응답의 실제 날짜 형식을 1회 확인한다** — ISO가 아니면 §7-11대로 멈추고 파서 문법을 넓힐지 결정한다.
   - **되돌리기 지점 2**: 파싱 정책만 어댑터 안에서 되돌린다.
3. **#20 흡수.** `OwnershipTransferRequest.tsx`의 로컬 `formatBytes`를 삭제하고 라이브러리 호출로 교체. §0.4-⑧⑨의 출력 변경을 디자인 확인 후 반영한다.
   - **되돌리기 지점 3**: 이 파일 1개만 revert.
4. **어댑터 제거 — admin.** 9개 소비 파일의 호출부(218건)를 라이브러리 직접 호출로 바꾼다. `relative` 5곳에 `now` 주입, percent 인라인 3곳을 `formatPercent`로, `storageUsage` 삭제.
5. **어댑터 제거 — mobile.** 18개 소비 파일(46건) 동일.
6. **스모크.** §5.5의 자기검증 화면을 iOS/Android 실기기에서 1회 — 특히 13시 렌더(§7-9)와 `canFormatTimeZone`.

### 8.4 되돌리기 정책

단계 4·5는 호출부를 광범위하게 건드리므로 **단계 3까지와 별도 PR**로 낸다. 단계 1~3이 머지된 상태에서 앱은 라이브러리를 쓰면서도 기존 시그니처를 유지하므로, 4·5가 늦어져도 부채가 아니라 중간 상태다.

---

부록 — 근거 파일 경로 (재검증용)

- `[실측 A]` `/Users/apeltop/project/company/memorylog2-gjkit/node_modules/react-native/sdks/.hermesversion` → `hermes-v0.16.0` (react-native 0.85.3, expo ~56.0.16)
- `[실측 B]` 동 `react-native/ReactAndroid/hermes-engine/build.gradle.kts` → `-DHERMES_ENABLE_INTL=True`, Intl java 소스 트리 포함
- `[실측 C]` 동 `react-native/gradle/libs.versions.toml` → `minSdk = "24"`
- `[문서 D]` https://github.com/facebook/hermes/blob/main/doc/IntlAPIs.md (2026-08-24 fetch, 2회 — 2회차에서 `hourCycle`/`hour12` 부재 확인)
- `[실측 E]` memorylog2 소스 직접 판독 — `apps/admin/src/format.ts`·`apps/admin/package.json`(`@gj-kit/expo-ui` tarball, `typescript ~6.0.3`)·`apps/mobile/src/utils/{format,datetime}.ts`·`apps/mobile/src/albums/OwnershipTransferRequest.tsx:27`·`apps/mobile/src/components/cards/{plans,storage}.tsx`·`apps/mobile/src/components/ImageViewerDialog.tsx:272`; 호출부 카운트는 `grep -rhoE '(^|[^A-Za-z0-9_.])<name>\(' apps/{admin,mobile}`; gj-kit 형제 `expo-ui/src/dates/calendar.ts`·`expo-ui/package.json:114`·`expo-ui/README.md:913,1121`·`expo-media/tsconfig.core.json`·`{expo-media,expo-workouts,expo-auth}/package.json`
- `[실측 F]` 소스 3구현을 Node로 재실행 — `admin bytes(999999)='1000.0 KB'`, `mobile formatBytes(999999)='1000KB'`, `mobile formatBytes(1023999)='1MB'`, `formatStorageBytes(250500000)='251MB'`, `formatStorageBytes(1e15)='1000TB'`, `mobile formatBytes(0)=null`, `admin bytes(0)='0 B'`·`bytes(-5)='-5 B'`
- `[실측 G]` Node full-icu `Intl.NumberFormat` — `{style:'currency',currency:'KRW',maximumFractionDigits:0}`: ko-KR/en-US/ja-JP `₩1,000`, de-DE `1.000 ₩`, fr-FR `1 000 ₩`, es-ES `1000 KRW`; `-1000`→`-₩1,000`, `-0`→`-₩0`, `1000.5`→`₩1,001`; `(1000.5).toLocaleString('ko-KR')+'원'` = `1,000.5원`
- `[실측 H]` `TZ=Asia/Seoul node -e "new Date('2026-06-08T09:05:00').toISOString()"` → `2026-06-08T00:05:00.000Z`; `TZ=America/New_York` → `2026-06-08T13:05:00.000Z`
- `[실측 I]` `new Intl.NumberFormat('ko-KR').format(Number(null || 0))` → `'0'`
- `[실측 J]` Node full-icu 단일 필드 `Intl.DateTimeFormat('en-US', {timeZone:'UTC', …})` — `{minute:'2-digit'}` → `"5"`(**패딩 안 됨**), `{year:'numeric'}` (999년) → `"999"`(패딩 안 됨), `{month:'2-digit'}` → `"06"`, `{hour:'2-digit'}`(13시) → `"01 PM"`, `{hour:'2-digit',hourCycle:'h23'}` → `"13"`
- `[실측 K]` `expo-workouts/node_modules/.bin/tsc` (**6.0.3**) + `--strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess --target ES2022 --lib ES2022`로 §3 시그니처 픽스처 컴파일 — §4의 12개 `@ts-expect-error` 전부 성립(#8은 fresh literal 한정, 변수 간접은 통과), 규약 준수 시 EOP 소비자 픽스처 CLEAN, 플레인 `?:`로 되돌리면 TS2379 3건 + TS2322 1건
- `[실측 L]` Node full-icu — `Intl.DateTimeFormat('en-US',{timeZone:'Etc/GMT-9',hour:'2-digit',hourCycle:'h23'}).format(new Date('2021-01-01T00:00:00Z'))` → `"09"`, 같은 존의 year/month/day → `2021`/`01`/`01`; `timeZone:'UTC'`로 `2021-01-01T13:05:00Z`의 hour → `"13"`
- 선례: 커밋 `03e4c50`(toss-payments-postgresql 도입 — 0.0.0 + minor changeset), `expo-media/scripts/*`(check-readme·provenance 래퍼), `expo-media/tests/unit/guards/*`(entry-guard·nodom-source-guard), `toss-payments-postgresql/tests/unit/release-artifact.test.ts`, `expo-media` §11(이관 계획)·§11.7(파괴적 변경표)
