# @gj-kit/expo-ui — 공개 API 표면 설계 (확정)

> 작성: 2026-08-10. 설계안 3개(TypeSafetyFirst / DXFirst / MinimalSurface) 경쟁 → 심사 3건(재사용성 / 타입 안전 / 이관 현실성) → 합성.
> 전신: memorylog2 `@memorylog/ui`(컴포넌트 18종) + `apps/mobile` 키보드·safe-area 유틸 4종.
> 구현 코드의 주석은 이 문서의 §번호를 역참조한다.

## 0. 채택 맵

| 심사 점수 | 재사용성 | 타입 안전 | 이관 현실성 |
|---|---|---|---|
| A: TypeSafetyFirst | 79 | **85** | 83 |
| B: DXFirst | **82** | 72 | **85** |
| C: MinimalSurface | 69 | 73 | 76 |

**B를 섀시로, A·C를 접붙인다.** 채택 출처:

| 결정 | 출처 | 근거 |
|---|---|---|
| Provider `icons`/`strings` 주입 | B | memorylog2 어댑터 5종의 존재 이유 80%가 아이콘 주입 + 한국어 문구 — Provider 1회 주입으로 어댑터 계층 소멸 |
| insets 유틸 원명 보존 | B | 13개+ 파일과 가드 테스트가 물린 검증된 코드 — sed 한 줄 이관 |
| EOP 공개 규약 (`?: T \| undefined`) | B | tsc 실측: 플레인 `?:`는 exactOptionalPropertyTypes 소비자의 `error={maybe}` 관용 패턴을 깨뜨림 |
| `./theme` React-무관 엔트리 | A | B의 골든패스 결함 수정 — tailwind.config가 앱 테마 모듈을 require할 때 `"."` 경유면 Node에서 RN import로 즉사. 테마 생성·토큰은 React 0 엔트리에 격리 |
| `Metrics` 토큰 (control/input/icon/maxFontScale) | A | B의 얕은 sizing을 대체 — 치수 관통 완성. 구 buttonSizes 36/44/52, input 48, 1.25 상수의 토큰화 |
| `ThemePair` 브랜드 | A | 양 스킴 완전성을 타입이 보장. B의 `darkTheme` 옵트인 2-prop은 다크 누락 미검출로 기각 |
| WeakMap\<Theme\> 스타일 캐시 + 깊은 동결 | A | 렌더마다 스타일 재생성 없이 토큰 관통 |
| readonly 토큰 인터페이스 | A | B의 non-readonly는 컴파일 타임 변조 허용으로 기각 |
| `colors.shadow` 신설 | B | 전신은 그림자색을 colors.text로 유용 — 다크에서 흰 그림자 재발 경로 차단 |
| `Text` 프리미티브 + 닫힌 tone 유니언 | B+C | typography 토큰의 직접 소비자 신설. C의 닫힌 유니언 채택 — B의 `(string & {})` 탈출구는 토큰 오타를 조용히 통과시켜 기각 |
| 전 컴포넌트 `unstyled?: never` | C | 'prop 부재' 방식은 `{...props}` 스프레드 경유 잔재를 통과시킴이 실측됨 — `?: never`만 유효 |
| EmptyState `action` 객체 | C | actionLabel-without-onAction의 죽은 버튼을 구조로 차단. `?: never` 쌍 강제보다 좋은 에러 메시지 |
| 상수 export 폐지 (TOAST_DURATION_MS 등) | C | 옵션 기본값(durationMs)과 토큰(metrics.maxFontScale)으로 흡수 |
| createTailwindPreset 브랜드 입력 강제 | C | 손조립 토큰으로 preset 생성 차단 |
| 소스 격리 가드 테스트 | B+C | token-guard(컴포넌트 소스에 디자인 리터럴 금지) + entry-guard(theme/tailwind 소스에 react/react-native import 금지) |

**기각 결정 (심사 실측 근거):** C의 Toast 개명(88 콜사이트 파급), SelectableRow 병합(무내용=전체선택 폴백은 사일런트 오렌더), SelectionSize 유니언 폐지(호스트 클래스 맵 총망라 보장 상실), tabActive/tabInactive 삭제(시각 회귀), Button children 제거(킷 우회 유도), IntentScale(이관 비용 — v2 과제), 리터럴 브랜드 각인(교차 시 never 붕괴 — 저장소 확정 기법인 레코드 각인 사용). B의 TextField `style` 의미 무경고 변경(→ `style?: never` 차단 장치 추가), 전역 테마 스냅샷 무제한(→ 루트 Provider만 기록 + TSDoc).

---

## 1. 설계 원칙

전신의 핵심 결함: **토큰이 색상에만 관통**. tokens.json에 spacing/radius/typography/elevation이 있지만 `StyleSheet.create` 리터럴(`borderRadius: 8`, `fontSize: 13`, `minHeight: 44`)이 실제 외형을 결정 — 테마 교체로 색만 바뀌었다. 이번 불변식:

1. **컴포넌트 스타일에 디자인 리터럴 금지.** 모든 수치는 Theme 토큰(colors/spacing/radius/typography/elevation/metrics)에서 온다. `tests/unit/token-guard.test.ts`가 정적으로 강제한다(리뷰가 아니라 테스트가 규칙을 지킨다 — memorylog2 `bottomSurfaceInsetGuard` 기법).
2. **Theme은 브랜드 — createTheme/createThemes 경유로만 존재.** 손조립 토큰 객체는 컴파일 에러. 키 누락이 런타임 undefined 스타일로 새는 사고를 타입이 차단.
3. **검증 강제는 "잘못 쓰면 화면이 조용히 깨지는 지점"에만.** a11y 라벨 누락, 죽은 액션 버튼, 토큰 키 오타, 잔재 prop. 결제 라이브러리 수준 typestate는 UI 킷에 과잉(§6 기각 표).
4. **주입은 Provider 1회.** 아이콘·문구·테마를 앱이 한 곳에서 주입하면 어댑터 계층의 존재 이유가 사라진다.
5. **마이그레이션 잔재 전부 제거**: `unstyled`, 별칭 3종(Field/SelectionCheckCircle/ConfirmationActionRow), Toast `bottomOffset !== 96` 레거시 분기, `MEMORYLOG_LIGHT_THEME` 네이밍.

## 2. 모듈 구조와 exports 맵

