# @gj-kit/expo-ui

**토큰이 모든 스타일을 관통하는** Expo/React Native UI 킷. 색상·간격·라운드·서체·그림자·치수 전부가 테마에서 오고, 테마는 `createTheme`을 거쳐야만 존재할 수 있으며, 잘못 쓰면 컴파일 에러가 난다.

이 라이브러리는 "parse, don't validate" 철학을 UI에 적용한다: 반쪽 테마 객체, 접근성 라벨 없는 아이콘 버튼, 핸들러 없는 액션 버튼, 토큰 키 오타 — 이런 것들은 런타임에서 조용히 깨지는 대신 타입 검사에서 거부된다.

- **런타임 의존성 0** — peer는 `react`, `react-native`뿐. 아이콘·문구는 주입받는다.
- **라이트/다크 내장** — `createThemes` 한 번으로 양 스킴 브랜드 테마 쌍을 만들고, Provider가 시스템 다크를 추종한다.
- **NativeWind 무의존, 그러나 우호적** — `className` 패스스루와 테마 파생 tailwind preset(`./tailwind`)을 제공한다.
- **키보드·safe-area 유틸 내장**(`./insets`) — Android 엣지투엣지 Modal의 키보드 워크어라운드 포함. `react-native-safe-area-context`는 이 서브패스를 쓸 때만 필요한 optional peer다.

```sh
pnpm add @gj-kit/expo-ui
```

## 1. 테마 — createTheme이 유일한 문

토큰 타입과 테마 생성기는 `@gj-kit/expo-ui/theme`에 있다. 이 엔트리는 react·react-native를 import하지 않으므로 **tailwind.config 같은 Node 컨텍스트에서도 안전하게 로드된다.**

```ts
// src/theme.ts — 앱 테마 모듈. 반드시 '/theme'에서 import한다.
import { createThemes } from '@gj-kit/expo-ui/theme';

export const themes = createThemes({
  // shared: 양 스킴 공통 오버라이드 → light/dark: 스킴별 오버라이드 순으로 병합
  shared: {
    colors: { primary: '#4A90E2', primaryStrong: '#227AED' },
    radius: { sm: 10 },
  },
  dark: {
    colors: { primary: '#5C9EEA' },
  },
});
```

```tsx
// app/_layout.tsx
import { UiProvider, koStrings } from '@gj-kit/expo-ui';
import { Feather } from '@expo/vector-icons';
import { themes } from '../src/theme';

export default function RootLayout() {
  return (
    <UiProvider
      theme={themes}            // ThemePair → 시스템 다크 추종. 라이트 고정이면 themes.light
      strings={koStrings}
      icons={{
        check: ({ color, size }) => <Feather name="check" size={size} color={color} />,
        search: ({ color, size }) => <Feather name="search" size={size} color={color} />,
        empty: ({ color, size }) => <Feather name="inbox" size={size} color={color} />,
        error: ({ color, size }) => <Feather name="alert-circle" size={size} color={color} />,
        toast: {
          error: ({ color, size }) => <Feather name="alert-circle" size={size} color={color} />,
          success: ({ color, size }) => <Feather name="check-circle" size={size} color={color} />,
          info: ({ color, size }) => <Feather name="info" size={size} color={color} />,
          warning: ({ color, size }) => <Feather name="alert-triangle" size={size} color={color} />,
        },
      }}
    >
      {/* ... */}
    </UiProvider>
  );
}
```

> **왜 이 단계를 건너뛸 수 없는가**
> - `UiProvider`의 `theme`은 브랜드 타입(`Theme | ThemePair`)만 받는다. 손으로 조립한 토큰 객체는 **컴파일 에러** — 키 하나 빠진 반쪽 테마가 런타임 undefined 스타일로 새는 사고를 타입이 차단한다.
> - `createThemes`의 반환은 라이트/다크가 **둘 다 완성된** 쌍이다. 다크 팔레트를 깜빡한 채 다크 전환이 켜지는 상태가 타입상 존재하지 않는다.
> - 문구를 `strings`로 주입하면(내장 `koStrings`/`enStrings`) 컴포넌트별 기본 문구가 전부 바뀐다. 커스텀 번들은 `{ ...koStrings, retry: '다시 시도' }` — **부분 객체는 컴파일 에러**라서, 라이브러리가 새 문구 키를 추가하면 손조립 번들에서 즉시 표면화된다.

