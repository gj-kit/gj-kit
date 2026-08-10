# @gj-kit/expo-ui — 컴포넌트 확장 v0.2

> 구현 기준 문서. 2026-08-10 현재 `expo-ui/src/components/{status,display,progress,controls,radio,accordion}.tsx`의 공개 계약을 기록한다. 기존 [`expo-ui-api-surface.md`](./expo-ui-api-surface.md)의 v0.1 원칙은 유지하며, 컴포넌트 수와 색상 role 수가 충돌하는 경우 이 문서의 31종·31 role이 우선한다.

## 0. 결과

v0.2는 앱이 매번 직접 만들던 상태, 폼, 진행률, identity, disclosure 프리미티브 11종을 추가한다.

| 항목 | v0.1 | v0.2 |
|---|---:|---:|
| 공개 디자인 컴포넌트 | 20 | **31** |
| 색상 role | 24 | **31** |
| 런타임 dependencies | 0 | **0** |
| 필수 peer | react, react-native | 변경 없음 |

전체 컴포넌트 카탈로그:

| 영역 | 컴포넌트 |
|---|---|
| Typography | `Text` |
| Actions | `Button`, `IconButton` |
| Fields | `TextField`, `SearchField` |
| Navigation | `Tabs` |
| Selection | `SelectionIndicator`, `SelectableRow`, `SelectAllRow` |
| Layout | `Surface`, `ContentFrame`, `Section`, `StickyActionBar` |
| Feedback | `Skeleton`, `EmptyState`, `ErrorState`, `Toast` |
| Dialog | `Dialog`, `DialogPanel`, `ConfirmActionRow` |
| **Status (v0.2)** | `Badge`, `Alert` |
| **Display (v0.2)** | `Avatar`, `Divider`, `ListItem` |
| **Progress (v0.2)** | `Spinner`, `ProgressBar` |
| **Controls (v0.2)** | `Checkbox`, `Switch`, `RadioGroup` |
| **Disclosure (v0.2)** | `Accordion` |

## 1. 확장 원칙

1. **Controlled가 기본이 아니라 유일한 상태 계약이다.** Checkbox, Switch, RadioGroup, Accordion은 `defaultValue`나 숨은 선택 상태를 갖지 않는다. 폼, 서버, URL 중 어느 상태가 정본인지는 호스트 앱이 결정한다.
2. **접근성에 필요한 선택은 타입으로 닫는다.** Avatar는 `alt | decorative`, Checkbox/Switch는 `label | accessibilityLabel`, ProgressBar와 RadioGroup은 필수 접근성 라벨을 사용한다.
3. **웹과 네이티브의 의미를 함께 낸다.** RN 접근성 prop과 flat `role`/`aria-*` 별칭을 병행하며, RNW 기본 Pressable이 의미와 다르게 동작하는 컨트롤에는 별도 키보드 브리지를 둔다.
4. **디자인 값은 테마에서만 온다.** 새 컴포넌트도 raw 색, font size, font weight를 소스에 두지 않는다. `ColorKey`, typography, spacing, radius, metrics를 소비한다.
5. **아이콘·문구 때문에 의존성을 추가하지 않는다.** Provider 슬롯과 기존 strings를 사용하고, 슬롯이 없을 때만 단순 텍스트 폴백을 렌더한다.

공통 시각 컴포넌트는 `style`, `className`, `testID`, `unstyled?: never` 꼬리를 유지한다. 개별 슬롯 스타일은 그 의미가 분명한 이름(`labelStyle`, `indicatorStyle`, `contentStyle`)으로만 연다.

## 2. 테마와 Provider 확장

### 2.1 31개 color role

기존의 단일 `success`, `info` 색으로는 soft surface, solid fill, 그 위의 content를 같은 의미 안에서 표현할 수 없었다. v0.2는 다음 7 role을 추가한다. 기존 base 상태색(`danger`·`warning`·`success`·`info`)은 soft surface 위의 대비 보장 foreground, `*Strong`은 solid fill, `on*`은 solid fill 위의 content라는 한 가지 책임을 갖는다.

| 신규 role | 용도 |
|---|---|
| `warningSoft` | warning 배경·progress track |
| `successStrong` | success solid fill |
| `successSoft` | success 배경·progress track |
| `onSuccess` | success strong 배경 위 콘텐츠 |
| `infoStrong` | info solid fill |
| `infoSoft` | info 배경·progress track |
| `onInfo` | info strong 배경 위 콘텐츠 |