```
expo-ui/                       # @gj-kit/expo-ui
├─ package.json                # sideEffects:false, ESM+CJS(tsup), 런타임 의존성 0
├─ tsup.config.ts              # entry: index/theme/insets/tailwind
└─ src/
   ├─ index.ts                 # "." 배럴
   ├─ theme.ts                 # "./theme" 배럴
   ├─ insets.ts                # "./insets" 배럴
   ├─ tailwind.ts              # "./tailwind" 배럴
   ├─ theme/                   # react·react-native import 0 (entry-guard 강제)
   │  ├─ brand.ts              # (비공개) unique symbol 레코드 각인 — 어떤 엔트리에서도 재export 금지
   │  ├─ tokens.ts             # 토큰 타입 + 키 유니언
   │  ├─ palettes.ts           # 내장 light/dark 팔레트 데이터
   │  └─ createTheme.ts        # createTheme/createThemes/lightTheme/darkTheme
   ├─ strings/strings.ts       # UiStrings + enStrings/koStrings ("."로 재export)
   ├─ components/              # "." — provider, text, button, fields, tabs, selection, layout, feedback, dialog
   ├─ insets/                  # keyboardReveal(순수) + hooks(safe-area-context 의존)
   └─ tailwind/preset.ts       # createTailwindPreset — theme/만 import
```

```jsonc
// package.json (발췌)
{
  "name": "@gj-kit/expo-ui",
  "sideEffects": false,
  "peerDependencies": {
    "react": ">=18",
    "react-native": ">=0.72",
    "react-native-safe-area-context": ">=4"
  },
  "peerDependenciesMeta": {
    "react-native-safe-area-context": { "optional": true }
  },
  "exports": {
    ".":          { "types": "./dist/index.d.ts",    "import": "./dist/index.js",    "require": "./dist/index.cjs" },
    "./theme":    { "types": "./dist/theme.d.ts",    "import": "./dist/theme.js",    "require": "./dist/theme.cjs" },
    "./insets":   { "types": "./dist/insets.d.ts",   "import": "./dist/insets.js",   "require": "./dist/insets.cjs" },
    "./tailwind": { "types": "./dist/tailwind.d.ts", "import": "./dist/tailwind.js", "require": "./dist/tailwind.cjs" },
    "./package.json": "./package.json"
  }
}
```

| 엔트리 | 내용 | 분리 이유 |
|---|---|---|
| `"."` | 컴포넌트 전부 + Provider/훅 + strings/icons + `./theme` 전체 재export | 앱 코드의 단일 import 지점 |
| `"./theme"` | 토큰 타입, createTheme(s), 내장 테마 — **react/react-native import 0** | ① 앱 테마 모듈이 여기만 import하면 tailwind.config(Node)에서 require 가능 ② 비-React 접근 ③ 테스트에서 RN alias 없이 순수 로드. toss-payments core(중립)/server(Node) 격리 규칙과 동형 |
| `"./insets"` | 키보드·safe-area 유틸 4종+α | `react-native-safe-area-context`를 optional peer로 격리. 미설치+import 시 번들 resolve 실패로 조기 발각(런타임 마법 없음) |
| `"./tailwind"` | createTailwindPreset | tailwind.config는 Node 평가 — RN 심볼 섞이면 로드 실패. 물리적 격리 |

`"."`의 어떤 컴포넌트도 insets를 import하지 않는다(단방향 — 소비자가 조합).

**exactOptionalPropertyTypes 규약**: 공개 props의 옵셔널 필드는 전부 `?: T | undefined`. 소비자가 `title={maybe}`로 undefined를 흘려도 에러가 나지 않는다(내부만 strict, 소비자에게 전파 금지). tsconfig는 루트 base extends(strict, EOP, verbatimModuleSyntax, **DOM lib 없음** — 웹 대응은 `Platform.OS === 'web'` 분기 + 캐스팅으로 한정).

## 3. 테마 시스템

### 3.1 브랜드 (비공개)

```ts
// src/theme/brand.ts — toss-payments core/brand.ts 확정 기법. 재export 금지.
const brand: unique symbol = Symbol('gj-kit/expo-ui#brand');   // Symbol.for 아님 — 전역 레지스트리 위조 차단
export type Brand<Name extends string> = {
  readonly [brand]: { readonly [K in Name]: true };            // 레코드 각인 — 교차 시 never 붕괴 없음
};
```

### 3.2 토큰 타입

```ts
// ─── "./theme" ───
export type ColorScheme = 'light' | 'dark';

/** 색상 롤 — 전신 23롤 유지 + shadow 신설(24롤). 이관 시 hex만 이동. */
export interface ThemeColors {
  readonly background: string; readonly surface: string; readonly surfaceSubtle: string;
  readonly text: string; readonly textMuted: string; readonly textSubtle: string;
  readonly tabActive: string; readonly tabInactive: string;
  readonly line: string;
  readonly primary: string; readonly primaryStrong: string; readonly primarySoft: string; readonly onPrimary: string;
  readonly danger: string; readonly dangerStrong: string; readonly dangerSoft: string; readonly onDanger: string;
  readonly warning: string; readonly warningStrong: string; readonly onWarning: string;
  readonly success: string; readonly info: string;
  readonly overlay: string;
  /** §0 — 전신은 그림자색을 colors.text로 유용. 다크에서 그림자는 텍스트색과 달라야 한다. */
  readonly shadow: string;
}

export interface ThemeSpacing {
  readonly none: 0; readonly xs: number; readonly sm: number; readonly md: number;
  readonly lg: number; readonly xl: number; readonly xxl: number; readonly xxxl: number;
}
export interface ThemeRadius { readonly none: 0; readonly sm: number; readonly md: number; readonly lg: number; readonly pill: number }

/** 전신 typography는 fontSize 숫자뿐 — weight·lineHeight가 컴포넌트에 하드코딩된 원인. 롤당 완전한 스타일로 확장. */
export type FontWeight = '400' | '500' | '600' | '700' | '800';
export interface TypeRole { readonly fontSize: number; readonly lineHeight: number; readonly fontWeight: FontWeight }
export interface ThemeTypography {
  readonly caption: TypeRole; readonly label: TypeRole; readonly button: TypeRole;
  readonly body: TypeRole; readonly title: TypeRole; readonly heading: TypeRole;
  /** 앱 커스텀 폰트 패밀리. 미지정 시 시스템 폰트. */
  readonly fontFamily?: string | undefined;
}

/** 전신 elevation은 Android 숫자뿐 — iOS shadow 4속성이 컴포넌트에 흩어져 있던 원인. */
export interface ElevationLevel {
  readonly elevation: number;                    // Android
  readonly shadowOpacity: number; readonly shadowRadius: number;
  readonly shadowOffsetY: number;                // shadowOffset.height (width 0 고정)
}
export interface ThemeElevation { readonly none: ElevationLevel; readonly sm: ElevationLevel; readonly md: ElevationLevel; readonly lg: ElevationLevel }

/** §0 A 채택 — 구 buttonSizes(36/44/52)·input 48·아이콘 16/18/20·폰트 스케일 캡 1.25의 토큰화. */
export interface ThemeMetrics {
  readonly control: { readonly sm: number; readonly md: number; readonly lg: number };
  readonly input: number;
  readonly icon: { readonly sm: number; readonly md: number; readonly lg: number };
  readonly maxFontScale: number;
}

export interface ThemeBreakpoints { readonly tablet: number; readonly desktop: number }

export interface ThemeTokens {
  readonly colors: ThemeColors; readonly spacing: ThemeSpacing; readonly radius: ThemeRadius;
  readonly typography: ThemeTypography; readonly elevation: ThemeElevation;
  readonly metrics: ThemeMetrics; readonly breakpoints: ThemeBreakpoints;
}

/** 자동완성용 키 유니언 — 컴포넌트 props가 받는다. */
export type ColorKey = keyof ThemeColors;
export type SpacingKey = keyof ThemeSpacing;
export type RadiusKey = keyof ThemeRadius;
export type ElevationKey = keyof ThemeElevation;
export type TextRole = Exclude<keyof ThemeTypography, 'fontFamily'>;
```

