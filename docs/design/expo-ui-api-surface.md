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
├─ tsup.config.ts              # native/web root를 순차 빌드 + theme/insets/tailwind
└─ src/
   ├─ index.shared.ts          # root 공개 표면의 단일 정본
   ├─ index.ts                 # React Native·fallback root
   ├─ index.web.ts             # browser·Node SSR root
   ├─ theme.ts                 # "./theme" 배럴
   ├─ insets.ts                # "./insets" 배럴
   ├─ tailwind.ts              # "./tailwind" 배럴
   ├─ theme/                   # react·react-native import 0 (entry-guard 강제)
   │  ├─ brand.ts              # (비공개) unique symbol 레코드 각인 — 어떤 엔트리에서도 재export 금지
   │  ├─ tokens.ts             # 토큰 타입 + 키 유니언
   │  ├─ palettes.ts           # 내장 light/dark 팔레트 데이터
   │  └─ createTheme.ts        # createTheme/createThemes/lightTheme/darkTheme
   ├─ strings/strings.ts       # UiStrings + enStrings/koStrings ("."로 재export)
   ├─ components/              # "." — 공개 컴포넌트 + 비공개 overlay kernel
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
    "react-native": ">=0.79",
    "react-native-safe-area-context": ">=4",
    "react-native-web": ">=0.21"
  },
  "peerDependenciesMeta": {
    "react-native-safe-area-context": { "optional": true },
    "react-native-web": { "optional": true }
  },
  // 최상위 main/module/types — node10 도구·구형 리졸버 구제 (리뷰 반영)
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  // 조건별 types — CJS 소비자는 d.cts, ESM은 d.ts (리뷰 확정 발견 반영:
  // type:module 패키지에서 단일 types는 node16 CJS에서 TS1479 'Masquerading as ESM')
  "exports": {
    ".": {
      "node":         { "import": { "types": "./dist/index.d.ts", "default": "./dist/index.web.js" },
                        "require": { "types": "./dist/index.d.cts", "default": "./dist/index.web.cjs" } },
      "browser":      { "import": { "types": "./dist/index.d.ts", "default": "./dist/index.web.js" },
                        "require": { "types": "./dist/index.d.cts", "default": "./dist/index.web.cjs" } },
      "react-native": { "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
                        "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" } },
      "import":         { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require":        { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./theme":    { "import": { "types": "./dist/theme.d.ts", "default": "./dist/theme.js" },
                    "require": { "types": "./dist/theme.d.cts", "default": "./dist/theme.cjs" } },
    "./insets":   { "import": { "types": "./dist/insets.d.ts", "default": "./dist/insets.js" },
                    "require": { "types": "./dist/insets.d.cts", "default": "./dist/insets.cjs" } },
    "./tailwind": { "import": { "types": "./dist/tailwind.d.ts", "default": "./dist/tailwind.js" },
                    "require": { "types": "./dist/tailwind.d.cts", "default": "./dist/tailwind.cjs" } },
    "./package.json": "./package.json"
  }
}
```

| 엔트리 | 내용 | 분리 이유 |
|---|---|---|
| `"."` | 컴포넌트 전부 + Provider/훅 + strings/icons + `./theme` 전체 재export. `react-native` 조건은 native 산출물, `node`·`browser` 조건은 `react-native-web` 직접 import 산출물을 선택 | 앱 코드의 단일 import 지점. 별칭 없는 Node SSR/CJS에서도 웹 산출물을 즉시 로드하고, 네이티브에는 RNW 설치를 강제하지 않음 |
| `"./theme"` | 토큰 타입, createTheme(s), 내장 테마 — **react/react-native import 0** | ① 앱 테마 모듈이 여기만 import하면 tailwind.config(Node)에서 require 가능 ② 비-React 접근 ③ 테스트에서 RN alias 없이 순수 로드. toss-payments core(중립)/server(Node) 격리 규칙과 동형 |
| `"./insets"` | 키보드·safe-area 유틸 4종+α | `react-native-safe-area-context`를 optional peer로 격리. 미설치+import 시 번들 resolve 실패로 조기 발각(런타임 마법 없음) |
| `"./tailwind"` | createTailwindPreset | tailwind.config는 Node 평가 — RN 심볼 섞이면 로드 실패. 물리적 격리 |

`"."`의 어떤 컴포넌트도 insets를 import하지 않는다(단방향 — 소비자가 조합).

**exactOptionalPropertyTypes 규약**: 공개 props의 옵셔널 필드는 전부 `?: T | undefined`. 소비자가 `title={maybe}`로 undefined를 흘려도 에러가 나지 않는다(내부만 strict, 소비자에게 전파 금지). tsconfig는 루트 base extends(strict, EOP, verbatimModuleSyntax, **DOM lib 없음** — 웹 대응은 `Platform.OS === 'web'` 분기 + 캐스팅으로 한정).

bare React Native Web 앱이 DOM lib와 React Native 전역 선언을 한 tsconfig에서 검사하면 `Blob`, `FormData` 등의 중복 선언이 나타날 수 있다. 이는 runtime export 선택 문제가 아니라 declaration 조합 문제다. 소비자는 `skipLibCheck: true`를 사용하거나 native/web tsconfig를 분리한다. `skipLibCheck`는 declaration 파일 간 검사만 생략하고 앱 `.ts`·`.tsx` source 검사는 유지하며, runtime alias는 필요 없다.

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
  /** underline Tabs 라벨 전용 — 전신 16/'600'은 어느 롤과도 불일치해 승격(리뷰 확정 발견 반영, 2026-08-10). */
  readonly tab: TypeRole;
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

내장 light/dark 팔레트의 현재 값:

| 롤 | light | dark |
|---|---|---|
| background / surface / surfaceSubtle | #FFFFFF / #FFFFFF / #F1F5F9 | #111418 / #1A1F26 / #232A33 |
| text / textMuted / textSubtle | #1D2733 / #5D6675 / #667085 | #E8ECF1 / #9AA4B0 / #8893A0 |
| tabActive / tabInactive / line | #2C3E50 / #667085 / #E7E7E7 | #E8ECF1 / #9AA4B0 / #2A323C |
| primary / primaryStrong / primarySoft / onPrimary | #1769C2 / #0E5CAD / #EAF4FF / #FFFFFF | #5C9EEA / #6BAAF0 / #16283D / #111418 |
| danger / dangerStrong / dangerSoft / onDanger | #B4232C / #B4232C / #FFF0F3 / #FFFFFF | #FF8FAF / #B4232C / #3A1E27 / #FFFFFF |
| warning / warningStrong / warningSoft / onWarning | #92400E / #92400E / #FFF8D6 / #FFFFFF | #F6C453 / #92400E / #3B331B / #FFFFFF |
| success / successStrong / successSoft / onSuccess | #0E765D / #0E765D / #E8F7F2 / #FFFFFF | #54C7A3 / #0E765D / #15382F / #FFFFFF |
| info / infoStrong / infoSoft / onInfo | #1E63B0 / #1E63B0 / #EAF4FF / #FFFFFF | #72A8E7 / #1E63B0 / #172B43 / #FFFFFF |
| overlay / shadow | rgba(15,23,42,0.40) / #0F172A | rgba(0,0,0,0.55) / #000000 |

### 3.7 앱 부트스트랩 골든 패스

```ts
// app/src/theme.ts — 반드시 '@gj-kit/expo-ui/theme'에서 import (tailwind.config가 require하는 모듈이므로 RN 금지)
import { createThemes } from '@gj-kit/expo-ui/theme';
export const themes = createThemes({
  light: { colors: { primary: '#1769C2', primaryStrong: '#0E5CAD' } },
  dark: { colors: { primary: '#5C9EEA', primaryStrong: '#6BAAF0' } },
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
| `typography.*` | Text role 전부, Button 라벨 fontSize=사이즈별 롤 차용(sm=label/md=button/lg=body — 전신 13/14/15 보존, 굵기=button 롤; 리뷰 발견 반영해 명시), TextField 입력=body·라벨=label·헬퍼/카운터=caption, Tabs segmented=label(활성 굵기 title)/underline=tab(비활성 굵기 body), SelectAllRow 라벨=button, Section 제목=title·부제=caption, Dialog 제목=title, 상태 뷰=title/label/caption |
| `elevation.*` + `colors.shadow` | Surface elevation prop, StickyActionBar(md), Toast(md), segmented 활성 탭(sm) |
| `metrics.*` | Button minHeight=control.*, TextField·SearchField minHeight=input, 아이콘 기본 크기=icon.*, maxFontSizeMultiplier 기본=maxFontScale |
| `breakpoints.*` | tailwind preset screens + native DataTable `auto`의 compact list/table, native Pagination `auto`의 compact/full 경계(tablet). 웹의 두 `auto`는 breakpoint와 무관하게 semantic table·full numbered navigation 유지 |

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
  readonly sortAscending: string;      // DataTable compact sort 상태
  readonly sortDescending: string;
  readonly sortUnsorted: string;
  readonly previousPage: string;       // Pagination 이전 control
  readonly nextPage: string;           // Pagination 다음 control
}
export const enStrings: UiStrings;
export const koStrings: UiStrings;
```

- 우선순위: **개별 prop > Provider strings > 내장 en**.
- **의도된 강제: `Partial<UiStrings>` 불가.** 커스텀 번들은 `{ ...koStrings, retry: '다시 시도' }` 스프레드로. 라이브러리가 키를 추가하면 손조립 소비자에게 컴파일 에러로 표면화(누락 키가 조용히 영어로 새는 것 방지). 스프레드 사용자는 무비용.
- DataTable compact sort 기본값은 en `sorted ascending` / `sorted descending` / `not sorted`, ko `오름차순 정렬됨` / `내림차순 정렬됨` / `정렬되지 않음`이다. semantic web table의 현재 방향은 별도 문구가 아니라 `<th aria-sort>`가 정본이다.
- Pagination control 기본값은 en `Previous page` / `Next page`, ko `이전 페이지` / `다음 페이지`다. numbered status는 count로 계산하고 cursor status는 데이터 의미를 아는 앱이 필수 prop으로 제공하므로 동적 formatter를 Provider에 추가하지 않는다.

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

/** label 또는 children 중 하나는 필수 — 내용 없는 버튼은 컴파일 에러 (아이콘 단독은 IconButton).
 *  children은 NonNullable — children={maybeUndefined} 우회를 좁힌다(리뷰 확정 발견 반영).
 *  빈 문자열 등 런타임 공백까지는 타입으로 막지 못한다(§6 ③ 경계). */
export type ButtonProps = ButtonOwnProps &
  ({ label: string; children?: ReactNode | undefined } | { label?: never; children: NonNullable<ReactNode> });
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
  showCloseButton?: boolean | undefined;
  closeAccessibilityLabel?: string | undefined;
  closeButtonTestID?: string | undefined;
  unstyled?: never;
}
export function DialogPanel(props: DialogPanelProps): ReactElement;

export type DialogDismissReason =
  | 'backdrop-press' | 'escape-key' | 'hardware-back'
  | 'accessibility-escape' | 'close-action';
export interface DialogDismissDetails {
  readonly overlayId: string;
  readonly reason: DialogDismissReason;
  readonly originalEvent?: unknown;
}
export type DialogPresentation = 'modal' | 'inline';
export interface DialogFocusable { focus?: (() => void) | undefined }
export type DialogFocusRef = RefObject<DialogFocusable | null>;
export type DialogPanelElement = ReactElement<DialogPanelProps, typeof DialogPanel>;

interface DialogBaseProps {
  visible: boolean;
  onDismiss: (details: DialogDismissDetails) => void; // () => void도 할당 가능
  dismissOnBackdrop?: boolean | undefined;
  dismissDisabled?: boolean | undefined;
  animationType?: 'none' | 'slide' | 'fade' | undefined;
  initialFocusRef?: DialogFocusRef | undefined;
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  overlayStyle?: StyleProp<ViewStyle> | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  inlineStyle?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
  unstyled?: never;
}
export type DialogProps = DialogBaseProps & (
  | {
      children: DialogPanelElement;
      presentation?: DialogPresentation | undefined;
      accessibilityLabel?: string | undefined;
    }
  | {
      children: Exclude<NonNullable<ReactNode>, DialogPanelElement>;
      presentation?: 'modal' | undefined;
      accessibilityLabel: string;
    }
  | {
      children: NonNullable<ReactNode>;
      presentation: 'inline';
      accessibilityLabel?: never;
    }
);
export function Dialog(props: DialogProps): ReactElement | null;

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

### 5.13 ActionSheet (v0.4 source preview)

```ts
export interface ActionSheetItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string | undefined;
  readonly accessibilityLabel?: string | undefined;
  readonly destructive?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly testID?: string | undefined;
}

