# @gj-kit/expo-ui

**토큰이 모든 스타일을 관통하는** Expo/React Native UI 킷. 색상·간격·라운드·서체·그림자·치수 전부가 테마에서 오고, 테마는 `createTheme`을 거쳐야만 존재할 수 있으며, 잘못 쓰면 컴파일 에러가 난다.

이 라이브러리는 "parse, don't validate" 철학을 UI에 적용한다: 반쪽 테마 객체, 접근성 라벨 없는 아이콘 버튼, 핸들러 없는 액션 버튼, 토큰 키 오타 — 이런 것들은 런타임에서 조용히 깨지는 대신 타입 검사에서 거부된다.

> **릴리스 상태 (2026-08-11)**
> npm `latest`는 **v0.3.0·31종**이다. 이 저장소의 `main`에는 다음 minor를 위한 **v0.4 소스 프리뷰·49종**이 들어 있으며, 아래에서 “v0.4 소스 프리뷰”로 표시한 API는 아직 npm `latest`에 포함되지 않았다. `pnpm add @gj-kit/expo-ui`만 실행한 사용자는 안정판 31종을 받는다.

- **직접 런타임 의존성 0** — 필수 peer는 `react`, `react-native`뿐이다. 웹 조건 빌드는 optional peer `react-native-web >= 0.21`을 직접 사용하고, 아이콘·문구는 앱에서 주입받는다.
- **라이트/다크 내장** — `createThemes` 한 번으로 양 스킴 브랜드 테마 쌍을 만들고, Provider가 시스템 다크를 추종한다.
- **npm v0.3 안정판 31종·소스 v0.4 프리뷰 49종·31개 색상 role** — 폼 제어, 상태 피드백, 진행률, identity, disclosure, 데이터 표시와 interaction foundation을 같은 토큰·타입 규칙으로 제공한다.
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
> - 루트 `UiProvider`는 v0.4의 Menu·Select·Popover·Tooltip·Sheet와 modal Dialog가 공유하는 overlay 환경도 자동으로 만든다. 중첩 `UiProvider`는 테마·문구·아이콘만 재정의하고 바깥 stack과 tooltip coordinator를 재사용하므로 일반 앱은 `OverlayProvider`를 따로 추가하지 않는다.

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

위 31종이 현재 npm v0.3.0 안정판이다. v0.3에서 상태(Badge/Alert), identity·구조(Avatar/Divider/ListItem), 진행률(Spinner/ProgressBar), 폼 제어(Checkbox/Switch/RadioGroup), disclosure(Accordion)를 추가했다.

`main`의 v0.4 소스 프리뷰에는 다음 18종이 추가돼 총 49종이다. 아직 npm에서 아래 import를 사용하면 안 된다.

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
  Link,
  Menu,
  Pagination,
  Popover,
  Select,
  Sheet,
  Slider,
  ToastViewport,
  ToggleGroup,
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
void Link;
void Menu;
void Pagination;
void Popover;
void Select;
void Sheet;
void Slider;
void ToastViewport;
void ToggleGroup;
void Tooltip;
void useToastQueue;
```

프리뷰 18종도 `style`·`className`·`testID` 계열의 명시적 스타일 꼬리, 테마 토큰, 라이트/다크, Provider 아이콘 규칙을 그대로 따른다. `useToastQueue`는 새 컴포넌트 수에 포함하지 않는 `ToastViewport`의 상태 훅이고, `OverlayProvider`는 Menu·Select·Popover·Tooltip·Sheet와 Dialog가 공유하는 인프라이므로 컴포넌트 수에서 제외한다. 공개 전에는 이름이나 세부 계약이 바뀔 수 있다.

2026-08-11 현재 `main`은 **unit 534개 + type-contract 91개 = 625개** 검증과 platform build, 아래 README 코드 블록 컴파일을 통과한다. 이 소스 검증은 npm v0.4가 이미 배포됐다는 뜻이 아니다.

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

### v0.4 소스 프리뷰 — interaction·data·overlay foundation 18종

> 아래 API는 `main` 소스에는 구현돼 있지만 아직 npm v0.3.0에는 없다. v0.4가 배포되기 전까지 평가·마이그레이션 준비 용도로만 읽는다.

#### Chip — 생김새가 아니라 동작으로 분기

`Chip`은 한 컴포넌트지만 `kind`가 역할과 콜백을 정확히 고정한다.

| `kind` | 필수 상태·콜백 | 의미 |
|---|---|---|
| `action` | `label`, `onPress` | 한 번 실행하는 button |
| `filter` | `label`, `selected`, `onSelectedChange` | 이름이 바뀌지 않는 controlled toggle |
| `removable` | `label`, `onRemove`, `removeAccessibilityLabel` | 정적 값 + 별도 제거 button |

공통 선택지는 `variant="filled" | "outlined"`(기본 filled), `size="sm" | "md"`(기본 md), `leading`, `disabled`다. removable 컨테이너 전체를 Pressable로 만들지 않아 인터랙티브 요소 중첩을 피한다.

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

`Card`는 관련 콘텐츠를 묶는 **정적 View 컨테이너만** 제공한다. 선택지는 `variant="outlined" | "elevated" | "filled"`, 토큰 또는 숫자 `padding`, 토큰 `radius`다. 모든 variant가 같은 내부 content View를 사용하며 `style`은 높이·폭·배치 같은 바깥 레이아웃, `contentStyle`은 자식 방향·정렬·간격에 적용한다. 이 구조는 고정 높이 Card 안의 flex 자식이 남은 영역을 채우게 하면서 elevated의 바깥 shadow는 clip하지 않고 내부 배경·테두리·둥근 모서리와 자식만 안전하게 clip한다. `onPress`·`disabled`·전체-card 접근성 이름은 받지 않는다. 이동이나 작업이 필요하면 정적 Card 안에 의미가 분명한 `Link`나 `Button`을 별도로 둔다. 이 경계는 전체 카드 button 안에 다른 interactive child가 중첩되는 문제를 공개 API에서 제거한다.

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

v0.4의 `TextField`도 단독 사용 시 label·helper·error ID를 자동 생성해 RN `accessibilityLabelledBy`/`accessibilityHint`와 웹 `aria-labelledby`/`aria-describedby`/`aria-errormessage`를 연결한다. 외부 `FormField`가 넘긴 `nativeID`·관계 prop도 보존하므로 둘을 함께 사용할 수 있다.

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

#### ToastViewport / useToastQueue — 수명과 순서를 선언적으로 소유

기존 v0.3의 `Toast/useToastController`는 단일 알림 호환 API로 유지한다. v0.4의 `useToastQueue`는 FIFO 전체 `records`, 현재 보이는 `visibleToasts`, `queuedCount`와 `show/update/dismiss/dismissAll/pause/resume`을 반환한다. 기본은 한 개 표시·아홉 개 대기(총 10개), 5000ms이며 `durationMs={null}`은 사용자가 닫을 때까지 유지한다. 타이머는 보이는 Toast에만 시작되고, update 또는 같은 `dedupeKey`의 show는 기존 id와 위치를 보존하면서 내용을 바꾸고 수명을 다시 시작한다. 상한을 넘으면 가장 오래 기다린 항목을 결정적으로 제거하고 `queue-overflow`를 보고한다.

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
<ErrorState onRetry={refetch} />
```