### 다크 전환 제어

```tsx
import { UiProvider } from '@gj-kit/expo-ui';
import { themes } from '../src/theme';
import type { ReactNode } from 'react';

function Root({ children }: { children: ReactNode }) {
  const setting = useAppColorSchemeSetting(); // 'light' | 'dark' | 'system' — 앱이 저장·소유
  return (
    <UiProvider theme={themes} colorScheme={setting}>
      {children}
    </UiProvider>
  );
}
```

컴포넌트는 `useTheme()` 하나만 읽는다 — `colors`가 이미 스킴 해석 완료라서 컴포넌트에 다크 분기가 존재하지 않는다. 비-React 경로(내비게이션 테마 등)는 `getActiveTheme()`/`subscribeActiveTheme()`을 쓴다(루트 Provider 기준).

### 토큰이 실제로 관통되는가

전부 그렇다 — 이 패키지의 존재 이유다. `radius.sm`을 10으로 바꾸면 Button·TextField·Surface·Skeleton의 라운드가 전부 바뀌고, `metrics.control.md`를 48로 바꾸면 기본 버튼 높이가 바뀌며, `typography.title`을 교체하면 Section·Dialog·EmptyState 제목이 함께 바뀐다. 컴포넌트 소스에 색·서체 리터럴이 없음을 정적 가드 테스트(`tests/unit/token-guard.test.ts`)가 강제한다.

## 2. 컴포넌트

```tsx
import {
  Button, IconButton, Text, TextField, SearchField, Tabs,
  Surface, ContentFrame, Section, StickyActionBar,
  Skeleton, EmptyState, ErrorState, Toast, useToastController,
  Dialog, DialogPanel, ConfirmActionRow,
  SelectionIndicator, SelectableRow, SelectAllRow,
} from '@gj-kit/expo-ui';
```

### Text — 서체는 role로

```tsx
<Text role="title">오늘의 기록</Text>
<Text role="caption" color="textMuted">3장의 사진</Text>
```

`role`이 fontSize/lineHeight/fontWeight/fontFamily를 토큰에서 가져온다. `color`는 **닫힌 토큰 키 유니언** — `color="#FF0000"`은 컴파일 에러다(raw 색은 `style` 탈출구로).

### Button / IconButton

```tsx
<Button label="저장" onPress={save} />
<Button label="삭제" variant="destructive" size="sm" loading={deleting} onPress={remove} />
<Button label="더보기" icon={({ color, size }) => <Feather name="plus" size={size} color={color} />} onPress={more} />
<IconButton accessibilityLabel="설정 열기" icon={({ color, size }) => <Feather name="settings" size={size} color={color} />} onPress={openSettings} />
```

> **왜 이 단계를 건너뛸 수 없는가**
> - `label`도 `children`도 없는 버튼은 **컴파일 에러**다. 아이콘 단독 버튼은 `IconButton`으로 — 그리고 `IconButton`은 `accessibilityLabel`이 **필수**라서 스크린리더 공백이 생기지 않는다.
> - variant `'inverse'`는 전신의 `'dark'`를 대체한다 — 다크 테마에서 "dark 버튼이 밝아지는" 의미 역전을 이름에서 제거했다.

### TextField / SearchField

```tsx
<TextField
  label="제목"
  value={title}
  onChangeText={setTitle}
  counter={`${title.length}/15`}
  error={titleError}
/>
<SearchField value={query} onChangeText={setQuery} />
```

`SearchField`의 플레이스홀더와 돋보기 아이콘은 Provider의 `strings.searchPlaceholder`·`icons.search`에서 온다 — 앱마다 래퍼를 만들 필요가 없다.

`TextField`에 `style`을 주면 **컴파일 에러**다. 전신에서 `style`은 "입력 스타일"이었는데 새 버전은 컨테이너 개념이 생겼으므로, 의미가 바뀐 채 조용히 이관되는 사고를 타입으로 차단했다 — `containerStyle`(묶음)과 `inputStyle`(입력)로 명시한다.

### 상태 뷰 — 문구·아이콘은 Provider에서