export type ActionSheetPresentation = 'auto' | 'bottom' | 'center';
export type ActionSheetDismissDetails<T extends string> =
  | DialogDismissDetails
  | { readonly overlayId: string; readonly reason: 'cancel-action'; readonly originalEvent?: unknown }
  | { readonly overlayId: string; readonly reason: 'action-select'; readonly value: T; readonly originalEvent?: unknown };

export interface ActionSheetProps<T extends string> extends Omit<CommonProps, 'unstyled'> {
  visible: boolean;
  title: string;
  description?: string | undefined;
  items: readonly ActionSheetItem<T>[];
  onDismiss: (details: ActionSheetDismissDetails<NoInfer<T>>) => void;
  cancelLabel?: string | undefined;
  presentation?: ActionSheetPresentation | undefined;
  animationType?: 'none' | 'slide' | 'fade' | undefined;
  dismissOnBackdrop?: boolean | undefined;
  dismissDisabled?: boolean | undefined;
  busy?: boolean | undefined;
  bottomInset?: number | undefined;
  keyboardOverlap?: number | undefined;
  accessibilityLabel?: string | undefined;
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  unstyled?: never;
}
export function ActionSheet<const T extends string>(props: ActionSheetProps<T>): ReactElement;
```

### 5.14 Sheet (v0.4 source preview)

```ts
export type SheetPresentation = 'auto' | 'bottom' | 'start' | 'end';
export type SheetOpenChangeDetails = DialogDismissDetails;

export interface SheetSafeAreaInsets {
  readonly top?: number | undefined;
  readonly right?: number | undefined;
  readonly bottom?: number | undefined;
  readonly left?: number | undefined;
}