> **왜 이 단계를 건너뛸 수 없는가**
> `EmptyState`의 액션은 `{ label, onPress }` 객체다 — 전신처럼 `actionLabel`만 넘기고 `onAction`을 잊으면 **눌러도 아무 일 없는 죽은 버튼**이 렌더됐다. 이제 그 상태는 컴파일되지 않는다. `ErrorState`의 재시도 버튼도 `onRetry`가 있을 때만 렌더된다.

### Toast (npm v0.3 안정판)

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

`dismissDisabled`는 저장·삭제 중 backdrop, Escape/Back, 접근성 escape와 닫기 버튼을 함께 막는다. 접근성 escape callback은 실제 descendant에 연결하지만 iOS VoiceOver 실기기 검증 전에는 보장 범위를 넓히지 않는다. `initialFocusRef`·`finalFocusRef`를 지정했을 때만 플랫폼 기본 포커스 처리에 best-effort override를 적용한다. `presentation="inline"`은 이미 열린 native Modal 안에서 레이어를 합성할 때 쓰며 portal·focus trap·dialog 역할을 제공한다고 가장하지 않고 overlay stack에도 참여하지 않는다. rich adaptive surface는 위의 `Sheet`, 제한된 선택 액션은 `ActionSheet`를 사용한다. drag·snap 제스처는 현재 둘의 계약 밖이며 후속 optional `BottomSheet` adapter 범위다.

v0.4 소스에서 modal Dialog는 `UiProvider` 또는 `OverlayProvider` 범위가 있으면 열릴 때 stack에 한 번 등록되고, 내부 overlay는 현재 Dialog를 parent로 상속한다. backdrop, 웹 Escape, 네이티브 Back, 접근성 escape와 close action은 모두 같은 topmost request 경로를 지나므로 열린 child Popover·Menu·Select가 있으면 parent Dialog가 먼저 닫히지 않는다. `dismissDisabled`인 topmost layer는 아래 layer까지 요청이 새는 것도 막는다. 이 parent ID와 stack hook은 구현 세부이며 public prop이나 barrel export가 아니다. Provider 없는 단일 Dialog는 기존처럼 동작하지만 여러 overlay의 중첩 순서가 필요하면 루트 `UiProvider`를 둔다.

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

function BottomAnchoredSurface({ children }: { children: ReactNode }) {
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
| multiple `Accordion`에 `collapsible` 지정 | 컴파일 에러 — single 전용 prop |
| `Chip` kind와 다른 handler·state 조합 | 컴파일 에러 — action/filter/removable 판별 유니언 |
| removable `Chip`에 `removeAccessibilityLabel` 누락 | 컴파일 에러 |
| `Link`에 `href`와 `onPress`를 동시에 지정 | 컴파일 에러 — destination/router branch 배타 |
| `Card`에 `onPress`·`disabled` 지정 | 컴파일 에러 — 정적 콘텐츠 컨테이너 전용 |
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