### 3.3 Theme / ThemePair / createTheme / createThemes

```ts
/** 해석 완료된 단일 스킴 테마. 브랜드 — createTheme 경유로만 존재. 깊은 동결. */
export interface Theme extends ThemeTokens, Brand<'Theme'> {
  readonly scheme: ColorScheme;
}

/** 라이트/다크 쌍 — 다크 전환을 원하는 Provider가 받는 형태. 역시 브랜드(양 스킴 완전성을 타입이 보장). */
export interface ThemePair extends Brand<'ThemePair'> {
  readonly light: Theme;
  readonly dark: Theme;
}

/** 2단 부분 오버라이드(그룹→키). typography role은 TypeRole 통째 교체 —
 *  3단 DeepPartial은 병합 규칙 암기 비용 > 이득 (§11). */
export type ThemeOverrides = {
  readonly [G in keyof ThemeTokens]?: Partial<ThemeTokens[G]> | undefined;
};

export const lightTheme: Theme;   // 값은 전신 tokens.json 계승
export const darkTheme: Theme;    // 신규 팔레트 (§3.6)

/** 부분 오버라이드 → 깊은 병합 → 깊은 동결 → 브랜드 각인. */
export function createTheme(base: ColorScheme | Theme, overrides?: ThemeOverrides): Theme;

/** "브랜드 컬러를 양 모드에 한 번에": shared → 스킴별 순으로 병합한 쌍 생성. */
export function createThemes(input?: {
  readonly shared?: ThemeOverrides | undefined;
  readonly light?: ThemeOverrides | undefined;
  readonly dark?: ThemeOverrides | undefined;
}): ThemePair;

/** createThemes() 무인자 결과 — 내장 쌍. */
export const defaultThemes: ThemePair;
```

### 3.4 Provider / 훅 / 다크 전환

```ts
// ─── "." (React 필요) ───
export interface UiProviderProps {
  /** Theme 하나 = 고정 스킴(전환 없음 — 명시적 결정). ThemePair = colorScheme 규칙으로 전환.
   *  기본 lightTheme. 손조립 토큰 객체는 브랜드 미보유로 컴파일 에러. */
  theme?: Theme | ThemePair | undefined;
  /** ThemePair일 때만 의미. 'system'(기본): RN Appearance 추종. 'light'/'dark': 앱 제어(설정 토글 등 — 영속화는 앱 소유). */
  colorScheme?: ColorScheme | 'system' | undefined;
  /** 기본 enStrings. 완전한 UiStrings만 — §4.1. */
  strings?: UiStrings | undefined;
  /** 아이콘 기본값 계층 — §4.2. 미지정 슬롯은 내장 폴백. */
  icons?: UiIcons | undefined;
  children?: ReactNode | undefined;
}
export function UiProvider(props: UiProviderProps): ReactElement;

/** 활성 스킴으로 해석된 Theme. Provider 없으면 lightTheme (Provider는 선택 — 전신과 동일). */
export function useTheme(): Theme;
export function useStrings(): UiStrings;
/** 해석된 현재 스킴 — 'system'이면 OS 값 반영 결과. */
export function useResolvedColorScheme(): ColorScheme;
```

컴포넌트는 `useTheme()` 하나만 읽는다 — colors가 이미 스킴 해석 완료이므로 **컴포넌트 내부에 스킴 분기가 존재하지 않는다**(분기 누락 버그가 구조적으로 불가능).

### 3.5 비-React 접근

```ts
/** 루트 UiProvider가 현재 흘리는 테마 스냅샷. Provider 이전/부재 시 lightTheme.
 *  리렌더 비유발 — expo-router 정적 옵션, 내비게이션 테마 등 비-React 경로 전용.
 *  중첩 Provider는 스냅샷을 쓰지 않는다(루트만 기록) — 다중 Provider 앱에서도 정의가 유일. */
export function getActiveTheme(): Theme;
/** 루트 테마 교체 구독(내비게이션 테마 동기화 용). 반환값은 해제 함수. */
export function subscribeActiveTheme(listener: (theme: Theme) => void): () => void;
```

정적 소비는 앱 테마 모듈에서 `import { light } from './theme'`으로 — 전신 `uiTokens` 상수는 `lightTheme`(또는 앱 테마)로 대체.

**스타일 캐시(§0 A)**: Theme은 깊은 동결로 정체성이 안정 — 내부 `makeStyles(theme)` 팩토리가 `WeakMap<Theme, Styles>` 캐시. 렌더마다 스타일 재생성 없이 토큰 관통.

### 3.6 내장 다크 팔레트

라이트는 전신 tokens.json 그대로(+`shadow: '#0F172A'`). 다크 제안값(구현 시 시각 확인으로 미세 조정):

| 롤 | light | dark |
|---|---|---|
| background / surface / surfaceSubtle | #FFFFFF / #FFFFFF / #F1F5F9 | #111418 / #1A1F26 / #232A33 |
| text / textMuted / textSubtle | #1D2733 / #777777 / #728094 | #E8ECF1 / #9AA4B0 / #7C8794 |
| tabActive / tabInactive / line | #2C3E50 / #94A3B8 / #E7E7E7 | #E8ECF1 / #5C6774 / #2A323C |
| primary / primaryStrong / primarySoft / onPrimary | #4A90E2 / #227AED / #EAF4FF / #FFFFFF | #5C9EEA / #3D8BF0 / #16283D / #FFFFFF |
| danger / dangerStrong / dangerSoft / onDanger | #FF5C8A / #FF4242 / #FFF0F3 / #FFFFFF | #FF6E96 / #FF5252 / #3A1E27 / #FFFFFF |
| warning / warningStrong / onWarning | #FFE45C / #D97706 / #1D2733 | #D9B83C / #F59E0B / #111418 |
| success / info / overlay / shadow | #4F96F4 / #1D2733 / rgba(15,23,42,0.40) / #0F172A | #5C9EEA / #E8ECF1 / rgba(0,0,0,0.55) / #000000 |