상태 매핑은 컴포넌트 내부 한 곳에서 고정한다.

| variant | soft surface | foreground | solid fill / on-solid |
|---|---|---|---|
| neutral | `surfaceSubtle` | `text` | — |
| info | `infoSoft` | `info` | `infoStrong` / `onInfo` |
| success | `successSoft` | `success` | `successStrong` / `onSuccess` |
| warning | `warningSoft` | `warning` | `warningStrong` / `onWarning` |
| error | `dangerSoft` | `danger` | `dangerStrong` / `onDanger` |

`createTheme`/`createThemes`가 양 스킴의 완전한 31 role을 만들므로 컴포넌트에는 라이트/다크 분기가 없다. 브랜드 테마를 교체하면 새 11종도 같은 경로로 즉시 바뀐다.

### 2.2 Provider 확장

`UiIcons`에는 모두 optional인 슬롯 2개가 추가되고, 기존 예약 슬롯 `close`가 실제 소비 경로를 얻는다.

| 슬롯 | 소비자 | 미주입 폴백 |
|---|---|---|
| `minus` | Checkbox `mixed` | `−` 텍스트 글리프 |
| `chevronDown` | Accordion | `⌄` 텍스트 글리프 |
| `close` (기존) | Alert dismiss | `×` 텍스트 글리프 |

기존 `check`는 Checkbox checked에, `toast[variant]`는 Alert leading 기본값에도 재사용한다. 개별 `renderMark`, `renderIndicator`, `leading` prop이 Provider 기본값보다 우선한다.

문구 key는 늘리지 않는다. Spinner는 기존 `strings.loading`, Alert dismiss는 기존 `strings.close`를 쓴다. 따라서 커스텀 `UiStrings` 번들에는 v0.2 때문에 추가해야 할 key가 없다.

## 3. Status — Badge / Alert

### 3.1 Badge

```ts
type StatusVariant = 'neutral' | 'info' | 'success' | 'warning' | 'error';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: StatusVariant | undefined; // neutral
  size?: BadgeSize | undefined;        // md
  leading?: ReactNode | RenderIcon | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  labelClassName?: string | undefined;
  // CommonProps
}
```

- `leading`이 렌더 함수면 soft surface 위의 상태 foreground와 size별 icon metric을 전달한다.
- `sm`은 caption, `md`는 label typography를 사용한다.
- Badge는 짧은 정적 라벨이다. 라이브 영역이나 버튼 역할을 자동으로 꾸며내지 않는다.

### 3.2 Alert

```ts
type AlertLive = 'off' | 'polite' | 'assertive';

type AlertProps = {
  variant?: 'info' | 'success' | 'warning' | 'error' | undefined; // info
  leading?: ReactNode | RenderIcon | undefined;
  action?: { readonly label: string; readonly onPress: () => void } | undefined;
  onDismiss?: (() => void) | undefined;
  dismissAccessibilityLabel?: string | undefined; // strings.close
  live?: AlertLive | undefined;                    // off
  // CommonProps
} & (
  | { title: string; children?: ReactNode | undefined }
  | { title?: never; children: NonNullable<ReactNode> }
);
```

- `neutral`은 알림 의도가 아니므로 Alert에서 허용하지 않는다.
- title 또는 `null`·`undefined`가 아닌 children 중 하나가 필수다.
- `action`은 label과 handler를 한 객체로 묶어 죽은 액션을 막는다.
- `onDismiss`가 있을 때만 닫기 버튼을 렌더한다. 버튼 라벨은 override 또는 `strings.close`다.
- `live="off"`가 기본이다. 동적으로 삽입·갱신되는 메시지에만 `polite`/`assertive`를 선택한다. 웹 polite는 `status`, assertive는 `alert` 의미를 내며 포커스를 이동하지 않는다.

## 4. Display — Avatar / Divider / ListItem

### 4.1 Avatar

```ts
type AvatarSize = 'sm' | 'md' | 'lg';

type AvatarProps = {
  name: string;
  source?: ImageSourcePropType | undefined;
  size?: AvatarSize | undefined;             // md
  fallback?: ReactNode | undefined;
  imageProps?: AvatarImageProps | undefined;
  imageStyle?: StyleProp<ImageStyle> | undefined;
  // CommonProps
} & (
  | { alt: string; decorative?: false | undefined }
  | { decorative: true; alt?: never }
);
```