interface SheetBaseProps extends Omit<CommonProps, 'unstyled'> {
  open: boolean;
  onOpenChange: (open: boolean, details: SheetOpenChangeDetails) => void;
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  presentation?: SheetPresentation | undefined;
  accessibilityLabel?: string | undefined;
  closeAccessibilityLabel?: string | undefined;
  dismissOnBackdrop?: boolean | undefined;
  dismissDisabled?: boolean | undefined;
  initialFocusRef?: DialogFocusRef | undefined;
  finalFocusRef?: DialogFocusRef | undefined;
  overlayId?: string | undefined;
  safeAreaInsets?: SheetSafeAreaInsets | undefined;
  keyboardOverlap?: number | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  bodyStyle?: StyleProp<ViewStyle> | undefined;
  bodyClassName?: string | undefined;
  footerStyle?: StyleProp<ViewStyle> | undefined;
  footerClassName?: string | undefined;
  unstyled?: never;
}

type InternallyScrolledSheetProps = {
  scrollMode?: 'internal' | undefined;
  children: NonNullable<ReactNode>;
  contentContainerStyle?: StyleProp<ViewStyle> | undefined;
  contentContainerClassName?: string | undefined;
};

type ConsumerScrolledSheetProps = {
  scrollMode: 'provided';
  children: ReactElement;
  contentContainerStyle?: never;
  contentContainerClassName?: never;
};

export type SheetProps = SheetBaseProps &
  (InternallyScrolledSheetProps | ConsumerScrolledSheetProps);
export function Sheet(props: SheetProps): ReactElement;
```

`open`은 앱이 소유하고 Sheet는 허용된 dismissal에서 `onOpenChange(false, details)`만 요청한다. `auto`는 compact 화면의 bottom과 태블릿 이상의 logical end를 선택하며 `start`·`end`는 RTL을 따른다. title/close header와 footer는 고정되고 기본 internal body만 스크롤된다. 가상화 목록은 `scrollMode="provided"`의 단일 React element로 넘겨 스크롤을 앱이 소유하며 content-container prop과 함께 쓸 수 없다.

`safeAreaInsets`는 safe-area-context 타입을 root entry에 결합하지 않는 structural 값이다. `keyboardOverlap > 0`이면 이미 safe area가 포함된 값으로 보고 `safeAreaInsets.bottom`을 대체한다. modal naming·focus·backdrop/Escape/Back/accessibility escape·child-first stack은 Dialog와 같은 정본을 쓴다. drag·snap·grabber·`defaultOpen`은 공개하지 않고 optional `BottomSheet` adapter의 별도 release gate로 남긴다.

### 5.15 Slider (v0.4 source preview)

```ts
export type SliderDirection = 'ltr' | 'rtl';

export interface SliderSharedProps extends CommonProps {
  min?: number | undefined;
  max?: number | undefined;
  step?: number | undefined;
  disabled?: boolean | undefined;
  direction?: SliderDirection | undefined;
  valueText?: ((value: number) => string) | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  trackStyle?: StyleProp<ViewStyle> | undefined;
  trackClassName?: string | undefined;
  rangeStyle?: StyleProp<ViewStyle> | undefined;
  rangeClassName?: string | undefined;
  thumbStyle?: StyleProp<ViewStyle> | undefined;
  thumbClassName?: string | undefined;
}

export interface SingleSliderProps extends SliderSharedProps {
  mode?: 'single' | undefined;
  value: number;
  onValueChange: (value: number) => void;
  onValueCommit?: ((value: number) => void) | undefined;
  accessibilityLabel: string;
  accessibilityLabels?: never;
  minDistance?: never;
}

export interface RangeSliderProps extends SliderSharedProps {
  mode: 'range';
  value: readonly [number, number];
  onValueChange: (value: readonly [number, number]) => void;
  onValueCommit?: ((value: readonly [number, number]) => void) | undefined;
  accessibilityLabels: readonly [string, string];
  accessibilityLabel?: never;
  minDistance?: number | undefined;
}

export type SliderProps = SingleSliderProps | RangeSliderProps;
export function Slider(props: SliderProps): ReactElement;
```

수평 controlled primitive다. 웹은 pointer/track과 Arrow·PageUp/Down·Home/End, 네이티브는 PanResponder와 adjustable action을 제공한다. RTL은 좌표와 Left/Right를 함께 반전하고 range는 두 thumb의 이름을 분리한다. vertical과 form 직렬화는 아직 공개 계약이 아니다.

### 5.16 ToggleGroup (v0.4 source preview)

```ts
export type ToggleGroupSelectionMode = 'single' | 'multiple';
export type ToggleGroupOrientation = 'horizontal' | 'vertical';
export type ToggleGroupVariant = 'filled' | 'outlined';
export type ToggleGroupSize = 'sm' | 'md';

export type ToggleGroupItem<T extends string> = {
  readonly value: T;
  readonly disabled?: boolean | undefined;
} & (
  | {
      readonly label: string;
      readonly accessibilityLabel?: string | undefined;
      readonly icon?: ReactNode | RenderIcon | undefined;
    }
  | {
      readonly label?: never;
      readonly accessibilityLabel: string;
      readonly icon: NonNullable<ReactNode> | RenderIcon;
    }
);

type ToggleGroupBaseProps<T extends string> = Omit<CommonProps, 'unstyled'> & {
  readonly items: readonly ToggleGroupItem<T>[];
  readonly accessibilityLabel: string;
  readonly orientation?: ToggleGroupOrientation | undefined;
  readonly variant?: ToggleGroupVariant | undefined;
  readonly size?: ToggleGroupSize | undefined;
  readonly disabled?: boolean | undefined;
  readonly loop?: boolean | undefined;
  readonly itemStyle?: StyleProp<ViewStyle> | undefined;
  readonly itemClassName?: string | undefined;
  readonly labelStyle?: StyleProp<TextStyle> | undefined;
  readonly labelClassName?: string | undefined;
  readonly unstyled?: never;
};

export type ToggleGroupProps<T extends string> = ToggleGroupBaseProps<T> & (
  | {
      readonly selectionMode: 'single';
      readonly value: NoInfer<T> | null;
      readonly onValueChange: (value: T | null) => void;
      readonly allowEmpty?: boolean | undefined;
    }
  | {
      readonly selectionMode: 'multiple';
      readonly value: readonly NoInfer<T>[];
      readonly onValueChange: (value: readonly T[]) => void;
      readonly allowEmpty?: never;
    }
);

export function ToggleGroup<T extends string>(props: ToggleGroupProps<T>): ReactElement;
```

이름 있는 toolbar와 toggle buttons로 즉시 상태를 선택한다. orientation에 맞는 방향키, Home/End, disabled skip과 roving tab stop은 focus만 옮기고 Enter·Space·press가 값을 바꾼다. 화면/panel 선택은 이 API가 아니라 Tabs가 소유한다.

### 5.17 ToastViewport + useToastQueue (v0.4 source preview)

```ts
declare const toastIdBrand: unique symbol;
export type ToastId = string & { readonly [toastIdBrand]: 'ToastId' };
export type ToastAnnouncement = 'off' | 'polite' | 'assertive';
export type ToastDismissReason =
  | 'timeout' | 'close-action' | 'action' | 'programmatic' | 'queue-overflow';

