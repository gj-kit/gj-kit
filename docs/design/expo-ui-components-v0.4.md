# @gj-kit/expo-ui — interaction·overlay foundation v0.4

> 구현 기준 문서. 2026-08-11 현재 `expo-ui/src/components/{chip,card,link,form-field,collapsible,fab,aspect-ratio,slider,toggle-group,toast-queue,action-sheet,sheet,data-table,data-table.types,data-table-validation,pagination,pagination.types,pagination-range,pagination-validation,menu,select,popover,tooltip,dialog,tabs,fields}.*`와 공개 `OverlayProvider` scope의 계약을 기록한다. **npm `latest`는 아직 v0.3.0·31종**이며, 이 문서의 신규 18종은 `main`의 v0.4 소스 프리뷰다. [`expo-ui-components-v0.2.md`](./expo-ui-components-v0.2.md)의 토큰·타입·접근성 원칙은 그대로 유지한다.

## 0. 결과와 릴리스 경계

v0.4는 웹·iOS·Android에서 의미를 완성하는 interaction foundation 10종, typed data display인 `DataTable`, numbered·cursor navigation을 분리한 `Pagination`, 목적이 좁은 `ActionSheet`, rich adaptive surface인 `Sheet`, 그리고 공통 overlay 환경을 소비하는 `Menu<T>`·`Select<T>`·`Popover`·`Tooltip`을 추가한다. 기존 Dialog, Tabs와 TextField의 프로그램적 관계도 보강한다.

| 항목 | npm v0.3.0 안정판 | v0.4 소스 프리뷰 |
|---|---:|---:|
| 공개 디자인 컴포넌트 | 31 | **49** |
| color role | 31 | **31** |
| package entrypoint | 4 | **4** |
| 직접 runtime dependency | 0 | **0** |
| 필수 peer | react, react-native | 변경 없음 |
| optional platform peer | safe-area-context | safe-area-context + **react-native-web >=0.21** |

추가 18종:

| 영역 | 컴포넌트 | 한 가지 책임 |
|---|---|---|
| Action / selection | `Chip` | action·controlled filter·removable value를 의미별 branch로 분리 |
| Surface | `Card` | 관련 콘텐츠를 의미 없는 정적 표면으로 묶음 |
| Navigation | `Link` | 목적지 이동과 앱 라우터 이동을 button action과 구분 |
| Form | `FormField` | label·helper·error·control의 프로그램적 관계 제공 |
| Disclosure | `Collapsible` | 독립 trigger/content 한 쌍의 controlled 공개 상태 |
| Primary action | `FloatingActionButton` | 화면 대표 action 하나와 edge/safe-area 배치 합성 |
| Media layout | `AspectRatio` | 유효한 width/height 비율을 플랫폼 공통 View에 적용 |
| Numeric input | `Slider` | single/range 수치 입력, step·RTL·thumb 접근성 계약 제공 |
| Immediate selection | `ToggleGroup` | single/multiple toggle button 집합과 roving focus 제공 |
| Data display | `DataTable` | semantic web table, native visual table/list와 typed sort·selection·state 계약 제공 |
| Navigation | `Pagination` | 1-based numbered items/pages와 opaque cursor 탐색을 타입으로 분리하고 semantic web navigation·native adaptive 표현 제공 |
| Transient feedback | `ToastViewport` + `useToastQueue` | 선언형 FIFO, 제한·dedupe·수명 일시정지와 접근 가능한 viewport 제공 |
| Adaptive action overlay | `ActionSheet` | 모바일 하단·넓은 화면 중앙의 typed action dialog와 안전한 cancel 제공 |
| Rich adaptive surface | `Sheet` | 고정 header·footer와 명시적 scroll ownership을 모바일 하단·넓은 화면 logical side panel로 제공 |
| Context menu | `Menu` | typed action·checkbox item, 웹 menu keyboard와 네이티브 adaptive action surface 제공 |
| Single selection | `Select` | typed controlled value, 웹 combobox/listbox와 네이티브 radio action surface 제공 |
| Rich contextual overlay | `Popover` | owned trigger·필수 title·close를 웹 non-modal과 네이티브 adaptive Dialog로 제공 |
| Icon action description | `Tooltip` | owned 44px 아이콘 action에 웹 시각 설명과 네이티브 accessibilityHint 제공 |

`Tabs`와 `TextField`는 기존 컴포넌트 업그레이드이므로 컴포넌트 수에는 더하지 않는다. `OverlayProvider`는 overlay 컴포넌트와 modal Dialog가 공유하는 인프라이므로 49종에 포함하지 않는다.

## 1. 벤치마크와 tranche 결정

### 1.1 살펴본 공식 카탈로그