- 의미 있는 프로필/조직 이미지는 `alt`가 필수다. 반복 정보 등 장식용은 `decorative`를 명시한다.
- `source`가 없거나 로드에 실패하면 `fallback`, 그마저 없으면 `avatarInitials(name)`을 렌더한다.
- `avatarInitials`는 공백 이름의 첫·끝 글자, 한 단어의 첫 두 유니코드 문자를 사용한다. 빈 이름은 `?`다.
- `imageProps`는 source, style, 접근성 prop을 제외한다. 내부 onError 폴백과 소비자 onError는 함께 실행된다.

### 4.2 Divider

```ts
interface DividerProps {
  orientation?: 'horizontal' | 'vertical' | undefined; // horizontal
  color?: ColorKey | undefined;                         // line
  thickness?: number | undefined;                       // hairlineWidth
  inset?: SpacingKey | number | undefined;              // 0
  spacing?: SpacingKey | number | undefined;            // 0
  decorative?: boolean | undefined;                     // true
  // CommonProps
}
```

`inset`은 선의 시작·끝 축 여백, `spacing`은 인접 콘텐츠 방향 여백이다. 기본은 시각적 장식으로 접근성 트리에서 숨고, `decorative={false}`일 때 separator와 웹 orientation을 노출한다.

### 4.3 ListItem

```ts
type ListItemProps = {
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  trailing?: ReactNode | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined; // md
  titleStyle?: StyleProp<TextStyle> | undefined;
  descriptionStyle?: StyleProp<TextStyle> | undefined;
  // CommonProps
} & (
  | {
      onPress: () => void;
      disabled?: boolean | undefined;
      accessibilityLabel?: string | undefined;
      accessibilityHint?: string | undefined;
    }
  | {
      onPress?: never;
      disabled?: never;
      accessibilityLabel?: never;
      accessibilityHint?: never;
    }
);
```

`onPress`가 있으면 전체 행은 button 의미와 pressed feedback을 갖는다. 없으면 정적 View다. 타입 유니언 때문에 정적 행에 상호작용 전용 prop을 붙이거나 handler 없는 disabled 행을 만들 수 없다.

## 5. Progress — Spinner / ProgressBar

### 5.1 Spinner

```ts
interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | undefined; // md
  color?: ColorKey | undefined;          // primary
  accessibilityLabel?: string | undefined;
  // CommonProps
}
```

ActivityIndicator를 테마 icon metric으로 감싼다. `progressbar`와 busy state를 노출하며 라벨 기본값은 `strings.loading`이다.

### 5.2 ProgressBar

```ts
type ProgressBarProps = {
  variant?: 'primary' | 'info' | 'success' | 'warning' | 'error' | undefined;
  size?: 'sm' | 'md' | 'lg' | undefined;
  accessibilityLabel: string;
  indicatorStyle?: StyleProp<ViewStyle> | undefined;
  indicatorClassName?: string | undefined;
  // CommonProps
} & (
  | { value: number; max?: number | undefined; accessibilityValueText?: string | undefined }
  | { value: null; max?: never; accessibilityValueText?: string | undefined }
);
```

- determinate: 기본 max는 100이다. 유한한 양수가 아닌 max는 100으로, 유한하지 않은 value는 0으로, 나머지 value는 `0...max`로 정규화한다.
- indeterminate: `value={null}`이다. track의 35% indicator가 반복 이동하고 busy state를 노출한다. 운영체제의 모션 감소 설정을 감지하면 이동을 중단한다. 이 모드에서 max는 타입 에러다.
- 두 모드 모두 대상이 무엇인지 말하는 `accessibilityLabel`이 필수다. `accessibilityValueText`로 “10장 중 7장” 같은 도메인 표현을 덧붙일 수 있다.

## 6. Controls — Checkbox / Switch / RadioGroup

### 6.1 공통 라벨 계약

Checkbox와 Switch는 다음 유니언을 사용한다.

```ts
type VisibleOrAccessibleLabel =
  | { label: string; accessibilityLabel?: string | undefined }
  | { label?: never; accessibilityLabel: string };
```

보이는 label을 생략한 icon/compact 배치라도 스크린리더 이름은 반드시 남는다. `description`은 시각 보조 문구이자 accessibility hint다.

### 6.2 Checkbox

```ts
type CheckboxProps = VisibleOrAccessibleLabel & {
  checked: boolean | 'mixed';
  onCheckedChange: (checked: boolean) => void;
  description?: string | undefined;
  disabled?: boolean | undefined; // false
  size?: 'sm' | 'md' | undefined; // md
  renderMark?: RenderIcon | undefined;
  // CommonProps
};
```