### 3.7 앱 부트스트랩 골든 패스

```ts
// app/src/theme.ts — 반드시 '@gj-kit/expo-ui/theme'에서 import (tailwind.config가 require하는 모듈이므로 RN 금지)
import { createThemes } from '@gj-kit/expo-ui/theme';
export const themes = createThemes({
  shared: { colors: { primary: '#4A90E2' } },
});
```

```tsx
// app/_layout.tsx
import { UiProvider, koStrings } from '@gj-kit/expo-ui';
import { Feather } from '@expo/vector-icons';
import { themes } from '../src/theme';

<UiProvider
  theme={themes}                    // ThemePair → 시스템 다크 추종. 라이트 고정이면 themes.light
  strings={koStrings}
  icons={{
    check:  ({ color, size }) => <Feather name="check" size={size} color={color} />,
    search: ({ color, size }) => <Feather name="search" size={size} color={color} />,
    empty:  ({ color, size }) => <Feather name="inbox" size={size} color={color} />,
    error:  ({ color, size }) => <Feather name="alert-circle" size={size} color={color} />,
    close:  ({ color, size }) => <Feather name="x" size={size} color={color} />,
    toast: {
      error:   ({ color, size }) => <Feather name="alert-circle" size={size} color={color} />,
      success: ({ color, size }) => <Feather name="check-circle" size={size} color={color} />,
      info:    ({ color, size }) => <Feather name="info" size={size} color={color} />,
      warning: ({ color, size }) => <Feather name="alert-triangle" size={size} color={color} />,
    },
  }}
>
```

### 3.8 토큰 소비 맵 (관통 보장 — token-guard가 강제)

| 토큰 | 소비 지점 (전부 — 하드코딩 잔존 없음) |
|---|---|
| `colors.*` | 전 컴포넌트 배경/보더/텍스트/플레이스홀더. `shadow`는 모든 그림자색 |
| `spacing.*` | Button 패딩(sm→md/md→lg/lg→xl), TextField 내부 패딩(lg/md), Surface·ContentFrame·Section·DialogPanel·상태 카드 padding/gap, 행 gap |
| `radius.*` | Button·TextField·Surface·Skeleton·상태 카드 sm, Tabs 컨테이너 md, DialogPanel lg, IconButton·SearchField·SelectionIndicator pill |
| `typography.*` | Text role 전부, Button 라벨=button(사이즈별 캡은 metrics), TextField 입력=body·라벨=label·헬퍼/카운터=caption, Section 제목=title·부제=caption, Dialog 제목=title, 상태 뷰=title/label/caption |
| `elevation.*` + `colors.shadow` | Surface elevation prop, StickyActionBar(md), Toast(md), segmented 활성 탭(sm) |
| `metrics.*` | Button minHeight=control.*, TextField·SearchField minHeight=input, 아이콘 기본 크기=icon.*, maxFontSizeMultiplier 기본=maxFontScale |
| `breakpoints.*` | tailwind preset screens (컴포넌트 소비는 없음 — 반응형은 앱 소유) |

## 4. strings · icons 주입

### 4.1 strings

```ts
export interface UiStrings {
  readonly loading: string;            // Skeleton a11y
  readonly emptyTitle: string;         // EmptyState 기본 제목
  readonly errorTitle: string;         // ErrorState 기본 제목
  readonly errorBody: string;          // ErrorState 기본 본문
  readonly retry: string;              // ErrorState 재시도 버튼
  readonly selectAll: string;          // SelectAllRow
  readonly deselectAll: string;
  readonly cancel: string;             // ConfirmActionRow
  readonly confirm: string;
  readonly close: string;              // Dialog 백드롭 a11y
  readonly searchPlaceholder: string;  // SearchField
}
export const enStrings: UiStrings;
export const koStrings: UiStrings;
```

- 우선순위: **개별 prop > Provider strings > 내장 en**.
- **의도된 강제: `Partial<UiStrings>` 불가.** 커스텀 번들은 `{ ...koStrings, retry: '다시 시도' }` 스프레드로. 라이브러리가 키를 추가하면 손조립 소비자에게 컴파일 에러로 표면화(누락 키가 조용히 영어로 새는 것 방지). 스프레드 사용자는 무비용.

### 4.2 icons

```ts
export type IconRenderProps = { readonly color: string; readonly size: number };
export type RenderIcon = (props: IconRenderProps) => ReactNode;

export interface UiIcons {
  readonly check?: RenderIcon | undefined;   // SelectionIndicator 마크 (폴백: ✓ 글리프)
  readonly search?: RenderIcon | undefined;  // SearchField leading (폴백: 미표시)
  readonly empty?: RenderIcon | undefined;   // EmptyState leading (폴백: 미표시)
  readonly error?: RenderIcon | undefined;   // ErrorState leading (폴백: 미표시)
  readonly close?: RenderIcon | undefined;   // (향후 Dialog 닫기 어포던스용 예약 — v1 미사용)
  readonly toast?: Partial<Record<ToastVariant, RenderIcon>> | undefined;  // Toast leading (폴백: 미표시)
}
```

런타임 의존성 0의 핵심: 아이콘 구현은 호스트 공급, 라이브러리는 색·크기만 계산. 컴포넌트별 `renderMark`/`leading` props가 개별 오버라이드 — icons는 기본값 계층.

## 5. 컴포넌트 시그니처

공통 규약:

```ts
/** 전 컴포넌트 공통 꼬리. unstyled?: never — 이관 잔재를 {...props} 스프레드 경유까지 컴파일 차단 (§0 C). */
type CommonProps = {
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;   // 해석 없이 네이티브 요소에 전달 — NativeWind는 호스트 관심사
  testID?: string | undefined;
  unstyled?: never;
};
```

오버라이드 규칙은 하나: 토큰 기반 기본 스타일 → `style`/`className` 최종 병합.

### 5.1 Text (신규)

```ts
// RN Text의 aria `role` prop을 가린다(이름 충돌) — 접근성 롤은 accessibilityRole로.
export interface TextProps extends Omit<RNTextProps, 'style' | 'role'> {
  role?: TextRole | undefined;              // 기본 'body' — size/lineHeight/weight/fontFamily 전부 토큰
  color?: ColorKey | undefined;             // 닫힌 유니언 — 오타는 에러, raw 색은 style로 (§0)
  style?: StyleProp<TextStyle> | undefined;
  className?: string | undefined;
  unstyled?: never;
}
export function Text(props: TextProps): ReactElement;
```

