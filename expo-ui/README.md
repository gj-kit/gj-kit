# @gj-kit/expo-ui

**토큰이 모든 스타일을 관통하는** Expo/React Native UI 킷. 색상·간격·라운드·서체·그림자·치수 전부가 테마에서 오고, 테마는 `createTheme`을 거쳐야만 존재할 수 있으며, 잘못 쓰면 컴파일 에러가 난다.

이 라이브러리는 "parse, don't validate" 철학을 UI에 적용한다: 반쪽 테마 객체, 접근성 라벨 없는 아이콘 버튼, 핸들러 없는 액션 버튼, 토큰 키 오타 — 이런 것들은 런타임에서 조용히 깨지는 대신 타입 검사에서 거부된다.

> **릴리스 안내**
> 이 문서는 저장소 `main`의 공개 API와 다음 배포 후보 변경을 함께 설명할 수 있다. 실제로 설치되는 표면은 사용 중인 package 버전과 CHANGELOG를 기준으로 확인한다. npm의 현재 `latest`는 `npm view @gj-kit/expo-ui version`으로 확인할 수 있다.

- **직접 런타임 의존성 0** — 필수 peer는 `react`, `react-native`뿐이다. 웹 조건 빌드는 optional peer `react-native-web >= 0.21`을 직접 사용하고, 아이콘·문구는 앱에서 주입받는다.
- **라이트/다크 내장** — `createThemes` 한 번으로 양 스킴 브랜드 테마 쌍을 만들고, Provider가 시스템 다크를 추종한다.
- **31개 색상 role 기반 UI foundation** — 폼 제어, 상태 피드백, 진행률, identity, disclosure, 데이터 표시와 interaction foundation을 같은 토큰·타입 규칙으로 제공한다.
- **NativeWind 무의존, 그러나 우호적** — `className` 패스스루와 테마 파생 tailwind preset(`./tailwind`)을 제공한다.
- **키보드·safe-area 유틸 내장**(`./insets`) — Android 엣지투엣지 Modal의 키보드 워크어라운드 포함. `react-native-safe-area-context`는 이 서브패스를 쓸 때만 필요한 optional peer다.

```sh
pnpm add @gj-kit/expo-ui
```

## 릴리스 artifact 정책

`dist/gj-kit-provenance.json`은 package 이름·버전과 **빌드한 Git의 full source commit**만(시간값 없이)
기록한다. 이 파일은 `dist/`와 함께 npm tarball에 들어가며, 루트 `check:pack`은 실제
`npm pack --ignore-scripts` tarball에서 그 값을 현재 clean Git `HEAD`와 대조한다. 앱의 vendor manifest는
tarball SHA-256을 추가로 기록할 수 있지만, 이 패키지 내부 stamp를 대신할 수 없다.

일반 `npm pack`도 `prepack`에서 clean checkout을 요구한다. 따라서 source 변경과 version commit을 먼저
commit한 뒤 `pnpm run verify:release`를 실행한다. provenance는 공개 런타임 API가 아닌 artifact metadata이므로,
이 보호 장치만 추가하는 경우에는 API 버전을 임의로 올리지 않는다.

`check:expo-ui-consumer`는 실제 packed artifact를 새 Expo SDK 56 소비자 두 곳에 설치한다. iOS/Android
fixture는 `react-native-web` 없이 native Metro 조건을 검증하고, web fixture는 `react-native-web`을 명시적으로
설치한 뒤 web export 및 DOM 전역 없는 Node ESM/CJS SSR import를 검증한다. 즉 `react-native-web`은 bare native
앱에 강제되지 않으며, web/SSR 소비자는 그 optional peer를 직접 설치해야 한다는 계약이 release gate가 된다.

## 1. 테마 — createTheme이 유일한 문

토큰 타입과 테마 생성기는 `@gj-kit/expo-ui/theme`에 있다. 이 엔트리는 react·react-native를 import하지 않으므로 **tailwind.config 같은 Node 컨텍스트에서도 안전하게 로드된다.**

```ts
// src/theme.ts — 앱 테마 모듈. 반드시 '/theme'에서 import한다.
import { createThemes } from '@gj-kit/expo-ui/theme';

export const themes = createThemes({
  // shared: 양 스킴 공통 오버라이드 → light/dark: 스킴별 오버라이드 순으로 병합
  shared: { radius: { sm: 10 } },
  light: {
    colors: { primary: '#1769C2', primaryStrong: '#0E5CAD' },
  },
  dark: {
    colors: { primary: '#5C9EEA', primaryStrong: '#6BAAF0' },
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
> - 루트 `UiProvider`는 Menu·Select·Popover·Tooltip·Sheet와 modal Dialog가 공유하는 overlay 환경도 자동으로 만든다. 중첩 `UiProvider`는 테마·문구·아이콘만 재정의하고 바깥 stack과 tooltip coordinator를 재사용하므로 일반 앱은 `OverlayProvider`를 따로 추가하지 않는다.

테마 Provider 없이 Menu·Select·Popover·Tooltip을 쓰거나 Sheet·Dialog를 포함한 overlay stack을 의도적으로 공유·격리할 때는 `children`만 받는 공개 `OverlayProvider`를 직접 둘 수 있다. Host·Portal·`asChild` trigger 합성은 내부 경계이며 공개 컴포넌트나 prop이 아니다. 일반 앱에서는 루트 `UiProvider` 범위를 권장한다.

```tsx
import { OverlayProvider } from '@gj-kit/expo-ui';
import type { ReactNode } from 'react';

export function IsolatedOverlayScope({ children }: { children: ReactNode }) {
  return <OverlayProvider>{children}</OverlayProvider>;
}
```

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

컴포넌트는 `useTheme()` 하나만 읽는다 — `colors`가 이미 스킴 해석 완료라서 컴포넌트에 다크 분기가 존재하지 않는다.

### SSR·정적 설정의 테마 해석

SSR, server component, 정적 route 옵션처럼 React Provider가 렌더·effect를 실행하지 않는 경로에서는 순수 함수 `resolveTheme(theme, colorScheme)`를 쓴다. `colorScheme`은 요청·쿠키·앱 설정처럼 해당 경로가 소유한 `'light' | 'dark'` 값이어야 한다.

```ts
import { resolveTheme } from '@gj-kit/expo-ui/theme';
import { themes } from '../src/theme';

export const staticNavigationTheme = resolveTheme(themes, 'light');
```

기존 `getActiveTheme()`과 `subscribeActiveTheme()`은 네이티브 클라이언트의 레거시 동기화 호환을 위해 남아 있지만 **deprecated client-only snapshot API**다. 모듈 전역 상태라 요청별 SSR 값이 아니며, SSR·정적 설정에는 사용하지 않는다.

### 토큰이 실제로 관통되는가

전부 그렇다 — 이 패키지의 존재 이유다. `radius.sm`을 10으로 바꾸면 Button·TextField·Surface·Skeleton의 라운드가 전부 바뀌고, `metrics.control.md`를 48로 바꾸면 기본 버튼 높이가 바뀌며, `typography.title`을 교체하면 Section·Dialog·EmptyState 제목이 함께 바뀐다. 상태 색은 **31개 color role**에서 온다. 예를 들면 `success`는 soft 배경 위 전경색, `successStrong`은 채운 배경, `successSoft`는 약한 배경, `onSuccess`는 strong 배경 위 전경색이다. 컴포넌트 소스에 색·서체 리터럴이 없음을 정적 가드 테스트(`tests/unit/token-guard.test.ts`)가 강제한다.

## 2. 컴포넌트

```tsx
import {
  Button, IconButton, Text, TextField, SearchField, Tabs,
  Surface, ContentFrame, Section, StickyActionBar,
  Skeleton, EmptyState, ErrorState, Toast, useToastController,
  Dialog, DialogPanel, ConfirmActionRow, ConfirmDialog,
  SelectionIndicator, SelectableRow, SelectAllRow,
  Badge, Alert, Avatar, Divider, ListItem,
  Spinner, ProgressBar,
  Checkbox, Switch, RadioGroup, SegmentedControl, Accordion,
} from '@gj-kit/expo-ui';
```

이 문서의 API는 상태(Badge/Alert), identity·구조(Avatar/Divider/ListItem), 진행률(Spinner/ProgressBar), 폼 제어(Checkbox/Switch/RadioGroup/SegmentedControl), disclosure(Accordion)와 interaction·data·overlay foundation을 같은 토큰·접근성 계약으로 제공한다. 설치 전에는 위 릴리스 안내에 따라 해당 버전의 공개 표면을 확인한다.

다음은 interaction·data·overlay foundation API다.

```tsx
import {
  ActionSheet,
  AspectRatio,
  Card,
  Chip,
  Collapsible,
  DataTable,
  FloatingActionButton,
  FormField,
  KeyValueList,
  Link,
  Menu,
  Pagination,
  Popover,
  Select,
  Sheet,
  Slider,
  StatGrid,
  ToastViewport,
  ToggleGroup,
  Toolbar,
  Tooltip,
  useToastQueue,
} from '@gj-kit/expo-ui';

void ActionSheet;
void AspectRatio;
void Card;
void Chip;
void Collapsible;
void DataTable;
void FloatingActionButton;
void FormField;
void KeyValueList;
void Link;
void Menu;
void Pagination;
void Popover;
void Select;
void Sheet;
void Slider;
void StatGrid;
void ToastViewport;
void ToggleGroup;
void Toolbar;
void Tooltip;
void useToastQueue;
```

이 API들도 `style`·`className`·`testID` 계열의 명시적 스타일 꼬리, 테마 토큰, 라이트/다크, Provider 아이콘 규칙을 그대로 따른다. `useToastQueue`는 새 컴포넌트 수에 포함하지 않는 `ToastViewport`의 상태 훅이고, `OverlayProvider`는 Menu·Select·Popover·Tooltip·Sheet와 Dialog가 공유하는 인프라이므로 컴포넌트 수에서 제외한다.

현재 `main`의 정확한 검증 수와 공개 표면은 CI 및 npm package/CHANGELOG를 기준으로 확인한다.

### Text — 서체는 role로

```tsx
<Text role="title">오늘의 기록</Text>
<Text role="caption" color="textMuted">3장의 사진</Text>
```

`role`이 fontSize/lineHeight/fontWeight/fontFamily를 토큰에서 가져온다. `color`는 **닫힌 토큰 키 유니언** — `color="#FF0000"`은 컴파일 에러다(raw 색은 `style` 탈출구로).

숫자 열이 세로로 정렬돼야 하는 표·통계에는 `tabularNums`를 켠다. 모든 숫자가 같은 폭으로 그려지도록 `fontVariant: ['tabular-nums']`를 방출하며, React Native Web은 이를 CSS `font-variant` 단축 속성으로 직렬화해 tabular-figures 기능을 켠다. 폰트 크기·굵기·색은 그대로 role·color 토큰에서 온다.

```tsx
import { Text } from '@gj-kit/expo-ui';