- [React Native Paper](https://callstack.github.io/react-native-paper/docs/components/Chip/)는 Chip, Card, FAB와 함께 Menu, Portal, Tooltip 같은 overlay 계열을 제공한다.
- [Tamagui](https://tamagui.dev/ui/intro)는 cross-platform suite를 composable primitive로 제공하고 Dialog·Popover가 사용할 portal root를 Provider에서 만든다.
- [gluestack-ui](https://gluestack.io/ui/docs/components/all-components)는 Card, FormControl, Link, FAB뿐 아니라 Select, Menu, Popover, Portal, Tooltip을 한 카탈로그에서 다룬다.
- [shadcn/ui](https://ui.shadcn.com/docs/components)는 Aspect Ratio, Card, Collapsible, Field와 Popover, Select, Tooltip 같은 조합을 분리된 컴포넌트로 제공한다.
- [Radix Aspect Ratio](https://www.radix-ui.com/primitives/docs/components/aspect-ratio)는 미디어 비율처럼 overlay 인프라가 없어도 완결되는 좁은 primitive의 선례다.
- [Radix Slider](https://www.radix-ui.com/primitives/docs/components/slider)는 single/multiple thumb, 최소 간격, RTL, pointer·touch와 전체 keyboard 입력을 한 수치 primitive에 묶는다.
- [Radix Toggle Group](https://www.radix-ui.com/primitives/docs/components/toggle-group)과 [Tamagui ToggleGroup](https://tamagui.dev/ui/toggle-group)은 single/multiple 상태와 orientation, roving keyboard focus를 제공한다.
- [Radix Toast](https://www.radix-ui.com/primitives/docs/components/toast)는 viewport·action·close와 hover/focus/window blur 수명 일시정지를 선언적 Toast의 기준선으로 제공한다.
- [Tamagui Sheet](https://tamagui.dev/ui/sheet)는 handle·drag·multiple snap point와 전용 ScrollView를 함께 제공하고 optional gesture-handler 통합으로 scroll-to-drag handoff를 강화한다.
- [gluestack-ui Drawer](https://v2.gluestack.io/ui/docs/components/drawer)는 backdrop·content·header·body·footer를 분리하고 side anchor를 선택하는 rich panel 구조를 제공한다.
- [shadcn/ui Sheet](https://ui.shadcn.com/docs/components/base/sheet)는 Dialog를 확장해 header·title·description·footer와 top·right·bottom·left side를 조합한다.
- [React Native Paper DataTable](https://callstack.github.io/react-native-paper/docs/components/DataTable/)은 mobile-first header·row·cell·pagination 합성의 기준선을 제공하고, [shadcn Table](https://ui.shadcn.com/docs/components/table)은 semantic HTML table을 앱 소유 데이터 모델과 결합하는 얇은 표면을 보여준다.
- [MUI Table](https://mui.com/material-ui/react-table/)은 native table semantics를 유지하는 bounded data display를, 별도 [MUI Data Grid](https://mui.com/x/react-data-grid/)는 virtualization·column management·grid interaction이 필요한 데이터 엔진을 분리하는 선례를 제공한다.
- [React Native Paper DataTable.Pagination](https://oss.callstack.com/react-native-paper/docs/components/DataTable/DataTablePagination/)은 현재 page와 page size·item count를 앱이 소유하는 mobile pagination을 제공하고, [Chakra Pagination](https://chakra-ui.com/docs/components/pagination)과 [MUI Pagination](https://mui.com/material-ui/api/pagination/)은 boundary·sibling range와 controlled page를 분리한다. [shadcn Pagination](https://ui.shadcn.com/docs/components/radix/pagination)은 navigation landmark를 얇은 앱 조합으로 유지하며, [WAI-ARIA `aria-current`](https://www.w3.org/TR/wai-aria/#aria-current)은 현재 페이지 하나를 `page`로 노출하는 기준을 제공한다.

공통적으로 Card·Field·Link·Chip·FAB 같은 기반 요소는 독립 구현이 가능하지만 Menu·Popover·Tooltip·Select는 stack, dismiss, position, presence와 collection 탐색을 공유한다. v0.4 overlay tranche는 먼저 공통 Provider scope를 검증한 뒤, 플랫폼 의미를 끝까지 소유할 수 있는 좁은 제품 계약으로 네 컴포넌트를 공개 표면에 추가했다. Popover는 임의 trigger 합성을 제거하고 Tooltip은 plain-text icon action으로 제한해 공개 Portal 없이도 일관된 수명과 접근성을 보장한다. Sheet는 Tamagui의 gesture·snap 제품군보다 gluestack/shadcn의 구조화된 rich panel 경계에 가깝게 잡고, GJ Kit의 runtime dependency 0을 깨는 gesture coordination은 후속 optional `BottomSheet` adapter로 분리했다.

### 1.2 v0.4에 포함한 기준

1. **플랫폼별 의미를 완성할 수 있는가.** 웹은 anchor·outside·focus·keyboard 관계를, 네이티브는 검증된 React Native Modal 기반 adaptive surface와 Back·접근성 escape를 끝까지 소유해야 한다.
2. **GJ Kit의 타입 차별점이 실제 오용을 막는가.** action/filter/removable, destination/router처럼 잘못 섞이는 props를 판별 유니언으로 닫고, Card처럼 상호작용을 안전하게 일반화할 수 없는 표면은 정적 계약으로 제한한다.
3. **기존 토큰만으로 스타일을 설명할 수 있는가.** 신규 color role이나 외부 icon package를 요구하지 않는다.
4. **자주 반복되는 앱 래퍼를 제거하는가.** 카드 표면, 필드 관계, 단일 disclosure, media ratio, primary floating action을 제품마다 다시 만들지 않게 한다.
5. **접근성 검증을 unit/type test로 고정할 수 있는가.** 실제 screen-reader 검증 없이는 안전성을 약속할 수 없는 `VisuallyHidden`은 이번 공개 표면에서 제외한다.
6. **정적 표와 데이터 엔진의 경계를 지킬 수 있는가.** DataTable은 현재 visible rows의 이름·열·상태·sort request·checkbox selection을 표현하되 filtering·virtualization과 실제 정렬 순서는 앱에 남긴다. Pagination도 data fetch·cursor 저장·route 동기화 없이 navigation request만 제공해 두 컴포넌트를 독립적으로 조합한다.

### 1.3 이번에 넣지 않은 것

공개 `Portal`·Host·`asChild` trigger 합성과 drag·snap·grabber를 가진 gesture `BottomSheet` adapter는 아직 연기한다. 이번 `Sheet`는 controlled modal rich surface, responsive bottom/logical-side 배치, 고정 header/footer와 스크롤 소유권까지만 책임진다. Popover의 arbitrary child trigger·compound Trigger/Content와 Tooltip의 임의 child wrapper·interactive content도 현재 owned-trigger 계약 밖이다. Menu의 radio item·submenu, Select의 검색·다중 선택도 current single-level action/checkbox와 select-only single value 계약 밖이다. `ActionSheet`는 menu나 gesture sheet를 가장하지 않고 일반 button을 Dialog에 배치하는 제한된 제품 계약으로 유지한다. DataTable의 filtering·server fetching·virtualization·column pinning·cell editing·grid keyboard model은 앱 또는 후속 별도 `DataGrid` 책임으로 둔다. Pagination은 fetch, router, cursor token, out-of-range page 자동 보정, infinite-scroll trigger를 소유하지 않는다. `VisuallyHidden`은 웹 CSS만으로는 쉽지만 iOS VoiceOver와 Android TalkBack에서 레이아웃·접근성 트리 조합을 실기기 검증하기 전까지 stable primitive로 내지 않는다. Slider는 이번에 수평 single/range까지만 제공하며 vertical orientation과 HTML form 직렬화는 후속 tranche다. Toast swipe gesture와 viewport hotkey도 실제 브라우저·실기기 검증 전에는 약속하지 않는다.

## 2. 불변식

v0.4 구현은 다음을 깨지 않는다.

1. **직접 runtime dependency 0.** 아이콘은 `ReactNode | RenderIcon`, 문구는 앱 prop 또는 기존 Provider 슬롯이다. 웹 조건 산출물은 optional peer `react-native-web >= 0.21`을 직접 import하며 네이티브 설치를 강제하지 않는다.
2. **토큰 단일 출처.** 색, spacing, radius, typography, elevation, control/icon metric은 Theme에서만 읽는다. raw 색·font size·font weight는 token guard가 거부한다.
3. **네 개 entrypoint 유지.** 새 컴포넌트는 root `@gj-kit/expo-ui`에만 추가하며 `/theme`, `/tailwind`, `/insets`의 RN-free 또는 optional-peer 경계를 바꾸지 않는다.
4. **controlled 상태.** Chip filter, Collapsible, Slider, ToggleGroup, Tabs, DataTable sort·selection, Pagination page·cursor request, Menu·Popover·Sheet의 open과 Select의 open·value는 앱이 소유한다. Tooltip의 짧은 hover/focus presence만 내부 coordinator가 관리한다. Toast queue도 hook instance의 명시적 records로 한정되며 전역 singleton이 없다. 숨은 `defaultValue`·`defaultOpen`이 없다.
5. **판별 유니언 우선.** 불가능한 조합은 런타임 경고가 아니라 `never` prop으로 컴파일 단계에서 막는다.
6. **`NoInfer`·tuple inference 보존.** Tabs·ToggleGroup·Menu·Select items와 DataTable columns가 값 유니언의 정본이며 value, callback, panels, row header나 sort 오타가 추론을 넓힐 수 없다. literal DataTable tuple은 `sortable: true`인 ID만 sort 계약에 남긴다.
7. **스타일 탈출구는 의미가 분명해야 한다.** visual root는 `style`/`className`/`testID`, 텍스트·trigger·content처럼 별도 슬롯은 이름이 있는 스타일 prop을 사용한다. `unstyled?: never`는 계속 금지한다.
8. **DOM lib를 public source에 들이지 않는다.** RNW 전용 `aria-*`, href, keyboard event는 좁은 로컬 타입과 platform adapter로 표현한다.

## 3. Chip

### 3.1 공개 계약

```ts
type ChipKind = 'action' | 'filter' | 'removable';
type ChipVariant = 'filled' | 'outlined';
type ChipSize = 'sm' | 'md';

type ChipBaseProps = {
  kind: ChipKind;
  label: string;
  variant?: ChipVariant; // filled
  size?: ChipSize;       // md
  leading?: ReactNode | RenderIcon;
  disabled?: boolean;
  labelStyle?: StyleProp<TextStyle>;
  labelClassName?: string;
  // root style, className, testID, unstyled?: never
};

type ActionChipProps = ChipBaseProps & {
  kind: 'action';
  onPress: () => void;
  selected?: never;
  onSelectedChange?: never;
  onRemove?: never;
  removeAccessibilityLabel?: never;
};

type FilterChipProps = ChipBaseProps & {
  kind: 'filter';
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  onPress?: never;
  onRemove?: never;
  removeAccessibilityLabel?: never;
};

type RemovableChipProps = ChipBaseProps & {
  kind: 'removable';
  onRemove: () => void;
  removeAccessibilityLabel: string;
  onPress?: never;
  selected?: never;
  onSelectedChange?: never;
};

type ChipProps = ActionChipProps | FilterChipProps | RemovableChipProps;
```

### 3.2 의미와 동작

- `action`: button. Enter와 Space의 플랫폼 기본 button 활성화를 보존한다.
- `filter`: 이름이 바뀌지 않는 toggle button이며 selected/pressed 상태를 노출한다. 앱은 `onSelectedChange(!selected)` 결과를 정본에 반영한다.
- `removable`: root는 정적 View이고 제거 아이콘만 별도 button이다. 전체 Chip과 제거 button을 중첩 Pressable로 만들지 않는다. 동작 이름이 값 label과 다르므로 `removeAccessibilityLabel`을 강제한다.
- selected filter에 `leading`이 없으면 Provider `check`, 없으면 텍스트 폴백을 쓴다. removable의 닫기 역시 Provider `close`를 우선한다.
- `disabled`는 action/filter/remove 동작과 disabled state를 함께 막는다.

## 4. Card

### 4.1 공개 계약

```ts
type CardVariant = 'outlined' | 'elevated' | 'filled';

interface CardProps {
  children: NonNullable<ReactNode>;
  variant?: CardVariant;       // outlined
  padding?: SpacingKey | number; // lg
  radius?: RadiusKey;          // md
  style?: StyleProp<ViewStyle>; // 바깥 배치·크기
  contentStyle?: StyleProp<ViewStyle>; // 자식 방향·정렬·간격
  className?: string;
  testID?: string;
  unstyled?: never;
}
```

### 4.2 경계

- Card는 항상 의미 없는 View다. 전체-card `onPress`, disabled state, action label을 공개하지 않는다.
- 이동이나 작업이 필요하면 정적 Card 안에 의미가 분명한 Link·Button을 별도 child로 둔다. 이 선택으로 전체 button과 내부 interactive child의 중첩, 카드 전체 action 이름 합성, 링크와 버튼 역할 혼동을 API에서 제거한다.
- outlined는 hairline border, elevated는 surface + `elevation.md`, filled는 `surfaceSubtle`을 사용한다. 모든 variant는 같은 내부 content View에 배경·테두리·radius·padding·clipping을 적용하고, 바깥 View의 `style`과 내부 `contentStyle`을 분리한다. 내부 View는 고정 높이 바깥 Card를 채우며, elevated만 바깥 View에 unclipped shadow를 둬 edge-to-edge 미디어도 radius 밖으로 새지 않게 한다.

## 5. Link

### 5.1 공개 계약

```ts
type LinkVariant = 'primary' | 'muted' | 'danger';
type LinkTarget = '_self' | '_blank';

type LinkBaseProps = {
  children: string;
  variant?: LinkVariant; // primary
  underline?: boolean;   // true
  accessibilityLabel?: string;
  style?: StyleProp<TextStyle>;
  className?: string;
  testID?: string;
  unstyled?: never;
};

type DestinationLinkProps = LinkBaseProps & {
  href: string;
  target?: LinkTarget;
  rel?: string;
  onOpenError?: (error: unknown) => void;
  onPress?: never;
};

type ActionLinkProps = LinkBaseProps & {
  onPress: () => void;
  href?: never;
  target?: never;
  rel?: never;
  onOpenError?: never;
};

type LinkProps = DestinationLinkProps | ActionLinkProps;
```

### 5.2 플랫폼 계약

- 웹 destination은 실제 anchor/href를 내고 브라우저의 링크 동작을 유지한다. `_blank`에는 소비자 rel과 함께 `noopener noreferrer`를 항상 보존한다.
- 네이티브 destination은 `Linking.openURL(href)`를 사용하고 동기·비동기 실패를 선택적 `onOpenError`로 전달한다.
- router/action branch는 `accessibilityRole="link"`를 유지하고 웹에서 Enter만 활성화한다. Space는 button과 달리 링크를 실행하지 않는다.
- children을 string으로 제한해 링크의 안정적인 보이는 이름과 Text 기반 렌더를 보장한다.

## 6. FormField와 TextField 관계

### 6.1 공개 계약

```ts
interface FormFieldControlProps {
  nativeID: string;
  accessibilityLabel: string;
  accessibilityLabelledBy: string;
  accessibilityHint?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-errormessage'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

type FormFieldBaseProps = {
  label: string;
  children: (controlProps: FormFieldControlProps) => ReactElement;
  helperText?: string;
  error?: string; // helperText보다 우선
  labelAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  helperStyle?: StyleProp<TextStyle>;
  className?: string;
  labelClassName?: string;
  helperClassName?: string;
  testID?: string;
  unstyled?: never;
};

type FormFieldProps = FormFieldBaseProps & (
  | { required?: false; requiredAccessibilityLabel?: never }
  | { required: true; requiredAccessibilityLabel: string }
);
```

### 6.2 관계 생성

- React `useId`에서 label/control/helper/error ID를 만든다.
- label은 항상 보이며 `accessibilityLabelledBy`와 웹 `aria-labelledby`로 control에 연결된다.
- error가 있으면 helper보다 우선하고 웹 `aria-invalid`, `aria-errormessage`, `aria-describedby`, polite live region을 설정한다.
- required는 보이는 표시와 웹 `aria-required`에 함께 전달한다. iOS VoiceOver는 `accessibilityLabelledBy`를 사용하지 않으므로 required branch는 현지화된 전체 제어 이름 `requiredAccessibilityLabel`도 필수로 받아 `accessibilityLabel`로 전달한다.
- children을 clone하지 않는다. render prop 소비자가 실제 focusable control에 `FormFieldControlProps`를 적용한다.
- disabled·busy·checked 같은 control 상태는 제어마다 타입과 적용 위치가 다르므로 FormField가 추상화하지 않는다. 실제 control prop에 직접 지정한다.

### 6.3 TextField 업그레이드

TextField 단독 사용도 같은 관계를 자동 생성한다.

- `label` → 생성한 label ID → input `accessibilityLabelledBy` / `aria-labelledby`
- `helperText` → `accessibilityHint` / `aria-describedby`
- `error` → danger visual + invalid state + `aria-errormessage` + polite live region
- 외부가 넘긴 `nativeID`, `accessibilityLabelledBy`, `aria-labelledby`, `aria-describedby`, `aria-errormessage`, `aria-invalid`, `aria-required`, `aria-disabled`는 TextField 내부 생성값과 우선순위에 따라 보존·합성

따라서 FormField render prop을 label 없는 TextField에 spread해도 control 관계가 끊기지 않는다.

## 7. Collapsible

### 7.1 공개 계약

```ts
type CollapsibleVariant = 'plain' | 'outlined';

interface CollapsibleProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: NonNullable<ReactNode>;
  disabled?: boolean;
  variant?: CollapsibleVariant; // outlined
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6; // 3
  triggerStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  className?: string;
  testID?: string;
  unstyled?: never;
}
```

### 7.2 disclosure 의미

- trigger는 heading 안의 native button 의미를 갖고 content ID를 controls로, open을 expanded로 노출한다. RNW가 View role=button을 실제 HTML button으로 매핑하므로 브라우저의 Enter/Space 기본 활성화를 재구현하지 않는다.
- 임의 leading·indicator ReactNode는 실제 button 안에 또 다른 interactive 요소를 중첩할 수 있어 받지 않는다. 표시기는 UiProvider의 장식용 `chevronDown` 또는 텍스트 폴백만 사용하며 pointer/focus/접근성 트리에서 제외한다.
- 네이티브는 Pressable button과 expanded/disabled state를 노출한다.
- `title: string`만 trigger copy로 허용해 heading 안의 button이 항상 안정적인 보이는 이름을 갖게 한다. `accessibilityLabel`은 필요한 문맥 보완용 override이며 임의 custom trigger는 공개 API에서 제거한다.
- 닫힌 content는 `display: none`뿐 아니라 `aria-hidden`, `accessibilityElementsHidden`, `importantForAccessibility`로 접근성 트리와 focus 대상에서 함께 제외된다.
- 상태는 오직 `open`/`onOpenChange`가 소유한다. Accordion은 여러 item의 값 집합, Collapsible은 한 trigger/content 쌍이라는 경계가 있다.

## 8. FloatingActionButton

### 8.1 공개 계약

```ts
type FABSize = 'sm' | 'md' | 'lg';
type FABVariant = 'primary' | 'secondary';
type FABPlacement = 'bottom-start' | 'bottom-center' | 'bottom-end';

type FABBaseProps = {
  onPress: () => void;
  size?: FABSize;           // md
  variant?: FABVariant;     // primary
  placement?: FABPlacement; // bottom-end, RTL-aware
  offset?: SpacingKey | number; // xl
  bottomInset?: number;     // 0
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  className?: string;
  testID?: string;
  unstyled?: never;
};

type IconOnlyFABProps = {
  icon: NonNullable<ReactNode> | RenderIcon;
  accessibilityLabel: string;
  label?: never;
  labelStyle?: never;
  labelClassName?: never;
};

type ExtendedFABProps = {
  label: string;
  icon?: NonNullable<ReactNode> | RenderIcon;
  accessibilityLabel?: string;
  labelStyle?: StyleProp<TextStyle>;
  labelClassName?: string;
};

type FABProps = FABBaseProps & (IconOnlyFABProps | ExtendedFABProps);
```

### 8.2 동작과 배치

- icon-only는 보이는 text가 없으므로 `accessibilityLabel`을 필수로 한다. extended는 label을 기본 접근성 이름으로 쓴다.
- loading은 busy + disabled이며 spinner로 content를 대체한다. disabled/loading 중에는 `onPress`가 실행되지 않는다.
- size는 control/icon metric, offset은 spacing token 또는 실측 number다. `bottom = offset + bottomInset`으로 safe area를 명시적으로 합성한다.
- placement는 absolute edge 배치만 책임진다. 여러 action을 펼치는 speed dial, scroll-hide, keyboard avoidance 상태는 앱 소유다.

## 9. AspectRatio

### 9.1 공개 계약

```ts
interface AspectRatioProps {
  ratio: number;
  children?: NonNullable<ReactNode>;
  // root style, className, testID, unstyled?: never
}
```

- `ratio`는 `width / height`다. 유한한 양수가 아니면 `RangeError`를 던진다.
- root View는 소비자 style 뒤에 `width: '100%'`와 `aspectRatio: ratio` 불변식을 적용한다. 소비자가 width와 height를 동시에 고정하면 플랫폼 레이아웃 규칙상 ratio보다 두 치수가 우선하므로 피한다.
- 로딩, object-fit/content mode, 이미지 대체 텍스트는 미디어 child의 책임이다.

## 10. Slider

### 10.1 공개 계약

```ts
type SliderDirection = 'ltr' | 'rtl';

interface SliderSharedProps {
  min?: number;                 // 0
  max?: number;                 // 100
  step?: number;                // 1
  disabled?: boolean;
  direction?: SliderDirection;  // ltr
  valueText?: (value: number) => string;
  // root/track/range/thumb style, className, testID, unstyled?: never
}

type SliderProps =
  | (SliderSharedProps & {
      mode?: 'single';
      value: number;
      onValueChange: (value: number) => void;
      onValueCommit?: (value: number) => void;
      accessibilityLabel: string;
      accessibilityLabels?: never;
      minDistance?: never;
    })
  | (SliderSharedProps & {
      mode: 'range';
      value: readonly [number, number];
      onValueChange: (value: readonly [number, number]) => void;
      onValueCommit?: (value: readonly [number, number]) => void;
      accessibilityLabels: readonly [string, string];
      accessibilityLabel?: never;
      minDistance?: number;     // 0
    });
```

### 10.2 수치·상호작용·접근성

- `min < max`, 양수 step, `(max - min) / step`, 모든 value와 `minDistance`의 step-grid 정렬을 runtime에서도 검증한다. range는 lower ≤ upper와 `minDistance`를 추가로 강제한다.
- track press는 가장 가까운 thumb를 결정적으로 선택하고 midpoint에서는 lower thumb를 택한다. drag 중 `onValueChange`, 한 pointer 또는 keyboard 상호작용이 끝날 때 `onValueCommit`을 정확히 한 번 호출한다.
- 웹은 각 thumb를 slider로 노출하고 Arrow, PageUp/PageDown, Home/End를 지원한다. 네이티브는 adjustable role과 increment/decrement action을 사용한다. `valueText`는 통화·시간 같은 현지화된 접근성 값을 제공한다.
- `direction="rtl"`은 좌표와 Left/Right 의미를 함께 뒤집는다. range의 두 thumb 이름은 하나로 합치지 않고 `accessibilityLabels` 튜플로 강제한다. 각 hit target은 theme의 44px `control.md`다.

## 11. ToggleGroup

### 11.1 공개 계약

```ts
type ToggleGroupItem<T extends string> = {
  readonly value: T;
  readonly disabled?: boolean;
} & (
  | { readonly label: string; readonly accessibilityLabel?: string; readonly icon?: ReactNode | RenderIcon }
  | { readonly label?: never; readonly accessibilityLabel: string; readonly icon: NonNullable<ReactNode> | RenderIcon }
);

type ToggleGroupProps<T extends string> = {
  items: readonly ToggleGroupItem<T>[];
  accessibilityLabel: string;
  orientation?: 'horizontal' | 'vertical'; // horizontal
  variant?: 'filled' | 'outlined';         // filled
  size?: 'sm' | 'md';                      // md
  disabled?: boolean;
  loop?: boolean;                          // true
  // root/item/label style, className, testID, unstyled?: never
} & (
  | {
      selectionMode: 'single';
      value: NoInfer<T> | null;
      onValueChange: (value: T | null) => void;
      allowEmpty?: boolean;                 // true
    }
  | {
      selectionMode: 'multiple';
      value: readonly NoInfer<T>[];
      onValueChange: (value: readonly T[]) => void;
      allowEmpty?: never;
    }
);
```

### 11.2 선택·키보드·접근성

- item literal value가 selection 유니언의 정본이다. 빈 items, 중복·빈 value, unknown selection, multiple 중복 selection과 빈 접근성 이름을 runtime에서도 거부한다. multiple callback은 항상 원래 item 순서로 값을 돌려준다.
- root는 이름 있는 toolbar이고 item은 toggle button이다. 웹은 `aria-pressed`, 네이티브는 `togglebutton`의 checked/disabled 상태를 사용한다. icon-only item은 접근성 이름이 필수이며 icon은 장식으로 숨긴다.
- selected 또는 첫 enabled item만 tab stop이 된다. horizontal은 Left/Right, vertical은 Up/Down, 두 방향 모두 Home/End로 disabled item을 건너뛴다. 방향키는 focus만 옮기고 값을 바꾸지 않으며 Enter·Space·press가 선택을 바꾼다.
- ToggleGroup은 즉시 적용되는 상태 선택만 소유한다. 별도 화면이나 panel을 바꾸는 항목은 tab/tabpanel 관계를 제공하는 `Tabs`를 사용한다.

## 12. ToastViewport와 useToastQueue

### 12.1 공개 계약

```ts
type ToastId = string & { readonly [toastIdBrand]: 'ToastId' };
type ToastAnnouncement = 'off' | 'polite' | 'assertive';
type ToastDismissReason =
  | 'timeout' | 'close-action' | 'action' | 'programmatic' | 'queue-overflow';

interface ToastRequest {
  readonly title?: string;
  readonly message: string;
  readonly variant?: 'error' | 'success' | 'info' | 'warning'; // info
  readonly durationMs?: number | null;                          // 5000, null은 persistent
  readonly announcement?: ToastAnnouncement;                   // polite
  readonly action?: { readonly label: string; readonly onPress: () => void; readonly accessibilityLabel?: string };
  readonly dedupeKey?: string;
}

interface ToastQueueController {
  readonly records: readonly ToastRecord[];
  readonly visibleToasts: readonly ToastRecord[];
  readonly queuedCount: number;
  readonly show: (request: ToastRequest) => ToastId;
  readonly update: (id: ToastId, update: ToastUpdate) => boolean;
  readonly dismiss: (id: ToastId, reason?: ToastDismissReason) => boolean;
  readonly dismissAll: (reason?: ToastDismissReason) => void;
  readonly pause: (id: ToastId) => boolean;
  readonly resume: (id: ToastId) => boolean;
}

function useToastQueue(options?: {
  maxVisible?: number;          // 1
  maxQueued?: number;           // 9, 총 기본 상한 10
  defaultDurationMs?: number;   // 5000
  onDismiss?: (toast: ToastRecord, reason: ToastDismissReason) => void;
}): ToastQueueController;

interface ToastViewportProps {
  readonly toasts: readonly ToastRecord[];
  readonly onDismiss: (id: ToastId, reason: 'close-action' | 'action') => void;
  readonly onPause: (id: ToastId) => void;
  readonly onResume: (id: ToastId) => void;
  readonly placement?: 'top' | 'bottom'; // bottom
  readonly offset?: number;              // spacing.xl
  // root style, className, testID, unstyled?: never
}
```

### 12.2 큐·수명·접근성

- `records`는 visible + queued의 FIFO 스냅샷이다. 타이머는 visible 항목에만 시작되고 처음부터 queued인 항목은 승격될 때 전체 수명으로 시작한다. `maxVisible` 축소로 다시 queued가 된 항목은 남은 시간을 보존한다. update는 내용을 제자리에서 교체하고 타이머를 다시 시작한다.
- 같은 `dedupeKey`를 show하면 기존 id와 큐 위치를 보존한다. `maxVisible + maxQueued` 상한을 넘으면 visible은 건드리지 않고 가장 오래 기다린 queued record를 제거해 `queue-overflow`를 보고한다. id는 branded라 임의 string으로 update/dismiss할 수 없다.
- hover·focus·touch는 해당 Toast의 남은 시간을 보존한다. action에서 close로 내부 포커스가 옮겨 갈 때는 focus pause가 잠깐 해제되지 않는다. 네이티브 AppState background/inactive, RNW page invisibility와 웹 window blur는 모든 visible timer를 멈춘다. 수동·상호작용·수명주기 pause 원인을 합성해 모든 원인이 해제된 뒤에만 남은 시간부터 재개한다.
- viewport의 action과 항상 존재하는 close는 sibling button이라 interactive nesting이 없다. close 이름과 icon은 `strings.close`·`icons.close` 폴백을 쓴다. `polite`는 status, `assertive`는 alert, `off`는 live announcement 없음으로 매핑한다. 반드시 응답해야 하는 작업은 Toast action이 아니라 Dialog 계약을 사용한다.
- hook unmount는 timer와 listener를 정리하며 viewport가 interaction 중 제거되면 대응 resume를 보내 paused id를 남기지 않는다. 입력·옵션·중복 id는 runtime에서도 검증한다.

## 13. ActionSheet, Sheet와 Dialog v2

### 13.1 ActionSheet 공개 계약

```ts
interface ActionSheetItem<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description?: string;
  readonly accessibilityLabel?: string;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  readonly testID?: string;
}

type ActionSheetDismissDetails<T extends string> =
  | DialogDismissDetails
  | { overlayId: string; reason: 'cancel-action'; originalEvent?: unknown }
  | { overlayId: string; reason: 'action-select'; value: T; originalEvent?: unknown };

interface ActionSheetProps<T extends string> {
  visible: boolean;
  title: string;
  description?: string;
  items: readonly ActionSheetItem<T>[];
  onDismiss: (details: ActionSheetDismissDetails<NoInfer<T>>) => void;
  cancelLabel?: string;
  presentation?: 'auto' | 'bottom' | 'center'; // auto
  animationType?: 'none' | 'slide' | 'fade';
  dismissOnBackdrop?: boolean; // true
  dismissDisabled?: boolean;
  busy?: boolean;
  bottomInset?: number;
  keyboardOverlap?: number;
  accessibilityLabel?: string;
  finalFocusRef?: DialogFocusRef;
  overlayId?: string;
  // panel style, className, testID, unstyled?: never
}
```

- `items`의 문자열 literal value가 action-select 결과 유니언의 정본이다. 동적 빈 배열도 허용하지만 cancel button은 항상 남는다.
- `auto`는 compact 폭에서 bottom, 태블릿 이상에서 center를 선택한다. 둘 다 Dialog 의미와 일반 button을 사용하며 menuitem·drag·snap을 가장하지 않는다.
- 각 description은 네이티브 hint와 웹 `aria-describedby`로 label에서 분리한다. destructive는 색상뿐 아니라 실제 label로 결과를 설명해야 한다.
- 열릴 때 안전한 cancel로 초기 포커스를 옮긴다. `busy`와 `dismissDisabled`는 item, cancel, backdrop, Escape/Back을 함께 막는다.
- bottom presentation의 하단 padding은 `theme.spacing.xxl + (keyboardOverlap > 0 ? keyboardOverlap : bottomInset)`이다. Android modal keyboard overlap이 이미 safe-area를 포함하므로 두 값을 더하지 않는다. center presentation은 기본 `xxl` padding만 유지한다.

### 13.2 Sheet 공개 계약

```ts
type SheetPresentation = 'auto' | 'bottom' | 'start' | 'end';
type SheetOpenChangeDetails = DialogDismissDetails;

interface SheetSafeAreaInsets {
  readonly top?: number;
  readonly right?: number;
  readonly bottom?: number;
  readonly left?: number;
}

interface SheetBaseProps extends Omit<CommonProps, 'unstyled'> {
  open: boolean;
  onOpenChange: (open: boolean, details: SheetOpenChangeDetails) => void;
  title: string;
  description?: string;
  leading?: ReactNode;
  footer?: ReactNode;
  presentation?: SheetPresentation; // auto
  accessibilityLabel?: string;
  closeAccessibilityLabel?: string;
  dismissOnBackdrop?: boolean; // true
  dismissDisabled?: boolean;
  initialFocusRef?: DialogFocusRef;
  finalFocusRef?: DialogFocusRef;
  overlayId?: string;
  safeAreaInsets?: SheetSafeAreaInsets;
  keyboardOverlap?: number;
  titleStyle?: StyleProp<TextStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  bodyClassName?: string;
  footerStyle?: StyleProp<ViewStyle>;
  footerClassName?: string;
  unstyled?: never;
}

type InternallyScrolledSheetProps = {
  scrollMode?: 'internal';
  children: NonNullable<ReactNode>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  contentContainerClassName?: string;
};

type ConsumerScrolledSheetProps = {
  scrollMode: 'provided';
  children: ReactElement;
  contentContainerStyle?: never;
  contentContainerClassName?: never;
};

type SheetProps = SheetBaseProps &
  (InternallyScrolledSheetProps | ConsumerScrolledSheetProps);
```

- `open`은 앱이 갱신하는 유일한 상태 정본이다. Sheet 자체 trigger나 `defaultOpen`은 없고, backdrop·Escape·hardware Back·accessibility escape·close action이 허용되면 `onOpenChange(false, DialogDismissDetails)`만 요청한다.
- `auto`는 `theme.breakpoints.tablet` 미만에서 bottom, 그 이상에서 logical end를 선택한다. `start`·`end`는 RTL에서 물리 방향이 뒤집히며 `bottom`·`start`·`end`를 명시하면 화면 폭과 무관하게 유지한다.
- title·close header와 선택적 footer는 고정되고 body만 남은 공간을 사용한다. `internal`은 Sheet가 ScrollView와 content container를 소유한다. `provided`는 `FlatList`·`SectionList` 같은 하나의 React element가 스크롤을 소유하며 content-container prop은 타입상 금지돼 중첩 스크롤을 막는다.
- `safeAreaInsets`는 `react-native-safe-area-context` 타입을 root entry에 끌어오지 않는 structural 숫자 계약이다. `keyboardOverlap > 0`이면 이미 safe area를 포함한 값으로 보고 `safeAreaInsets.bottom`을 대체한다. side presentation도 top·left·right와 대체된 bottom avoidance를 보존한다.
- modal·label·description·focus trap/restore와 parent-aware topmost dismissal은 Dialog 정본을 그대로 사용한다. `dismissDisabled`는 모든 사용자 dismissal 경로를 함께 막고 child overlay가 열려 있으면 Sheet보다 child가 먼저 요청을 처리한다.
- title·description·접근성 이름·overlay ID의 공백 문자열, 유한하지 않거나 음수인 inset/keyboard 값, provided 모드의 non-element child는 렌더 단계에서 명확히 실패한다. reduced motion 설정을 읽기 전이나 활성화된 동안은 animation을 끄고, 허용된 경우에만 bottom은 slide, side는 fade를 사용한다.
- grabber·drag-to-dismiss·snap point·position state는 이 API에 없다. gesture-handler/Reanimated 또는 native sheet를 연결하는 후속 optional `BottomSheet` adapter는 scroll-to-drag handoff, adjustable handle와 snap 접근성을 별도 계약으로 검증해야 한다.

### 13.3 Dialog v2 업그레이드

기존 `visible`, `dismissOnBackdrop`, no-argument handler 할당 가능성은 유지한다. `children`은 비어 있지 않아야 하며, direct `DialogPanel`은 웹에서 title·description ID를 modal의 `aria-labelledby`·`aria-describedby`에 연결한다. 네이티브에서는 title을 탐색 가능한 header로 노출하고 panel에 modal isolation을 적용한다. 다른 content tree에는 `accessibilityLabel`이 필수이고 React element identity가 타입에서 지워지는 경우 runtime guard가 마지막으로 차단한다.

`onDismiss`는 `backdrop-press | escape-key | hardware-back | accessibility-escape | close-action`을 보고한다. `dismissDisabled`는 모든 경로를 한 번에 막고, backdrop은 포커스 가능한 가짜 close button이 아니라 접근성 트리에서 숨은 absolute sibling이다. DialogPanel은 direct child context 안에서 현지화된 close button을 기본 렌더한다. 네이티브 `Modal` host가 임의 View 접근성 prop을 전달하지 않는 제약 때문에 escape handler는 실제 descendant에 두며, iOS VoiceOver 경로는 실기기 release gate로 남긴다.

`presentation="modal"`은 RN Modal과 RNW의 portal·dialog role·focus trap·restore를 사용한다. `presentation="inline"`은 이미 열린 native Modal 내부 합성용이며 portal, dialog role, focus trap을 약속하지 않는다. `initialFocusRef`·`finalFocusRef`는 명시했을 때만 best-effort로 개입한다.

modal Dialog는 optional overlay stack에 열린 동안 한 번만 등록하고, 등록 당시 current parent ID를 보존한다. Dialog content는 자신의 ID를 descendant boundary로 제공하므로 내부 Menu·Select·Popover 또는 child Dialog가 같은 parent branch를 상속한다. backdrop, 웹 keydown Escape, native hardware Back, accessibility escape와 explicit close는 모두 `requestDismiss`의 strict topmost 판단을 거친다. topmost child나 `dismissDisabled` layer가 있으면 parent 요청은 아래로 통과하지 않는다. child-first effect 순서와 무관하게 parent chain을 포함한 topmost가 선택돼 처음부터 함께 열린 nested layer도 child가 먼저 닫힌다.

`presentation="inline"`은 이미 열린 native Modal 내부 합성용이고 stack·portal·dialog role·focus trap에 참여하지 않는다. Provider 없는 단일 modal Dialog는 direct fallback으로 기존 동작을 유지하지만 중첩 순서가 필요한 소비자는 루트 `UiProvider`를 사용한다. RNW와 native Modal의 실제 inactive-layer inertness·screen-reader isolation은 플랫폼 host가 소유하며, public Portal adapter는 여전히 별도 release gate다.

## 14. Popover, Tooltip, Menu와 Select

### 14.1 Popover 공개 계약

```ts
type PopoverOpenChangeReason =
  | 'trigger-press' | 'outside-press' | 'escape-key' | 'hardware-back'
  | 'accessibility-escape' | 'close-action' | 'tab-key' | 'focus-out'
  | 'anchor-detached';

interface PopoverOpenChangeDetails {
  reason: PopoverOpenChangeReason;
  originalEvent?: unknown;
}

type PopoverTriggerProps =
  | { triggerLabel: string; iconOnly?: false; triggerIcon?: ReactNode | RenderIcon }
  | { triggerLabel: string; iconOnly: true; triggerIcon: NonNullable<ReactNode> | RenderIcon };

type PopoverProps = PopoverTriggerProps & {
  open: boolean;
  onOpenChange: (open: boolean, details: PopoverOpenChangeDetails) => void;
  title: string;
  description?: string;
  children: NonNullable<ReactNode>;
  closeAccessibilityLabel?: string;
  initialFocusRef?: DialogFocusRef;
  disabled?: boolean;
  dismissDisabled?: boolean;
  overlayId?: string;
  placement?: OverlayPlacement;
  direction?: 'ltr' | 'rtl';
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  presentation?: 'auto' | 'bottom' | 'center';
  bottomInset?: number;
  keyboardOverlap?: number;
  size?: 'sm' | 'md';
  variant?: 'filled' | 'outlined' | 'ghost';
  // root·trigger·triggerLabel·content·body·title style/className/testID
  unstyled?: never;
};
```

- open은 완전히 controlled이며 callback은 변경 요청일 뿐이다. `title`, `triggerLabel`, `children`은 비어 있을 수 없고 icon-only branch는 `triggerIcon`을 타입으로 강제한다. 임의 child trigger, custom anchor ref, compound `Trigger`/`Content`, `asChild`와 public Portal은 받지 않는다.
- 웹은 이름 있는 owned button에 anchor된 non-modal rich dialog다. 기본 close로 focus를 옮기되 Tab trap은 두지 않으며, 12개 placement·RTL·flip·shift·collision padding·detached anchor를 처리한다. Escape와 close는 trigger focus를 복원하고 Tab·focus-out·outside는 자연스러운 목적지를 존중한다.
- native는 같은 controlled API를 Dialog modal로 표현한다. `auto`는 tablet 미만 bottom, 이상 center이며 fixed title/close header 아래 body만 스크롤한다. positive `keyboardOverlap`이 `bottomInset`보다 우선한다. web positioning props는 native에서 검증만 하고 시각 배치에 쓰지 않는다.
- `dismissDisabled`는 web outside·Escape·close·열린 trigger toggle과 native modal 사용자 dismissal을 차단한다. web Tab·focus-out·anchor-detached lifecycle cleanup까지 가두는 옵션은 아니다.

### 14.2 Tooltip 공개 계약

```ts
type TooltipProps = {
  content: string;
  triggerLabel: string;
  triggerIcon: NonNullable<ReactNode> | RenderIcon;
  onPress: () => void;
  tooltipDisabled?: boolean;
  delayMs?: number;
  closeDelayMs?: number;
  placement?: OverlayPlacement;
  direction?: 'ltr' | 'rtl';
  sideOffset?: number;
  collisionPadding?: number;
  size?: 'sm' | 'md';
  variant?: ButtonVariant;
  // root·trigger·content style/className/testID
  unstyled?: never;
};
```

- Tooltip은 controlled overlay나 임의 child wrapper가 아니다. non-blank plain `content`, 이름 있는 `triggerLabel`, `triggerIcon`, `onPress`를 받아 자체 icon action을 렌더한다. `children`, JSX·interactive content, `open`, `defaultOpen`, `onOpenChange`, `disabled`, `asChild`는 계약하지 않는다.
- 웹은 focus 즉시, 첫 pointer hover 기본 700ms 뒤 `role="tooltip"` 시각 bubble을 표시하고 기본 100ms close bridge를 둔다. Provider의 coordinator가 한 번에 하나의 active Tooltip과 hover warm-up만 유지한다. `tooltipDisabled`가 아니면 trigger와 programmatic description의 `aria-describedby` 관계는 닫힌 상태에도 유지하고, Escape·blur·scroll·press는 시각 bubble만 정리한다.
- native는 floating layer·timer·placement를 만들지 않고 `content`를 owned icon action의 `accessibilityHint`로 전달한다. `tooltipDisabled`는 web 설명과 native hint만 제거하며 action은 계속 동작한다. 두 size 모두 최소 44px target이다.
- 필수 정보, 오류, 입력 지침과 상호작용은 Tooltip에만 두지 않는다. 본문·FormField·Alert 또는 모든 사용자가 발견할 수 있는 Popover를 사용한다.

### 14.3 Menu 공개 계약

```ts
type MenuItem<T extends string> =
  | {
      kind: 'action';
      value: T;
      label: string;
      textValue?: string;
      description?: string;
      leading?: ReactNode | RenderIcon;
      shortcut?: string;
      destructive?: boolean;
      disabled?: boolean;
      closeOnSelect?: boolean; // true
      testID?: string;
    }
  | {
      kind: 'checkbox';
      value: T;
      label: string;
      checked: boolean | 'mixed';
      textValue?: string;
      description?: string;
      leading?: ReactNode | RenderIcon;
      shortcut?: string;
      disabled?: boolean;
      closeOnSelect?: boolean; // false
      destructive?: never;
      testID?: string;
    };

type MenuSelectDetails<T extends string> =
  | { kind: 'action'; value: T; originalEvent?: unknown }
  | { kind: 'checkbox'; value: T; checked: boolean; originalEvent?: unknown };

type MenuOpenChangeReason =
  | 'trigger-press' | 'outside-press' | 'escape-key' | 'hardware-back'
  | 'accessibility-escape' | 'cancel-action' | 'tab-key' | 'focus-out'
  | 'anchor-detached' | 'action-select';

interface MenuOpenChangeDetails<T extends string> {
  reason: MenuOpenChangeReason;
  value?: T;
  originalEvent?: unknown;
}

type MenuTriggerProps =
  | { triggerLabel: string; iconOnly?: false; triggerIcon?: ReactNode | RenderIcon }
  | { triggerLabel: string; iconOnly: true; triggerIcon: NonNullable<ReactNode> | RenderIcon };

type MenuProps<T extends string> = MenuTriggerProps & {
  items: readonly MenuItem<T>[];
  open: boolean;
  onOpenChange: (open: boolean, details: MenuOpenChangeDetails<NoInfer<T>>) => void;
  onSelect: (details: MenuSelectDetails<NoInfer<T>>) => void;
  accessibilityLabel?: string; // triggerLabel
  disabled?: boolean;
  busy?: boolean;
  dismissDisabled?: boolean;
  placement?: OverlayPlacement;
  direction?: 'ltr' | 'rtl';
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  presentation?: 'auto' | 'bottom' | 'center';
  bottomInset?: number;
  keyboardOverlap?: number;
  size?: 'sm' | 'md';
  variant?: 'filled' | 'outlined' | 'ghost';
  // root·trigger·label·content·item·itemLabel style/className/testID, unstyled?: never
};
```

- value는 유일하고 비어 있지 않아야 하며 label도 비어 있을 수 없다. `mixed` checkbox를 선택하면 callback의 다음 `checked`는 `true`다. action은 기본 close, checkbox는 기본 stay-open이며 `closeOnSelect`로 항목별 정책을 바꾼다.
- 웹은 이름 있는 button trigger와 `menu` > `menuitem | menuitemcheckbox`를 렌더한다. 실제 item focus를 roving하고 ArrowUp/Down·Home/End·typeahead가 disabled를 건너뛴다. Tab은 닫고 자연 이동, Escape·선택은 trigger focus 복원, outside는 focus를 강제로 되돌리지 않는다. anchor가 분리되면 `anchor-detached`로 닫는다.
- 네이티브는 존재하지 않는 menu role을 주장하지 않는다. `auto`는 tablet 미만 bottom, 이상 center Dialog surface를 선택하고 action은 button, checkbox는 checkbox로 노출하며 안전한 cancel을 고정한다. `keyboardOverlap > 0`이면 bottomInset보다 우선한다.
- `busy`는 activation만 막고 열린 layer의 dismiss는 허용한다. `dismissDisabled`는 outside·Escape·Back·접근성 escape를 막는다. radio item과 submenu는 v0.4 계약이 아니다.

### 14.4 Select 공개 계약

```ts
interface SelectItem<T extends string> {
  value: T;
  label: string;
  textValue?: string;
  description?: string;
  leading?: ReactNode | RenderIcon;
  disabled?: boolean;
  testID?: string;
}

type SelectLabelProps =
  | { label: string; accessibilityLabel?: string }
  | { label?: never; accessibilityLabel: string };

type SelectOpenChangeReason =
  | 'trigger-press' | 'trigger-key' | 'outside-press' | 'escape-key'
  | 'hardware-back' | 'accessibility-escape' | 'cancel-action' | 'tab-key'
  | 'focus-out' | 'anchor-detached' | 'option-select';

interface SelectOpenChangeDetails<T extends string> {
  reason: SelectOpenChangeReason;
  value?: T;
  originalEvent?: unknown;
}

type SelectProps<T extends string> = SelectLabelProps & {
  items: readonly SelectItem<T>[];
  value: NoInfer<T> | null;
  onValueChange: (value: T) => void;
  open: boolean;
  onOpenChange: (open: boolean, details: SelectOpenChangeDetails<NoInfer<T>>) => void;
  placeholder: string;
  description?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  busy?: boolean;
  dismissDisabled?: boolean;
  placement?: OverlayPlacement;
  direction?: 'ltr' | 'rtl';
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  presentation?: 'auto' | 'bottom' | 'center';
  bottomInset?: number;
  keyboardOverlap?: number;
  size?: 'sm' | 'md';
  leading?: ReactNode | RenderIcon;
  // root·label·trigger·value·helper·content·item·itemLabel style/className/testID
  unstyled?: never;
};
```

- `items`가 literal T의 정본이고 `value`와 open은 controlled다. 중복 value, 빈 label·placeholder, items에 없는 비-null value를 거부한다. 같은 값을 확정하면 layer는 닫되 `onValueChange`는 생략한다.
- 웹은 select-only `combobox` trigger에 DOM focus를 유지하고 `listbox`의 active `option`을 `aria-activedescendant`로 가리킨다. selected controlled value와 active 탐색 상태는 분리된다. 닫힌 ArrowUp/Down·Enter·Space는 열고, 열린 Arrow·Home·End·typeahead는 active만 이동하며 Enter·Space가 commit한다. Tab은 active를 commit하고 자연 이동, Escape·outside는 cancel한다.
- label·description·error는 `aria-labelledby`·`aria-describedby`·`aria-errormessage`와 invalid/required로 연결한다. selected item의 leading은 별도 trigger leading이 없을 때 trigger에도 일관되게 표시한다.
- 네이티브 trigger는 button과 현재 accessibilityValue를 사용하고 adaptive surface는 이름 있는 radiogroup/radio를 쓴다. 웹 combobox/listbox 의미를 네이티브에 거짓으로 이식하지 않는다. 검색과 multiple selection은 v0.4 계약이 아니다.

### 14.5 OverlayProvider scope

루트 `UiProvider`는 `OverlayProvider`를 자동 생성한다. 중첩 `UiProvider`는 theme/string/icon 값만 재정의하고 바깥 overlay environment를 재사용하므로 modal stacking, dismiss 순서와 Tooltip warm-up이 Provider 경계마다 쪼개지지 않는다. UiProvider 없이 Menu·Select·Popover·Tooltip을 쓰거나 Sheet·Dialog를 포함한 여러 overlay가 stack을 공유해야 하는 범위를 명시하거나, 독립 환경으로 격리할 때 `<OverlayProvider>`를 직접 사용한다. Menu·Select·Popover와 web Tooltip은 scope가 없으면 개발 단계에서 명확히 fail-fast한다. native Tooltip은 floating state가 없어 coordinator를 요구하지 않으며, modal Dialog와 이를 사용하는 Sheet는 optional scope가 있을 때만 stack에 참여한다.

공개 `OverlayProviderProps`는 `children`만 받는다. 환경은 stack과 Tooltip coordinator를 인스턴스별로 만들고 unmount에서 coordinator의 active callback·warm-up·cooldown timer를 `destroy()`한다. layer parent context, stack/coordinator hooks, Host·Portal·registry는 완전히 내부이며 공개 컴포넌트나 옵션으로 노출하지 않는다.

## 15. DataTable

### 15.1 공개 계약

`DataTable`은 spreadsheet/DataGrid가 아니라 현재 전달된 bounded rows를 표현하는 presentational table이다. `Row`, 문자열 `ColumnId`, `string | number` `RowKey`를 타입 축으로 사용하며, 앱이 ordering·filtering·pagination·fetching을 소유한다.

```ts
type DataTableRowKey = string | number;
type DataTableSortDirection = 'ascending' | 'descending';
type DataTableAlignment = 'start' | 'center' | 'end';
type DataTableSize = 'sm' | 'md' | 'lg';
type DataTableVariant = 'line' | 'outline';
type DataTablePresentation = 'table' | 'list' | 'auto';

type DataTableColumn<Row, ColumnId extends string, RowKey extends DataTableRowKey> =
  | ({ readonly width: number; readonly flex?: never } & DataTableColumnBody<Row, ColumnId, RowKey>)
  | ({ readonly width?: never; readonly flex?: number } & DataTableColumnBody<Row, ColumnId, RowKey>);

type DataTableColumnBody<Row, ColumnId extends string, RowKey extends DataTableRowKey> =
  (
    | { readonly sortable: true; readonly firstSortDirection?: DataTableSortDirection }
    | { readonly sortable?: false; readonly firstSortDirection?: never }
  ) & {
    readonly id: ColumnId;
    readonly header: string;
    readonly getTextValue: (context: {
      readonly row: Row;
      readonly rowKey: RowKey;
      readonly rowIndex: number;
      readonly columnId: ColumnId;
    }) => string;
    readonly renderCell?: (context: DataTableCellContext<Row, RowKey, ColumnId>) => NonNullable<ReactNode>;
    readonly align?: DataTableAlignment;
    readonly minWidth?: number;
    readonly maxWidth?: number;
    // header/cell style·className·text style slots
  };

type DataTableState<Row> =
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

type DataTableSelection<Row, RowKey extends DataTableRowKey> = {
  readonly selectedRowKeys: readonly NoInfer<RowKey>[];
  readonly onSelectionChange: (
    selectedRowKeys: readonly RowKey[],
    details:
      | { readonly reason: 'row-toggle'; readonly scope: 'visible'; readonly rowKey: RowKey; readonly selected: boolean; readonly originalEvent?: unknown }
      | { readonly reason: 'page-toggle'; readonly scope: 'visible'; readonly affectedRowKeys: readonly RowKey[]; readonly selected: boolean; readonly originalEvent?: unknown },
  ) => void;
  readonly getRowSelectionAccessibilityLabel: (context: DataTableSelectionRowContext<Row, RowKey>) => string;
  readonly isRowSelectionDisabled?: (context: DataTableSelectionRowContext<Row, RowKey>) => boolean;
  readonly showSelectAll?: boolean;
  readonly selectAllAccessibilityLabel?: string;
  readonly clearSelectionAccessibilityLabel?: string;
};
```

표 이름 branch는 `{ caption: string; accessibilityLabel?: never } | { caption?: never; accessibilityLabel: string }`이며 둘 중 정확히 하나가 필수다. `rowHeaderColumnId: NoInfer<ColumnId>`와 모든 열의 비어 있지 않은 `getTextValue`도 필수다. `renderCell`은 rich visual을 덮어쓸 뿐 scalar text contract를 제거하지 않는다.

정렬은 `{ sort: DataTableSort<ColumnId> | null; onSortChange }` controlled pair 또는 두 prop이 모두 없는 branch다. literal `columns` tuple을 JSX에 직접 넘기면 `DataTableColumnId<Columns>`가 전체 ID를, `DataTableSortableColumnId<Columns>`가 `sortable: true` ID만 추출하므로 component overload의 `sort`·callback은 sortable ID로만 좁혀진다. widened column array나 명시적 `DataTableProps<Row, ColumnId, RowKey>`는 전체 ColumnId controlled-pair union을 유지하고 runtime validator가 실제 sortable 열인지 재검증한다.

presentation branch는 다음처럼 닫힌다.

```ts
type DataTablePresentationProps<Row, RowKey extends DataTableRowKey, ColumnId extends string> =
  | { readonly presentation?: 'table'; readonly renderListRow?: never }
  | {
      readonly presentation: 'list' | 'auto';
      readonly renderListRow: (
        context: DataTableListRowContext<Row, RowKey, ColumnId>,
      ) => ReactElement;
    };
```

### 15.2 상태·정렬·선택 경계

- 정렬 버튼은 같은 열에서 `firstSortDirection`(기본 ascending) → 반대 방향 → `null`로 순환한다. `onSortChange`는 request만 내며 `state.rows`의 실제 순서를 바꾸지 않는다.
- selection은 include-only controlled multiple checkbox 모델이다. 전체 선택은 현재 공급된 visible rows 중 `isRowSelectionDisabled !== true`인 key만 바꾸고, 현재 rows에 없는 off-page key는 보존한다.
- page toggle의 `affectedRowKeys`는 target boolean이 실제로 달라진 visible·enabled key만 포함한다. 이미 같은 상태인 key와 off-page key는 details에 포함하지 않는다.
- `loading`, `error`, `ready`, `refreshing`은 판별 유니언이다. loading/error는 rows와 충돌하지 않고, ready만 `emptyState`, refreshing만 live status label을 가진다. 기본 terminal UI는 기존 `EmptyState`·`ErrorState`와 token skeleton을 사용한다.
- validator는 이름 XOR, 열·행 key 중복, width/flex XOR, enum·양수 범위, sort controlled pair, nonblank scalar/selection label과 선택 key 중복을 fail-fast하고, 검증한 row model을 한 번만 계산해 렌더러가 재사용한다.

### 15.3 플랫폼 의미와 반응형

- **Web `table`·`auto`:** viewport와 무관하게 실제 `<table>`을 유지한다. `<caption>`, `<thead>`, `<tbody>`, column `<th scope="col">`, 지정한 row `<th scope="row">`, `<td>`를 만들고 현재 sorted header 하나에만 `aria-sort`를 둔다. overflow는 수평 scroll wrapper가 처리하며 SSR/hydration 중 markup을 바꾸지 않는다.
- **Web `list`:** 명시적으로 요청할 때만 toolbar와 `role="list"`/`listitem` compact rows를 사용하고 `renderListRow`가 앱 콘텐츠를 만든다.
- **Native `table`:** React Native에 없는 table/row/cell role을 가장하지 않는다. horizontal `ScrollView`의 접근성 `list`와 visual header/`listitem` rows로 표 형태를 제공한다.
- **Native `list`:** `renderListRow` 기반 compact `list`/`listitem`이다. sortable control의 현재 상태는 `UiStrings.sortAscending`, `sortDescending`, `sortUnsorted`를 사용해 이름과 accessibility value로 노출한다.
- **Native `auto`:** `theme.breakpoints.tablet` 미만은 list, tablet 이상은 visual table이다. 웹 `auto`는 언제나 semantic table이다.

DataTable은 nonvirtualized current-page primitive다. filtering·search·pagination·server fetching·실제 정렬·virtualization은 앱 또는 adapter가 소유한다. 대규모 행, column pinning/resizing, cell editing, composite grid keyboard navigation은 이 API를 비대하게 만들지 않고 후속 별도 `DataGrid`에서 다룬다.

## 16. Pagination

### 16.1 공개 계약

```ts
type PaginationMode = 'numbered' | 'cursor';
type PaginationDirection = 'ltr' | 'rtl';
type PaginationSize = 'sm' | 'md';
type PaginationPresentation = 'auto' | 'full' | 'compact';
type PaginationCountMode = 'items' | 'pages';
type PaginationBoundaryCount = 0 | 1 | 2;
type PaginationSiblingCount = 0 | 1 | 2;
type PaginationNavigateDirection = 'previous' | 'next';
type PaginationPageChangeReason = 'page-press' | 'previous-press' | 'next-press';

interface PaginationPageLabelDetails {
  readonly page: number;
  readonly pageCount: number;
  readonly current: boolean;
}

interface PaginationItemsPageChangeDetails {
  readonly mode: 'numbered';
  readonly countMode: 'items';
  readonly page: number;
  readonly previousPage: number;
  readonly pageCount: number;
  readonly reason: PaginationPageChangeReason;
  readonly totalItemCount: number;
  readonly pageSize: number;
  readonly offset: number;             // zero-based inclusive
  readonly endOffsetExclusive: number; // totalItemCount 이하
  readonly visibleItemCount: number;
  readonly originalEvent?: unknown;
}

interface PaginationPagesPageChangeDetails {
  readonly mode: 'numbered';
  readonly countMode: 'pages';
  readonly page: number;
  readonly previousPage: number;
  readonly pageCount: number;
  readonly reason: PaginationPageChangeReason;
  readonly originalEvent?: unknown;
}

interface PaginationNavigateDetails {
  readonly mode: 'cursor';
  readonly direction: PaginationNavigateDirection;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
  readonly originalEvent?: unknown;
}

type PaginationBaseProps = Omit<CommonProps, 'unstyled'> & {
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
  readonly page: number; // 1-based. pageCount=0일 때 sentinel 1
  readonly presentation?: PaginationPresentation;
  readonly boundaryCount?: PaginationBoundaryCount;
  readonly siblingCount?: PaginationSiblingCount;
  readonly getPageAccessibilityLabel?: (details: PaginationPageLabelDetails) => string;
  readonly statusLabel?: string;
  readonly hasPreviousPage?: never;
  readonly hasNextPage?: never;
  readonly onNavigate?: never;
};

type PaginationNumberedItemsProps = PaginationBaseProps &
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

type PaginationNumberedPagesProps = PaginationBaseProps &
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

type PaginationCursorProps = PaginationBaseProps & {
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

type PaginationProps =
  | PaginationNumberedItemsProps
  | PaginationNumberedPagesProps
  | PaginationCursorProps;
```

numbered는 공개 `page`를 1-based로 고정한다. `countMode="items"`는 `ceil(totalItemCount / pageSize)`를 계산하고 callback에 서버 offset을 만들 수 있는 범위를 전달한다. `countMode="pages"`는 이미 계산된 `pageCount`만 받는다. page count가 0이면 `page={1}` sentinel만 유효하고 range는 비어 있다. cursor는 숫자 위치를 발명하지 않으며 필수 status와 이전·다음 가능 여부만 표현한다. 세 branch 모두 app-owned controlled request이며 내부에서 page, cursor, fetch 상태를 갱신하지 않는다.

공개 순수 helper `getPaginationRange({ page, pageCount, boundaryCount?, siblingCount? })`는 `PaginationRangeItem[]`을 반환한다. item은 `{ type: 'page', page, current }` 또는 선택 불가능한 `{ type: 'start-ellipsis' | 'end-ellipsis' }`다. boundary·sibling count는 `0 | 1 | 2`, 기본은 각각 1이며 현재 page는 정확히 한 번 포함된다.

### 16.2 표현·접근성·조합 경계

- **Web:** 실제 `<nav aria-label>` 안에 `<ol>`·`<li>`·`<button type="button">`을 만들고 현재 page button 하나에만 `aria-current="page"`를 둔다. ellipsis는 `aria-hidden`인 비제어 텍스트다. `auto`와 `full`은 numbered range를 유지하고 `compact`만 이전·다음으로 줄인다.
- **Native:** 이름 있는 `toolbar`와 button 접근성 상태를 사용한다. numbered `auto`는 `theme.breakpoints.tablet` 미만 compact, 이상 full이고 cursor는 항상 compact다. 존재하지 않는 navigation landmark나 list semantics를 가장하지 않는다.
- 기본 상태 문구는 items의 `start–end / total`, pages의 `page / pageCount`, 빈 결과의 `0 / 0`이다. cursor는 숫자 위치가 없으므로 nonblank `statusLabel`이 필수다. numbered도 `statusLabel`로 보이는 문구를 교체할 수 있다.
- 이전·다음 기본 문구는 완전한 Provider 문자열 `UiStrings.previousPage`·`nextPage`에서 오고 prop으로 덮어쓸 수 있다. numbered page 이름은 기본 숫자이며 `getPageAccessibilityLabel({ page, pageCount, current })`로 현지화한다.
- `disabled`와 `busy`는 navigation request를 막고 busy 상태를 root와 control에 전달한다. current page press는 callback을 다시 내지 않는다. 이전·다음 callback은 `reason`, page press는 별도 reason을 전달한다.
- `direction`은 control의 logical 순서를 `ltr | rtl`로 정하고 생략하면 플랫폼 RTL 설정을 따른다. `presentation`은 표현만 바꾸며 count·page 의미에는 관여하지 않는다.

Pagination은 DataTable의 child나 내장 footer가 아니다. 앱은 현재 page에 맞춰 rows를 slice/fetch한 뒤 `DataTable state.rows`에 주고, 같은 state로 형제 `Pagination`을 제어한다. Pagination은 filtering·fetch·cursor token·router·out-of-range 자동 보정·infinite-list `onEndReached`를 소유하지 않는다. DataTable 역시 Pagination의 page나 total count를 추측하지 않는다.

## 17. Tabs 업그레이드

### 17.1 공개 계약 변화

```ts
interface TabItem<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly disabled?: boolean;
}

type TabsProps<T extends string> = {
  items: readonly TabItem<T>[];
  value: NoInfer<T>;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  panels: Readonly<Record<NoInfer<T>, NonNullable<ReactNode>>>;
  panelMountStrategy?: 'keep-mounted' | 'active-only'; // keep-mounted
  panelStyle?: StyleProp<ViewStyle>;
  panelClassName?: string;
  variant?: 'segmented' | 'underline';
  style?: StyleProp<ViewStyle>;
  className?: string;
  testID?: string;
  unstyled?: never;
};
```

`accessibilityLabel`은 tablist의 목적을 설명하므로 필수다. `panels`도 필수이며 item value 전체를 key로 가져야 하므로 누락과 오타는 타입 에러다. tab만 렌더하고 외부 panel의 ID 관계를 소비자에게 맡기는 반쪽 계약은 제거한다. Tabs가 panel 렌더와 내부 ID를 항상 소유한다.

### 17.2 키보드와 panel lifecycle

- roving tab stop: 선택된 enabled 탭 하나, 유효한 선택이 없으면 첫 enabled 탭 하나만 `tabIndex=0`.
- ArrowRight/ArrowLeft: disabled를 건너뛰고 순환하며 focus와 selection을 함께 이동.
- Home/End: 첫/마지막 enabled 탭으로 이동.
- Enter/Space: 현재 탭 활성화.
- `keep-mounted`: 비활성 panel의 local state를 보존하되 display와 접근성 트리에서 숨김.
- `active-only`: 비활성 panel을 언마운트해 무거운 tree 비용을 줄이되 local state도 사라짐.
- 생성된 tab/panel ID를 `aria-controls`/`aria-labelledby`로 양방향 연결한다.

## 18. 접근성·키보드 검증 행렬

| 대상 | role / 이름 | 상태·관계 | 웹 키보드 | 타입 방어 | unit 핵심 |
|---|---|---|---|---|---|
| Chip action | button / label | disabled | native button Enter·Space | onPress 필수, filter/remove props 금지 | press·disabled·role |
| Chip filter | toggle button / stable label | selected/pressed, disabled | native button Enter·Space | selected + callback 필수 | controlled callback·selected state |
| Chip removable | static root + remove button / remove label | disabled | remove button Enter·Space | remove label + callback 필수 | 중첩 button 없음·remove press |
| Card | none | 정적 layout만 | 없음 | onPress·disabled·action label 금지 | View·variant·overflow |
| Link destination | link / text 또는 override | href, target, rel | Enter + 브라우저 기본 | href/onPress 배타 | 실제 anchor·safe rel·native openURL |
| Link router | link / text 또는 override | 없음 | Enter only | onPress 필수 | Space 미활성·Enter 활성 |
| FormField | label + control | labelledby, describedby, error, invalid, required | 실제 control 소유 | label/render prop 필수, disabled 금지 | 생성 ID·helper/error 우선·live |
| TextField | textbox / label | label/helper/error 관계 | native input | style migration 차단 | standalone 및 FormField 합성 |
| Collapsible | heading > button / 필수 title | controls, expanded, disabled | native button Enter·Space | title 필수, custom trigger 금지 | 닫힘 tree 제외·ID 관계 |
| FAB | button / label | disabled, busy | native button Enter·Space | icon-only label 필수 | loading·placement·inset |
| AspectRatio | none | layout only | 없음 | unstyled 금지 | 유효·무효 ratio, style merge |
| Slider | slider/adjustable / thumb별 필수 이름 | min, max, now, text, disabled | Arrow, PageUp/Down, Home/End | scalar/tuple·label branch 배타 | step snap·commit·range·RTL·gesture |
| ToggleGroup | toolbar > toggle buttons / group·item 이름 | pressed/checked, disabled, orientation | 방향별 arrows, Home, End, Enter, Space | single/multiple·icon-only 이름 | roving·disabled skip·순서·loop |
| DataTable | web table/columnheader/rowheader/cell; native list/listitem / caption 또는 label | aria-sort, busy, checkbox state, description | sortable header·checkbox의 기본 Enter/Space; grid arrow 없음 | 이름 XOR·row header NoInfer·tuple sortable ID·state/presentation union | DOM 계층·sort 3-state·off-page selection·state·auto breakpoint·single-evaluation model |
| Pagination | web navigation > list > button; native toolbar > button / root·control 이름 | current page, busy, disabled, visible status | 실제 button Enter·Space | numbered items/pages·cursor union, 1-based range count | semantic DOM·aria-current 단일성·range·callback detail·auto breakpoint·RTL |
| ToastViewport | status/alert + sibling buttons / copy·action·close | live mode, FIFO, remaining time | Tab·native button | branded id·persistent duration·action 필수 쌍 | fake timer·dedupe·overflow·pause source·cleanup |
| Dialog v2 | dialog / panel title 또는 explicit label | labelledby, describedby, modal, parent-aware topmost veto | web keydown Escape·trap·restore | children 필수, arbitrary content label | reason·backdrop sibling·close·nested child first·focus refs |
| ActionSheet | dialog + buttons / title + item labels | disabled, busy, describedby | 일반 button Enter·Space | items value NoInfer, controlled props 필수 | action/cancel reason·empty·inset·focus |
| Sheet | dialog / title 또는 explicit label | labelledby, describedby, modal, parent-aware topmost veto | Escape·trap·restore; native Back | open controlled·internal/provided scroll union | auto/logical side·fixed chrome·inset replacement·nested child first |
| Popover | button + non-modal dialog / trigger·title | expanded, labelledby, describedby, parent branch | Tab 자연 이탈, Escape·close restore | owned trigger union, title·children 필수 | controlled request·outside·focus-out·collision·native adaptive |
| Tooltip | button + tooltip / triggerLabel·content | persistent describedby / native hint | hover delay, focus immediate, Escape | owned icon action, plain string 필수 | coordinator warm-up·single active·visual timer cleanup·native hint |
| Menu | menu > menuitem/checkbox / trigger·menu 이름 | expanded, controls, checked, busy, topmost | Up/Down, Home/End, typeahead, Enter/Space, Escape, Tab | typed action/checkbox, icon-only trigger, NoInfer | active/disabled skip·close policy·focus restore·outside·detached |
| Select | combobox > listbox/option / label | expanded, active descendant, selected, invalid, required | open keys, arrows, Home/End, typeahead, commit/cancel/Tab | label union, controlled value/open, NoInfer | active/selected 분리·same value·reconcile·scroll·detached |
| Tabs | tablist/tab/tabpanel / group + item label | selected, disabled, controls, labelledby | arrows, Home, End, Enter, Space | label·완전한 panels 필수, value/panels NoInfer | roving·disabled skip·wrap·panel lifecycle |

추가 공통 검증:

- light/dark 각각에서 token mapping snapshot 또는 style assertion
- 모든 신규 `.tsx`에 token guard 적용
- root export와 public type export smoke test
- `unstyled`·불가능한 prop 조합 `@ts-expect-error`
- README의 모든 `ts`/`tsx` fence를 빌드된 d.ts에 대해 컴파일
- library build, CJS/ESM type declarations, 0 dependency pack inspection

실기기 후속 QA:

- iOS VoiceOver: label/state 순서, removable Chip의 단일 remove action, FormField error 재공지, Sheet title/description·close와 child-first escape
- Android TalkBack: expanded/checked/busy 상태, disabled control skip, Slider adjustable 두 thumb 구분, Sheet hardware Back·modal isolation
- 키보드 브라우저: focus ring, roving focus, Tab 진입·이탈, Menu/Select commit·cancel, Popover non-modal 이탈·nested child-first Escape, Tooltip focus·Escape, Sheet focus trap·restore·side RTL, ToggleGroup orientation, Slider RTL 방향, DataTable sort·checkbox와 Pagination button·current page 기본 동작 확인
- 수명주기: iOS·Android background/inactive, RNW page visibility·window blur와 Toast hover/focus/touch 중 남은 시간 보존
- reduced motion: FAB 자체 애니메이션은 없고 기존 ProgressBar 회귀 없음

## 19. Overlay kernel 상태와 공개 gate

### 19.1 이번에 완료한 내부 기반

- root 공개 표면을 `index.shared.ts` 한 곳에 두고 native와 web을 별도 빌드한다. `.native.*`·`.web.*` 해석 우선순위를 build marker guard가 실제 그래프에서 검증한다.
- 인스턴스별 stack은 mount order와 parent depth, strict top-most와 nondismissible 차단, 12개 dismissal reason을 순수 상태로 관리한다. Dialog boundary까지 같은 parent chain을 써 child-first effect order에서도 descendant가 우선한다.
- position kernel은 12개 side×align placement, logical RTL, flip, shift, collision inset, available size와 detached anchor를 계산한다.
- typeahead는 disabled skip, timeout, 반복 순환, 한글·emoji와 locale casing을 지원하며 Latin accent folding이 Devanagari 같은 의미 있는 결합 문자를 지우지 않는다.
- presence reducer는 exit visual을 유지하면서 interaction·stack 참여를 즉시 끊고 monotonic transition token으로 같은 phase의 stale completion도 거부한다.
- Provider별 Tooltip coordinator는 first-hover delay, 한 번에 하나의 active 설명, warm-up cooldown을 관리하고 scope unmount에서 pending timer와 active callback을 정리한다.
- `OverlayProvider` scope만 공개 barrel에서 제공한다. layer parent context, stack/coordinator hook, registry, Host와 Portal hook은 구현 세부로 남고 공개 barrel에는 내보내지 않는다.

### 19.2 Provider scope와 Portal 경계

루트 `UiProvider`는 공개 `OverlayProvider` scope를 자동 생성하고 중첩 UiProvider는 바깥 scope를 재사용한다. 명시적 `OverlayProvider`는 UiProvider 없는 소비자와 overlay environment를 의도적으로 공유·격리하는 합성에 사용한다. Menu·Select·Popover의 web은 in-tree HTML Popover top layer(지원 브라우저) 또는 fixed fallback을 사용하고, native는 Dialog 기반 surface를 사용한다. Sheet는 양 플랫폼에서 Dialog의 modal boundary와 stack을 재사용해 responsive bottom/logical-side surface를 구성한다. Tooltip은 web에서만 visual layer를 만들며 native에서는 accessibilityHint만 제공한다.

내부 registry relocation은 local Context·error boundary·event ancestry를 보존하는 실제 React portal 계약이 아니다. 따라서 Host·Portal·registry hook은 공개 barrel에 포함하지 않으며 소비자가 의존할 수 있는 API가 아니다. 공개 Popover·Tooltip도 arbitrary child wrapping이나 `asChild`를 제공하지 않고 owned trigger로 이 경계를 지킨다.

public Portal 또는 `asChild` 합성을 추가하기 전 필수 gate는 다음과 같다.

1. web Portal: context를 보존하는 실제 DOM portal, modal/non-modal focus scope와 nested layer isolation.
2. native Portal: scoped host/context bridge 또는 플랫폼 Portal 전략과 nested native Modal·inline 정책.
3. test: Playwright 실제 브라우저 focus·outside·RTL·scroll/resize, iOS VoiceOver, Android TalkBack와 hardware keyboard.
4. SSR: hydration-safe portal mount와 layout-effect 경고 없는 adapter.

### 19.3 다음 제품 순서

| 순서 | 컴포넌트 | kernel 소비 | 추가 계약 |
|---:|---|---|---|
| 1 | Menu 확장 | collection/typeahead + nested overlay | radio item, submenu |
| 2 | Select 확장 | collection + async data policy | searchable, multiple selection |
| 3 | Public composition | real Portal + focus/ancestry bridge | Host, compound API, `asChild`의 플랫폼 공통 의미 |
| 4 | optional `BottomSheet` adapter | Sheet/Dialog boundary + optional gesture runtime | scroll-to-drag handoff, grabber·snap·keyboard 접근성 정책 |
| 5 | HoverCard | anchor, presence, parent stack | pointer bridge와 touch 대체, rich content 경계 |
| 6 | DataGrid | 별도 data/virtualization engine | 대규모 rows, pin/resize/edit, composite grid keyboard와 adapter 경계 |

현재 Select는 `items`가 값 유니언의 정본이고 `value: NoInfer<T> | null`인 controlled API를 유지한다. pointer/desktop 표현과 touch/native 표현은 달라도 selection state와 label/error 관계는 같은 공개 계약을 사용한다. Slider·Tabs의 vertical orientation과 `VisuallyHidden`은 각각 gesture·RTL·실기기 screen-reader matrix를 별도 통과한 뒤 다룬다.

## 20. 배포 체크리스트

- [x] 새 18종과 관련 public type, `OverlayProvider` scope를 root에서 export
- [x] Tabs 사용처에 필수 `accessibilityLabel` 추가
- [x] Tabs 필수 typed panels, 내부 생성 ID와 panel lifecycle을 type/unit test
- [x] TextField 단독 및 FormField 합성 관계 test
- [x] `pnpm --dir expo-ui test:all` — unit 534개 + type 91개, 총 625개 통과(2026-08-11)
- [x] `pnpm --dir expo-ui typecheck`
- [x] `pnpm --dir expo-ui check:readme`
- [x] pack 결과의 dependency/entrypoint/type declaration 확인
- [x] Dialog v2·ActionSheet reason, focus, label, busy·inset 계약을 unit/type test
- [x] Sheet controlled open, auto/logical presentation, internal/provided scroll union, inset replacement와 Dialog stack·focus 계약을 unit/type test
- [x] Slider single/range·gesture·RTL·keyboard와 ToggleGroup single/multiple·roving focus 계약을 unit/type test
- [x] Toast queue FIFO·dedupe·overflow·fake timer·상호작용/수명주기 pause와 branded id 계약을 unit/type test
- [x] Menu·Select literal generic, controlled state, web keyboard/focus/ARIA, native adaptive semantics와 Provider scope를 unit/type test
- [x] Popover controlled owned trigger·web non-modal·native adaptive semantics와 Tooltip owned icon action·web coordinator·native accessibilityHint를 unit/type test
- [x] DataTable semantic web table, native list/listitem visual table, tuple-derived sortable ID, controlled sort·visible-page selection·state·responsive presentation을 unit/type test
- [x] Pagination numbered items/pages·cursor union, range invariant, web semantic navigation·single aria-current, native compact/full breakpoint와 RTL을 unit/type test
- [x] Dialog parent boundary, initially-open nested topmost, 모든 dismiss route와 dismissDisabled 차단을 unit test
- [x] native/web 조건부 root build와 실제 platform extension 선택 guard
- [x] 내부 stack·position·typeahead·presence kernel의 순수 테스트
- [x] docs catalog는 v0.4 18종을 preview/noindex로 표시
- [x] package version과 npm `latest` 표시는 실제 publish 전까지 0.3.0 유지
- [x] minor changeset 포함

이 체크리스트가 끝나도 곧바로 npm에 publish했다는 뜻은 아니다. version bump, npm publish, docs deploy는 별도 릴리스 작업에서 명시적으로 수행한다.