신설 근거: 전신엔 텍스트 프리미티브가 없어 앱이 `text-[13px] font-bold` 류를 수백 곳에 복제. RN Text를 가리는 이름은 업계 관행(Paper/Tamagui) — 필요 시 `import { Text as RNText }`.

### 5.2 Button

```ts
export type ButtonVariant =
  | 'primary' | 'primary-outline' | 'secondary'
  | 'destructive' | 'destructive-outline' | 'inverse';   // 'dark' → 'inverse' (다크 테마에서 의미 역전 해소)
export type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonOwnProps = {
  onPress?: (() => void) | undefined;
  variant?: ButtonVariant | undefined;      // 기본 'primary'
  size?: ButtonSize | undefined;            // 기본 'md' — metrics.control이 결정
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  /** 정적 노드 또는 렌더 함수 — 전신 icon/renderIcon/iconColor 3종 통합. */
  icon?: ReactNode | RenderIcon | undefined;
  iconSize?: number | undefined;            // 기본 metrics.icon.md
  maxFontSizeMultiplier?: number | undefined;   // 기본 metrics.maxFontScale
  accessibilityLabel?: string | undefined;  // 기본 label
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
} & CommonProps;

/** label 또는 children 중 하나는 필수 — 내용 없는 버튼은 컴파일 에러 (아이콘 단독은 IconButton). */
export type ButtonProps = ButtonOwnProps &
  ({ label: string; children?: ReactNode | undefined } | { label?: never; children: ReactNode });
export function Button(props: ButtonProps): ReactElement;
```

a11y: `accessibilityState={{ disabled, busy: loading }}` — 전신의 unstyled 분기별 비일관 제거, 단일 계약.

### 5.3 IconButton

```ts
export interface IconButtonProps extends Omit<CommonProps, 'unstyled'> {
  accessibilityLabel: string;               // 필수 유지 — 스크린리더 공백 방지
  icon: ReactNode | RenderIcon;
  onPress?: (() => void) | undefined;
  variant?: ButtonVariant | undefined;      // 기본 'secondary'
  size?: number | undefined;                // 지름, 기본 40 — 마크 크기 자동 산출(size*0.48)
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  unstyled?: never;
}
export function IconButton(props: IconButtonProps): ReactElement;
```

### 5.4 TextField

```ts
export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string | undefined;
  error?: string | undefined;               // 지정 시 보더/헬퍼 danger 계열 (helperText보다 우선)
  helperText?: string | undefined;
  counter?: string | undefined;
  labelAccessory?: ReactNode | undefined;
  /** 구 라이브러리에서 style은 "입력 스타일"이었다 — 의미 변경 무경고 이관 방지 차단 장치.
   *  컨테이너는 containerStyle, 입력은 inputStyle. */
  style?: never;
  containerStyle?: StyleProp<ViewStyle> | undefined;
  inputStyle?: StyleProp<TextStyle> | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  counterStyle?: StyleProp<TextStyle> | undefined;
  helperStyle?: StyleProp<TextStyle> | undefined;
  containerClassName?: string | undefined;
  inputClassName?: string | undefined;
  labelClassName?: string | undefined;
  counterClassName?: string | undefined;
  helperClassName?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}
export function TextField(props: TextFieldProps): ReactElement;
```

변경: `Field` 별칭 제거, multiline 시 `textAlignVertical: 'top'` 내장(어댑터 LEGACY_MULTILINE_INPUT_STYLE 흡수), 서체 body/label/caption·패딩 spacing·높이 metrics.input 토큰화(LEGACY_INPUT_STYLE의 존재 이유 제거).

### 5.5 SearchField

```ts
export interface SearchFieldProps extends Pick<TextInputProps,
  'value' | 'onChangeText' | 'onSubmitEditing' | 'autoFocus' | 'returnKeyType'> {
  placeholder?: string | undefined;         // 기본 strings.searchPlaceholder
  leading?: ReactNode | undefined;          // 기본 icons.search 렌더
  inputStyle?: StyleProp<TextStyle> | undefined;
  inputClassName?: string | undefined;
  style?: StyleProp<ViewStyle> | undefined; // 컨테이너 (pill)
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}
export function SearchField(props: SearchFieldProps): ReactElement;
```

### 5.6 Tabs (구 SegmentedTabs)

```ts
export interface TabItem<T extends string> {
  readonly label: string; readonly value: T; readonly disabled?: boolean | undefined;
}
export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: NoInfer<T>;                        // 오타 value가 items 추론을 오염시키지 못함
  onChange: (value: T) => void;
  variant?: 'segmented' | 'underline' | undefined;   // 기본 'segmented'
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}
export function Tabs<T extends string>(props: TabsProps<T>): ReactElement;
```

### 5.7 SelectionIndicator / SelectableRow / SelectAllRow

```ts
export type SelectionSize = 16 | 18 | 20 | 24;   // 리터럴 유니언 유지 — 호스트 클래스 맵 총망라 보장

export interface SelectionIndicatorProps extends Omit<CommonProps, 'unstyled'> {
  selected: boolean;
  showUncheckedMark?: boolean | undefined;
  size?: SelectionSize | undefined;         // 기본 24
  renderMark?: RenderIcon | undefined;      // 기본 icons.check → ✓ 글리프
  unstyled?: never;
}
export function SelectionIndicator(props: SelectionIndicatorProps): ReactElement;

export interface SelectableRowProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean | undefined;
  accessibilityLabel?: string | undefined;
  indicatorSize?: SelectionSize | undefined;
  renderMark?: RenderIcon | undefined;
  unstyled?: never;
}
export function SelectableRow(props: SelectableRowProps): ReactElement;

export interface SelectAllRowProps extends Omit<CommonProps, 'unstyled'> {
  selected: boolean;
  onPress: () => void;
  disabled?: boolean | undefined;
  showUncheckedMark?: boolean | undefined;  // 구 showUncheckedCheck 정리
  checkSize?: SelectionSize | undefined;
  selectLabel?: string | undefined;         // 기본 strings.selectAll
  deselectLabel?: string | undefined;       // 기본 strings.deselectAll
  renderMark?: RenderIcon | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  unstyled?: never;
}
export function SelectAllRow(props: SelectAllRowProps): ReactElement;
```

`SelectionCheckCircle` 별칭 제거. 마크·라벨 기본값이 Provider에서 — Selection.tsx 어댑터 존재 이유 소멸.

### 5.8 Surface / ContentFrame / Section / StickyActionBar