export interface ToastAction {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string | undefined;
}
export interface ToastRequest {
  readonly title?: string | undefined;
  readonly message: string;
  readonly variant?: ToastVariant | undefined;
  readonly durationMs?: number | null | undefined;
  readonly announcement?: ToastAnnouncement | undefined;
  readonly action?: ToastAction | undefined;
  readonly dedupeKey?: string | undefined;
}
export interface ToastUpdate {
  readonly title?: string | null | undefined;
  readonly message?: string | undefined;
  readonly variant?: ToastVariant | undefined;
  readonly durationMs?: number | null | undefined;
  readonly announcement?: ToastAnnouncement | undefined;
  readonly action?: ToastAction | null | undefined;
  readonly dedupeKey?: string | null | undefined;
}
export interface ToastRecord {
  readonly id: ToastId;
  readonly title?: string | undefined;
  readonly message: string;
  readonly variant: ToastVariant;
  readonly durationMs: number | null;
  readonly announcement: ToastAnnouncement;
  readonly action?: ToastAction | undefined;
  readonly dedupeKey?: string | undefined;
}
export interface UseToastQueueOptions {
  readonly maxVisible?: number | undefined;
  readonly maxQueued?: number | undefined;
  readonly defaultDurationMs?: number | undefined;
  readonly onDismiss?: ((toast: ToastRecord, reason: ToastDismissReason) => void) | undefined;
}
export interface ToastQueueController {
  readonly records: readonly ToastRecord[];
  readonly visibleToasts: readonly ToastRecord[];
  readonly queuedCount: number;
  readonly show: (request: ToastRequest) => ToastId;
  readonly update: (id: ToastId, update: ToastUpdate) => boolean;
  readonly dismiss: (id: ToastId, reason?: ToastDismissReason | undefined) => boolean;
  readonly dismissAll: (reason?: ToastDismissReason | undefined) => void;
  readonly pause: (id: ToastId) => boolean;
  readonly resume: (id: ToastId) => boolean;
}
export function useToastQueue(options?: UseToastQueueOptions): ToastQueueController;

export type ToastViewportPlacement = 'top' | 'bottom';
export type ToastViewportDismissReason = Extract<ToastDismissReason, 'close-action' | 'action'>;
export interface ToastViewportProps extends Omit<CommonProps, 'unstyled'> {
  readonly toasts: readonly ToastRecord[];
  readonly onDismiss: (id: ToastId, reason: ToastViewportDismissReason) => void;
  readonly onPause: (id: ToastId) => void;
  readonly onResume: (id: ToastId) => void;
  readonly placement?: ToastViewportPlacement | undefined;
  readonly offset?: number | undefined;
  readonly unstyled?: never;
}
export function ToastViewport(props: ToastViewportProps): ReactElement;
```

큐는 hook instance 범위의 FIFO다. 기본 visible 1 + queued 9, 5000ms이며 persistent는 `durationMs: null`이다. visible만 시간을 소비하고 update/dedupe는 id·위치를 보존해 수명을 다시 시작하며 overflow는 oldest queued를 제거한다. viewport hover/focus/touch와 네이티브 AppState, RNW page visibility, window blur가 남은 시간을 보존한다. action과 항상 존재하는 close는 sibling control이고 live mode를 off/polite/assertive로 명시한다.

### 5.18 Menu (v0.4 source preview)

아래 4개 code block은 전체 style/className 꼬리를 중복하지 않고 상태와 의미를 결정하는 headline contract만 발췌한다. 실제 export type 전체와 dismissal reason은 [`expo-ui-components-v0.4.md`](./expo-ui-components-v0.4.md) §14가 정본이다.

```ts
type MenuHeadlineItem<T extends string> =
  | {
      readonly kind: 'action';
      readonly value: T;
      readonly label: string;
      readonly disabled?: boolean | undefined;
      readonly destructive?: boolean | undefined;
      readonly closeOnSelect?: boolean | undefined; // 기본 true
    }
  | {
      readonly kind: 'checkbox';
      readonly value: T;
      readonly label: string;
      readonly checked: boolean | 'mixed';
      readonly disabled?: boolean | undefined;
      readonly closeOnSelect?: boolean | undefined; // 기본 false
      readonly destructive?: never;
    };

type MenuHeadlineContract<T extends string> = {
  readonly triggerLabel: string;
  readonly items: readonly MenuHeadlineItem<T>[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean, details: MenuOpenChangeDetails<NoInfer<T>>) => void;
  readonly onSelect: (details: MenuSelectDetails<NoInfer<T>>) => void;
  readonly disabled?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly dismissDisabled?: boolean | undefined;
  readonly placement?: OverlayPlacement | undefined;
  readonly presentation?: 'auto' | 'bottom' | 'center' | undefined;
  // iconOnly이면 triggerIcon 필수. position·inset·명시적 style/className 꼬리 지원.
  readonly unstyled?: never;
};

export function Menu<T extends string>(props: MenuProps<T>): ReactElement;
```

`items`가 리터럴 값의 정본이고 open은 controlled다. 웹은 실제 `menuitem | menuitemcheckbox` focus, 방향키·Home/End·typeahead를 제공한다. 네이티브는 menu role을 가장하지 않고 adaptive Dialog의 button·checkbox와 고정 cancel로 표현한다. radio item과 submenu는 아직 공개 계약이 아니다.

### 5.19 Select (v0.4 source preview)

```ts
interface SelectHeadlineItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly textValue?: string | undefined;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
}

type SelectHeadlineContract<T extends string> = {
  readonly items: readonly SelectHeadlineItem<T>[];
  readonly value: NoInfer<T> | null;
  readonly onValueChange: (value: NoInfer<T>) => void;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean, details: SelectOpenChangeDetails<NoInfer<T>>) => void;
  readonly placeholder: string;
  // visible label 또는 accessibilityLabel 중 하나 필수
  readonly description?: string | undefined;
  readonly error?: string | undefined;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly busy?: boolean | undefined;
  readonly dismissDisabled?: boolean | undefined;
  readonly placement?: OverlayPlacement | undefined;
  readonly presentation?: 'auto' | 'bottom' | 'center' | undefined;
  // position·inset·명시적 style/className 꼬리 지원.
  readonly unstyled?: never;
};

export function Select<T extends string>(props: SelectProps<T>): ReactElement;
```

value와 open은 모두 controlled이고 같은 값을 다시 확정하면 닫기만 요청하며 `onValueChange`를 중복 호출하지 않는다. 웹은 focus를 이름 있는 combobox trigger에 유지하면서 `aria-activedescendant`로 listbox option을 탐색한다. 네이티브는 adaptive Dialog의 이름 있는 radiogroup/radio를 쓴다. 검색과 multiple selection은 아직 공개 계약이 아니다.

### 5.20 Popover (v0.4 source preview)

```ts
export type PopoverOpenChangeReason =
  | 'trigger-press' | 'outside-press' | 'escape-key' | 'hardware-back'
  | 'accessibility-escape' | 'close-action' | 'tab-key' | 'focus-out'
  | 'anchor-detached';

type PopoverHeadlineContract = {
  readonly triggerLabel: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean, details: PopoverOpenChangeDetails) => void;
  readonly title: string;
  readonly description?: string | undefined;
  readonly children: NonNullable<ReactNode>;
  readonly disabled?: boolean | undefined;
  readonly dismissDisabled?: boolean | undefined;
  readonly placement?: OverlayPlacement | undefined;
  readonly presentation?: 'auto' | 'bottom' | 'center' | undefined;
  // iconOnly이면 triggerIcon 필수. position·inset·명시적 style/className 꼬리 지원.
  readonly unstyled?: never;
};

