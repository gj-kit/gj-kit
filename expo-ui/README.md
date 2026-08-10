# @gj-kit/expo-ui

**토큰이 모든 스타일을 관통하는** Expo/React Native UI 킷. 색상·간격·라운드·서체·그림자·치수 전부가 테마에서 오고, 테마는 `createTheme`을 거쳐야만 존재할 수 있으며, 잘못 쓰면 컴파일 에러가 난다.

이 라이브러리는 "parse, don't validate" 철학을 UI에 적용한다: 반쪽 테마 객체, 접근성 라벨 없는 아이콘 버튼, 핸들러 없는 액션 버튼, 토큰 키 오타 — 이런 것들은 런타임에서 조용히 깨지는 대신 타입 검사에서 거부된다.

- **런타임 의존성 0** — 필수 peer는 `react`, `react-native`뿐. 아이콘·문구는 주입받는다.
- **라이트/다크 내장** — `createThemes` 한 번으로 양 스킴 브랜드 테마 쌍을 만들고, Provider가 시스템 다크를 추종한다.
- **31개 컴포넌트·31개 색상 role** — 폼 제어, 상태 피드백, 진행률, identity, disclosure까지 같은 토큰·타입 규칙으로 제공한다.
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
        minus: ({ color, size }) => <Feather name="minus" size={size} color={color} />,
        chevronDown: ({ color, size }) => <Feather name="chevron-down" size={size} color={color} />,
        close: ({ color, size }) => <Feather name="x" size={size} color={color} />,
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

전부 그렇다 — 이 패키지의 존재 이유다. `radius.sm`을 10으로 바꾸면 Button·TextField·Surface·Skeleton의 라운드가 전부 바뀌고, `metrics.control.md`를 48로 바꾸면 기본 버튼 높이가 바뀌며, `typography.title`을 교체하면 Section·Dialog·EmptyState 제목이 함께 바뀐다. 상태 색은 **31개 color role**에서 온다. 예를 들면 `success`는 soft 배경 위 전경색, `successStrong`은 채운 배경, `successSoft`는 약한 배경, `onSuccess`는 strong 배경 위 전경색이다. 컴포넌트 소스에 색·서체 리터럴이 없음을 정적 가드 테스트(`tests/unit/token-guard.test.ts`)가 강제한다.

## 2. 컴포넌트

```tsx
import {
  Button, IconButton, Text, TextField, SearchField, Tabs,
  Surface, ContentFrame, Section, StickyActionBar,
  Skeleton, EmptyState, ErrorState, Toast, useToastController,
  Dialog, DialogPanel, ConfirmActionRow,
  SelectionIndicator, SelectableRow, SelectAllRow,
  Badge, Alert, Avatar, Divider, ListItem,
  Spinner, ProgressBar,
  Checkbox, Switch, RadioGroup, Accordion,
} from '@gj-kit/expo-ui';
```

총 31종이다. v0.2에서 상태(Badge/Alert), identity·구조(Avatar/Divider/ListItem), 진행률(Spinner/ProgressBar), 폼 제어(Checkbox/Switch/RadioGroup), disclosure(Accordion)를 추가했다. 새 컴포넌트도 `style`·`className`·`testID` 공통 꼬리, 테마 토큰, 라이트/다크, Provider 아이콘·문구 규칙을 그대로 따른다.

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

### Badge / Alert — 상태를 색이 아니라 의미로

```tsx
import { Alert, Badge } from '@gj-kit/expo-ui';

export function SyncStatus() {
  return (
    <>
      <Badge label="동기화 완료" variant="success" size="sm" />
      <Alert
        title="오프라인 상태"
        variant="warning"
        action={{ label: '다시 연결', onPress: () => {} }}
        onDismiss={() => {}}
      >
        연결되면 변경 사항을 자동으로 업로드합니다.
      </Alert>
    </>
  );
}
```

`Badge`는 `neutral | info | success | warning | error`, `Alert`는 알림 의도가 분명한 `info | success | warning | error`만 받는다. `Alert`는 `title` 또는 `null`·`undefined`가 아닌 `children`이 반드시 필요하고, 액션은 `{ label, onPress }` 한 덩어리라 죽은 버튼을 만들 수 없다. 정적 안내의 기본 `live="off"`를 유지하고, 비동기 결과를 새로 삽입할 때만 `live="polite"` 또는 `"assertive"`를 선택한다.

### Avatar / Divider / ListItem — identity와 정보 구조

```tsx
import { Avatar, Badge, Divider, ListItem } from '@gj-kit/expo-ui';

export function AccountRow() {
  return (
    <>
      <ListItem
        title="김가람"
        description="garam@example.com"
        leading={<Avatar name="김가람" decorative size="sm" />}
        trailing={<Badge label="관리자" size="sm" />}
        onPress={() => {}}
        accessibilityHint="계정 상세 화면을 엽니다"
      />
      <Divider decorative={false} />
    </>
  );
}
```

`Avatar`는 의미가 있으면 `alt`, 장식이면 `decorative`를 타입으로 강제한다. 이미지가 없거나 로드에 실패하면 `name`에서 유니코드 안전한 초성을 만든다. `ListItem`은 `onPress` 유무로 정적 행과 버튼 행을 구분한다. 따라서 정적 행에 `disabled`나 `accessibilityHint`를 잘못 붙일 수 없다. `Divider`는 기본이 장식이며, `decorative={false}`일 때만 separator 의미론을 노출한다.

### Spinner / ProgressBar — 알 수 있는 진행률과 알 수 없는 진행률