export function AmountCell({ amount }: { amount: string }) {
  return (
    <Text role="body" tabularNums>
      {amount}
    </Text>
  );
}
```

### Button / IconButton

```tsx
<Button label="저장" onPress={save} />
<Button label="삭제" variant="destructive" size="sm" loading={deleting} onPress={remove} />
<Button label="취소" variant="ghost" onPress={() => {}} />
<Button label="더보기" icon={({ color, size }) => <Feather name="plus" size={size} color={color} />} onPress={more} />
<IconButton accessibilityLabel="설정 열기" icon={({ color, size }) => <Feather name="settings" size={size} color={color} />} onPress={openSettings} />
```

> **왜 이 단계를 건너뛸 수 없는가**
> - `label`도 `children`도 없는 버튼은 **컴파일 에러**다. 아이콘 단독 버튼은 `IconButton`으로 — 그리고 `IconButton`은 `accessibilityLabel`이 **필수**라서 스크린리더 공백이 생기지 않는다.
> - `label` 또는 문자열 `children`은 버튼의 기본 접근성 이름이 되며 빈 문자열은 런타임에서도 거부한다. 아이콘·View 같은 rich children은 추론할 이름이 없으므로 `accessibilityLabel`이 **필수**다.
> - 활성 `Button`과 `IconButton`은 `onPress`가 **필수**다. `disabled` 또는 `loading`일 때만 handler를 생략할 수 있으며, 이는 의도적으로 inert인 상태를 표현한다.
> - variant `'inverse'`는 전신의 `'dark'`를 대체한다 — 다크 테마에서 "dark 버튼이 밝아지는" 의미 역전을 이름에서 제거했다.
> - variant `'ghost'`는 배경·테두리 없이 `colors.text`로 렌더하는 보조 action이다. disabled일 때도 투명 배경을 유지하고 `colors.textSubtle` 및 일반 button의 disabled 접근성 계약을 따른다.

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

### Section — 페이지·패널 헤더의 heading 의미론과 count

`Section`은 title/subtitle/actions 헤더와 자식 콘텐츠를 한 세로 리듬으로 묶는다. `headingLevel={1..6}`을 지정하면 title이 진짜 heading으로 노출된다 — 네이티브 `accessibilityRole="header"`, 웹 `role="heading"` + `aria-level`. 지정하지 않으면 기존과 동일한 일반 텍스트다. `count`는 title 옆에 토큰 스타일 count pill을 그리고(`surfaceSubtle` 배경 + `textMuted` caption), `countAccessibilityLabel`로 pill의 접근성 이름을 서술형으로 바꿀 수 있다("812건 중 40건") — 네이티브는 숫자 텍스트 요소에 라벨을 싣고, 웹은 role 없는 div의 aria-label이 ARIA가 금지한 네이밍이라 pill이 `role="img"` + 서술형 이름을 갖고 숫자를 AT에서 숨긴다. `accessory`는 count 뒤에 이어지는 임의 노드이고, `titleStyle`/`titleClassName`은 title 텍스트에만 적용된다. 새 prop이 전부 없으면 렌더 트리는 이전과 완전히 같다.

```tsx
import { Badge, Section } from '@gj-kit/expo-ui';

export function PaymentsPanel({ visible, total }: { visible: number; total: number }) {
  return (
    <Section
      title="결제"
      headingLevel={2}
      count={visible}
      countAccessibilityLabel={`${total}건 중 ${visible}건 표시`}
      accessory={<Badge label="실시간" size="sm" variant="info" />}
      subtitle="최근 90일"
    >
      {/* 표·목록 */}
    </Section>
  );
}
```

### Badge / Alert — 상태를 색이 아니라 의미로

```tsx
import { Alert, Badge } from '@gj-kit/expo-ui';