```ts
export interface SurfaceProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  padding?: SpacingKey | number | undefined;    // 기본 'lg' (구 padded boolean → 토큰 키)
  radius?: RadiusKey | undefined;               // 기본 'sm'
  elevation?: ElevationKey | undefined;         // 기본 'none' (구 elevated boolean → 토큰 키)
  bordered?: boolean | undefined;               // 기본 true
  unstyled?: never;
}
export function Surface(props: SurfaceProps): ReactElement;

export interface ContentFrameProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  maxWidth?: number | undefined;                // 기본 1040
  padding?: SpacingKey | number | undefined;    // 기본 'xl'
  topPadding?: SpacingKey | number | undefined;
  bottomPadding?: SpacingKey | number | undefined;
  center?: boolean | undefined;
  unstyled?: never;
}
export function ContentFrame(props: ContentFrameProps): ReactElement;

export interface SectionProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  title?: string | undefined;                   // typography.title
  subtitle?: string | undefined;                // typography.caption + textMuted (전신 13/400은 label과 굵기 불일치 — caption으로 정규화, 구현 확정)
  actions?: ReactNode | undefined;
  gap?: SpacingKey | number | undefined;        // 기본 'md'
  unstyled?: never;
}
export function Section(props: SectionProps): ReactElement;

export interface StickyActionBarProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  /** './insets' useBottomInset() 반환값을 꽂는 자리. 라이브러리가 직접 재지 않는 이유:
   *  safe-area peer를 "."에 끌어들이지 않기 위해. 기본 0. */
  bottomInset?: number | undefined;
  unstyled?: never;
}
export function StickyActionBar(props: StickyActionBarProps): ReactElement;
```

### 5.9 Skeleton

```ts
export interface SkeletonProps extends Omit<CommonProps, 'unstyled'> {
  radius?: RadiusKey | undefined;               // 기본 'sm'
  accessibilityLabel?: string | undefined;      // 기본 strings.loading
  unstyled?: never;
}
export function Skeleton(props: SkeletonProps): ReactElement;
```

`ThumbnailSkeleton` 삭제 — 3:4 비율은 memorylog 사진 도메인 잔재. `<Skeleton style={{ aspectRatio: 3/4 }} />` 조합으로 충분.

### 5.10 EmptyState / ErrorState

```ts
export interface EmptyStateProps extends Omit<CommonProps, 'unstyled'> {
  title?: string | undefined;                   // 기본 strings.emptyTitle
  body?: string | undefined;
  /** §0 C — label 없이 onPress 없는 죽은 버튼을 구조로 차단. */
  action?: { readonly label: string; readonly onPress: () => void } | undefined;
  leading?: ReactNode | undefined;              // 기본 icons.empty
  maxFontSizeMultiplier?: number | undefined;   // 기본 metrics.maxFontScale
  unstyled?: never;
}
export function EmptyState(props: EmptyStateProps): ReactElement;

export interface ErrorStateProps extends Omit<CommonProps, 'unstyled'> {
  title?: string | undefined;                   // 기본 strings.errorTitle
  message?: string | undefined;                 // 기본 strings.errorBody
  onRetry?: (() => void) | undefined;           // 있을 때만 버튼 렌더 — 죽은 버튼 불가
  retryLabel?: string | undefined;              // 기본 strings.retry
  leading?: ReactNode | undefined;              // 기본 icons.error
  maxFontSizeMultiplier?: number | undefined;
  unstyled?: never;
}
export function ErrorState(props: ErrorStateProps): ReactElement;
```

구 `EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER` 상수는 `metrics.maxFontScale` 토큰으로 흡수 — export 폐지.

### 5.11 Toast + useToastController

```ts
export type ToastVariant = 'error' | 'success' | 'info' | 'warning';   // 이름 보존 (88 콜사이트)
export type ToastPayload = { message: string; variant: ToastVariant };

export function useToastController<T extends ToastPayload = ToastPayload>(
  options?: { durationMs?: number | undefined }   // 기본 2800 — 구 TOAST_DURATION_MS 상수 흡수
): { toast: T | null; showToast: (t: T) => void; clearToast: () => void };

export interface ToastProps extends Omit<CommonProps, 'style' | 'unstyled'> {
  message: string;
  variant?: ToastVariant | undefined;           // 기본 'error'
  leading?: ReactNode | undefined;              // 기본 icons.toast[variant]
  /** 하단 거리(순수 수치). 기본 96. safe-area 합성은 useBottomInset()과 조합.
   *  구 bottomOffset!==96 레거시 스타일 분기 삭제 — 값은 위치에만 쓰인다. */
  bottomOffset?: number | undefined;
  containerStyle?: StyleProp<ViewStyle> | undefined;
  unstyled?: never;
}
export function Toast(props: ToastProps): ReactElement;
```

### 5.12 DialogPanel / Dialog / ConfirmActionRow

```ts
export interface DialogPanelProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  unstyled?: never;
}
export function DialogPanel(props: DialogPanelProps): ReactElement;

/** 구 BasicDialog 개명. Modal/portal/키보드 고급 제어는 앱 소유(§11). */
export interface DialogProps {
  children?: ReactNode | undefined;
  visible: boolean;
  onDismiss: () => void;
  dismissOnBackdrop?: boolean | undefined;      // 기본 true. 백드롭 a11y = strings.close
  testID?: string | undefined;
  unstyled?: never;
}
export function Dialog(props: DialogProps): ReactElement;

export interface ConfirmActionRowProps extends Omit<CommonProps, 'unstyled'> {
  onCancel: () => void;
  onConfirm: () => void;
  cancelLabel?: string | undefined;             // 기본 strings.cancel
  confirmLabel?: string | undefined;            // 기본 strings.confirm
  cancelVariant?: ButtonVariant | undefined;    // 기본 'secondary'
  confirmVariant?: ButtonVariant | undefined;   // 기본 'primary'
  /** 슈가: true면 confirmVariant 'destructive' (앱 ConfirmDialog가 매번 손으로 하던 매핑). */
  destructive?: boolean | undefined;
  loading?: boolean | undefined;                // confirm 로딩 — cancel 자동 disabled
  cancelLoading?: boolean | undefined;
  unstyled?: never;
}
export function ConfirmActionRow(props: ConfirmActionRowProps): ReactElement;
```

### 5.13 기타

```ts
export const PRESSABLE_FEEDBACK_CLASS = 'hover:brightness-90 active:scale-[0.98]';
// NativeWind 호스트 편의 상수 — 라이브러리 자신은 해석하지 않는다. (앱 11파일 사용 중 — 보존)
```

## 6. 검증 강제 지점 (tests/types 픽스처로 고정)