```tsx
import { ProgressBar, Spinner } from '@gj-kit/expo-ui';

export function UploadProgress() {
  return (
    <>
      <Spinner accessibilityLabel="파일 목록을 불러오는 중" />
      <ProgressBar
        accessibilityLabel="사진 업로드"
        accessibilityValueText="10장 중 7장"
        value={7}
        max={10}
        variant="success"
      />
      <ProgressBar
        accessibilityLabel="서버와 동기화"
        accessibilityValueText="동기화 중"
        value={null}
      />
    </>
  );
}
```

숫자 `value`는 `0...max`로 정규화하고, `value={null}`은 현재 양을 알 수 없는 indeterminate 애니메이션이다. 운영체제에서 모션 감소를 켜면 이동을 중단하고 정적 진행 표시로 유지한다. `null`일 때 `max`를 함께 넘기는 상태는 타입이 거부한다. `ProgressBar`의 대상 라벨은 필수이며, `Spinner`는 라벨을 생략하면 Provider의 `strings.loading`을 사용한다.

### Checkbox / Switch / RadioGroup — controlled form controls

```tsx
import { useState } from 'react';
import { Checkbox, RadioGroup, Switch } from '@gj-kit/expo-ui';

const densityItems = [
  { label: '편안하게', value: 'comfortable' },
  { label: '조밀하게', value: 'compact', description: '한 화면에 더 많이 표시합니다.' },
] as const;

export function Preferences() {
  const [analytics, setAnalytics] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  return (
    <>
      <Checkbox
        checked={analytics}
        label="익명 사용 통계 공유"
        onCheckedChange={setAnalytics}
      />
      <Switch
        value={notifications}
        label="알림 받기"
        onValueChange={setNotifications}
      />
      <RadioGroup
        accessibilityLabel="목록 밀도"
        items={densityItems}
        value={density}
        onValueChange={setDensity}
      />
    </>
  );
}
```

세 컴포넌트는 모두 상태를 앱이 소유한다. `Checkbox`는 select-all용 `'mixed'`도 표현하지만 사용자 입력 콜백은 항상 `boolean`을 돌려준다. `Checkbox`와 `Switch`는 보이는 `label` 또는 `accessibilityLabel` 중 하나가 반드시 필요하고, `RadioGroup`은 그룹 라벨이 필수다. 웹 Checkbox는 Space로 토글하고, RadioGroup은 Space·방향키·Home·End와 disabled 항목 건너뛰기·순환 이동을 구현한다. Switch는 플랫폼의 네이티브 Switch 동작을 보존한다.

### Accordion — 단일/복수 controlled disclosure

```tsx
import { useState } from 'react';
import { Accordion, Text } from '@gj-kit/expo-ui';

const faqItems = [
  {
    value: 'theme',
    title: '다크 모드는 어떻게 켜나요?',
    content: <Text>UiProvider에 ThemePair를 전달하면 시스템 설정을 추종합니다.</Text>,
  },
  {
    value: 'deps',
    title: '아이콘 패키지가 필요한가요?',
    content: <Text>아니요. 앱의 아이콘을 Provider 슬롯에 주입합니다.</Text>,
  },
] as const;

export function FrequentlyAskedQuestions() {
  const [open, setOpen] = useState<'theme' | 'deps' | null>(null);

  return <Accordion items={faqItems} value={open} onValueChange={setOpen} />;
}
```

기본 `type="single"`은 `value: T | null`, `type="multiple"`은 `value: readonly T[]` 계약으로 분리된다. `collapsible={false}`는 열린 단일 항목을 잠그며 multiple 모드에서는 사용할 수 없다. 웹은 heading/button/panel 관계, `aria-expanded`, Enter·Space를 제공하고 네이티브는 같은 펼침·disabled 상태를 접근성 API로 전달한다.

### 접근성과 상태 소유 원칙

새 컴포넌트는 시각 스타일보다 먼저 의미론을 고정한다. Avatar의 `alt | decorative`, Checkbox/Switch의 `label | accessibilityLabel`, ProgressBar·RadioGroup의 필수 라벨처럼 누락하면 조용히 접근성이 깨지는 선택을 타입 유니언으로 차단한다. Alert live region은 명시적으로 opt-in하고, 폼 제어와 Accordion은 uncontrolled `defaultValue`를 제공하지 않는다. 서버 상태·폼 상태·URL 상태 중 무엇이 정본인지는 앱만 알기 때문에 라이브러리는 `value`와 변경 콜백으로 렌더링만 담당한다.

이 규칙은 플랫폼별로도 같다. 네이티브에서는 RN의 role/state API를, 웹에서는 대응 ARIA 속성과 필요한 키보드 상호작용을 함께 발행한다. 모든 색·간격·치수는 활성 라이트/다크 테마에서 오고, 기본 로딩·닫기 문구는 `UiProvider strings`를 사용하며, 아이콘은 Provider 슬롯을 우선한다. 추가 런타임 패키지는 없다.

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
| `Avatar`에 `alt`도 `decorative`도 누락 | 컴파일 에러 — 이미지 의미를 명시 |
| `Checkbox`/`Switch`에 보이는 label과 접근성 label 모두 누락 | 컴파일 에러 |
| `ProgressBar`에 `accessibilityLabel` 누락 | 컴파일 에러 |
| indeterminate `ProgressBar value={null}`에 `max` 지정 | 컴파일 에러 — 서로 배타적인 모드 |
| `RadioGroup value`에 items에 없는 오타 | 컴파일 에러 (`NoInfer`) |
| multiple `Accordion`에 `collapsible` 지정 | 컴파일 에러 — single 전용 prop |

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
아니다. 필수 peer는 react/react-native뿐이라 bare RN에서도 동작한다. 이름은 주 사용처(Expo 앱 패밀리)를 따랐다.

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