export function Popover(props: PopoverProps): ReactElement;
```

Popover가 이름 있는 trigger, 필수 title, close와 body 경계를 직접 소유하고 open은 앱이 갱신해야 하는 request-only controlled 상태다. 웹은 anchor collision을 처리하는 non-modal rich dialog이고 Tab을 가두지 않는다. 네이티브는 bottom/center adaptive Dialog다. arbitrary child trigger, compound `Trigger`/`Content`, custom anchor ref, public Portal과 `asChild`는 없다.

### 5.21 Tooltip (v0.4 source preview)

```ts
type TooltipHeadlineContract = {
  readonly content: string;
  readonly triggerLabel: string;
  readonly triggerIcon: NonNullable<ReactNode> | RenderIcon;
  readonly onPress: () => void;
  readonly tooltipDisabled?: boolean | undefined;
  readonly delayMs?: number | undefined;
  readonly closeDelayMs?: number | undefined;
  readonly placement?: OverlayPlacement | undefined;
  readonly direction?: 'ltr' | 'rtl' | undefined;
  readonly sideOffset?: number | undefined;
  readonly collisionPadding?: number | undefined;
  readonly size?: 'sm' | 'md' | undefined;
  readonly variant?: ButtonVariant | undefined;
  readonly unstyled?: never;
};

export function Tooltip(props: TooltipProps): ReactElement;
```

Tooltip은 open prop이나 임의 child를 받지 않는 owned icon action이다. 웹은 `tooltipDisabled`가 아닌 동안 programmatic description과 trigger의 `aria-describedby` 관계를 항상 유지하고, focus 즉시 또는 hover delay 뒤 시각 bubble만 연다. 네이티브는 floating layer 없이 같은 content를 `accessibilityHint`로 전달한다. 필수 정보·오류·입력 지침·상호작용은 Tooltip에만 두지 않는다.

| 컴포넌트 | 상태 정본 | Web 의미 | Native 의미 | 공개하지 않는 경계 |
|---|---|---|---|---|
| Menu | `open` + item별 controlled checkbox | menu/menuitem, roving focus, typeahead | adaptive Dialog button/checkbox | radio, submenu |
| Select | `open` + `value` | combobox/listbox, active descendant | adaptive Dialog radiogroup | search, multiple |
| Sheet | request-only `open` | modal dialog, bottom/logical side | modal Dialog, bottom/logical side | drag, snap, grabber, defaultOpen |
| Popover | request-only `open` | owned anchor의 non-modal dialog | adaptive Dialog modal | Portal, asChild, arbitrary trigger |
| Tooltip | 내부 visual presence | persistent describedby + focus/hover bubble | owned action accessibilityHint | arbitrary child, interactive content |

루트 `UiProvider`가 공개 `OverlayProvider` 환경을 자동 생성한다. 명시적 `OverlayProvider`는 UiProvider 없는 범위나 Sheet·Dialog까지 포함해 격리된 overlay scope가 필요할 때 사용한다. stack·parent/coordinator hook, Host·Portal과 registry는 내부 구현이다. dismiss·position·focus·platform 세부의 정본은 [`expo-ui-components-v0.4.md`](./expo-ui-components-v0.4.md) §13~19다.

### 5.22 DataTable (v0.4 source preview)

DataTable은 앱 소유 data engine 위에 현재 rows의 의미와 표현만 제공하는 bounded, nonvirtualized primitive다. 아래는 public semantic contract다. 전체 named style/className slot과 검증 세부의 정본은 [`expo-ui-components-v0.4.md`](./expo-ui-components-v0.4.md) §15다.

```ts
export type DataTableRowKey = string | number;
export type DataTableAlignment = 'start' | 'center' | 'end';
export type DataTableSize = 'sm' | 'md' | 'lg';
export type DataTableVariant = 'line' | 'outline';
export type DataTablePresentation = 'table' | 'list' | 'auto';
export type DataTableSortDirection = 'ascending' | 'descending';

export type DataTableColumn<Row, ColumnId extends string, RowKey extends DataTableRowKey = DataTableRowKey> =
  (
    | { readonly width: number; readonly flex?: never }
    | { readonly width?: never; readonly flex?: number }
  ) & (
    | { readonly sortable: true; readonly firstSortDirection?: DataTableSortDirection }
    | { readonly sortable?: false; readonly firstSortDirection?: never }
  ) & {
    readonly id: ColumnId;
    readonly header: string;
    readonly getTextValue: (
      context: DataTableValueContext<Row, RowKey, ColumnId>,
    ) => string;
    readonly renderCell?: (
      context: DataTableCellContext<Row, RowKey, ColumnId>,
    ) => NonNullable<ReactNode>;
    readonly align?: DataTableAlignment;
    readonly minWidth?: number;
    readonly maxWidth?: number;
    // headerStyle/headerClassName/headerTextStyle/headerTextClassName
    // cellStyle/cellClassName/cellTextStyle/cellTextClassName
  };

export type DataTableState<Row> =
  | {
      readonly status: 'loading';
      readonly skeletonRowCount?: number;
      readonly loadingState?: ReactElement;
      readonly rows?: never;
      readonly errorState?: never;
      readonly emptyState?: never;
      readonly refreshingAccessibilityLabel?: never;
    }
  | {
      readonly status: 'error';
      readonly errorState?: ReactElement;
      readonly rows?: never;
      readonly skeletonRowCount?: never;
      readonly loadingState?: never;
      readonly emptyState?: never;
      readonly refreshingAccessibilityLabel?: never;
    }
  | {
      readonly status: 'ready';
      readonly rows: readonly Row[];
      readonly emptyState?: ReactElement;
      readonly skeletonRowCount?: never;
      readonly loadingState?: never;
      readonly errorState?: never;
      readonly refreshingAccessibilityLabel?: never;
    }
  | {
      readonly status: 'refreshing';
      readonly rows: readonly Row[];
      readonly refreshingAccessibilityLabel?: string;
      readonly skeletonRowCount?: never;
      readonly loadingState?: never;
      readonly errorState?: never;
      readonly emptyState?: never;
    };

export interface DataTableSelection<Row, RowKey extends DataTableRowKey> {
  readonly selectedRowKeys: readonly NoInfer<RowKey>[];
  readonly onSelectionChange: (
    selectedRowKeys: readonly RowKey[],
    details: DataTableSelectionChangeDetails<RowKey>,
  ) => void;
  readonly getRowSelectionAccessibilityLabel: (
    context: DataTableSelectionRowContext<Row, RowKey>,
  ) => string;
  readonly isRowSelectionDisabled?: (
    context: DataTableSelectionRowContext<Row, RowKey>,
  ) => boolean;
  readonly showSelectAll?: boolean;
  readonly selectAllAccessibilityLabel?: string;
  readonly clearSelectionAccessibilityLabel?: string;
}

type DataTableAccessibleName =
  | { readonly caption: string; readonly accessibilityLabel?: never }
  | { readonly caption?: never; readonly accessibilityLabel: string };

type DataTableSorting<ColumnId extends string> =
  | {
      readonly sort: DataTableSort<NoInfer<ColumnId>> | null;
      readonly onSortChange: (
        sort: DataTableSort<ColumnId> | null,
        details: DataTableSortChangeDetails<ColumnId>,
      ) => void;
    }
  | { readonly sort?: never; readonly onSortChange?: never };

type DataTablePresentationBranch<Row, RowKey extends DataTableRowKey, ColumnId extends string> =
  | { readonly presentation?: 'table'; readonly renderListRow?: never }
  | {
      readonly presentation: 'list' | 'auto';
      readonly renderListRow: (
        context: DataTableListRowContext<Row, RowKey, ColumnId>,
      ) => ReactElement;
    };