```ts
// ① Theme/ThemePair 브랜드 — 손조립 토큰 객체 차단
// @ts-expect-error 키 누락이 런타임 undefined로 새는 사고 차단
<UiProvider theme={{ colors: { primary: 'red' } }} />;

// ② IconButton accessibilityLabel 필수 — 스크린리더 공백 방지
// @ts-expect-error
<IconButton icon={gear} onPress={open} />;

// ③ Button 내용 필수 — label도 children도 없으면 에러
// @ts-expect-error
<Button icon={gear} onPress={open} />;

// ④ Tabs NoInfer — value 오타가 T 추론을 넓히지 못함
// @ts-expect-error 'alL'은 'all' | 'photo'에 없다
<Tabs items={[{ label: '전체', value: 'all' }, { label: '사진', value: 'photo' }]} value="alL" onChange={fn} />;

// ⑤ UiStrings 완전 객체 — 부분 객체는 에러 (키 추가 시 손조립 소비자에게 표면화)
// @ts-expect-error
<UiProvider strings={{ retry: '다시' }} />;

// ⑥ 토큰 키 유니언 — 오타는 에러, 자동완성 공짜
// @ts-expect-error 'x1'은 SpacingKey가 아니다
<Surface padding="x1" />;

// ⑦ unstyled 잔재 — 직접 지정·스프레드 경유 모두 차단
// @ts-expect-error
<Button label="저장" unstyled />;

// ⑧ TextField 구 style 의미 차단 — containerStyle/inputStyle로 명시 이관 강제
// @ts-expect-error
<TextField style={{ padding: 4 }} />;

// ⑨ EmptyState 죽은 버튼 차단 — label만 있는 action 불가
// @ts-expect-error onPress 누락
<EmptyState action={{ label: '추가' }} />;

// ⑩ Text 닫힌 tone — raw 문자열 색 불가 (style 탈출구 사용)
// @ts-expect-error
<Text color="#FF0000" />;
```

**의도적으로 걸지 않은 것 (비용 > 이득):** `error`/`helperText` 상호배제(둘 다 흘리는 실코드 존재 — "error 우선" 런타임 규칙이 더 쌈), variant 조건부 props(변형 간 prop 차이 없음), 테마 3단 DeepPartial 거부 강제(2단 제한은 타입으로 자연 표현됨), Dialog visible/onDismiss typestate(과잉).

## 7. "./insets"

```ts
// 순수 함수 — peer 불필요 (원명 보존: memorylog2 검증 코드의 sed 이관)
export function nativeBottomInset(bottomInset: number, platformOS?: string): number;
export function nativeBottomPadding(basePadding: number, bottomInset: number, platformOS?: string): number;
export function computeKeyboardRevealOffset(input: {
  currentOffset: number; inputHeight: number; inputTop: number;
  keyboardInset: number; reservedBottomHeight: number; viewportHeight: number;
  margin?: number | undefined;    // 신규 옵션 — 기본 16 (구 KEYBOARD_REVEAL_MARGIN 상수 흡수)
}): number | null;

// 훅 — react-native-safe-area-context 필요 (optional peer)
export function useBottomInset(): number;                          // web 0, native max(0, inset)
export function useBottomSheetPadding(designPadding: number): number;
export function useModalKeyboardOverlap(): number;                 // Android 엣지투엣지 Modal 보정 포함
```

- 원본 TSDoc(재현 근거 포함)을 그대로 이전한다 — KAV가 Modal 윈도우에서 동작하지 않는 실측, Android inset 합성 최소치 금지 규칙.
- `"."` ↔ `"./insets"` 결합은 단방향(소비자가 조합). 앱의 `bottomSurfaceInsetGuard.test.ts`는 앱에 남고 import 패턴만 갱신.

## 8. "./tailwind"

```ts
export interface TailwindPresetOptions {
  readonly prefix?: string | undefined;   // 기본 'ui' → bg-ui-surface, p-ui-lg, text-ui-title …
}
/** 브랜드 Theme 입력 강제 — 앱 커스텀 테마가 그대로 유틸리티에 반영(전신의 정적 preset 이중 진실 해소). */
export function createTailwindPreset(theme?: Theme, options?: TailwindPresetOptions): {
  theme: { extend: Record<string, unknown> };
};
export const defaultTailwindPreset: ReturnType<typeof createTailwindPreset>;
```

- fontSize는 `[size, { lineHeight, fontWeight }]` 튜플 방출 — `text-ui-title` 하나가 서체 3속성을 나른다.
- boxShadow는 elevation + colors.shadow에서 파생.
- 구 `ui-1..10` 숫자 별칭 미방출(semantic 키와 이중 표기였음).
- **다크 preset 미방출**: 런타임 테마 전환은 `useTheme()`이 정본, className 다크는 NativeWind `dark:` 소관. 두 진실 동기화 시도는 반드시 어긋난다. (재사용성 심사관의 `includeDark` 요청은 v2 검토 과제로 기록 — 라이트 온리인 memorylog2에 수요 없음.)

## 9. 테스트 전략 (3계층 — integration 없음)

| 계층 | 내용 |
|---|---|
| unit | vitest + **react-native → react-native-web alias** + @testing-library/react (jsdom). 토큰 관통(테마 교체 시 스타일 변화), strings/icons 폴백 체인, 다크 전환, insets 순수 함수, **token-guard**(컴포넌트 소스에 hex·fontSize·fontWeight 리터럴 금지), **entry-guard**(src/theme·src/tailwind에 react/react-native import 금지) |
| type | §6 픽스처 전부 — vitest typecheck + expectTypeOf + `@ts-expect-error` |
| integration | 없음 — 외부 서비스 부재. `test:all` = unit → types |

Platform 분기 테스트는 `Platform.OS` 모킹으로. README 예제는 toss-payments의 `scripts/check-readme.mjs` 패턴을 복제해 컴파일 검증.

## 10. memorylog2 이관 계획

전제: tarball 벤더링 — `pnpm pack` 산출 .tgz를 memorylog2 저장소에 커밋, `file:`로 참조(EAS/CI 재현 가능). npm publish 후 레지스트리 버전으로 교체.

### 10.1 심볼 매핑

