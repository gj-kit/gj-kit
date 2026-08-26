# @gj-kit/format

[English](./README.md) · **한국어**

<!-- gj-kit-localized-overview -->

TypeScript용 명시성 강제 날짜, 숫자, 바이트, 기간, 한국 원화 포매팅 유틸리티입니다.

## Golden path

> **완료 상태:** 호출 위치에서 시간대와 구분자가 명시된 안정적인 표시 문자열을 만듭니다.

### 1. 설치

```sh
pnpm add @gj-kit/format
```

### 2. 앱이 소유할 경계를 정합니다

코드에서 시간대와 구분자를 선택하세요. 영속·운영 값에 기기 기본값을 물려주지 마세요.

### 3. 최소 연결부터 시작합니다

먼저 아래 코드를 복사한 뒤, 위에서 언급한 앱 소유 값만 교체하세요.

```ts
import { formatDateTime } from '@gj-kit/format';

export const dateLabel = formatDateTime(Date.UTC(2026, 7, 26, 0, 0), {
  timeZone: 'Asia/Seoul',
  separator: '-',
});
```

## 사용할 때

시간대, locale, 단위, 통화 표시 선택을 호출 위치에서 분명히 해야 할 때 사용합니다.

## 사용하지 않을 때

문서화된 계약 밖의 앱 문구, 사용자 locale 선호, 금융 반올림 정책을 소유시키기 위해 사용하지 마세요.

## 런타임과 peer 조건

이 패키지는 peer dependency가 없습니다.

## 공개 entry point

- `@gj-kit/format`

## 안전 경계

영속 데이터나 운영 값에 암묵적인 기기 시간대 또는 locale 기본값을 의존하지 마세요.

## 문서