- `'mixed'`는 select-all 같은 부분 선택 상태다. 사용자가 false 또는 mixed를 활성화하면 `true`, true를 활성화하면 `false`를 콜백한다.
- mark 우선순위는 `renderMark` → Provider `minus/check` → 텍스트 폴백이다.
- 웹은 checkbox role, checked/mixed/disabled ARIA, focusable View를 사용한다. Space만 토글하도록 명시해 RNW Pressable의 범용 Enter 활성화를 피한다.

### 6.3 Switch

```ts
type SwitchProps = VisibleOrAccessibleLabel & {
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string | undefined;
  disabled?: boolean | undefined; // false
  size?: 'sm' | 'md' | undefined; // md
  // CommonProps
};
```

RN의 네이티브 Switch를 유지한다. RNW가 만드는 native input을 wrapper role로 중복하지 않으며, 네이티브에서는 switch role과 checked/disabled state를 함께 전달한다.

### 6.4 RadioGroup

```ts
interface RadioItem<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly description?: string | undefined;
  readonly disabled?: boolean | undefined;
}

interface RadioGroupProps<T extends string> {
  items: readonly RadioItem<T>[];
  value: NoInfer<T> | null;
  onValueChange: (value: T) => void;
  accessibilityLabel: string;
  orientation?: 'vertical' | 'horizontal' | undefined; // vertical
  // CommonProps
}
```

items가 값 유니언 `T`의 정본이고 `NoInfer`가 value의 오타로 유니언이 넓어지는 일을 막는다. 웹은 선택 항목 또는 첫 enabled 항목 하나만 tab stop으로 두고 다음을 제공한다.

- Space: 현재 항목 선택
- ArrowRight/ArrowDown: 다음 enabled 항목, 끝에서 처음으로 순환
- ArrowLeft/ArrowUp: 이전 enabled 항목, 처음에서 끝으로 순환
- Home/End: 첫/마지막 enabled 항목

이동은 선택과 포커스를 함께 갱신한다. disabled 항목은 tab 순서와 방향키 이동에서 제외한다.

## 7. Disclosure — Accordion

```ts
interface AccordionItem<T extends string> {
  readonly value: T;
  readonly title: string;
  readonly description?: string | undefined;
  readonly content: NonNullable<ReactNode>;
  readonly leading?: ReactNode | undefined;
  readonly disabled?: boolean | undefined;
}

type AccordionProps<T extends string> = {
  items: readonly AccordionItem<T>[];
  disabled?: boolean | undefined;
  renderIndicator?: ((props: IconRenderProps & { readonly expanded: boolean }) => ReactNode) | undefined;
  headingLevel?: 1 | 2 | 3 | 4 | 5 | 6 | undefined; // 3
  style?: StyleProp<ViewStyle> | undefined;
  itemStyle?: StyleProp<ViewStyle> | undefined;
  headerStyle?: StyleProp<ViewStyle> | undefined;
  contentStyle?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
} & (
  | {
      type?: 'single' | undefined;
      value: NoInfer<T> | null;
      onValueChange: (value: T | null) => void;
      collapsible?: boolean | undefined; // true
    }
  | {
      type: 'multiple';
      value: ReadonlyArray<NoInfer<T>>;
      onValueChange: (value: readonly T[]) => void;
      collapsible?: never;
    }
);
```

- single은 한 항목 또는 null이다. `collapsible={false}`이면 열린 항목의 헤더를 다시 눌러도 닫지 않고 disabled state를 노출한다.
- multiple은 열린 값 배열을 입력받고 새 readonly 배열을 콜백한다. `collapsible`은 이 모드에서 타입 에러다.
- 전체 `disabled`와 item별 `disabled`를 합성한다.
- indicator 우선순위는 `renderIndicator` → Provider `chevronDown` → 텍스트 폴백이다.
- 웹 헤더는 실제 heading 아래 button이며 header id와 panel id를 `aria-controls`로 연결한다. Enter와 Space로 토글한다. landmark 남발을 피하려고 item이 6개 이하일 때만 패널에 region과 `aria-labelledby`를 부여한다.
- 닫힌 panel은 display뿐 아니라 접근성 트리에서도 숨는다.

### single / multiple 예제