| 기존 (@memorylog/ui) | 신규 (@gj-kit/expo-ui) | 비고 |
|---|---|---|
| `UiProvider` | `UiProvider` | props 확장 (theme: Pair 가능, strings, icons) |
| `useUiTheme` | `useTheme` | sed |
| `UiTheme` | `Theme` | 브랜디드 — 수제 조립 불가 |
| `defaultLightTheme` / `MEMORYLOG_LIGHT_THEME` / `uiTokens` | `lightTheme` 또는 앱 테마 모듈 | |
| `uiBreakpoints` | `lightTheme.breakpoints` | |
| `Field` | `TextField` | 별칭 제거 |
| `TextFieldProps.style`(입력 스타일) | `inputStyle` (`style?: never` 차단) | 컴파일 에러로 표면화 |
| `SegmentedTabs`/`SegmentedTabsProps`/`SegmentedTabItem` | `Tabs`/`TabsProps`/`TabItem` | albums.tsx·ui-catalog.tsx 직접 import 2파일 포함 |
| `SelectionCheckCircle`(+`showUncheckedCheck`) | `SelectionIndicator`(+`showUncheckedMark`) | |
| `ConfirmationActionRow` | `ConfirmActionRow` | |
| `BasicDialog` | `Dialog` | |
| `ButtonVariant 'dark'` | `'inverse'` | grep 치환 |
| `unstyled`(전 컴포넌트) | 삭제 — 테마 주입 + style/className 병합으로 대체 | |
| `ThumbnailSkeleton` | `Skeleton` + aspectRatio 스타일 | 앱 어댑터가 이미 자체 구현 |
| `EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER` | `theme.metrics.maxFontScale` | |
| `TOAST_DURATION_MS` | `useToastController({ durationMs })` 기본값 | |
| `tokens.json`/`tailwind-preset.cjs` | `createTailwindPreset(theme)` | tailwind.config 1곳 |
| `utils/` 4파일 | `@gj-kit/expo-ui/insets` 동명 | 앱 파일 삭제, import 경로 교체 |

### 10.2 파일별 수정 (완전 인벤토리)

| 파일 | 수정 요지 |
|---|---|
| `app/_layout.tsx` | UiProvider에 앱 테마(createThemes)·koStrings·icons 주입 |
| `src/theme.ts` (신설) | `'@gj-kit/expo-ui/theme'`에서 createThemes — memorylog 팔레트 |
| `components/Fields.tsx` | unstyled·LEGACY_* 삭제(토큰 기본값이 동일 시각 재현), style→inputStyle. SearchField 래퍼 삭제 후보 |
| `components/StateViews.tsx` | Skeleton/EmptyState/ErrorState 래퍼 대폭 축소(문구=strings·아이콘=icons), Toast 래퍼는 inset 합성만, ConfirmDialog는 앱 소유 존치 |
| `components/Selection.tsx` | 삭제 또는 CIRCLE_CLASS 화면용 얇은 래퍼만 |
| `components/Tabs.tsx` | 재export 1줄 |
| `components/Button.tsx` | 변경 0 (앱 소유 NativeWind Button 존치 — 후속 검토) |
| `components/ScreenShell.tsx` | ContentFrame import 경로 + 심볼 확인 (이관 심사관 지적 — 인벤토리 누락 방지) |
| `app/` 라우트 14파일 | useToastController 등 import 경로 sed |
| `app/(tabs)/albums.tsx`, `app/ui-catalog.tsx` | SegmentedTabs→Tabs 직접 수정. ui-catalog는 최대 단일 수정 파일 |
| `utils/` 4파일 + 테스트 | 파일 삭제, `@gj-kit/expo-ui/insets`로 교체, 가드 테스트 패턴 갱신 |
| `tailwind.config.js` | preset을 createTailwindPreset(앱 라이트 테마)로 |
| `packages/ui` | 삭제 (모든 소비 이관 후) |
| `package.json`(root/mobile) | `@memorylog/ui` 제거, `@gj-kit/expo-ui` file:.tgz 추가, build:workspace-deps에서 ui 제거 |

## 11. 의도적으로 뺀 것과 이유

| 뺀 것 | 이유 |
|---|---|
| ConfirmDialog/BottomSheet/완전한 Modal 시스템 | Modal 윈도우의 키보드·엣지투엣지·portal은 플랫폼 조합마다 다르고 앱 라우팅과 얽힘(memorylog2 실측). 레고 조각(Dialog+DialogPanel+ConfirmActionRow+useModalKeyboardOverlap)까지만. 전신 ConfirmDialog의 30개 스타일 props 지옥을 라이브러리로 들이지 않는다 |
| 아이콘 세트 내장 | 런타임 의존성 0과 충돌. RenderIcon 슬롯 + Provider icons가 상한 |
| ScreenShell·CachedImage 등 앱 컴포넌트 | 도메인 결합. 3개 앱 이상 반복 시 승격 |
| imperative 전역 toast (`toast.show()`) | 전역 싱글턴은 다중 Provider·테스트 격리와 충돌. useToastController로 충분(실사용 검증) |
| strings 복수형·포맷팅·locale 감지 | 문구 11개에 i18n 엔진은 과잉. 완전 객체 주입이면 앱 i18n과 조합 가능 |
| 다크 tailwind preset | §8 — 두 진실 동기화 금지. v2 검토 |
| 테마 3단 DeepPartial | 병합 규칙 암기 비용 > 이득. role 통째 교체 |
| IntentScale (intent×emphasis 격자) | 23롤 평면 대비 이관 비용 과대(테마 오버라이드·테스트 전면 수정) — v2 과제 |
| `./testing` 서브패스 | 픽스처가 필요한 외부 세계 없음 |
| Reanimated 연동 | peer 오염. RN 코어 Animated 펄스(Skeleton)가 상한 |
| RNW 전용 경로 확대 | DOM lib 없는 tsconfig 확정 — Platform 분기+캐스팅(Toast fixed/StickyActionBar sticky)에서 동결 |

## 12. 잔존 리스크

1. **다크 팔레트 시각 품질** — 제안값은 수치 유도. 실앱 검증 전까지 "합리적 기본값" 수준. memorylog2는 라이트 온리라 이번 라운드에서 실검증 불가.
2. **react-native-web alias 테스트의 네이티브 갭** — 네이티브 렌더러 특유 동작(includeFontPadding 등)은 unit에서 미검증. 이관 후 memorylog2의 jest-expo 스위트가 간접 보완.
3. **`style?: never`의 DX** — TextField에 style을 못 주는 것이 낯설 수 있음. TSDoc + 에러 메시지로 완화, containerStyle이 대체.
4. **tarball 벤더링 운영** — 라이브러리 수정 시 재-pack·재커밋 필요. publish 전 과도기 한정.
5. **Toast success/info 텍스트 색 차용** (구현 단계 발견) — success 배경엔 onPrimary, info 배경엔 colors.background를 텍스트 색으로 유용. onSuccess/onInfo 롤 부재 때문 — 커스텀 테마가 success를 primary 계열과 다르게 잡으면 대비 저하 가능. 롤 추가는 v2 검토(IntentScale과 함께).
6. **그림자 이중 경로** (구현 단계 결정) — RNW 0.21이 shadow* props를 deprecated 처리(테스트 실측)해 웹은 boxShadow, 네이티브는 shadow*+elevation으로 분기 방출. RN 0.76+의 네이티브 boxShadow 채택 시 통합 검토.
7. **웹 aria 병기** (구현 단계 발견) — RNW는 accessibilityState 객체를 DOM aria로 매핑하지 않아 aria-busy/aria-selected/aria-disabled를 병기함. 네이티브는 accessibilityState가 정본.