```tsx
<EmptyState body="첫 번째 기록을 남겨보세요" action={{ label: '기록 만들기', onPress: create }} />
<ErrorState onRetry={refetch} />
```

> **왜 이 단계를 건너뛸 수 없는가**
> `EmptyState`의 액션은 `{ label, onPress }` 객체다 — 전신처럼 `actionLabel`만 넘기고 `onAction`을 잊으면 **눌러도 아무 일 없는 죽은 버튼**이 렌더됐다. 이제 그 상태는 컴파일되지 않는다. `ErrorState`의 재시도 버튼도 `onRetry`가 있을 때만 렌더된다.

### Toast

```tsx
import { Toast, useToastController } from '@gj-kit/expo-ui';
import { useBottomInset } from '@gj-kit/expo-ui/insets';

function Screen() {
  const { toast, showToast } = useToastController();
  const bottomInset = useBottomInset();
  return (
    <>
      {/* ... showToast({ message: '저장했습니다', variant: 'success' }) ... */}
      {toast ? <Toast message={toast.message} variant={toast.variant} bottomOffset={96 + bottomInset} /> : null}
    </>
  );
}
```

variant별 아이콘은 `icons.toast`에서, 지속 시간은 `useToastController({ durationMs })`로 조정한다(기본 2800ms).

### Dialog 조각들

```tsx
<Dialog visible={confirmVisible} onDismiss={close}>
  <DialogPanel title="기록을 삭제할까요?" description="삭제한 기록은 복구할 수 없습니다.">
    <ConfirmActionRow destructive loading={deleting} onCancel={close} onConfirm={confirmDelete} />
  </DialogPanel>
</Dialog>
```

완전한 Modal 시스템(바텀시트·키보드 회피·포털)은 의도적으로 없다 — 그 조립은 앱 소유다(플랫폼 조합마다 다른 동작이 앱 라우팅과 얽히기 때문). 라이브러리는 레고 조각과 `useModalKeyboardOverlap`(아래)까지만 제공한다.

## 3. "./insets" — 키보드·safe-area

```tsx
import {
  useBottomInset,          // 하단 safe-area inset (web 0)
  useBottomSheetPadding,   // 디자인 여백 + 실측 inset — 하단 앵커 서피스의 paddingBottom
  useModalKeyboardOverlap, // <Modal> 안 하단 시트가 키보드에 가려지는 높이
  nativeBottomInset,       // 순수 함수 버전 (peer 불필요)
  nativeBottomPadding,
  computeKeyboardRevealOffset, // 포커스 입력을 키보드 위로 드러내는 목표 스크롤 오프셋
} from '@gj-kit/expo-ui/insets';
import { StickyActionBar, Button } from '@gj-kit/expo-ui';
import { View } from 'react-native';
import type { ReactNode } from 'react';

function BottomBar() {
  return (
    <StickyActionBar bottomInset={useBottomInset()}>
      <Button label="완료" onPress={() => {}} />
    </StickyActionBar>
  );
}

function Sheet({ children }: { children: ReactNode }) {
  const keyboardOverlap = useModalKeyboardOverlap();
  const bottomPadding = useBottomSheetPadding(24);
  return <View style={{ paddingBottom: keyboardOverlap || bottomPadding }}>{children}</View>;
}
```

훅 3종은 `react-native-safe-area-context`(optional peer)가 필요하다 — 이 서브패스를 import하지 않으면 설치할 필요 없고, 설치 없이 import하면 번들 시점에 바로 실패한다(런타임 마법 없음). `useModalKeyboardOverlap`은 Android 엣지투엣지 Modal 윈도우에서 KeyboardAvoidingView가 동작하지 않는 실측 문제의 우회이며, 근거는 소스 TSDoc에 있다.

## 4. "./tailwind" — 테마 파생 preset

```ts
// tailwind.config.js가 require하는 앱 테마 모듈은 '/theme'에서만 import할 것 —
// '.' 엔트리는 react-native를 포함하므로 Node 평가에서 실패한다.
import { createTailwindPreset } from '@gj-kit/expo-ui/tailwind';
import { themes } from './src/theme';

export const preset = createTailwindPreset(themes.light);
// tailwind.config.js: presets: [preset], → bg-ui-primary, p-ui-lg, rounded-ui-pill,
// text-ui-title(서체 3속성 튜플), shadow-ui-sm, screens.tablet/desktop
```