interface DataTableBaseProps<
  Row,
  ColumnId extends string,
  RowKey extends DataTableRowKey,
> extends Omit<CommonProps, 'unstyled'> {
  readonly state: DataTableState<Row>;
  readonly columns: readonly DataTableColumn<Row, ColumnId, RowKey>[];
  readonly getRowKey: (row: Row, rowIndex: number) => RowKey;
  readonly rowHeaderColumnId: NoInfer<ColumnId>;
  readonly description?: string;
  readonly selection?: DataTableSelection<Row, RowKey>;
  readonly size?: DataTableSize;
  readonly variant?: DataTableVariant;
  readonly striped?: boolean;
  readonly showColumnBorders?: boolean;
  readonly minTableWidth?: number;
  readonly captionStyle?: StyleProp<TextStyle>;
  readonly captionClassName?: string;
  readonly descriptionStyle?: StyleProp<TextStyle>;
  readonly descriptionClassName?: string;
  readonly headerCellStyle?: StyleProp<ViewStyle>;
  readonly headerCellClassName?: string;
  readonly cellStyle?: StyleProp<ViewStyle>;
  readonly cellClassName?: string;
  readonly listStyle?: StyleProp<ViewStyle>;
  readonly listClassName?: string;
  readonly listRowStyle?: StyleProp<ViewStyle>;
  readonly listRowClassName?: string;
  readonly unstyled?: never;
}

export type DataTableProps<Row, ColumnId extends string, RowKey extends DataTableRowKey> =
  DataTableBaseProps<Row, ColumnId, RowKey> &
  DataTableAccessibleName &
  DataTableSorting<ColumnId> &
  DataTablePresentationBranch<Row, RowKey, ColumnId>;

export type DataTableColumnId<Columns extends readonly { readonly id: string }[]> =
  Extract<Columns[number]['id'], string>;

export type DataTableSortableColumnId<Columns extends readonly { readonly id: string }[]> =
  Extract<Extract<Columns[number], { readonly sortable: true }>['id'], string>;

type DistributiveDataTableOmit<T, Keys extends PropertyKey> =
  T extends unknown ? Omit<T, Extract<keyof T, Keys>> : never;

type InferredDataTableSorting<Columns extends readonly { readonly id: string }[]> =
  number extends Columns['length']
    ? DataTableSorting<DataTableColumnId<Columns>>
    : [DataTableSortableColumnId<Columns>] extends [never]
      ? { readonly sort?: never; readonly onSortChange?: never }
      : {
          readonly sort: DataTableSort<NoInfer<DataTableSortableColumnId<Columns>>> | null;
          readonly onSortChange: (
            sort: DataTableSort<DataTableSortableColumnId<Columns>> | null,
            details: DataTableSortChangeDetails<DataTableSortableColumnId<Columns>>,
          ) => void;
        };

export type DataTableComponentProps<
  Row,
  RowKey extends DataTableRowKey,
  Columns extends readonly { readonly id: string }[],
> = DistributiveDataTableOmit<
  DataTableProps<Row, DataTableColumnId<Columns>, RowKey>,
  'columns' | 'sort' | 'onSortChange'
> & {
  readonly columns: Columns &
    readonly DataTableColumn<Row, DataTableColumnId<Columns>, RowKey>[];
} & InferredDataTableSorting<Columns>;

export function DataTable<
  Row,
  RowKey extends DataTableRowKey,
  const Columns extends readonly { readonly id: string }[],
>(props: DataTableComponentProps<Row, RowKey, Columns>): ReactElement;
```

`DataTableBaseProps`의 의미 필수항은 `state`, `columns`, `getRowKey`, `rowHeaderColumnId: NoInfer<ColumnId>`다. root `style`·`className`·`testID`는 `CommonProps`에서 오고 `unstyled?: never`를 유지한다.

- literal columns tuple을 component에 넘기면 `sortable: true` 열 ID만 sort와 callback에 남는다. single sort는 ascending → descending → null request이며 실제 rows 순서는 소비자가 갱신한다.
- selection은 controlled include-only multiple checkbox다. visible·enabled page toggle은 off-page key를 보존하고 `affectedRowKeys`에 실제로 변한 key만 보고한다.
- Web table/auto는 실제 table DOM, caption, column/row header scope와 active header 하나의 `aria-sort`를 사용한다. Web auto는 breakpoint로 markup을 바꾸지 않는다.
- Native table은 가로 ScrollView의 `list`와 visual `listitem` rows로 table/cell role을 가장하지 않는다. Native auto만 tablet 미만 list, tablet 이상 visual table로 바뀐다.
- list/auto는 앱 소유 `renderListRow`가 필수다. compact sort 상태는 `UiStrings.sortAscending`, `sortDescending`, `sortUnsorted`를 사용한다.
- filtering·server ordering/fetching·virtualization은 앱/adapter 책임이다. page navigation이 필요하면 현재 rows를 계산하는 같은 앱 상태에 독립 `Pagination`을 조합한다. 편집·pin/resize·대규모 composite keyboard model은 별도 future DataGrid로 유예한다.

### 5.23 Pagination (v0.4 source preview)

Pagination은 1-based numbered collection과 위치가 opaque한 cursor navigation을 판별 유니언으로 분리한다. 앱이 page·cursor·fetch·route를 소유하고 컴포넌트는 접근 가능한 navigation request와 range 표현만 제공한다. 전체 스타일 slot·플랫폼 검증 정본은 [`expo-ui-components-v0.4.md`](./expo-ui-components-v0.4.md) §16이다.

```ts
export type PaginationMode = 'numbered' | 'cursor';
export type PaginationDirection = 'ltr' | 'rtl';
export type PaginationSize = 'sm' | 'md';
export type PaginationPresentation = 'auto' | 'full' | 'compact';
export type PaginationCountMode = 'items' | 'pages';
export type PaginationBoundaryCount = 0 | 1 | 2;
export type PaginationSiblingCount = 0 | 1 | 2;
export type PaginationNavigateDirection = 'previous' | 'next';
export type PaginationPageChangeReason =
  | 'page-press'
  | 'previous-press'
  | 'next-press';

export interface PaginationPageLabelDetails {
  readonly page: number;
  readonly pageCount: number;
  readonly current: boolean;
}

export interface PaginationItemsPageChangeDetails {
  readonly mode: 'numbered';
  readonly countMode: 'items';
  readonly page: number;
  readonly previousPage: number;
  readonly pageCount: number;
  readonly reason: PaginationPageChangeReason;
  readonly totalItemCount: number;
  readonly pageSize: number;
  readonly offset: number;
  readonly endOffsetExclusive: number;
  readonly visibleItemCount: number;
  readonly originalEvent?: unknown;
}

export interface PaginationPagesPageChangeDetails {
  readonly mode: 'numbered';
  readonly countMode: 'pages';
  readonly page: number;
  readonly previousPage: number;
  readonly pageCount: number;
  readonly reason: PaginationPageChangeReason;
  readonly originalEvent?: unknown;
}

export interface PaginationNavigateDetails {
  readonly mode: 'cursor';
  readonly direction: PaginationNavigateDirection;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly originalEvent?: unknown;
}