```tsx
const items = [
  { value: 'profile', title: '프로필', content: <ProfileSettings /> },
  { value: 'security', title: '보안', content: <SecuritySettings /> },
] as const;

function SingleSettings() {
  const [open, setOpen] = useState<'profile' | 'security' | null>('profile');
  return (
    <Accordion
      items={items}
      value={open}
      onValueChange={setOpen}
      collapsible={false}
    />
  );
}

function MultipleSettings() {
  const [open, setOpen] = useState<readonly ('profile' | 'security')[]>([]);
  return (
    <Accordion
      type="multiple"
      items={items}
      value={open}
      onValueChange={setOpen}
    />
  );
}
```

## 8. 접근성 검증 행렬

| 컴포넌트 | 이름·상태 | 웹 키보드 | 핵심 방어 |
|---|---|---|---|
| Badge | 보이는 label | 해당 없음 | 상호작용 역할을 꾸며내지 않음 |
| Alert | live opt-in, polite status/assertive alert | action/dismiss는 Button 규약 | 정적 메시지의 중복 낭독 방지 |
| Avatar | image + alt 또는 accessibility tree 제외 | 해당 없음 | 의미/장식 선택을 타입으로 강제 |
| Divider | 기본 hidden, opt-in separator | 해당 없음 | 시각 장식을 불필요하게 낭독하지 않음 |
| ListItem | interactive만 button/disabled/hint | Button과 동일 | 정적/인터랙티브 prop 유니언 |
| Spinner | progressbar + busy + label | 해당 없음 | strings.loading 기본 이름 |
| ProgressBar | progressbar + value 또는 busy | 해당 없음 | 필수 대상 라벨, null/max 배타, 모션 감소 존중 |
| Checkbox | checkbox + checked/mixed/disabled | Space | label/accessibilityLabel 필수 |
| Switch | native switch + checked/disabled | 플랫폼 input | RNW 중복 접근성 node 방지 |
| RadioGroup | radiogroup + roving radio state | Space, arrows, Home, End | disabled skip, wrap, 필수 그룹 라벨 |
| Accordion | heading/button/panel + expanded | Enter, Space | id 연결, 닫힌 panel 트리 제외 |

## 9. 상태 소유와 국제화

controlled API는 라이브러리와 앱의 책임 경계를 선명하게 한다.

- 라이브러리 소유: 현재 props에 따른 렌더, 키보드/스크린리더 의미, press feedback, indeterminate animation phase, 이미지 로드 실패 폴백.
- 앱 소유: 선택값, 펼침값, 저장/복구, validation, 네트워크 재시도, URL 동기화, 비즈니스 문구.

기본 문구가 필요한 새 경로는 기존 `loading`과 `close`만 소비한다. title, label, description, accessibilityLabel, value text는 앱 문맥이므로 prop으로 받는다. `koStrings`/`enStrings`와 완전한 커스텀 번들 규칙은 그대로 유지된다.

## 10. 의존성과 배포 계약

새 컴포넌트는 React와 React Native만 사용한다. portal, gesture, icon, animation, accessibility 보조 패키지를 추가하지 않는다. `react-native-safe-area-context`는 계속 `./insets` 전용 optional peer이며 새 11종을 import하는 앱에는 필요하지 않다.

공개 export는 모두 패키지 루트 `@gj-kit/expo-ui`에 둔다. `./theme`, `./insets`, `./tailwind`의 물리적 격리와 Node-safe 규칙은 변경하지 않는다. 릴리스는 changeset으로 버전과 changelog를 만들며 직접 publish하지 않는다.

## 11. 검증 기준

v0.2 완료 조건은 특정 테스트 개수를 문서에 고정하지 않고 다음 성질로 정의한다.

- 새 공개 prop과 discriminated union이 typecheck/type test를 통과한다.
- 라이트/다크 기본 테마가 31개 color role을 모두 갖는다.
- component source에 raw design literal이 없다는 token guard를 통과한다.
- 웹 role, ARIA state, keyboard interaction과 네이티브 접근성 state를 unit test로 검증한다.
- root/theme/insets/tailwind ESM·CJS build와 README TS/TSX snippet compile을 통과한다.
- 런타임 dependency 수가 0으로 유지된다.

## 12. 이번 tranche에서 의도적으로 제외한 것

Select/Combobox, Menu/Popover/Tooltip, DatePicker, BottomSheet/Drawer는 overlay, focus trap, portal, positioning, gesture 같은 별도 기반 계층이 필요하다. v0.2의 런타임 의존성 0·작은 primitive 원칙 안에서 얕게 흉내 내면 사용성보다 위험이 커지므로 포함하지 않는다. Card는 `Surface + Section`, multiline input은 `TextField multiline`으로 이미 조립 가능하다.