preset 입력도 브랜드 `Theme`이다 — 손조립 토큰으로 preset을 만들 수 없으므로 런타임 테마와 클래스 유틸리티가 어긋나지 않는다.

## 5. 오용 = 컴파일 에러 요약

| 오용 | 결과 |
|---|---|
| 손조립 테마 객체를 `UiProvider theme`에 | 컴파일 에러 — `createTheme`/`createThemes` 경유 강제 |
| `IconButton`에 `accessibilityLabel` 누락 | 컴파일 에러 |
| `label`도 `children`도 없는 `Button` | 컴파일 에러 |
| `Tabs` `value`에 items에 없는 오타 | 컴파일 에러 (`NoInfer`) |
| `strings`에 부분 객체 | 컴파일 에러 — 스프레드로 완전 객체 생성 |
| `Surface padding="x1"` 같은 토큰 키 오타 | 컴파일 에러 (키 유니언 + 자동완성) |
| 전신의 `unstyled` prop (스프레드 경유 포함) | 컴파일 에러 (`unstyled?: never`) |
| `TextField`에 `style` | 컴파일 에러 — `containerStyle`/`inputStyle`로 명시 |
| `EmptyState action`에 `onPress` 누락 | 컴파일 에러 — 죽은 버튼 차단 |
| `Text color`에 raw 색 문자열 | 컴파일 에러 — 토큰 키만, raw는 `style`로 |

## 6. @memorylog/ui에서 이관

| 기존 | 신규 |
|---|---|
| `useUiTheme` / `UiTheme` | `useTheme` / `Theme` |
| `MEMORYLOG_LIGHT_THEME` / `defaultLightTheme` / `uiTokens` | `lightTheme` 또는 앱 테마 모듈 |
| `Field` | `TextField` |
| `SegmentedTabs` | `Tabs` |
| `SelectionCheckCircle` (+`showUncheckedCheck`) | `SelectionIndicator` (+`showUncheckedMark`) |
| `ConfirmationActionRow` | `ConfirmActionRow` |
| `BasicDialog` | `Dialog` |
| `ButtonVariant 'dark'` | `'inverse'` |
| `ThumbnailSkeleton` | `<Skeleton style={{ aspectRatio: 3 / 4 }} />` |
| `TOAST_DURATION_MS` | `useToastController({ durationMs })` |
| `EMPTY_STATE_MAX_FONT_SIZE_MULTIPLIER` | `theme.metrics.maxFontScale` |
| `unstyled` | 삭제 — 앱 테마 주입 + `style`/`className` 최종 병합 |
| `tokens.json` + `tailwind-preset.cjs` | `createTailwindPreset(theme)` |
| 앱 `utils/` safe-area 4파일 | `@gj-kit/expo-ui/insets` 동명 export |

## 7. FAQ

**Q. Expo 전용인가?**
아니다. peer는 react/react-native뿐이라 bare RN에서도 동작한다. 이름은 주 사용처(Expo 앱 패밀리)를 따랐다.

**Q. 웹(react-native-web)에서 동작하나?**
동작한다. Toast(`position: fixed`)·StickyActionBar(`position: sticky`)는 웹 분기가 내장돼 있다. 단 호버 스타일은 NativeWind 호스트의 `dark:`/`hover:` 클래스 소관이다.

**Q. 다크 모드에서 tailwind 클래스는?**
preset은 단일 테마에서 방출된다. 런타임 다크 전환의 정본은 `useTheme()` 경로이고, className 경로의 다크는 NativeWind `dark:` 유틸리티로 앱이 다룬다 — 두 진실을 동기화하려 들면 반드시 어긋나기 때문에 라이브러리는 시도하지 않는다.

**Q. 아이콘 라이브러리가 왜 없나?**
런타임 의존성 0 원칙과 충돌한다. `RenderIcon` 슬롯(`({ color, size }) => ReactNode`)에 앱의 아이콘 시스템을 꽂으면 색·크기는 라이브러리가 계산해 넘긴다.

**Q. `Text`가 RN `Text`를 가리는데?**
의도된 관행(react-native-paper·Tamagui와 동일)이다. RN 것이 필요하면 `import { Text as RNText } from 'react-native'`.

## 라이선스

MIT