export type PaginationBaseProps = Omit<CommonProps, 'unstyled'> & {
  readonly accessibilityLabel: string;
  readonly direction?: PaginationDirection;
  readonly size?: PaginationSize;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly previousLabel?: string;
  readonly nextLabel?: string;
  readonly controlStyle?: StyleProp<ViewStyle>;
  readonly controlClassName?: string;
  readonly controlLabelStyle?: StyleProp<TextStyle>;
  readonly controlLabelClassName?: string;
  readonly statusStyle?: StyleProp<TextStyle>;
  readonly statusClassName?: string;
  readonly unstyled?: never;
};

type PaginationNumberedCommonProps = {
  readonly mode: 'numbered';
  readonly page: number;
  readonly presentation?: PaginationPresentation;
  readonly boundaryCount?: PaginationBoundaryCount;
  readonly siblingCount?: PaginationSiblingCount;
  readonly getPageAccessibilityLabel?: (
    details: PaginationPageLabelDetails,
  ) => string;
  readonly statusLabel?: string;
  readonly hasPreviousPage?: never;
  readonly hasNextPage?: never;
  readonly onNavigate?: never;
};

export type PaginationNumberedItemsProps = PaginationBaseProps &
  PaginationNumberedCommonProps & {
    readonly countMode: 'items';
    readonly totalItemCount: number;
    readonly pageSize: number;
    readonly pageCount?: never;
    readonly onPageChange: (
      page: number,
      details: PaginationItemsPageChangeDetails,
    ) => void;
  };

export type PaginationNumberedPagesProps = PaginationBaseProps &
  PaginationNumberedCommonProps & {
    readonly countMode: 'pages';
    readonly pageCount: number;
    readonly totalItemCount?: never;
    readonly pageSize?: never;
    readonly onPageChange: (
      page: number,
      details: PaginationPagesPageChangeDetails,
    ) => void;
  };

export type PaginationCursorProps = PaginationBaseProps & {
  readonly mode: 'cursor';
  readonly statusLabel: string;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly onNavigate: (
    direction: PaginationNavigateDirection,
    details: PaginationNavigateDetails,
  ) => void;
  readonly page?: never;
  readonly presentation?: never;
  readonly boundaryCount?: never;
  readonly siblingCount?: never;
  readonly getPageAccessibilityLabel?: never;
  readonly countMode?: never;
  readonly totalItemCount?: never;
  readonly pageSize?: never;
  readonly pageCount?: never;
  readonly onPageChange?: never;
};

export type PaginationProps =
  | PaginationNumberedItemsProps
  | PaginationNumberedPagesProps
  | PaginationCursorProps;

export interface PaginationRangeOptions {
  readonly page: number;
  readonly pageCount: number;
  readonly boundaryCount?: PaginationBoundaryCount;
  readonly siblingCount?: PaginationSiblingCount;
}

export type PaginationRangeItem =
  | { readonly type: 'page'; readonly page: number; readonly current: boolean }
  | { readonly type: 'start-ellipsis' | 'end-ellipsis' };