- [패키지 가이드](https://gj-kit.github.io/gj-kit/ko/packages/format/)
- [전체 API 명세](https://gj-kit.github.io/gj-kit/ko/api/format/)
- [기계 판독 API JSON](https://gj-kit.github.io/gj-kit/api/format.json)

포털은 npm 최신 공개판 선언 파일 스냅샷을 기준으로 합니다. 문서화된 public entry point만 사용하고 internal source file을 deep import하지 마세요.

## 상세 가이드


명시성을 타입으로 강제하는 포매팅 유틸. 시간대·로케일·통화 표기 스타일·바이트 단위를 **전부 명시 인자로** 받는다. 생략하면 컴파일되지 않는다.

- 런타임 의존성 0, peer 0. `react` / `react-native` / DOM / Node API를 일절 import하지 않는다.
- ESM + CJS 듀얼. 브라우저(React Native Web) · Hermes · Node 20+ 가 같은 산출물을 소비한다.
- Intl은 **Hermes가 지원하는 최소 교집합**만 쓴다. 그 밖의 API는 가드 테스트가 소스와 산출물 양쪽에서 정적으로 금지한다.

```sh
corepack pnpm add @gj-kit/format
```

---

## 왜 이 패키지가 있나

한 제품의 admin 앱과 mobile 앱에 포매터가 **세 벌** 있었고, 같은 데이터가 화면마다 다르게 보였다.

| 축 | admin | mobile |
|---|---|---|
| 시간대 | 로컬(`getHours`) | 어떤 화면은 UTC, 어떤 화면은 로컬 |
| 통화 | `₩1,000` | `1,000원` |
| 그룹핑 로케일 | `ko-KR` 고정 | 기기 기본값 |
| 날짜 구분자 | `2026-06-08` | `2026.06.08` |
| 상대시간 | `3분 전`, 미래는 빈 문자열 | `3분전`, `어제`, 7일 후 절대날짜 |
| 바이트 | `1.5 GB` | `1.5GB` (+ 단위별로 다른 반올림) |
| 0 바이트 | `0 B` | 칩을 숨김 |

이 패키지는 **어느 쪽도 조용한 승자로 만들지 않는다.** 위에서 갈라진 축은 전부 필수 옵션이 되고, 호출부가 매번 무엇을 원하는지 적어야 한다. 두 앱이 이미 합의했던 것(폴백 `-`, 24시간제 `HH:mm`)만 기본값을 가진다.

---

## 첫 예제

```ts
import { formatDateTime, formatKrw, formatBytes, parseIsoInstant } from '@gj-kit/format';

// 시간대는 항상 명시한다. 생략하면 컴파일 에러다.
formatDateTime(Date.UTC(2026, 5, 8, 9, 5), { timeZone: 'Asia/Seoul', separator: '-' });
// → '2026-06-08 18:05'

// 통화 표기 스타일과 그룹핑 로케일도 명시한다.
formatKrw(1234567, { style: 'symbol', locale: 'ko-KR' }); // → '₩1,234,567'
formatKrw(1234567, { style: 'suffix-ko', locale: 'ko-KR' }); // → '1,234,567원'

// 바이트는 단위 체계와 "0을 어떻게 볼 것인가"를 함께 정해야 한다.
formatBytes(1_500_000_000, { system: 'decimal', unitSpace: true, nonPositive: 'render' });
// → '1.5 GB'
formatBytes(1_500_000_000, { system: 'binary', unitSpace: true, nonPositive: 'render' });
// → '1.4 GiB'

// API가 준 문자열은 포매터에 바로 넣을 수 없다 — 해석 정책을 골라야 한다.
const instant = parseIsoInstant('2026-06-08T09:05:00Z', { assumeNoOffset: 'utc' });
formatDateTime(instant, { timeZone: 'UTC', separator: '.' }); // → '2026.06.08 09:05'
```

---

## 시간대 — `'UTC' | 'device' | IANA`

날짜 3종은 `timeZone`을 **반드시** 받는다. 기본값을 두지 않는 이유는 단순하다. "명시 없으면 로컬"이 바로 위 표의 첫 줄을 만든 원인이다.

```ts
import { formatDateOnly, formatDateTime, formatMonthDayTime } from '@gj-kit/format';

const instant = Date.UTC(2026, 5, 8, 13, 5);

formatDateTime(instant, { timeZone: 'UTC', separator: '-' }); // '2026-06-08 13:05'
formatDateOnly(instant, { timeZone: 'Asia/Seoul', separator: '.' }); // '2026.06.08'
formatMonthDayTime(instant, { timeZone: 'America/New_York', separator: '-' }); // '06-08 09:05'

// 'device'는 폴백이 아니라 명시적 선택이다 — 기기 상태 의존이 호출부에 글자로 남는다.
formatDateTime(instant, { timeZone: 'device', separator: '-' });
```

세 토큰의 의미:

- **`'UTC'`** — UTC 벽시계. Intl을 전혀 호출하지 않는다(`getUTC*` getter만 쓴다).
- **`'device'`** — 런타임 로컬 시간. 역시 Intl을 호출하지 않는다. 기기 의존을 **고르는** 것이지 흘러들어오는 것이 아니다.
- **IANA 이름** — `'Asia/Seoul'` 같은 정식 표기(`Area/City`). `Intl.DateTimeFormat`으로 해석하며, 런타임이 모르는 이름이면 `FormatError('ERR_TIMEZONE_INVALID')`를 던진다.

### 출력 형식

`YYYY-MM-DD HH:mm` · `YYYY-MM-DD` · `MM-DD HH:mm` (구분자는 `-` 또는 `.`). 24시간제이고 초는 없다.

월·일·시·분은 항상 2자리, **연도는 패딩하지 않는다**(`999-06-08`). 소스 앱들이 `getFullYear()`를 그대로 썼고, IANA 경로와 `'UTC'`/`'device'` 경로가 같은 문자열을 내려면 그 쪽에 맞춰야 하기 때문이다. 실데이터가 사는 1000–9999년 구간에서는 폭이 고정된다.

지원 인스턴트 범위는 **모든 지원 시간대에서 연도가 1–9999에 들어오는 구간**이다(`0001-01-01T14:00:00Z` ~ `9999-12-31T09:59:59.999Z`). 그 밖은 값 오류이므로 `fallback`을 낸다 — 던지지 않는다.

---

## 문자열은 포매터에 들어가지 않는다 — `parseIsoInstant`

`FormatDateInput`은 `Date | number`다. `string`이 없는 것은 실수가 아니다.

`new Date('2026-06-08T09:05:00')`은 offset 없는 문자열을 **기기 시간대로** 해석한다. 같은 API 응답이 서울 폰에서는 `00:05Z`, 뉴욕 폰에서는 `13:05Z`가 된다. 이 일은 포매터가 값을 보기 **전에** 벌어지므로 `timeZone` 옵션으로는 되돌릴 수 없다.

```ts
import { formatDateTime, parseIsoInstant } from '@gj-kit/format';

// offset이 없는 문자열 — 해석 정책이 필수다.
parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'utc' }); // UTC 벽시계로 읽는다
parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'device' }); // 기기 시간대로 읽는다
parseIsoInstant('2026-06-08T09:05:00', { assumeNoOffset: 'reject' }); // null — 호출부가 폴백

// offset이 붙어 있으면 세 정책 모두 같은 인스턴트를 낸다.
parseIsoInstant('2026-06-08T09:05:00+09:00', { assumeNoOffset: 'reject' });

// date-only는 언제나 UTC 자정이다(ECMA-262). 옵션의 영향을 받지 않는다.
const day = parseIsoInstant('2026-06-08', { assumeNoOffset: 'reject' });
formatDateOnlyOrDash(day);

function formatDateOnlyOrDash(value: Date | null): string {
  return formatDateTime(value, { timeZone: 'UTC', separator: '-' });
}
```

**수용 문법 전량** — 이 밖은 전부 `null`이다(파싱 실패는 값 오류이지 예외가 아니다).

```
YYYY-MM-DD
YYYY-MM-DD(T|공백)HH:mm[:ss[.fff…]][Z | ±HH:MM | ±HHMM]
```

- 연도 1–9999, 달력상 유효한 날짜만(`2026-02-30`은 `null`, `2023-02-29`도 `null`).
- 앞뒤 공백 불허, `2026/06/08`·RFC 2822 같은 비-ISO 형식 불허.
- 구현은 정규식 + `Date.UTC` 산술이다. 엔진의 문자열 파서를 쓰지 않으므로 V8·JavaScriptCore·Hermes에서 결과가 같다.

> **이관 주의.** 이 파서는 `new Date(str)`보다 **좁다**. 서버 응답 형식이 ISO가 아니라면 이관 전에 그 사실이 여기서 드러난다 — 그것이 좁힌 목적이다.

---

## 통화 — 로케일이 기호를 옮기지 못한다

```ts
import { formatKrw } from '@gj-kit/format';

formatKrw(1000, { style: 'symbol', locale: 'ko-KR' }); // '₩1,000'
formatKrw(1000, { style: 'suffix-ko', locale: 'ko-KR' }); // '1,000원'
formatKrw(1234567, { style: 'symbol', locale: 'de-DE' }); // '₩1.234.567' — 그룹핑만 바뀐다
formatKrw(-1000, { style: 'symbol', locale: 'ko-KR' }); // '-₩1,000'
formatKrw(1000.5, { style: 'symbol', locale: 'ko-KR' }); // '₩1,001' — KRW에 minor unit은 없다
formatKrw(null, { style: 'symbol', locale: 'ko-KR' }); // '-'
```

`locale`은 **그룹핑과 소수 구분자만** 정한다. `₩` 글리프·그 위치·`원` 접미는 이 패키지가 고정한다.

Intl의 통화 스타일을 쓰지 않는 이유가 여기 있다. 그 경로에서는 로케일이 글리프와 위치를 정해 버려서, 타입을 통과하는 `{ style: 'symbol', locale: 'device' }` 조합이 어떤 기기에서는 통화 코드(`KRW`)를 렌더할 수 있었다. 필수 옵션으로 올린 목적이 조합 하나로 무너지는 셈이다. 대신 숫자만 Intl로 그룹핑하고 기호는 여기서 합성한다.

`formatPercent`도 같은 이유로 `%`를 리터럴 접미로 붙인다 — Intl의 백분율 스타일은 로케일에 따라 기호를 옮기고 사이에 줄바꿈 없는 공백을 넣는다.

**음의 0은 어떤 포매터에서도 화면에 오지 않는다.** 리터럴 `-0`뿐 아니라 **반올림 결과가 0인 음수**도 마찬가지다 — `formatPercent(-0.0001, { locale: 'ko-KR' })`은 `'-0%'`가 아니라 `'0%'`이고, `formatKrw(-0.4, …)`는 `'₩0'`, `formatBytes`도 `'-0.0 KB'`를 내지 않는다.

---

## 바이트 — 라벨이 나눈 수를 정직하게 말한다

```ts
import { formatBytes } from '@gj-kit/format';
import type { FormatBytesOptions } from '@gj-kit/format';

// admin 표기: 공백 있음, 항상 소수 1자리(고정폭 열), 0·음수도 렌더
const adminBytes: FormatBytesOptions = {
  system: 'decimal',
  unitSpace: true,
  fractionDigits: 1,
  trailingZeros: 'keep',
  nonPositive: 'render',
  maxUnit: 'PB',
};
formatBytes(1_500_000_000, adminBytes); // '1.5 GB'
formatBytes(0, adminBytes); // '0 B'

// mobile 파일 크기 표기: 무공백, 후행 0 제거, 10 이상은 정수, 0 이하는 "크기 미상"
const mobileBytes: FormatBytesOptions<null> = {
  system: 'decimal',
  unitSpace: false,
  fractionDigits: 1,
  trailingZeros: 'trim',
  wholeNumberFrom: 10,
  maxUnit: 'GB',
  nonPositive: 'fallback',
  fallback: null,
};
formatBytes(12_345_678, mobileBytes); // '12MB'
formatBytes(0, mobileBytes); // null — 칩을 숨긴다

// mobile 플랜 용량 표기: MB는 정수, GB/TB는 소수 1자리 — 단위마다 반올림이 다르다
const planBytes: FormatBytesOptions = {
  system: 'decimal',
  unitSpace: false,
  minUnit: 'MB',
  maxUnit: 'TB',
  fractionDigits: { MB: 0, GB: 1, TB: 1 },
  trailingZeros: 'trim-exact',
  nonPositive: 'render',
};
formatBytes(250_500_000, planBytes); // '251MB'
formatBytes(1_040_000_000, planBytes); // '1.0GB'
```

축의 의미:

- **`system`** (필수) — `'decimal'`은 1000으로 나누고 KB/MB/GB로, `'binary'`는 1024로 나누고 KiB/MiB/GiB로 라벨한다. 타입이 두 체계를 유니언으로 묶어서 `{ system: 'binary', maxUnit: 'GB' }` 같은 **거짓말하는 라벨은 컴파일되지 않는다** — 리터럴에서도, 변수 간접에서도.
- **`nonPositive`** (필수) — 0과 음수를 렌더할지(`'render'`) 폴백으로 볼지(`'fallback'`). 두 앱이 갈라졌고 화면에 보이는 차이라서 축이 됐다: "0 바이트"는 크기가 0인 것일 수도, 크기를 모르는 것일 수도 있다.
- **`trailingZeros`** — `'keep'`은 고정폭(`1.0 GB`), `'trim'`은 반올림 후 후행 0 제거(`1GB`), `'trim-exact'`는 **반올림 전에 정수였을 때만** 소수를 뗀다(`1.04GB` → `'1.0GB'`).
- **`fractionDigits`** — 단일 값 또는 단위별 맵. 맵이 필요한 이유는 실제 앱이 MB는 정수로, GB/TB는 소수 1자리로 반올림했기 때문이다. 두 구간 모두 자기 단위에서 1–999를 차지하므로 숫자 임계값으로는 갈라낼 수 없다.

> **단위는 반올림 전에 정해지고, 반올림 뒤에 재승격하지 않는다.** `999_999`가 `'1000.0 KB'`(`'1.0 MB'`가 아니라)로 나오는 것은 버그가 아니라 소스 동치 계약이다. 두 앱 모두 그렇게 렌더했다.

---

## 상대시간 — 시계를 몰래 읽지 않는다

`now`가 인자다. 함수가 `new Date()`를 몰래 부르면 테스트가 불가능해지고 스냅샷이 흔들린다.

```ts
import { formatDateOnly, formatDateTime, formatRelativeKo, relativeBucket } from '@gj-kit/format';

const now = new Date(Date.UTC(2026, 5, 8, 11, 24, 43));
const fiveMinutesAgo = new Date(now.getTime() - 5 * 60_000);

// admin 카피: 공백 있음, 미래는 빈 문자열
formatRelativeKo(fiveMinutesAgo, {
  now,
  suffixSpace: true,
  fallback: '',
  onFuture: 'empty',
}); // '5분 전'

// mobile 카피: 무공백, '방금 전', '어제', 7일 컷오프, 미래는 절대 시각
formatRelativeKo(fiveMinutesAgo, {
  now,
  suffixSpace: false,
  fallback: '-',
  justNowLabel: '방금 전',
  yesterdayLabel: '어제',
  maxDays: 7,
  onFuture: (date) => formatDateTime(date, { timeZone: 'device', separator: '.' }),
  onOverflow: (date) => formatDateOnly(date, { timeZone: 'device', separator: '.' }),
}); // '5분전'

// 카피가 필요 없으면 구조화된 분류만 가져다 직접 렌더해도 된다.
relativeBucket(fiveMinutesAgo, now); // { kind: 'minutes', count: 5 }
```

`maxDays`와 `onOverflow`는 **쌍으로만** 존재한다. 하나만 주면 컴파일 에러다 — 절대 시각을 어떻게 렌더할지 라이브러리가 임의로 정하는 일이 타입상 불가능하다.

`어제`·`방금 전`·7일 컷오프는 **제품 결정**이므로 기본값으로 승격하지 않는다. 표현만 가능하게 한다.

버킷 임계값은 `<60s` · `<60m` · `<24h` · `<30d` · `<12개월` 이고, **한 달은 정확히 30일, 한 해는 그런 달 12개(=360일)** 다. 달력을 인지하지 않는다. 소스 앱 두 곳과 바이트 단위로 같기 위한 선택이며, 오차는 연 단위에서 약 5일/년의 체계적 조기 표시로 선형 누적한다(360일에 이미 `1년 전`이 뜬다).

---

## 오류 3분류

| 분류 | 무엇 | 동작 |
|---|---|---|
| **값 오류(데이터)** | `null`·`undefined`·invalid `Date`·`NaN`·범위 밖 연도·파싱 실패 | `fallback` 반환. **절대 던지지 않는다.** |
| **설정 오류(코드)** | 잘못된 IANA 이름 · 런타임이 거부하는 로케일 태그(`'ko_KR'`, `'en US'`) · 범위 밖 fraction digits | `FormatError('ERR_TIMEZONE_INVALID')` · `ERR_LOCALE_INVALID` · `ERR_FRACTION_DIGITS_INVALID` throw. 프로그래머가 고칠 수 있다. |
| **환경 오류(런타임 Intl 결함)** | `ERR_INTL_UNUSABLE` · `ERR_INTL_FIELD_OUTPUT` | throw. 프로그래머가 고칠 수 없으므로 **부팅 시 미리 물어볼 수 있게** 했다. |

`locale`은 타입이 열려 있다(`'device' | string | string[]`) — 서버가 요청마다 `Accept-Language`를 그대로 넘기는 경로가 정상 사용이기 때문이다. 그래서 **런타임이 그 태그를 거부하는 경우도 3분류 안에 있다**: Intl의 맨 `RangeError`가 새어 나가지 않고 `FormatError('ERR_LOCALE_INVALID')`가 된다. 아래 `isFormatError` 레시피 하나로 전부 잡힌다는 뜻이다.

```ts
import { canFormatTimeZone, isFormatError } from '@gj-kit/format';
import type { FormatTimeZone } from '@gj-kit/format';

// 부팅 시 1회 — 실패하면 앱이 스스로 정책을 정한다.
const zone: FormatTimeZone = canFormatTimeZone('Asia/Seoul') ? 'Asia/Seoul' : 'UTC';

try {
  renderRow(formatSomething(zone));
} catch (error) {
  if (isFormatError(error)) {
    // 설정 오류 3종 + 환경 오류 2종
    error.code; // 'ERR_TIMEZONE_INVALID' | 'ERR_LOCALE_INVALID' | 'ERR_FRACTION_DIGITS_INVALID' | 'ERR_INTL_UNUSABLE' | 'ERR_INTL_FIELD_OUTPUT'
  }
}

function formatSomething(timeZone: FormatTimeZone): string {
  return timeZone;
}
```

`canFormatTimeZone`은 던지지 않고 `boolean`을 준다. `'UTC'`와 `'device'`는 언제나 `true`다(Intl을 쓰지 않으므로). 결과는 캐시된다 — 런타임 전역 자기검사는 최대 1회, 각 존은 최대 1회 검사되고 이후로는 맵 조회다.

`isFormatError`는 `instanceof`가 아니라 태그 검사다. ESM과 CJS가 한 런타임에 동시에 로드돼도 참을 유지한다.

---

## Hermes에서 무엇이 왜 안전한가

타깃은 Expo SDK 56 = React Native 0.85 = Hermes v0.16이고, Android Hermes는 Intl을 켜서 빌드된다(`android.icu` 위임).

**이 패키지가 호출하는 Intl은 두 가지가 전부다.**

1. `Intl.NumberFormat` — `style: 'decimal'` + 최소/최대 소수 자릿수. Hermes 지원 목록에 있다.
2. `Intl.DateTimeFormat` — `timeZone` + **단일 숫자 필드 하나** + `hourCycle: 'h23'` + `hour12: false`. `.format()`만 쓰고, 파트 분해 API는 쓰지 않는다.

파트 분해 API가 Hermes에 없다는 것이 (2)의 구현을 결정했다. 합성된 날짜 문자열을 되파싱하는 대신, 연/월/일/시/분 각각에 대해 포매터를 하나씩 만들어 숫자 하나씩 읽는다. 로케일은 `'en-US'`로 고정한다 — 요청하는 필드가 어느 로케일에서나 숫자이므로, 고정이 변수를 하나 없앤다.

`'UTC'`와 `'device'` 경로는 **Intl을 전혀 호출하지 않는다.** 그래서 Hermes 편차의 영향권 밖이다. `parseIsoInstant`도 마찬가지다.

**정직하게 적어 두는 잔존 리스크.** `hourCycle`과 `hour12`는 Hermes의 Intl 문서에 **지원 목록에도, 미지원 목록에도 나오지 않는다.** IANA 경로의 모든 시각 렌더가 여기 걸려 있다. 완화는 세 겹이다.

1. 두 옵션을 **함께** 준다. 스펙상 `hour12`가 우선하고 둘은 같은 0–23 시계를 지시하므로, 엔진이 어느 하나만 알아도 정답이 나온다.
2. 런타임 1회 자기검사가 **값으로** 확인한다. `13:05 UTC`의 시각 필드가 `'13'`이 아니면 `ERR_INTL_UNUSABLE`이다. 즉 실패하면 렌더 도중 무작위로 터지는 것이 아니라 `canFormatTimeZone` 프로브에서 잡힌다.
3. 실기기 스모크에서 실패가 확인되면 내부 구현만 교체한다(존 오프셋만 얻어 산술로 벽시계를 합성). 공개 표면은 변하지 않는다.

자기검사는 모양이 아니라 **값**을 본다. `/^\d+$/`만 보는 검사는 이 패키지가 막으려는 실패를 통과시킨다 — 엔진이 `timeZone`을 무시하고 기기 벽시계를 돌려줘도 출력은 여전히 숫자이기 때문이다. 검사는 세 가지다: `'UTC'`가 실제 UTC를 내는가, `'Etc/GMT-9'`가 실제 +09:00을 내는가(기기가 UTC+0일 때를 위한 짝), 13시가 `'13'`인가.

또한 IANA 이름의 대소문자 정규화·별칭 처리가 Hermes에서 ECMA-402와 다를 가능성은 미실측이다. 정식 표기(`Area/City`)를 쓰고, 오프 스펙 입력은 `ERR_TIMEZONE_INVALID`로 즉사하게 두었다 — 조용한 오출력은 없다.

비-Expo React Native 소비자에게: 산출물은 `es2022` 문법이다. Expo/Metro는 `node_modules`를 babel로 변환하므로 문제가 없지만, 직접 번들링한다면 트랜스파일 대상에 포함시켜야 한다.

---

## `exactOptionalPropertyTypes` 소비자 보호

모든 옵셔널 필드는 `?: T | undefined`로 선언돼 있다. EOP를 켠 소비 앱이 `string | undefined` 값을 그대로 넘겨도 컴파일이 깨지지 않고, 그때 **반환 타입이 조용히 넓어지지도 않는다**.

```ts
import { formatRelativeKo, formatBytes } from '@gj-kit/format';

declare const maybeLabel: string | undefined;

const now = new Date(Date.UTC(2026, 5, 8, 11, 24, 43));

// TS2379 없이 통과하고, 반환 타입은 여전히 string이다.
const label: string = formatRelativeKo(now, {
  now,
  suffixSpace: false,
  fallback: '-',
  onFuture: 'empty',
  justNowLabel: maybeLabel,
});

// 제네릭 fallback은 정확히 준 타입만큼만 넓힌다.
const size: string | null = formatBytes(0, {
  system: 'decimal',
  unitSpace: false,
  nonPositive: 'fallback',
  fallback: null,
});
```

---

## 조합 레시피

`storageUsage` · `storagePair` 같은 앱 카피 조합은 라이브러리에 넣지 않았다. 한 줄이면 되고, 괄호나 슬래시 같은 표기는 제품 결정이기 때문이다.

```ts
import { formatBytes, formatPercent, storageRatio } from '@gj-kit/format';
import type { FormatBytesOptions } from '@gj-kit/format';

const bytesStyle: FormatBytesOptions = {
  system: 'decimal',
  unitSpace: true,
  fractionDigits: 1,
  trailingZeros: 'keep',
  nonPositive: 'render',
};

function storageUsage(used: number | null, limit: number | null): string {
  const ratio = formatPercent(storageRatio(used, limit), { locale: 'ko-KR' });
  const pair = `${formatBytes(used, bytesStyle)} / ${formatBytes(limit, bytesStyle)}`;
  return ratio === '-' ? pair : `${pair} (${ratio})`;
}

storageUsage(usedBytes, limitBytes); // '630.0 MB / 1.0 GB (63%)'
```

`@gj-kit/expo-ui`의 `CalendarDate`(평면 `{ year, month, day }`)와의 브리지도 소비 앱이 세 줄로 만든다. 어느 쪽 패키지에 넣어도 패키지 간 타입 의존이 생겨 이 패키지의 peer 0이 깨지기 때문이다.

```ts
import { formatDateOnly } from '@gj-kit/format';
import type { FormatTimeZone } from '@gj-kit/format';

function toCalendarDate(
  instant: Date,
  timeZone: FormatTimeZone,
): { year: number; month: number; day: number } {
  const key = formatDateOnly(instant, { timeZone, separator: '-' });
  const [year, month, day] = key.split('-').map(Number);
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}

toCalendarDate(new Date(Date.UTC(2026, 5, 8, 15, 0)), appTimeZone);
```

역할 분담은 한 문장이다: **입력은 civil date(`expo-ui`), 출력은 instant(`format`).** 사용자가 달력에서 고른 "날"은 시간대에 따라 달라지는 순간값이면 안 되고, 이미 확정된 순간을 사람이 읽는 문자열로 내리는 일은 `Date`(또는 epoch ms)일 수밖에 없다.

---

## API 표면

| 심볼 | 종류 | 요약 |
|---|---|---|
| `formatDateTime` · `formatDateOnly` · `formatMonthDayTime` | 함수 | 고정폭 날짜 3종. `timeZone`·`separator` 필수 |
| `parseIsoInstant` | 함수 | 엄격 ISO 8601 → instant. `assumeNoOffset` 필수 |
| `relativeBucket` · `formatRelativeKo` | 함수 | 상대시간 분류 / 한국어 카피. `now` 필수 |
| `formatDurationKo` | 함수 | 소요시간 ms → `'0.8초'` · `'5분'` · `'1.2시간'` |
| `formatBytes` | 함수 | 바이트. `system`·`unitSpace`·`nonPositive` 필수 |
| `formatKrw` | 함수 | 원화. `style`·`locale` 필수 |
| `formatNumber` · `formatPercent` | 함수 | 그룹핑 수 / 백분율. `locale` 필수 |
| `storageRatio` | 함수 | 0–1 비율 산술(문자열을 만들지 않는다) |
| `formatText` | 함수 | 빈 셀 폴백 |
| `canFormatTimeZone` | 함수 | 던지지 않는 환경 프로브 |
| `FormatError` · `isFormatError` | 클래스·가드 | 설정·환경 오류 |
| `FormatDateInput` · `FormatTimeZone` · `FormatLocale` | 타입 | 공유 입력 타입 |
| `FormatErrorCode` · `FormatRelativeBucket` · `FormatDecimalByteUnit` · `FormatBinaryByteUnit` | 타입 | 닫힌 유니언 |
| `FormatDateOptions` · `IsoParseOptions` · `FormatRelativeKoOptions` · `FormatDurationKoOptions` · `FormatBytesOptions` · `FormatKrwOptions` · `FormatNumberOptions` · `FormatPercentOptions` | 타입 | 옵션 |

공개 엔트리는 `'.'` 하나다. 서브패스가 없으므로 internal 모듈을 deep import할 수 없다. `sideEffects: false` + ESM tree-shaking으로 안 쓰는 함수는 소비자 번들에서 빠진다.

---

## 명명 규약

- 공개 타입은 전부 `Format` 접두다(`FormatTimeZone`·`FormatBytesOptions`…). 소비 앱이 형제 패키지들과 같은 파일에서 import하므로 무접두 이름은 충돌한다.
- 출력 문자열에 **한국어 리터럴이 항상 박히는** 함수만 `Ko` 접미를 갖는다(`formatRelativeKo`·`formatDurationKo`). `formatKrw`는 예외다 — `KRW`는 언어가 아니라 ISO 4217 통화 코드이고, 한국어는 `style: 'suffix-ko'`라는 **옵션 값**에만 나타난다.
- `storageRatio`만 `format` 접두가 없다. 문자열을 만들지 않는 산술이기 때문이다.

---

## 개발

```sh
corepack pnpm --filter @gj-kit/format build
corepack pnpm --filter @gj-kit/format typecheck    # src(플랫폼 중립) + tests 두 프로젝트
corepack pnpm --filter @gj-kit/format test         # unit
corepack pnpm --filter @gj-kit/format test:types   # 타입 테스트
corepack pnpm --filter @gj-kit/format check:readme # 이 문서의 모든 ts 블록을 dist 타입으로 컴파일
```

`tests/unit/guards/`의 가드가 소스와 산출물 양쪽에서 Hermes 미지원 Intl API·로케일 위임 스타일·엔진 날짜 문자열 파싱·Node/DOM 전역을 정적으로 금지한다. `tsconfig.src.json`은 `types: []` · `lib: ["ES2022"]`로 같은 규율을 타입 체커에게도 시킨다 — 문자열 스캔이 놓치는 유출은 여기서 죽는다.

## 라이선스

MIT