export function SyncStatus() {
  return (
    <>
      <Badge label="동기화 완료" variant="success" size="sm" />
      <Badge
        label="결제 완료"
        variant="success"
        accessibilityLabel="결제 완료 (PAID)"
      />
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

`Badge`는 `neutral | info | success | warning | error`, `Alert`는 알림 의도가 분명한 `info | success | warning | error`만 받는다. `Badge accessibilityLabel`은 보이는 라벨에서 파생되는 접근성 이름을 재정의한다 — 보이는 라벨은 현지화 문구로 두고 운영자가 지원 티켓에 붙여 넣을 원시 코드를 이름에 남기는 경우("결제 완료 (PAID)")를 위한 것으로, 지정하면 배지가 그 이름을 가진 하나의 접근성 요소로 노출된다 — 네이티브는 accessible 루트가 자식을 평탄화하고, 웹은 role 없는 div의 aria-label이 ARIA가 금지한 네이밍이라 스크린 리더가 무시하므로 루트가 `role="img"`를 갖고 보이는 라벨·아이콘을 AT에서 숨긴다(읽기 전용 Rating과 같은 패턴). `Alert`는 `title` 또는 `null`·`undefined`가 아닌 `children`이 반드시 필요하고, 액션은 `{ label, onPress }` 한 덩어리라 죽은 버튼을 만들 수 없다. 정적 안내의 기본 `live="off"`를 유지하고, 비동기 결과를 새로 삽입할 때만 `live="polite"` 또는 `"assertive"`를 선택한다.

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

### SegmentedControl — compact required choice

```tsx
import { useState } from 'react';
import { SegmentedControl } from '@gj-kit/expo-ui';

const rangeItems = [
  { label: '일', value: 'day' },
  { label: '주', value: 'week' },
  { label: '월', value: 'month' },
] as const;

export function RangeControl() {
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week');
  return (
    <SegmentedControl
      accessibilityLabel="통계 기간"
      items={rangeItems}
      value={range}
      onValueChange={setRange}
      size="sm"
      fit="content"
    />
  );
}
```

`SegmentedControl<T>`은 **정확히 하나가 선택된 compact radio group**이다. `value`와 `onValueChange`는 앱이 소유하며 빈 선택·복수 선택은 제공하지 않는다. `accessibilityLabel`은 필수이고 웹에서는 radio 역할, 선택된 항목 하나의 roving tab stop, Space·방향키·Home·End, disabled 항목 건너뛰기를 제공한다. 화면과 panel 관계가 필요하면 `Tabs`, 토글 가능한 단일/복수 상태가 필요하면 `ToggleGroup`을 쓴다. 기본 `fit="equal"`은 컨테이너 폭을 균등 분할하고 `fit="content"`는 각 항목의 intrinsic width를 유지한다.

목록의 **필터를 바꾸는 "탭처럼 생긴 행"**은 panel을 바꾸지 않으므로 `Tabs`가 아니라 이 radio group이 정직한 primitive다. `variant="underline"`은 기본 `filled`와 semantics·키보드가 완전히 같고 외형만 바뀐다 — 투명한 track 아래 hairline, 선택 항목에만 `colors.tabActive` 밑줄과 같은 색 글자, 비선택 항목은 `colors.tabInactive` — `Tabs variant="underline"`과 같은 token role이다. `md` 크기는 `Tabs variant="underline"`과 높이·서체(`typography.tab`)를 공유해 같은 화면에 나란히 놓아도 baseline이 맞는다.

```tsx
import { useState } from 'react';
import { SegmentedControl } from '@gj-kit/expo-ui';

const albumFilters = [
  { label: '내 앨범', value: 'mine' },
  { label: '공유받은 앨범', value: 'shared' },
] as const;

export function AlbumFilterRow() {
  const [filter, setFilter] = useState<'mine' | 'shared'>('mine');
  return (
    <SegmentedControl
      accessibilityLabel="앨범 필터"
      items={albumFilters}
      value={filter}
      onValueChange={setFilter}
      variant="underline"
    />
  );
}
```

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

item의 `trailing`은 헤더 행에서 제목 옆(인디케이터 앞)에 그려지는 **presentation-only** 슬롯이다 — "최근 결제 [12]"의 count pill 같은 시각 장식용. 트리거의 접근성 이름은 계속 `title`이고 trailing은 접근성 트리에서 숨겨지므로, 그 정보가 보조 기술에도 중요하면 `description`에 함께 적는다. 트리거 내부에 중첩 컨트롤을 만들 수 없도록 인터랙티브 trailing 콘텐츠는 지원하지 않는다.

### Interaction·data·overlay foundation

#### Chip — 생김새가 아니라 동작으로 분기

`Chip`은 한 컴포넌트지만 `kind`가 역할과 콜백을 정확히 고정한다.

| `kind` | 필수 상태·콜백 | 의미 |
|---|---|---|
| `action` | `label`, `onPress` | 한 번 실행하는 button |
| `filter` | `label`, `selected`, `onSelectedChange` | 이름이 바뀌지 않는 controlled toggle |
| `static` | `label`, 선택 `selected` | 읽기 전용 값 또는 선택 상태를 보이는 일반 텍스트 (button/selection widget 아님) |
| `removable` | `label`, `onRemove`, `removeAccessibilityLabel` | 정적 값 + 별도 제거 button |

공통 선택지는 `variant="filled" | "outlined"`(기본 filled), `size="sm" | "md"`(기본 md), `leading`, `count`, `trailing`이다. `count`는 라벨 뒤에 muted 토큰 색(`textMuted`, disabled면 `textSubtle`)으로 건수를 그리는 편의 슬롯으로, action/filter의 접근성 이름에 "완료, 700"처럼 합쳐진다(static은 일반 텍스트라 그대로 읽힌다). `trailing`은 접근성 트리에서 숨겨지는 presentation-only 노드다 — 인터랙티브 trailing은 지원하지 않으며, 제거 액션은 removable kind의 전용 버튼을 쓴다. `disabled`는 interactive action/filter/removable에만 쓴다. static의 `selected`는 시각 상태만 바꾸며 ARIA selection state를 만들지 않는다. removable 컨테이너 전체를 Pressable로 만들지 않아 인터랙티브 요소 중첩을 피한다.

```tsx
import { useState } from 'react';
import { Chip } from '@gj-kit/expo-ui';

export function TopicChips() {
  const [featured, setFeatured] = useState(false);

  return (
    <>
      <Chip kind="action" label="추천 보기" onPress={() => {}} />
      <Chip
        kind="filter"
        label="인기"
        selected={featured}
        onSelectedChange={setFeatured}
      />
      <Chip
        kind="filter"
        label="완료"
        count={700}
        selected={!featured}
        onSelectedChange={() => setFeatured(false)}
      />
      <Chip kind="static" label="다크 초콜릿" selected />
      <Chip
        kind="removable"
        label="React Native"
        onRemove={() => {}}
        removeAccessibilityLabel="React Native 필터 제거"
      />
    </>
  );
}
```

#### ToggleGroup — 화면 전환이 아닌 즉시 상태 선택

`ToggleGroup<T>`은 굵게·정렬·필터처럼 같은 맥락 안에서 바로 적용되는 toggle button 집합이다. `selectionMode="single"`은 `T | null`과 `allowEmpty`(기본 true), `selectionMode="multiple"`은 `readonly T[]`를 사용한다. `items`가 literal value 유니언의 정본이며, 아이콘만 보이는 항목에는 `accessibilityLabel`이 필수다. 화면과 panel을 전환하는 경우에는 `ToggleGroup`이 아니라 관계를 함께 소유하는 `Tabs`를 사용한다.

웹 root는 이름 있는 toolbar이고, 선택 상태는 각 button의 `aria-pressed`로 노출한다. horizontal은 Left/Right, vertical은 Up/Down, 두 방향 모두 Home/End로 disabled 항목을 건너뛰며 roving focus만 이동한다. 방향키 이동이 값을 암묵적으로 바꾸지는 않고 Enter·Space 또는 press로 활성화한다. `loop={false}`로 끝에서 멈출 수 있다.

```tsx
import { useState } from 'react';
import { ToggleGroup } from '@gj-kit/expo-ui';

const viewItems = [
  { value: 'grid', label: '격자' },
  { value: 'list', label: '목록' },
] as const;

export function ViewToggle() {
  const [view, setView] = useState<'grid' | 'list' | null>('grid');

  return (
    <ToggleGroup
      selectionMode="single"
      accessibilityLabel="보기 방식"
      items={viewItems}
      value={view}
      allowEmpty={false}
      onValueChange={setView}
    />
  );
}
```

#### DataTable — 정적 표 의미와 데이터 엔진의 경계를 분리

`DataTable`은 앱이 건넨 현재 행을 표현하는 bounded presentational table이다. 웹 `table`·`auto`는 항상 실제 `<table>`/`<caption>`/`<thead>`/`<tbody>`/`<th scope="row">`/`<td>`를 만들고, 네이티브의 시각적 표는 존재하지 않는 table/cell role을 가장하지 않고 `list`/`listitem` 의미를 사용한다. `auto`는 웹에서 hydration 전후 모두 표를 유지하며, 네이티브에서만 `theme.breakpoints.tablet` 미만은 compact list, 이상은 가로 스크롤 가능한 visual table로 바뀐다.

표 이름은 보이는 `caption` 또는 `accessibilityLabel` 중 정확히 하나가 필수다. 모든 열은 비어 있지 않은 `header`와 `getTextValue`를 제공하고, `rowHeaderColumnId`는 실제 열 하나를 행 헤더로 고정한다. `as const` 열 tuple에서 `sortable: true`인 ID만 `sort.columnId`로 추론된다. 정렬은 `ascending → descending → null`의 controlled single sort 알림만 제공하며, 행 순서를 실제로 바꾸는 일은 앱이 책임진다.

선택도 include-only `selectedRowKeys`와 `onSelectionChange`를 쓰는 controlled multiple checkbox 모델이다. 전체 선택은 현재 전달된 visible·selectable 행만 바꾸고 off-page key는 보존한다. page toggle의 `details.affectedRowKeys`에는 선택 boolean이 실제로 달라진 key만 들어간다. 상태는 `loading | error | ready | refreshing` 판별 유니언이라 rows·empty·error가 충돌하지 않는다. 명시적 `list`와 네이티브에서 list가 될 수 있는 `auto`는 앱 소유 `renderListRow`가 필수이며, compact 정렬 상태 문구는 `UiStrings.sortAscending`·`sortDescending`·`sortUnsorted`에서 온다.

```tsx
import { useState } from 'react';
import { View } from 'react-native';
import { DataTable, Pagination, Text } from '@gj-kit/expo-ui';
import type { DataTableColumn, DataTableSort } from '@gj-kit/expo-ui';

type Payment = {
  readonly id: string;
  readonly member: string;
  readonly amount: number;
  readonly status: 'paid' | 'pending';
};

const payments: readonly Payment[] = [
  { id: 'pay-1', member: 'Ada', amount: 12000, status: 'paid' },
  { id: 'pay-2', member: 'Grace', amount: 24000, status: 'pending' },
];

const paymentColumns = [
  {
    id: 'member',
    header: '멤버',
    sortable: true,
    flex: 2,
    getTextValue: ({ row }) => row.member,
  },
  {
    id: 'amount',
    header: '금액',
    sortable: true,
    firstSortDirection: 'descending',
    align: 'end',
    width: 120,
    getTextValue: ({ row }) => `${row.amount.toLocaleString()}원`,
  },
  {
    id: 'status',
    header: '상태',
    getTextValue: ({ row }) => row.status === 'paid' ? '결제 완료' : '대기 중',
  },
] as const satisfies readonly DataTableColumn<
  Payment,
  'member' | 'amount' | 'status',
  string
>[];

type PaymentSort = DataTableSort<'member' | 'amount'>;

function orderPayments(
  rows: readonly Payment[],
  sort: PaymentSort | null,
): readonly Payment[] {
  if (sort === null) return rows;
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) => direction * (
    sort.columnId === 'member'
      ? left.member.localeCompare(right.member)
      : left.amount - right.amount
  ));
}

export function PaymentsTable() {
  const [sort, setSort] = useState<PaymentSort | null>(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState<readonly string[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 1;
  const visiblePayments = orderPayments(payments, sort).slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  return (
    <View>
      <DataTable
        caption="최근 결제"
        description="현재 페이지의 결제 내역"
        state={{ status: 'ready', rows: visiblePayments }}
        columns={paymentColumns}
        getRowKey={(row) => row.id}
        rowHeaderColumnId="member"
        sort={sort}
        onSortChange={setSort}
        selection={{
          selectedRowKeys,
          onSelectionChange: setSelectedRowKeys,
          getRowSelectionAccessibilityLabel: ({ row }) => `${row.member} 결제 선택`,
        }}
        presentation="auto"
        renderListRow={({ cells }) => (
          <View>
            {cells.map((cell) => (
              <Text key={cell.columnId} role="body">
                {cell.header}: {cell.textValue}
              </Text>
            ))}
          </View>
        )}
      />
      <Pagination
        mode="numbered"
        countMode="items"
        accessibilityLabel="결제 페이지"
        page={page}
        totalItemCount={payments.length}
        pageSize={pageSize}
        onPageChange={setPage}
      />
    </View>
  );
}
```

필터링·검색·페이지네이션·서버 fetch·행 재정렬·가상화는 앱 또는 전용 데이터 엔진이 소유한다. 위 예제처럼 `DataTable`에는 앱이 잘라 낸 현재 행을, 독립 `Pagination`에는 전체 개수와 현재 페이지를 전달한다. 두 컴포넌트가 서로의 상태나 fetch 수명을 숨겨 소유하지 않는다. `DataTable`은 현재 visible rows에 최적화된 비가상 표이며, 대규모 데이터·복합 셀 편집·column pinning·grid keyboard navigation은 후속 별도 `DataGrid`의 책임이다.

**행 활성화 — `onRowPress`.** 행을 누르면 상세 화면을 여는 관리 콘솔 표를 위해 `onRowPress(row, { rowKey, rowIndex, presentation })`를 받는다. 어떤 표현에서도 소비자 행 콘텐츠는 button 안에 중첩되지 않는다. 웹 `table` 표현은 실제 `<tr role="row">`가 `tabIndex={0}`으로 포커스 가능해지고 click·Enter·Space로 활성화되며, `getRowAccessibilityLabel(row)`가 있으면 그 값이, 없으면 셀을 `"헤더: 값"`으로 이은 문자열이 행의 `aria-label`이 된다. 행을 button으로 만들면 스크린리더의 row/cell 관계가 깨지고 셀 안의 체크박스·링크·정렬 버튼이 동작하지 않기 때문이다. 웹 `list` 표현도 같은 패턴이다 — listitem 자체가 포커스 가능한 활성화 컨테이너가 된다. 포커스 가능한 행·listitem은 `aria-describedby`로 시각적으로 숨긴 힌트(`UiStrings.rowActivationHint`, 기본 "Press Enter or Space to activate")를 가리켜 키보드 활성화 방법을 보조기술에 알린다. 선택 체크박스 셀은 이벤트를 행으로 전파하지 않고, 셀 안의 link·button 같은 interactive 요소에서 시작한 클릭도 행을 활성화하지 않는다. 키보드는 **행 자체에 포커스가 있을 때만** 반응하므로 체크박스 위의 Space는 선택만 바꾼다. 네이티브 `table`·`list` 표현은 두 관심사를 나눈다: 접근성 트리에 잡히지 않는 Pressable 표면이 터치를 받고(셀 안의 링크·버튼은 중첩 터처블 규칙대로 자기 터치를 그대로 가져간다), 행 이름과 활성화는 셀·체크박스와 나란한 1pt 형제 button이 보조기술에 제공한다 — iOS VoiceOver가 행을 하나의 button으로 접어 자손 컨트롤을 가리는 일이 없다. `onRowPress`는 `canOpen ? open : undefined` 같은 조건부 연결을 허용하지만, `getRowAccessibilityLabel`은 확실히 존재하는 `onRowPress` 없이는 이름 붙일 대상이 없으므로 **컴파일 에러**다.

```tsx
import { DataTable } from '@gj-kit/expo-ui';
import type { DataTableColumn } from '@gj-kit/expo-ui';

type Member = { readonly id: string; readonly name: string; readonly email: string };

const memberColumns = [
  { id: 'name', header: '이름', flex: 1, getTextValue: ({ row }) => row.name },
  { id: 'email', header: '이메일', flex: 2, getTextValue: ({ row }) => row.email },
] as const satisfies readonly DataTableColumn<Member, 'name' | 'email', string>[];

export function MembersTable({
  members,
  onOpen,
}: {
  members: readonly Member[];
  onOpen: (id: string) => void;
}) {
  return (
    <DataTable
      accessibilityLabel="멤버"
      state={{ status: 'ready', rows: members }}
      columns={memberColumns}
      getRowKey={(row) => row.id}
      rowHeaderColumnId="name"
      onRowPress={(row) => onOpen(row.id)}
      getRowAccessibilityLabel={(row) => `${row.name} 상세 열기`}
    />
  );
}
```

웹 표는 `table-layout: fixed` + `width: 100%`로 scroll region(컨테이너) 폭을 따르고, `minTableWidth`(기본 640) 아래에서만 region이 가로 스크롤한다. 긴 이메일 하나가 표 전체를 max-content로 키우는 손수 만든 flex 표의 결함은 실제 `<table>`에는 없다.

#### Pagination — 전체 개수와 opaque cursor를 섞지 않는 탐색

`Pagination`은 `mode="numbered" | "cursor"`가 필수인 controlled navigation이다. numbered의 공개 page는 **1-based**다. `countMode="items"`는 `totalItemCount`와 `pageSize`로 page count를 계산하고 callback detail에 `offset`, `endOffsetExclusive`, `visibleItemCount`를 함께 전달한다. `countMode="pages"`는 이미 계산한 `pageCount`만 받는다. 두 count branch의 입력은 `never`로 교차 사용을 막으며, 결과가 0페이지면 controlled sentinel은 `page={1}`이다.

cursor 모드는 숫자 위치를 추측하지 않는다. `statusLabel`, `hasPreviousPage`, `hasNextPage`, `onNavigate`가 필수이고 page·count prop은 모두 금지된다. 따라서 GraphQL cursor나 무한 목록의 서버 토큰을 UI가 숫자로 바꾸거나 저장하지 않는다.

```tsx
import { Pagination } from '@gj-kit/expo-ui';

export function SearchCursor() {
  const loadCursor = (direction: 'previous' | 'next') => {
    void direction;
  };

  return (
    <Pagination
      mode="cursor"
      accessibilityLabel="검색 결과 페이지"
      statusLabel="최근 결과 20개"
      hasPreviousPage={false}
      hasNextPage
      onNavigate={(direction) => loadCursor(direction)}
    />
  );
}
```

numbered의 `presentation="auto" | "full" | "compact"`는 표현만 바꾼다. 웹 auto는 실제 `nav > ol > li > button` 숫자 목록을 유지하고 현재 button 하나에 `aria-current="page"`를 둔다. 네이티브 auto는 `theme.breakpoints.tablet` 미만에서 이전·상태·다음만 보이는 compact, 그 이상에서 numbered range를 보이는 full로 바뀐다. `boundaryCount`와 `siblingCount`는 각각 `0 | 1 | 2`, 생략 시 1이다. 기본 상태 문구는 items에서 `시작–끝 / 전체`, pages에서 `현재 / 전체`이며 `statusLabel`로 바꿀 수 있다. 이전·다음 기본 문구는 `UiStrings.previousPage`·`nextPage`에서 오고, 숫자 button의 읽기 이름은 `getPageAccessibilityLabel`로 현지화한다.

`disabled`와 `busy`는 navigation request를 막고, `direction="ltr" | "rtl"`, `size="sm" | "md"`와 control/status별 style·className 꼬리를 제공한다. 데이터 fetch, cursor 저장, route 동기화, 범위를 벗어난 page의 자동 보정, 리스트 끝 도달 감지는 앱 책임이다.

#### KeyValueList — 상세 패널의 description list

`KeyValueList`는 `{ label, value }` 쌍을 세로로 나열하는 description list다. 웹은 실제 `<dl>` 안에 `<div><dt/><dd/></div>` 그룹을 만들어(HTML이 허용하는 구조) term/definition 의미를 그대로 노출하고, description list 의미가 없는 네이티브는 `list`/`listitem` 역할을 쓰며 문자열·숫자 값은 `"라벨: 값"` 하나의 접근성 요소로 접는다. 커스텀 노드 값은 접지 않아 내부 링크·배지에 개별로 닿을 수 있다. 빈 `items`는 빈 컨테이너조차 만들지 않는다.

`layout="inline"`(기본)은 라벨을 왼쪽 고정 폭 열로, `stacked`는 값 위에 라벨을 놓는다. 웹에서 라벨 열 폭은 블록 레벨 `<dt>`에 실린다 — `labelStyle`의 `width`(또는 `minWidth`·`maxWidth`·flex 크기 속성)를 주면 dt로 끌어올려져 모든 행의 값이 같은 위치에서 정렬된다. `divider`는 행 사이에만 hairline을 긋고, `labelStyle`·`valueStyle`·`rowStyle`(+`className` 쌍)이 각 층에 닿는다. 라벨은 `textMuted`, 값은 `text` 토큰이며 `key`를 생략하면 `label`이 React key가 되므로 같은 라벨이 두 번 나오면 런타임에서 즉시 거부한다.

```tsx
import { Badge, KeyValueList } from '@gj-kit/expo-ui';

export function MemberSummary() {
  return (
    <KeyValueList
      accessibilityLabel="멤버 정보"
      layout="inline"
      divider
      items={[
        { label: '이름', value: '김가람' },
        { label: '이메일', value: 'garam@example.com' },
        { label: '좌석', value: 12 },
        { key: 'status', label: '상태', value: <Badge label="활성" variant="success" size="sm" /> },
      ]}
    />
  );
}
```

#### StatGrid — 한 장의 테두리 안에 모이는 참고 지표

`StatGrid`는 N열 격자 하나에 지표를 채운다. 카드 여러 장은 "똑같이 급한 N가지"로 읽히지만 조용한 격자 하나는 참고 데이터로 읽힌다. `columns`(기본 2)는 1 이상의 정수만 허용하고, 각 `StatItem`은 이미 포맷된 문자열 `value`와 선택적 `hint`, 0~1의 `ratio`, 그리고 `tone`을 갖는다. 모든 셀은 `"라벨, 값, 힌트"`를 이름으로 하는 group이며, `ratio`가 있으면 값 아래 얇은 막대가 `progressbar` 계약(`aria-valuenow` 0~100)으로 노출된다. 범위 밖·NaN 비율은 [0, 1]로 clamp된다. 값 글자는 `tabularNums`로 그려져 열이 흔들리지 않는다.

**임계값은 라이브러리가 정하지 않는다.** 저장 공간 90% 이상을 danger로, 75% 이상을 warning으로 칠할지는 제품 정책이라 앱이 `tone`을 계산해 넘긴다.

```tsx
import { StatGrid } from '@gj-kit/expo-ui';
import type { StatTone } from '@gj-kit/expo-ui';

function storageTone(ratio: number): StatTone {
  return ratio >= 0.9 ? 'danger' : ratio >= 0.75 ? 'warning' : 'neutral';
}

export function WorkspaceStats({ usedBytes, limitBytes }: { usedBytes: number; limitBytes: number }) {
  const ratio = usedBytes / limitBytes;
  return (
    <StatGrid
      accessibilityLabel="워크스페이스 현황"
      columns={3}
      items={[
        { label: '멤버', value: '1,204' },
        { label: '이번 달 결제', value: '3건 실패', tone: 'danger' },
        {
          label: '저장 공간',
          value: `${Math.round(ratio * 100)}%`,
          hint: `${usedBytes.toLocaleString()} / ${limitBytes.toLocaleString()} B`,
          ratio,
          tone: storageTone(ratio),
        },
      ]}
    />
  );
}
```

#### Toolbar — 이름 있는 컨트롤 행

`Toolbar`는 검색 필드·Select·버튼이 줄바꿈하며 늘어서는 행이다. `accessibilityLabel`은 **필수** — `role="toolbar"`는 이름이 있어야 보조 기술에 의미가 있다. `wrap`(기본 true)·`gap`(spacing 토큰 키, 기본 `sm`)·`align`(`start | center | end | space-between`)·`bordered`(surface 배경 + hairline 테두리 + 안쪽 패딩)만 다루는 레이아웃·이름 계약이다. **방향키 roving focus는 제공하지 않는다** — 서로 독립적인 컨트롤은 Tab으로 이동하고 포커스는 각 자식이 소유한다.

```tsx
import { useState } from 'react';
import { Button, SearchField, Toolbar } from '@gj-kit/expo-ui';

export function MemberFilters({ onExport }: { onExport: () => void }) {
  const [query, setQuery] = useState('');
  return (
    <Toolbar accessibilityLabel="멤버 필터" bordered align="space-between">
      <SearchField value={query} onChangeText={setQuery} />
      <Button label="내보내기" variant="secondary" size="sm" onPress={onExport} />
    </Toolbar>
  );
}
```

#### Link — 목적지 이동과 앱 라우팅을 분리

`Link`의 children은 안정적인 문자열이고, 다음 두 branch는 상호 배타적이다.

- 목적지 링크: `href` 필수, `target="_self" | "_blank"`, `rel`, 네이티브 `onOpenError` 선택, `onPress` 금지
- 라우터 링크: `onPress` 필수, `href`·`target`·`rel` 금지

`variant="primary" | "muted" | "danger"`, `underline`(기본 true)을 제공한다. 웹의 목적지 branch는 실제 anchor를 만들고, `_blank`에는 `noopener noreferrer`를 보존한다. 네이티브 목적지는 `Linking.openURL` 실패를 `onOpenError`로 전달하고, 라우터 branch는 link 역할과 Enter 활성화를 사용한다.

```tsx
import { Link } from '@gj-kit/expo-ui';

export function HelpLinks() {
  return (
    <>
      <Link href="https://gj-kit-expo-ui.expo.app/docs" target="_blank">
        문서 열기
      </Link>
      <Link variant="muted" onPress={() => {}}>
        앱 도움말로 이동
      </Link>
    </>
  );
}
```

#### Card / AspectRatio — 콘텐츠 표면과 미디어 비율

`Card`는 기본적으로 관련 콘텐츠를 묶는 **정적 View 컨테이너**다. 선택지는 `variant="outlined" | "elevated" | "filled"`, 토큰 또는 숫자 `padding`, 토큰 `radius`다. 모든 variant가 같은 내부 content View를 사용하며 `style`은 높이·폭·배치 같은 바깥 레이아웃, `contentStyle`은 자식 방향·정렬·간격에 적용한다. 이 구조는 고정 높이 Card 안의 flex 자식이 남은 영역을 채우게 하면서 elevated의 바깥 shadow는 clip하지 않고 내부 배경·테두리·둥근 모서리와 자식만 안전하게 clip한다.

`onPress`를 주면 카드 전체가 정직한 버튼이 된다. 자식은 언제나 임의 rich 콘텐츠이므로 **명시적 `accessibilityLabel`이 타입으로 필수**다(rich children `Button`과 같은 규칙, 런타임에서도 공백 문자열을 거부). `selected`를 boolean으로 주면 카드는 **독립 toggle button**으로 노출된다 — 웹 `aria-pressed`, 네이티브 togglebutton + checked 상태 — 그리고 선택 중에는 `primarySoft` 배경 + `primary` 테두리의 토큰 시각을 얻는다. 정확히 하나를 고르는 N지선다 그룹의 정직한 위젯은 `RadioGroup`이다: Card 하나는 그룹 관계·roving focus를 소유할 수 없으므로 radio 의미론을 가장하지 않는다. 선택형 Card 그룹을 쓰면 보조 기술에는 독립 토글들의 집합으로 읽힌다는 것을 감수하고, 그룹 맥락은 각 카드의 `accessibilityLabel`/`accessibilityHint`로 전달한다. 정적 카드에 `onPress`·`selected`·`disabled`·`accessibilityLabel`을 붙이는 것은 여전히 컴파일 에러이고, pressable 카드 안에 또 다른 interactive child를 두는 것은 중첩 컨트롤이므로 두지 않는다 — 내부 액션이 필요한 카드는 정적 Card + 명시적 `Link`/`Button` 조합으로 돌아간다.

```tsx
import { Card, Text } from '@gj-kit/expo-ui';

export function ScenarioCard({ selected, onSelect }: { selected: boolean; onSelect: () => void }) {
  return (
    <Card
      onPress={onSelect}
      selected={selected}
      accessibilityLabel="표준 시나리오, 월 1회 결제"
    >
      <Text role="title">표준 시나리오</Text>
      <Text role="caption" color="textMuted">매월 1일에 정기 결제를 시도합니다.</Text>
    </Card>
  );
}
```

`AspectRatio`는 `ratio={width / height}`와 선택적 children을 받는 폭 100% View다. ratio가 0 이하이거나 유한수가 아니면 즉시 `RangeError`를 던져 깨진 레이아웃이 조용히 전파되지 않게 한다.

```tsx
import { Image } from 'react-native';
import { AspectRatio, Card, Text } from '@gj-kit/expo-ui';

export function ArticlePreview() {
  return (
    <Card variant="elevated" padding="xl" contentStyle={{ gap: 12 }}>
      <AspectRatio ratio={16 / 9}>
        <Image
          accessibilityLabel="산 위로 지는 노을"
          source={{ uri: 'https://example.com/sunset.jpg' }}
          style={{ width: '100%', height: '100%' }}
        />
      </AspectRatio>
      <Text role="title">여름 산행 기록</Text>
    </Card>
  );
}
```

#### FormField / TextField — 보이는 문구와 제어 관계를 한 계약으로

`FormField`는 `label`과 `children(controlProps) => ReactElement`가 필수인 render-prop 컴포넌트다. `helperText`, 이를 우선하는 `error`, `required`, `labelAccessory`를 받고, 생성한 label/control/helper/error ID와 invalid/required 관계를 `FormFieldControlProps`로 넘긴다. `required`일 때는 iOS VoiceOver에도 상태가 남도록 현지화된 전체 이름 `requiredAccessibilityLabel`도 필수다. root는 `style`/`className`/`testID`, 텍스트 슬롯은 `labelStyle`/`labelClassName`과 `helperStyle`/`helperClassName`으로 연다. 임의 child를 clone하지 않으므로 어떤 제어에 어느 prop을 적용할지 앱이 결정한다. 오류 문구는 polite live region이다. disabled 상태는 제어마다 적용 위치와 의미가 다르므로 FormField가 소유하지 않고 실제 control에 직접 준다.

`TextField`는 단독 사용 시에도 label·helper·error ID를 자동 생성해 RN `accessibilityLabelledBy`/`accessibilityHint`와 웹 `aria-labelledby`/`aria-describedby`/`aria-errormessage`를 연결한다. 외부 `FormField`가 넘긴 `nativeID`·관계 prop도 보존하므로 둘을 함께 사용할 수 있다.

```tsx
import { useState } from 'react';
import { FormField, TextField } from '@gj-kit/expo-ui';

export function EmailField() {
  const [email, setEmail] = useState('');
  const error = email.length > 0 && !email.includes('@')
    ? '올바른 이메일 주소를 입력하세요.'
    : undefined;

  return (
    <FormField
      label="이메일"
      helperText="업무용 주소를 사용하세요."
      error={error}
      required
      requiredAccessibilityLabel="이메일, 필수"
    >
      {(controlProps) => (
        <TextField
          {...controlProps}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      )}
    </FormField>
  );
}
```

#### Slider — scalar와 range를 섞지 않는 수치 입력

`Slider`는 수평 controlled 입력만 제공한다. single branch는 scalar `value`와 하나의 `accessibilityLabel`, range branch는 `readonly [number, number]`와 두 thumb의 `accessibilityLabels`를 요구한다. `min`(기본 0), `max`(100), `step`(1), range 전용 `minDistance`, `direction="ltr" | "rtl"`, 현지화된 `valueText`를 지원한다. 범위·step grid·thumb 순서가 잘못되면 렌더 단계에서 명확히 실패하고, `onValueCommit`은 pointer나 keyboard 상호작용이 끝날 때 한 번만 호출된다.

웹은 track click·drag와 Arrow/PageUp/PageDown/Home/End를, 네이티브는 drag와 adjustable increment/decrement action을 제공한다. RTL에서는 좌표와 Left/Right의 의미를 함께 뒤집으며, 각 thumb hit target은 44px다. vertical slider와 form hidden input 직렬화는 아직 계약하지 않는다.

```tsx
import { useState } from 'react';
import { Slider } from '@gj-kit/expo-ui';

export function PriceRange() {
  const [price, setPrice] = useState<readonly [number, number]>([20_000, 80_000]);

  return (
    <Slider
      mode="range"
      min={0}
      max={100_000}
      step={5_000}
      minDistance={10_000}
      value={price}
      onValueChange={setPrice}
      accessibilityLabels={['최저 가격', '최고 가격']}
      valueText={(value) => `${value.toLocaleString()}원`}
    />
  );
}
```

#### Rating — 0.5단위 입력과 읽기 전용 점 표시

`Rating`은 `value: number | undefined`를 받는 controlled dot rating이다. interactive branch는 `onChange`와 비어 있지 않은 `accessibilityLabel`을 요구하고, `readonly` branch는 단일 image announcement로 표시한다. 빈 값은 반드시 `undefined`이며, 선택 가능한 값은 기본 `1..5` 또는 `halfStep`일 때 `0.5` 단위다. `maxRating`은 렌더 항목과 hit target 수를 제한하기 위해 **1..10**의 정수다.

`clearable`이면 현재 선택된 값을 다시 누를 때 `onChange(undefined)`가 호출된다. 웹에서는 Arrow/Home/End와 Backspace/Delete, 네이티브에서는 adjustable increment/decrement 및 clear action을 제공한다. 점 자체는 장식 처리되므로 screen reader에는 중복 button이 노출되지 않는다. 기본 announcement와 clear action 이름은 `UiProvider strings`의 `UiStrings.ratingNoValue`·`ratingValue`·`clearRating`에서 온다. 인스턴스별 표현만 바꿀 때 `valueText`와 `clearAccessibilityLabel`을 제공한다. native half-step range 값은 정수 스케일로 노출해 Android의 range 정수 처리에도 0.5 단위를 잃지 않으며, 말하는 텍스트는 원래 단위를 유지한다. haptic feedback은 이 컴포넌트의 의존성이 아니므로 필요한 앱에서 `onChange` 주변에 추가한다.

```tsx
import { useState } from 'react';
import { Rating } from '@gj-kit/expo-ui';

export function CoffeeRating() {
  const [rating, setRating] = useState<number | undefined>(undefined);

  return (
    <>
      <Rating
        value={rating}
        onChange={setRating}
        halfStep
        clearable
        accessibilityLabel="커피 평점"
        clearAccessibilityLabel="평점 지우기"
        valueText={(value, maxRating) =>
          value === undefined ? '평점 없음' : `${value}점 / ${maxRating}점`
        }
      />
      <Rating
        value={4.5}
        readonly
        halfStep
        size="sm"
        accessibilityLabel="기록 평점"
        valueText={(value, maxRating) => `${value}점 / ${maxRating}점`}
      />
    </>
  );
}
```

#### Collapsible — 독립된 controlled disclosure

`Collapsible`은 `title: string`, `open`, `onOpenChange`, 비어 있지 않은 `children`이 필수다. 임의 custom trigger·leading·indicator 노드는 받지 않아 heading 안의 이름 있는 button 구조를 항상 보장하고, 필요한 경우 `accessibilityLabel`로 동작 이름만 보완한다. `variant="plain" | "outlined"`, `disabled`, `headingLevel`, `triggerStyle`, `contentStyle`을 지원한다. 표시기는 Provider `chevronDown` 또는 장식용 텍스트 폴백을 사용한다. trigger와 content ID, expanded/controls 관계를 만들고 닫힌 content는 표시와 접근성 트리에서 함께 제외한다. 웹 trigger는 RNW가 실제 HTML button으로 매핑하므로 브라우저의 Enter·Space 활성화를 그대로 사용한다.

```tsx
import { useState } from 'react';
import { Collapsible, Text } from '@gj-kit/expo-ui';

export function ShippingHelp() {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      title="배송비 안내"
      open={open}
      onOpenChange={setOpen}
      headingLevel={2}
    >
      <Text>5만원 이상 주문하면 무료 배송됩니다.</Text>
    </Collapsible>
  );
}
```

#### FloatingActionButton — 화면의 대표 액션 하나

icon-only branch는 `icon`, `onPress`, `accessibilityLabel`이 필수다. extended branch는 `label`, `onPress`가 필수이고 `icon`과 별도 `accessibilityLabel`은 선택이다. `size="sm" | "md" | "lg"`, `variant="primary" | "secondary"`, RTL을 따르는 `placement="bottom-start" | "bottom-center" | "bottom-end"`, 토큰 또는 숫자 `offset`, `bottomInset`, `disabled`, `loading`을 지원한다. 절대 위치와 safe-area 값은 명시적으로 합성하며 speed dial 상태는 소유하지 않는다.

```tsx
import { View } from 'react-native';
import { FloatingActionButton } from '@gj-kit/expo-ui';
import { useBottomInset } from '@gj-kit/expo-ui/insets';

export function ComposeAction() {
  const bottomInset = useBottomInset();

  return (
    <>
      <FloatingActionButton
        label="기록 작성"
        onPress={() => {}}
        bottomInset={bottomInset}
      />
      <FloatingActionButton
        icon={<View />}
        accessibilityLabel="사진 추가"
        onPress={() => {}}
        placement="bottom-start"
        variant="secondary"
      />
    </>
  );
}
```

#### ActionSheet — 드래그를 가장하지 않는 adaptive action dialog

`ActionSheet<T>`는 모바일에서 하단, 태블릿·데스크톱에서 중앙에 놓이는 controlled action dialog다. 각 항목은 menuitem이 아닌 일반 button이고 `items`의 문자열 literal `value`가 `action-select` 결과 타입을 결정한다. 긴 항목 목록은 제한된 패널 안에서 스크롤되고 cancel 버튼은 아래에 고정된다. 항목이 비어 있어도 cancel은 항상 남고, 열릴 때 destructive 항목 대신 cancel로 초기 포커스를 옮긴다.

`presentation="auto" | "bottom" | "center"`, `busy`, `dismissDisabled`, `dismissOnBackdrop`, `bottomInset`, `keyboardOverlap`을 지원한다. bottom presentation에서 키보드가 열리면 이미 safe-area를 포함한 `keyboardOverlap`이 `bottomInset`보다 우선하므로 이중 패딩이 생기지 않고, center presentation은 기본 패딩만 유지한다. item `value`는 유일해야 하며 중복이면 렌더 단계에서 명확히 실패한다. 이 컴포넌트는 drag·snap point·menu 키보드 동작을 지원한다고 주장하지 않는다.

```tsx
import { useState } from 'react';
import { ActionSheet, Button } from '@gj-kit/expo-ui';
import { useBottomInset, useModalKeyboardOverlap } from '@gj-kit/expo-ui/insets';

const recordActions = [
  { value: 'duplicate', label: '복제' },
  { value: 'delete', label: '삭제', description: '복구할 수 없습니다.', destructive: true },
] as const;

export function RecordActions() {
  const [open, setOpen] = useState(false);
  const bottomInset = useBottomInset();
  const keyboardOverlap = useModalKeyboardOverlap();

  return (
    <>
      <Button label="기록 작업" onPress={() => setOpen(true)} />
      <ActionSheet
        visible={open}
        title="기록 작업"
        items={recordActions}
        bottomInset={bottomInset}
        keyboardOverlap={keyboardOverlap}
        onDismiss={(detail) => {
          setOpen(false);
          if (detail.reason === 'action-select') void detail.value;
        }}
      />
    </>
  );
}
```

#### Sheet — rich body를 mobile bottom·logical side panel로

`Sheet`는 임의의 rich body를 담되 구조와 수명은 라이브러리가 끝까지 소유하는 controlled modal surface다. `open`과 `onOpenChange`가 상태 정본이며, 필수 `title`·body와 선택적 `description`·`leading`·`footer`를 받는다. title·close header와 footer는 고정되고 본문만 스크롤되므로 긴 폼에서도 주요 액션이 사라지지 않는다.

`presentation="auto"`는 작은 화면에서 `bottom`, 태블릿 이상에서 RTL을 따르는 logical `end`를 선택한다. 필요하면 `bottom | start | end`를 명시할 수 있다. 단순 콘텐츠는 기본 `scrollMode="internal"`로 Sheet의 ScrollView를 사용하고, `FlatList`처럼 가상화·스크롤을 직접 소유해야 하는 단일 React element는 `scrollMode="provided"`로 넘긴다. provided 모드에서는 `contentContainerStyle`·`contentContainerClassName`을 함께 쓸 수 없도록 타입이 막아 중첩 스크롤을 피한다.

safe area는 `safeAreaInsets={{ top, right, bottom, left }}` 구조 값으로 주입한다. `keyboardOverlap > 0`이면 패널의 `safeAreaInsets.bottom`을 대체해 키보드 높이와 safe area를 이중 합산하지 않는다. backdrop, Escape, hardware Back, accessibility escape, close action, 중첩 overlay의 child-first 순서와 focus 복원은 Dialog와 같은 dismissal stack을 사용한다. `dismissDisabled`는 이 모든 사용자 닫기 경로를 함께 막는다.

`showCloseButton`(기본 true)은 헤더의 닫기 X만 제어한다. **X는 편의 장치이지 유일한 출구가 아니다** — `showCloseButton={false}`여도 backdrop 탭, Escape, hardware Back, 접근성 escape는 여전히 dismiss한다. 반대로 `showCloseButton={false}`와 `dismissDisabled`를 **함께** 쓰면 내장 출구가 전부 사라진다: 시트는 호출부가 닫아 줄 때까지 열려 있으므로, **명시적 출구 제공은 전적으로 소비자 책임이다.** 로그아웃·탈퇴처럼 둘 중 하나를 강제하는 확인 시트가 정확히 이 패턴이며, 보통 `footer`의 취소/확인 액션이 유일한 출구가 된다(ConfirmDialog의 forced-choice 규율과 동일).

```tsx
import { Button, Sheet, Text } from '@gj-kit/expo-ui';

export function SignOutSheet({ open, onResolve }: { open: boolean; onResolve: (signOut: boolean) => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={() => {}}
      title="로그아웃할까요?"
      presentation="bottom"
      showCloseButton={false}
      dismissDisabled
      footer={
        <>
          <Button label="취소" variant="secondary" onPress={() => onResolve(false)} />
          <Button label="로그아웃" variant="destructive" onPress={() => onResolve(true)} />
        </>
      }
    >
      <Text>다시 로그인하기 전까지 알림을 받을 수 없습니다.</Text>
    </Sheet>
  );
}
```

```tsx
import { useState } from 'react';
import { Button, Sheet, Text } from '@gj-kit/expo-ui';
import { useBottomInset, useModalKeyboardOverlap } from '@gj-kit/expo-ui/insets';

export function FilterSheet() {
  const [open, setOpen] = useState(false);
  const bottomInset = useBottomInset();
  const keyboardOverlap = useModalKeyboardOverlap();

  return (
    <>
      <Button label="필터 열기" onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        title="기록 필터"
        description="표시할 기록 조건을 선택하세요."
        safeAreaInsets={{ bottom: bottomInset }}
        keyboardOverlap={keyboardOverlap}
        footer={<Button label="적용" onPress={() => setOpen(false)} />}
        onOpenChange={(next, details) => {
          setOpen(next);
          void details.reason;
        }}
      >
        <Text>필터 제어를 이 body에 조합합니다.</Text>
      </Sheet>
    </>
  );
}
```

이 컴포넌트는 grabber, drag-to-dismiss, snap point나 uncontrolled `defaultOpen`을 제공한다고 가장하지 않는다. 제스처 기반 단계 전환이 필요한 제품에는 Reanimated·gesture-handler 등을 선택적으로 연결하는 별도 `BottomSheet` adapter를 후속으로 둘 수 있으며, 현재 `Sheet`의 명명·스크롤·dismiss 계약과 혼합하지 않는다.

#### Popover — owned trigger에서 시작하는 bounded rich overlay

`Popover`는 `open`과 `onOpenChange`를 앱이 소유하는 controlled 컴포넌트다. 컴포넌트가 이름 있는 button trigger, 필수 `title`, 고정 close action과 스크롤 가능한 body를 함께 소유한다. 임의 trigger·compound `Trigger`·`asChild`·public Portal은 받지 않으므로 trigger 이름, touch target과 anchor lifecycle이 내용과 분리되지 않는다. 아이콘 전용 trigger에는 `iconOnly`와 `triggerIcon`이 모두 필요하다.

웹에서는 주변 페이지와 함께 Tab 이동할 수 있는 **non-modal rich dialog**로 열리고, 12개 `placement`, RTL, `sideOffset`·`alignOffset`·`collisionPadding`, flip·shift와 detached anchor 종료를 처리한다. Escape와 명시적 close는 trigger로 포커스를 복원하고 outside·Tab·focus-out은 자연스러운 포커스 목적지를 존중한다. `dismissDisabled`는 outside·Escape·close와 열린 trigger toggle을 막지만 웹 Tab·focus-out·anchor-detached 정리까지 가두지는 않는다. 네이티브에서는 같은 공개 API가 `presentation="auto" | "bottom" | "center"` Dialog로 적응한다. 작은 화면은 하단, 넓은 화면은 중앙이 기본이며 `keyboardOverlap > 0`이면 `bottomInset`보다 우선한다.

```tsx
import { useState } from 'react';
import { Popover, Text } from '@gj-kit/expo-ui';

export function AccountHelp() {
  const [open, setOpen] = useState(false);

  return (
    <Popover
      triggerLabel="계정 도움말"
      title="계정 정보"
      description="공개 범위를 확인하세요."
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        void details.reason;
      }}
      placement="bottom-start"
      variant="outlined"
    >
      <Text>프로필 공개 범위는 설정에서 언제든 바꿀 수 있습니다.</Text>
    </Popover>
  );
}
```

#### Tooltip — 아이콘 액션의 짧은 보조 설명

`Tooltip`은 임의 자식을 감싸는 wrapper가 아니라 `triggerLabel`, `triggerIcon`, `onPress`를 필수로 받는 **owned icon action**이다. `sm`과 `md` 모두 최소 44px target을 유지한다. 웹은 첫 hover에 기본 700ms 지연, keyboard focus에는 즉시 plain-text bubble을 표시하고, 한 scope에서 한 Tooltip만 활성화한다. `tooltipDisabled`가 아닌 동안 trigger와 programmatic description의 `aria-describedby` 관계는 항상 유지하고, 시각 bubble만 focus·hover 상태에서 표시한다. Escape·blur·scroll은 시각 bubble을 닫는다. `delayMs`, `closeDelayMs`, 12개 `placement`, RTL과 collision padding을 조정할 수 있다.

네이티브에서는 hover bubble을 가장하지 않고 같은 `content`를 trigger의 `accessibilityHint`로 전달한다. `tooltipDisabled`는 보조 설명만 숨기며 `onPress` 액션과 접근성 이름은 그대로 유지한다. **작업 완료에 꼭 필요한 정보, 오류, 필수 입력 설명이나 상호작용은 Tooltip에만 넣지 않는다.** 그런 내용은 본문, FormField helper/error, Alert 또는 Popover처럼 모든 사용자가 발견할 수 있는 표면에 둔다.

```tsx
import { View } from 'react-native';
import { Tooltip } from '@gj-kit/expo-ui';
import type { IconRenderProps } from '@gj-kit/expo-ui';

const infoIcon = ({ color, size }: IconRenderProps) => (
  <View style={{ backgroundColor: color, borderRadius: size / 2, height: size, width: size }} />
);

export function FilterHelp() {
  return (
    <Tooltip
      triggerLabel="필터 도움말"
      triggerIcon={infoIcon}
      content="선택한 조건만 표시합니다."
      onPress={() => {}}
      placement="top-center"
    />
  );
}
```

#### Menu — 웹 menu semantics와 네이티브 adaptive action surface

`Menu<T>`는 `items`의 문자열 literal `value`를 `onSelect` 결과 타입으로 보존하고, `open`도 앱이 소유한다. 항목은 한 번 실행하는 `kind="action"`과 controlled `checked`를 받는 `kind="checkbox"`로 제한한다. action은 기본적으로 선택 뒤 닫히고 checkbox는 기본적으로 열린 채 다음 선택을 받는다. 중복 value와 빈 라벨은 렌더 전에 실패하며, radio item·submenu는 아직 공개 계약이 아니다.

웹 trigger는 `aria-haspopup="menu"` 관계를 갖고 실제 `menuitem`·`menuitemcheckbox`로 포커스를 이동한다. ArrowUp/Down·Home/End·typeahead는 disabled 항목을 건너뛰고, Tab은 닫힌 뒤 자연스럽게 다음 요소로 이동하며 Escape와 선택은 trigger로 포커스를 복원한다. 네이티브는 존재하지 않는 menu role을 흉내 내지 않고, 작은 화면에서는 하단·태블릿 이상에서는 중앙에 Dialog 기반 일반 button·checkbox를 표시하고 안전한 취소 액션을 항상 둔다. `busy`는 선택만 막아 dismiss는 허용하고 `dismissDisabled`는 outside·Escape·Back·접근성 escape를 막는다.

```tsx
import { useState } from 'react';
import { Menu } from '@gj-kit/expo-ui';

export function ProjectMenu() {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const items = [
    { kind: 'action', value: 'duplicate', label: '복제' },
    { kind: 'checkbox', value: 'compact', label: '압축 보기', checked: compact },
    { kind: 'action', value: 'delete', label: '삭제', destructive: true },
  ] as const;

  return (
    <Menu
      triggerLabel="프로젝트 작업"
      items={items}
      open={open}
      onOpenChange={(next) => setOpen(next)}
      onSelect={(detail) => {
        if (detail.kind === 'checkbox') setCompact(detail.checked);
        if (detail.kind === 'action') void detail.value;
      }}
    />
  );
}
```

#### Select — active option과 controlled value를 분리

`Select<T>`는 `items`를 값 유니언의 정본으로 삼고 `value: T | null`, `onValueChange`, `open`, `onOpenChange`를 모두 controlled로 둔다. 보이는 `label` 또는 `accessibilityLabel` 중 하나와 null 상태의 `placeholder`가 필수이며 `description`·`error`·`required` 관계를 컴포넌트가 연결한다. 같은 값을 다시 확정하면 닫히되 `onValueChange`를 중복 호출하지 않는다.

웹에서는 DOM 포커스를 이름 있는 combobox trigger에 유지하고 `aria-activedescendant`로 listbox의 active option을 추적한다. 닫힌 상태의 ArrowUp/Down·Enter·Space로 열고, 열린 상태의 Arrow·Home·End·typeahead는 active만 이동하며 Enter·Space가 확정한다. Tab은 active 값을 확정하고 자연스럽게 다음 요소로 이동하고, Escape·outside는 값을 바꾸지 않는다. 네이티브에서는 trigger를 button으로 노출하고 작은 화면 하단·넓은 화면 중앙의 이름 있는 radiogroup/radio 선택면으로 적응한다. 검색·다중 선택은 아직 지원하지 않는다.

```tsx
import { useState } from 'react';
import { Select } from '@gj-kit/expo-ui';

const channelItems = [
  { value: 'stable', label: 'Stable' },
  { value: 'preview', label: 'Preview', description: '테스트 빌드' },
] as const;

export function ReleaseChannelSelect() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<'stable' | 'preview' | null>('stable');

  return (
    <Select
      label="릴리스 채널"
      required
      placeholder="채널 선택"
      items={channelItems}
      value={channel}
      onValueChange={setChannel}
      open={open}
      onOpenChange={(next) => setOpen(next)}
    />
  );
}
```

두 컴포넌트의 웹 표현은 anchor collision·flip·shift와 detached anchor 종료를 처리하고 긴 목록을 자체 viewport에서 스크롤한다. 네이티브 `presentation="auto" | "bottom" | "center"`, `bottomInset`, `keyboardOverlap`은 ActionSheet와 같은 adaptive 규칙을 쓰며 `keyboardOverlap > 0`이면 이미 safe area를 포함한 값으로 보고 `bottomInset`보다 우선한다.

트리거는 컴포넌트가 소유하지만 테스트·시안 계약을 위한 탈출구는 연다. `triggerTestID`는 **실제 press 대상인 trigger pressable**에 testID를 붙인다(루트 컨테이너의 `testID`와 별개 — `fireEvent.press(getByTestId('album-sort-button'))` 계약이 그대로 성립한다; 웹 Select에서는 파생 `${testID}-trigger`를 대체한다). `triggerHoverStyle`/`itemHoverStyle`은 pointer가 올라가 있는 동안 trigger/항목에 겹쳐지는 스타일이다 — 각각 `triggerStyle`/`itemStyle` **뒤에** 적용되고, disabled 대상에는 적용하지 않으며, hover가 없는 터치 플랫폼에서는 아무 일도 하지 않는다.

```tsx
import { useState } from 'react';
import { Select } from '@gj-kit/expo-ui';

const sortItems = [
  { value: 'recent', label: '최신순' },
  { value: 'oldest', label: '오래된순' },
] as const;

export function AlbumSortSelect() {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<'recent' | 'oldest' | null>('recent');
  return (
    <Select
      accessibilityLabel="정렬 변경"
      placeholder="정렬"
      items={sortItems}
      value={sort}
      onValueChange={setSort}
      open={open}
      onOpenChange={(next) => setOpen(next)}
      triggerTestID="album-sort-button"
      triggerHoverStyle={{ backgroundColor: '#F1F3F5' }}
      itemHoverStyle={{ backgroundColor: '#edeff0' }}
    />
  );
}
```

Menu·Select는 OverlayProvider 범위 없이 렌더되면 **의도적으로 throw한다**(Dialog의 단독 폴백과 비대칭인 이유: 두 컴포넌트의 outside-press/Escape 소유권은 overlay stack의 topmost 판정이 중재하므로, stack 없이 열리면 중첩 overlay에서 어느 레이어가 이벤트를 소비할지 보장할 수 없다). 에러 메시지가 안내하듯 앱 루트나 테스트 렌더를 `UiProvider`로 감싸면 된다 — 루트 `UiProvider`가 overlay scope를 자동으로 만든다(명시적 `OverlayProvider`도 동일).

#### ToastViewport / useToastQueue — 수명과 순서를 선언적으로 소유

기존 `Toast/useToastController`는 단일 알림 호환 API로 유지한다. `useToastQueue`는 FIFO 전체 `records`, 현재 보이는 `visibleToasts`, `queuedCount`와 `show/update/dismiss/dismissAll/pause/resume`을 반환한다. 기본은 한 개 표시·아홉 개 대기(총 10개), 5000ms이며 `durationMs={null}`은 사용자가 닫을 때까지 유지한다. 타이머는 보이는 Toast에만 시작되고, update 또는 같은 `dedupeKey`의 show는 기존 id와 위치를 보존하면서 내용을 바꾸고 수명을 다시 시작한다. 상한을 넘으면 가장 오래 기다린 항목을 결정적으로 제거하고 `queue-overflow`를 보고한다.

`ToastViewport`는 top/bottom 배치와 offset만 소유하고 상태를 훅에 되돌린다. 각 Toast에는 `UiProvider strings.close`와 `icons.close` 폴백을 쓰는 이름 있는 닫기 버튼이 항상 있으며, 선택 action과 닫기는 중첩되지 않은 sibling control이다. `announcement="polite"`가 기본이고 긴급 오류만 `assertive`, 이미 화면에 설명된 변화는 `off`로 선택한다. 응답이 반드시 필요한 결정에는 Toast action 대신 `Dialog`를 사용한다.

보이는 Toast의 남은 시간은 hover·focus·touch 동안 멈춘다. action에서 닫기 버튼으로 내부 포커스가 이동하는 순간에는 잘못 재개하지 않는다. 네이티브 앱이 background/inactive가 되거나 RNW 페이지가 보이지 않을 때, 웹 창 자체가 blur됐을 때도 모든 visible timer를 멈추고, 모든 pause 원인이 해제된 뒤 남은 시간부터 재개한다.

```tsx
import { Button, ToastViewport, useToastQueue } from '@gj-kit/expo-ui';

export function AppToasts() {
  const queue = useToastQueue({
    onDismiss: (_toast, reason) => {
      void reason;
    },
  });

  return (
    <>
      <Button
        label="저장"
        onPress={() => {
          queue.show({
            title: '저장 완료',
            message: '변경 사항을 저장했습니다.',
            variant: 'success',
            dedupeKey: 'save-result',
            action: { label: '되돌리기', onPress: () => {} },
          });
        }}
      />
      <ToastViewport
        toasts={queue.visibleToasts}
        onDismiss={queue.dismiss}
        onPause={queue.pause}
        onResume={queue.resume}
      />
    </>
  );
}
```

### Tabs — 이름, roving focus, typed panels

`Tabs`는 tablist의 `accessibilityLabel`과 모든 item value에 대응하는 `panels`를 필수로 받는다. `items`의 각 항목은 `label`, `value`, 선택적 `disabled`를 갖는다. 웹은 선택 탭 하나만 tab stop으로 두고 Left/Right, Home/End로 disabled 항목을 건너뛰며 순환 이동·선택한다. Enter/Space도 현재 탭을 활성화한다.

필수 `panels`는 `Readonly<Record<T, NonNullable<ReactNode>>>`라서 item value의 panel 하나라도 빠지면 컴파일되지 않는다. 기본 `panelMountStrategy="keep-mounted"`는 비활성 panel을 표시·접근성 트리에서 숨기고, `"active-only"`는 비활성 panel을 언마운트한다. 라이브러리가 tab/tabpanel 렌더와 ID, `aria-controls`/`aria-labelledby`를 항상 함께 소유한다.

```tsx
import { useState } from 'react';
import { Tabs, Text } from '@gj-kit/expo-ui';

const profileTabs = [
  { label: '개요', value: 'overview' },
  { label: '기록', value: 'history' },
] as const;

export function ProfileTabs() {
  const [tab, setTab] = useState<'overview' | 'history'>('overview');

  return (
    <Tabs
      accessibilityLabel="프로필 섹션"
      items={profileTabs}
      value={tab}
      onChange={setTab}
      panels={{
        overview: <Text>프로필 개요</Text>,
        history: <Text>활동 기록</Text>,
      }}
    />
  );
}
```

### 접근성과 상태 소유 원칙

새 컴포넌트는 시각 스타일보다 먼저 의미론을 고정한다. Avatar의 `alt | decorative`, Checkbox/Switch의 `label | accessibilityLabel`, ProgressBar·RadioGroup의 필수 라벨처럼 누락하면 조용히 접근성이 깨지는 선택을 타입 유니언으로 차단한다. Alert live region은 명시적으로 opt-in하고, 폼 제어와 Accordion은 uncontrolled `defaultValue`를 제공하지 않는다. 서버 상태·폼 상태·URL 상태 중 무엇이 정본인지는 앱만 알기 때문에 라이브러리는 `value`와 변경 콜백으로 렌더링만 담당한다.

이 규칙은 플랫폼별로도 같다. 네이티브에서는 RN의 role/state API를, 웹에서는 대응 ARIA 속성과 필요한 키보드 상호작용을 함께 발행한다. 모든 색·간격·치수는 활성 라이트/다크 테마에서 오고, 기본 로딩·닫기 문구는 `UiProvider strings`를 사용하며, 아이콘은 Provider 슬롯을 우선한다. 추가 런타임 패키지는 없다.

### 상태 뷰 — 문구·아이콘은 Provider에서

```tsx
<EmptyState body="첫 번째 기록을 남겨보세요" action={{ label: '기록 만들기', onPress: create }} />
<EmptyState variant="compact" title="결제 내역 없음" />
<ErrorState onRetry={refetch} />
```

`EmptyState variant="compact"`은 표 내부(`DataTable emptyState` 슬롯)나 인라인 빈 행용 한 줄 안내다 — 제목이 `typography.label`(13px), 패딩은 `spacing.lg`, 내장 아이콘 없음(`leading`은 명시했을 때만 원형 배경 없이 그대로 렌더). `variant`가 없으면 기존 카드와 완전히 같다. `Skeleton`은 모든 플랫폼에서 같은 펄스를 돌리되 웹에서는 JS driver를 명시해 RNW의 `useNativeDriver` 경고를 인스턴스마다 찍지 않는다.

> **왜 이 단계를 건너뛸 수 없는가**
> `EmptyState`의 액션은 `{ label, onPress }` 객체다 — 전신처럼 `actionLabel`만 넘기고 `onAction`을 잊으면 **눌러도 아무 일 없는 죽은 버튼**이 렌더됐다. 이제 그 상태는 컴파일되지 않는다. `ErrorState`의 재시도 버튼도 `onRetry`가 있을 때만 렌더된다.

### Toast — 단일 알림 호환 API

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

### Dialog v2 — modal 의미와 모든 닫기 경로를 한 계약으로

```tsx
<Dialog visible={confirmVisible} onDismiss={close}>
  <DialogPanel title="기록을 삭제할까요?" description="삭제한 기록은 복구할 수 없습니다.">
    <ConfirmActionRow destructive loading={deleting} onCancel={close} onConfirm={confirmDelete} />
  </DialogPanel>
</Dialog>
```

`Dialog`는 `visible`을 앱이 소유하는 controlled API를 유지하면서 `onDismiss`에 `backdrop-press | escape-key | hardware-back | accessibility-escape | close-action` 이유를 전달한다. 기존 `() => void` handler도 그대로 할당할 수 있다. 직접 자식 `DialogPanel`의 title·description은 웹 modal의 `aria-labelledby`·`aria-describedby`에 연결되고, 네이티브에서는 탐색 가능한 header·description과 modal isolation을 제공한다. 임의 콘텐츠에는 `accessibilityLabel`을 요구한다. `DialogPanel`은 Dialog 안에서 현지화된 닫기 버튼을 기본 제공하며 `showCloseButton={false}`로 끌 수 있다.

시안 고정 확인창을 위해 `DialogPanel`은 헤더·닫기 버튼 탈출구를 연다. `headerStyle`은 leading·제목/본문 copy·닫기 버튼을 감싸는 헤더 행에, `descriptionStyle`은 description Text에 적용된다. `closeButtonStyle`은 닫기 버튼(원형 IconButton)의 위치·크기를, `closeIcon`은 기본 ×/`icons.close` 마크를 임의 노드(또는 `RenderIcon`)로 교체한다 — 접근 가능한 이름(`closeAccessibilityLabel ?? strings.close`)은 그대로 유지된다. 다른 아이콘 슬롯과 같은 규약으로 `null`(직접 전달이든 `RenderIcon`의 반환이든)은 기본 마크로 되돌아간다 — 마크 없는 버튼을 원하면 빈 프래그먼트(`<></>`)를 렌더한다. `hideHeader`는 제목/본문 블록과 `leading` 노드를 시각적으로 렌더하지 않되 닫기 버튼 행은 남긴다. 정의된 `hideHeader`는 실제 boolean이어야 한다 — truthy 비-boolean(예: `"false"` 문자열)으로 이름 규율을 우회할 수 없도록 렌더 전에 검증한다. **이름 규율은 그대로다**: 보이는 제목이 사라지면 파생 이름도 사라지므로, modal Dialog의 직접 자식 패널이 `hideHeader`를 쓰면 Dialog에 `accessibilityLabel`을 요구한다(누락 시 렌더 전에 명확히 실패). 이때 description은 렌더되지 않으므로 `aria-describedby` 관계도 걸리지 않는다 — 스크린 리더에 전달할 본문은 패널 children으로 직접 구성한다.

`Dialog backdropStyle`은 backdrop pressable에 테마 `colors.overlay` 위로 겹쳐지는 스타일 오버라이드다. `backgroundColor: 'transparent'`로 딤 없는 anchored overlay를 만들거나 시안 딤 색을 그대로 지정할 수 있다. **overlay 색을 덮어쓰는 순간 패널과 뒤 화면의 대비 책임은 소비자에게 넘어간다** — 테마가 보장하던 scrim 대비는 더 이상 성립하지 않는다. inline presentation은 backdrop 자체를 렌더하지 않으므로 이 prop의 영향 밖이다.

```tsx
import { Text } from 'react-native';
import { ConfirmActionRow, Dialog, DialogPanel } from '@gj-kit/expo-ui';

export function FixedArtworkConfirm({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Dialog
      visible={visible}
      onDismiss={onClose}
      accessibilityLabel="회원 등급 변경 확인"
      backdropStyle={{ backgroundColor: 'rgba(13, 13, 13, 0.5)' }}
    >
      <DialogPanel
        title="회원 등급 변경 확인"
        hideHeader
        closeButtonStyle={{ position: 'absolute', right: 12, top: 12 }}
        closeIcon={<Text accessible={false}>×</Text>}
      >
        <Text>시안이 소유하는 본문 카피</Text>
        <ConfirmActionRow
          onCancel={onClose}
          onConfirm={onClose}
          cancelTestID="member-plan-cancel-button"
          confirmTestID="member-plan-confirm-button"
          cancelStyle={{ backgroundColor: '#f1f3f5', minHeight: 52 }}
          cancelLabelStyle={{ color: '#546e7a' }}
          confirmLabelStyle={{ fontWeight: '600' }}
        />
      </DialogPanel>
    </Dialog>
  );
}
```

`ConfirmActionRow`도 같은 이유로 버튼별 탈출구를 연다: `cancelTestID`/`confirmTestID`(소비 앱의 `-cancel-button`/`-confirm-button` testID 규약), `cancelStyle`/`confirmStyle`(버튼 컨테이너 — 내장 flex 사이징 뒤에 겹침), `cancelLabelStyle`/`confirmLabelStyle`(라벨 Text)이다.

`Dialog`의 모션은 플랫폼 동의 후에만 켜진다(Sheet와 같은 보수적 정책이며, Dialog를 조합하는 `ConfirmDialog`·`ActionSheet`·`Sheet`·`Popover`도 같은 경로를 지난다). `AccessibilityInfo.isReduceMotionEnabled()`는 비동기이므로 설정이 false(모션 허용)로 확정되기 전까지는 — 미해결 창과 감소 상태 모두 — `animationType` 값과 무관하게 'none'으로 프레젠테이션한다. 이 덕분에 `{open && <ConfirmDialog visible …/>}`처럼 열린 채 마운트되는 흔한 패턴에서도 모션 감소 사용자가 entrance 애니메이션을 보지 않는다. 열린 채로 설정이 확정되어도 진행 중인 프레젠테이션의 entrance를 다시 재생하지 않고, 닫힌 커밋 이후의 다음 entrance부터 적용한다(Sheet와 같은 latch).

> **웹 소비자 jest 안내 (jest-expo/web + @testing-library/react)**
> RNW `Modal`은 entrance 애니메이션의 `animationend` 이후에야 active가 된다 — `role="dialog"`, focus trap, 닫힘 후 unmount가 전부 그 시점이다. jsdom은 CSS 애니메이션을 실행하지 않으므로 `animationType`이 'none'이 아니면 `getByRole('dialog')`가 영원히 나타나지 않는다. 다만 위의 보수적 정책 때문에 대부분의 테스트는 그대로 통과한다: 설정이 false로 확정되기 전까지 Dialog는 'none'이므로, 열자마자(또는 열린 채 마운트하면 즉시) `getByRole('dialog')`가 나타난다. jsdom에는 `window.matchMedia`가 없어 RNW가 모션 감소를 true로 보고하므로 microtask가 flush된 뒤에도 'none'이 유지된다. 애니메이션 경로 자체를 검증해야 할 때만 `isReduceMotionEnabled`를 `Promise.resolve(false)`로 모킹하고 닫힌 상태에서 flush한 뒤 열어 fade/slide를 latch시킨다.

`dismissDisabled`는 저장·삭제 중 backdrop, Escape/Back, 접근성 escape와 닫기 버튼을 함께 막는다. 접근성 escape callback은 실제 descendant에 연결하지만 iOS VoiceOver 실기기 검증 전에는 보장 범위를 넓히지 않는다. `initialFocusRef`·`finalFocusRef`를 지정했을 때만 플랫폼 기본 포커스 처리에 best-effort override를 적용한다. `presentation="inline"`은 이미 열린 native Modal 안에서 레이어를 합성할 때 쓰며 portal·focus trap·dialog 역할을 제공한다고 가장하지 않고 overlay stack에도 참여하지 않는다. rich adaptive surface는 위의 `Sheet`, 제한된 선택 액션은 `ActionSheet`를 사용한다. drag·snap 제스처는 현재 둘의 계약 밖이며 후속 optional `BottomSheet` adapter 범위다.

modal Dialog는 `UiProvider` 또는 `OverlayProvider` 범위가 있으면 열릴 때 stack에 한 번 등록되고, 내부 overlay는 현재 Dialog를 parent로 상속한다. backdrop, 웹 Escape, 네이티브 Back, 접근성 escape와 close action은 모두 같은 topmost request 경로를 지나므로 열린 child Popover·Menu·Select가 있으면 parent Dialog가 먼저 닫히지 않는다. `dismissDisabled`인 topmost layer는 아래 layer까지 요청이 새는 것도 막는다. 이 parent ID와 stack hook은 구현 세부이며 public prop이나 barrel export가 아니다. Provider 없는 단일 Dialog는 기존처럼 동작하지만 여러 overlay의 중첩 순서가 필요하면 루트 `UiProvider`를 둔다.

#### ConfirmDialog — 제한된 controlled confirm/cancel

```tsx
import { ConfirmDialog } from '@gj-kit/expo-ui';

<ConfirmDialog
  visible={confirmVisible}
  title="기록을 삭제할까요?"
  description="삭제한 기록은 복구할 수 없습니다."
  confirmLabel="삭제"
  confirmVariant="destructive"
  loading={deleting}
  onConfirm={confirmDelete}
  onDismiss={close}
/>
```

확인/취소 두 action만 필요한 경우에는 `ConfirmDialog`를 쓴다. `animationType`은 Dialog로 그대로 전달된다('none' | 'fade' | 'slide', 기본 fade) — 모션은 플랫폼이 감소 아님(false)을 확정한 뒤에만 켜지고 미해결·감소 상태에서는 'none'이므로, 웹 jest에서는 보통 명시 없이도 `getByRole('dialog')`가 바로 나타난다(위 Dialog v2의 안내 참고). `visible`·`loading`·실제 삭제 후 닫기는 앱이 소유하고, `onConfirm`은 스스로 modal을 닫지 않는다. `onDismiss`는 명시적 취소의 `cancel-action`과 Dialog의 `backdrop-press | escape-key | hardware-back | accessibility-escape`를 같은 typed callback으로 전달한다. 일반 상태에서는 안전한 Cancel에 initial focus를 두며, `loading` 중에는 Cancel·Confirm·backdrop·Escape/Back·접근성 escape를 모두 막는다. 버튼 testID는 기본적으로 `${testID}-cancel`/`${testID}-confirm`으로 파생되고, `cancelTestID`/`confirmTestID`로 소비 앱 규약(`-cancel-button`/`-confirm-button` 등)에 맞게 덮어쓸 수 있다. custom body/footer나 닫기 X가 필요하면 `Dialog`와 `DialogPanel`을 직접 조합한다.

## 3. "./insets" — 키보드·safe-area

```tsx
import {
  useBottomInset,          // 하단 safe-area inset (web 0)
  useBottomSheetPadding,   // 디자인 여백 + 실측 inset — 하단 앵커 서피스의 paddingBottom
  useModalKeyboardOverlap, // <Modal> 안 하단 시트가 키보드에 가려지는 높이
  useModalSafeAreaInsets,  // full-screen Modal의 root-provider inset
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

function BottomAnchoredSurface({ children }: { children: ReactNode }) {
  const keyboardOverlap = useModalKeyboardOverlap();
  const bottomPadding = useBottomSheetPadding(24);
  return <View style={{ paddingBottom: keyboardOverlap || bottomPadding }}>{children}</View>;
}
```

훅 4종은 `react-native-safe-area-context`(optional peer)가 필요하다 — 이 서브패스를 import하지 않으면 설치할 필요 없고, 설치 없이 import하면 번들 시점에 바로 실패한다(런타임 마법 없음). `useModalKeyboardOverlap`은 Android 엣지투엣지 Modal 윈도우에서 KeyboardAvoidingView가 동작하지 않는 실측 문제의 우회이며, 근거는 소스 TSDoc에 있다.

`statusBarTranslucent` full-screen Modal은 `SafeAreaView`나 Modal 내부 `SafeAreaProvider` 대신 `useModalSafeAreaInsets({ statusBarTranslucent: true })`를 호출하고 결과를 plain `View` padding에 넣는다. Android 첫 프레임에서 top inset이 0으로 보고되는 경우에도 `StatusBar.currentHeight`와 큰 값을 사용해 header가 system UI 아래로 들어가지 않는다.

React Native, React, safe-area peer가 없는 공유 코드·빌드 도구·서버 계산에는 dependency-free `./insets/pure`를 쓴다. 이 경로는 `Platform.OS`를 읽을 수 없으므로 플랫폼을 명시적으로 넘긴다.

```ts
import {
  nativeBottomInset,
  nativeBottomPadding,
  computeKeyboardRevealOffset,
} from '@gj-kit/expo-ui/insets/pure';

const bottomInset = nativeBottomInset(34, 'ios');
const bottomPadding = nativeBottomPadding(24, bottomInset, 'ios');
const revealOffset = computeKeyboardRevealOffset({
  currentOffset: 0,
  inputHeight: 44,
  inputTop: 640,
  keyboardInset: 300,
  reservedBottomHeight: 56,
  viewportHeight: 844,
});

void bottomPadding;
void revealOffset;
```

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
| 활성 `Button`/`IconButton`에 `onPress` 누락 | 컴파일 에러 (`disabled`/`loading` 제외) |
| rich children `Button`에 `accessibilityLabel` 누락 | 컴파일 에러 |
| `Tabs` `value`에 items에 없는 오타 | 컴파일 에러 (`NoInfer`) |
| `Tabs`에 `accessibilityLabel` 누락 | 컴파일 에러 — tablist 목적 이름 필수 |
| `Tabs`에 `panels` 누락 | 컴파일 에러 — tab과 panel을 항상 한 계약으로 소유 |
| `Tabs panels`에서 item value 하나 누락 | 컴파일 에러 — `Record<T, ...>` 완전성 강제 |
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
| `SegmentedControl value`에 items에 없는 오타 또는 `null` | 컴파일 에러 (`NoInfer`, required radio choice) |
| `SegmentedControl`에 `accessibilityLabel` 누락 | 컴파일 에러 — named radio group 필수 |
| `ConfirmDialog`에 `visible`·`onConfirm`·`onDismiss` 중 하나 누락 | 컴파일 에러 — 앱이 상태와 모든 close request를 소유 |
| multiple `Accordion`에 `collapsible` 지정 | 컴파일 에러 — single 전용 prop |
| `Chip` kind와 다른 handler·state 조합 | 컴파일 에러 — action/filter/removable 판별 유니언 |
| removable `Chip`에 `removeAccessibilityLabel` 누락 | 컴파일 에러 |
| `Link`에 `href`와 `onPress`를 동시에 지정 | 컴파일 에러 — destination/router branch 배타 |
| pressable `Card`(`onPress`)에 `accessibilityLabel` 누락 | 컴파일 에러 — rich children은 이름을 암묵 파생하지 않음 |
| 정적 `Card`에 `selected`·`disabled`·`accessibilityLabel` 지정 | 컴파일 에러 — 위젯 상태는 pressable 카드 전용 |
| `FormField`에 임의 child를 직접 전달 | 컴파일 에러 — render prop으로 control 관계 적용 |
| `FormField`에 `disabled` 지정 | 컴파일 에러 — 실제 control이 상태를 소유 |
| `Collapsible`에 `title` 누락 또는 custom `trigger` 지정 | 컴파일 에러 |
| icon-only `FloatingActionButton`에 접근성 이름 누락 | 컴파일 에러 |
| range `Slider`에 단일 `accessibilityLabel` 지정 | 컴파일 에러 — 두 thumb 이름 튜플 필수 |
| `ToggleGroup value`에 items에 없는 오타 | 컴파일 에러 (`NoInfer`) |
| icon-only `ToggleGroup` item에 `accessibilityLabel` 누락 | 컴파일 에러 |
| `DataTable`에 `caption`과 `accessibilityLabel`을 함께 지정 | 컴파일 에러 — accessible name 하나만 정본 |
| `DataTable rowHeaderColumnId`에 columns에 없는 ID 지정 | 컴파일 에러 (`NoInfer`) |
| literal columns tuple의 non-sortable ID를 `DataTable sort.columnId`에 지정 | 컴파일 에러 — `sortable: true` 열만 추론 |
| `DataTable presentation="list" | "auto"`에 `renderListRow` 누락 | 컴파일 에러 — compact row를 앱이 명시 |
| `DataTable getRowAccessibilityLabel`을 `onRowPress` 없이 지정 | 컴파일 에러 — 정적 행에는 이름 붙일 대상이 없음 |
| `KeyValueList` item `value`에 `null`/`undefined`/boolean | 컴파일 에러 — 빈 값은 행을 빼는 것으로 표현 |
| `StatGrid` item `value`에 숫자 | 컴파일 에러 — 포맷은 앱이 소유, `value: string` |
| `StatGrid tone="error"` | 컴파일 에러 — `danger`가 tone 이름 |
| `Toolbar`에 `accessibilityLabel` 누락 | 컴파일 에러 — toolbar landmark 이름 필수 |
| `Toolbar gap={12}` 같은 픽셀 값 | 컴파일 에러 — spacing 토큰 키만 |
| `Pagination`에 `accessibilityLabel` 누락 | 컴파일 에러 — navigation 목적 이름 필수 |
| items `Pagination`에 `pageCount`도 지정 | 컴파일 에러 — items/pages count branch 배타 |
| cursor `Pagination`에 `page`·`onPageChange` 지정 | 컴파일 에러 — opaque cursor에 숫자 위치를 발명하지 않음 |
| 임의 문자열로 Toast `update`/`dismiss` | 컴파일 에러 — `show`가 반환한 branded `ToastId`만 허용 |
| Toast `action`에 `label` 또는 `onPress` 누락 | 컴파일 에러 — 죽은 action 차단 |

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
동작한다. `node`·`browser` 조건은 별칭 없이 `react-native-web >= 0.21`을 직접 불러오는 전용 산출물을 선택한다. Expo Web에는 보통 이미 설치돼 있으며, bare React Native Web 앱은 이 optional peer를 직접 설치해야 한다. DataTable은 이 웹 산출물에서 실제 HTML table을, Pagination은 실제 navigation·ordered list·button을 만든다. Toast(`position: fixed`)·StickyActionBar(`position: sticky`)도 웹 분기가 내장돼 있다. 단 호버 스타일은 NativeWind 호스트의 `dark:`/`hover:` 클래스 소관이다.

**Q. bare React Native Web TypeScript에서 DOM 중복 선언 오류가 나면?**
React Native의 전역 선언과 `lib.dom.d.ts`가 `Blob`, `FormData` 같은 이름에서 겹치는 도구 체인 문제다. 앱 `tsconfig.json`에 `"skipLibCheck": true`를 두거나 native/web 설정을 분리한다. `skipLibCheck`는 declaration 파일 간 검사를 건너뛸 뿐 앱의 `.ts`·`.tsx` 소스 타입 검사는 유지한다. 런타임 alias를 추가할 필요는 없으며, `node`·`browser` export condition이 RNW 산출물을 선택한다.

**Q. 다크 모드에서 tailwind 클래스는?**
preset은 단일 테마에서 방출된다. 런타임 다크 전환의 정본은 `useTheme()` 경로이고, className 경로의 다크는 NativeWind `dark:` 유틸리티로 앱이 다룬다 — 두 진실을 동기화하려 들면 반드시 어긋나기 때문에 라이브러리는 시도하지 않는다.

**Q. 아이콘 라이브러리가 왜 없나?**
런타임 의존성 0 원칙과 충돌한다. `RenderIcon` 슬롯(`({ color, size }) => ReactNode`)에 앱의 아이콘 시스템을 꽂으면 색·크기는 라이브러리가 계산해 넘긴다.

**Q. `Text`가 RN `Text`를 가리는데?**
의도된 관행(react-native-paper·Tamagui와 동일)이다. RN 것이 필요하면 `import { Text as RNText } from 'react-native'`.

## 라이선스

MIT