export function Pagination(props: PaginationProps): ReactElement;
export function getPaginationRange(
  options: PaginationRangeOptions,
): readonly PaginationRangeItem[];
```

- numbered page는 1-based이며 computed/provided pageCount가 0이면 `page={1}` sentinel만 허용한다. `items` branch는 nonnegative safe integer `totalItemCount`와 positive safe integer `pageSize`, `pages` branch는 nonnegative safe integer `pageCount`를 요구하고 서로의 count prop을 금지한다.
- items callback detail은 requested page의 zero-based inclusive `offset`, exclusive·clamped `endOffsetExclusive`, `visibleItemCount`를 제공한다. pages callback은 item count를 발명하지 않는다. reason은 page·previous·next press를 구분한다.
- cursor는 nonblank `statusLabel`, boolean 이전·다음 가능 여부와 `onNavigate`가 필수다. page·presentation·range·count callback은 전부 `never`다.
- Web은 실제 `nav > ol > li > button`, current button 하나의 `aria-current="page"`를 사용한다. Web auto는 full range이고 compact만 숫자를 숨긴다. Native는 toolbar이며 auto가 tablet 미만 compact, 이상 full로 적응한다. cursor는 양 플랫폼에서 이전·상태·다음만 사용한다.
- 기본 status는 items `start–end / total`, pages `page / pageCount`, 빈 collection `0 / 0`이다. 이전·다음은 `UiStrings.previousPage`·`nextPage`, page 이름은 선택적 `getPageAccessibilityLabel`에서 온다.
- `getPaginationRange`는 count가 0이면 빈 배열을, 그 외에는 현재 page를 정확히 한 번 포함하는 page/ellipsis 배열을 반환한다. boundaryCount와 siblingCount는 각각 `0 | 1 | 2`, 기본 1이다.
- Pagination은 DataTable footer가 아니다. 앱이 current rows와 page를 함께 소유해 형제로 조합한다. fetch, server cursor token, route synchronization, page 자동 clamp, infinite scroll은 공개 계약 밖이다.

### 5.24 기타

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

// ⑪ DataTable 이름 XOR — caption이 aria-label에 조용히 덮이지 않음
// @ts-expect-error
<DataTable caption="결제" accessibilityLabel="결제 표" {...tableProps} />;

// ⑫ literal columns tuple의 sortable ID만 sort에 허용
// @ts-expect-error status 열은 존재하지만 sortable: true가 아님
<DataTable {...tableProps} columns={paymentColumns} sort={{ columnId: 'status', direction: 'ascending' }} onSortChange={fn} />;

// ⑬ rowHeaderColumnId 오타가 ColumnId 추론을 넓히지 못함
// @ts-expect-error
<DataTable {...tableProps} columns={paymentColumns} rowHeaderColumnId="missing" />;

// ⑭ compact branch는 앱 소유 row renderer 필수
// @ts-expect-error
<DataTable {...tableProps} columns={paymentColumns} presentation="auto" />;

// ⑮ Pagination items/pages count 입력 교차 금지
// @ts-expect-error items는 computed count이므로 pageCount를 함께 받지 않음
<Pagination mode="numbered" countMode="items" accessibilityLabel="결제 페이지" page={1} totalItemCount={40} pageSize={20} pageCount={2} onPageChange={fn} />;

// ⑯ opaque cursor에 숫자 page를 발명하지 않음
// @ts-expect-error cursor는 status와 capability만 소유
<Pagination mode="cursor" accessibilityLabel="검색 페이지" statusLabel="최근 결과" hasPreviousPage={false} hasNextPage onNavigate={fn} page={1} />;

// ⑰ range 밀도는 검증 가능한 닫힌 유니언
// @ts-expect-error 0 | 1 | 2만 허용
<Pagination mode="numbered" countMode="pages" accessibilityLabel="문서 페이지" page={1} pageCount={10} boundaryCount={3} onPageChange={fn} />;
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
| unit | 소스 컴포넌트는 vitest의 **react-native → react-native-web alias** + @testing-library/react(jsdom)로 검증한다. 별도로 **root-build guard**가 native/web platform 파일 우선순위, web 산출물의 RNW 직접 참조, native 산출물의 RN 직접 참조, alias 없는 Node ESM/CJS self-import를 검증한다. 토큰 관통, strings/icons 폴백, 다크 전환, insets 순수 함수, token/entry guard도 포함한다. 2026-08-11 기준 41 files·534 tests. |
| type | §6 픽스처 전부 — vitest typecheck + expectTypeOf + `@ts-expect-error`. 2026-08-11 기준 14 files·91 tests. |
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

### 10.1b 알려진 시각 델타 (의도된 정규화 — 이관 시 앱 테스트 단언 갱신 필요)

전신의 하드코딩 서체가 롤 체계로 정규화되면서 생기는 의도적 시각 변화. memorylog2의 flatten 스타일 단언 테스트(StateViews.test.tsx 등)는 이 표대로 갱신한다:

| 지점 | 전신 | 신규 | 근거 |
|---|---|---|---|
| EmptyState 제목 | 16/800/22 | title 롤 18/800/24 | 대응 롤 부재 — title로 흡수 |
| EmptyState 본문·ErrorState 본문·Dialog 설명 | 13/400/20 | caption 롤 12/400/16 | label(13)은 700 굵기라 부적합 |
| ErrorState 제목 | 14(RN기본)/700 | label 롤 13/700/18 | |
| Section 부제 | 13/400 | caption 롤 12/400 | §5.8 구현 확정 |
| TextField 세로 패딩 | 14 | spacing.md 12 | minHeight 48이 지배 — 체감 미미 |
| Button lg 세로 패딩 | 14 | spacing.md 12 | minHeight 52가 지배 |
| segmented 탭 행 높이 | 컨테이너 48 | 동일(상수 보존) | |
| underline 탭 라벨 | 16/600 | **동일** — typography.tab 롤 승격으로 보존 | 리뷰 확정 발견 수정 |

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
| gesture `BottomSheet` adapter·public Portal·arbitrary-anchor overlay 합성 | rich body의 responsive bottom/logical-side 표면은 controlled `Sheet`로 공개했지만 public Host/Portal·`asChild`·custom anchor ref와 drag·snap·grabber는 아직 가장하지 않는다. 선택적 gesture runtime, scroll-to-drag handoff와 실제 브라우저·VoiceOver·TalkBack gate를 통과한 뒤 별도 adapter로 공개한다. 현재 overlay 정본은 [`expo-ui-components-v0.4.md`](./expo-ui-components-v0.4.md)다 |
| DataTable 내장 filtering·pagination·server fetching·virtualization | 현재 visible rows의 의미·상태·sort request·include-only selection만 제공한다. page navigation은 독립 Pagination을 형제로 조합하고 앱/adapter가 rows·page·fetch를 함께 소유한다. 대규모 rows·pin/resize/edit·composite grid keyboard가 필요하면 후속 별도 `DataGrid`로 설계한다 |
| 아이콘 세트 내장 | 런타임 의존성 0과 충돌. RenderIcon 슬롯 + Provider icons가 상한 |
| ScreenShell·CachedImage 등 앱 컴포넌트 | 도메인 결합. 3개 앱 이상 반복 시 승격 |
| imperative 전역 toast (`toast.show()`) | 전역 싱글턴은 다중 Provider·테스트 격리와 충돌. 단일 v0.3 알림은 `useToastController`, v0.4 FIFO·수명·dedupe는 scope가 명시된 `useToastQueue` + `ToastViewport`가 담당 |
| strings 복수형·포맷팅·locale 감지 | 문구 16개에 i18n 엔진은 과잉. 완전 객체 주입이면 앱 i18n과 조합 가능. Pagination의 동적 범위는 숫자로 계산하고 cursor status는 앱이 제공한다 |
| 다크 tailwind preset | §8 — 두 진실 동기화 금지. v2 검토 |
| 테마 3단 DeepPartial | 병합 규칙 암기 비용 > 이득. role 통째 교체 |
| IntentScale (intent×emphasis 격자) | 23롤 평면 대비 이관 비용 과대(테마 오버라이드·테스트 전면 수정) — v2 과제 |
| `./testing` 서브패스 | 픽스처가 필요한 외부 세계 없음 |
| Reanimated 연동 | peer 오염. RN 코어 Animated 펄스(Skeleton)가 상한 |
| DOM lib를 요구하는 공개 컴포넌트 계약 | 공개 source는 DOM lib 없는 tsconfig를 유지한다. DataTable web adapter가 실제 semantic table host를 좁은 `createElement` 경계에서 만들지만 public type과 native graph에는 DOM 타입·API를 새지 않는다 |

## 12. 잔존 리스크

1. **다크 팔레트 시각 품질** — 제안값은 수치 유도. 실앱 검증 전까지 "합리적 기본값" 수준. memorylog2는 라이트 온리라 이번 라운드에서 실검증 불가.
2. **RNW 기반 source unit의 네이티브 갭** — root-build guard는 산출물 경계를 검증하지만 네이티브 렌더러 특유 동작(includeFontPadding 등)은 jsdom unit에서 미검증. 이관 후 memorylog2의 jest-expo 스위트가 간접 보완.
3. **`style?: never`의 DX** — TextField에 style을 못 주는 것이 낯설 수 있음. TSDoc + 에러 메시지로 완화, containerStyle이 대체.
4. **tarball 벤더링 운영** — 라이브러리 수정 시 재-pack·재커밋 필요. publish 전 과도기 한정.
5. **Toast success/info 텍스트 색 차용** (구현 단계 발견) — success 배경엔 onPrimary, info 배경엔 colors.background를 텍스트 색으로 유용. onSuccess/onInfo 롤 부재 때문 — 커스텀 테마가 success를 primary 계열과 다르게 잡으면 대비 저하 가능. 롤 추가는 v2 검토(IntentScale과 함께).
6. **그림자 이중 경로** (구현 단계 결정) — RNW 0.21이 shadow* props를 deprecated 처리(테스트 실측)해 웹은 boxShadow, 네이티브는 shadow*+elevation으로 분기 방출. RN 0.76+의 네이티브 boxShadow 채택 시 통합 검토.
7. **웹 aria 병기** (구현 단계 발견) — RNW는 accessibilityState 객체를 DOM aria로 매핑하지 않아 aria-busy/aria-selected/aria-disabled를 병기함. 네이티브는 accessibilityState가 정본.
8. **exports·peer 정정** (리뷰 확정 발견, 2026-08-10) — CJS TS 소비자(node16)의 타입 해석이 깨져 exports를 import/require 조건별 types(d.ts/d.cts)로 분리하고 최상위 main/module/types를 추가. peer react-native는 >=0.79로 정정(Metro가 exports 맵을 기본 지원하는 최소선 — 그 이하는 resolve 자체 불가라 선언 범위와 실지원의 거짓 불일치였음). toss-payments에도 동일 exports 결함 확인 — 별도 작업으로 분리.
9. **CJS 산출물 테마 코드 복제** (리뷰 low) — tsup CJS는 코드 스플리팅이 없어 '.'·'./theme'·'./tailwind' 각각에 테마 코드가 인라인됨. Metro(require 조건)에서 서로 다른 엔트리의 lightTheme이 다른 객체 정체성을 가짐 — 브랜드는 타입 수준이고 WeakMap 캐시는 컴포넌트 모듈 단위라 동작 문제는 없으나, 엔트리 간 정체성 비교는 금물.
10. **§6 강제의 알려진 경계** (리뷰 확정·low 반영) — ③ Button children은 NonNullable로 좁혔으나 빈 문자열 등 런타임 공백은 불가차단. ④ Tabs NoInfer는 items를 as const 없이 호이스팅한 변수로 주면 T가 string으로 넓어져 소멸(TS 구조적 한계). ⑩ Text 닫힌 색 유니언은 style 탈출구가 의도적으로 존재.
