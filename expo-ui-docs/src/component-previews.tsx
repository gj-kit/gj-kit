import { useState } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import {
  Accordion,
  ActionSheet,
  Alert,
  AspectRatio,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Chip,
  Collapsible,
  ConfirmActionRow,
  ContentFrame,
  DataTable,
  Dialog,
  DialogPanel,
  Divider,
  EmptyState,
  ErrorState,
  FloatingActionButton,
  FormField,
  IconButton,
  Link,
  ListItem,
  Menu,
  Pagination,
  Popover,
  ProgressBar,
  RadioGroup,
  SearchField,
  Section,
  Select,
  SelectAllRow,
  SelectableRow,
  SelectionIndicator,
  Sheet,
  Skeleton,
  Slider,
  Spinner,
  StickyActionBar,
  Surface,
  Switch,
  Tabs,
  Text,
  TextField,
  Toast,
  ToastViewport,
  ToggleGroup,
  Tooltip,
  useTheme,
  useToastQueue,
} from '@gj-kit/expo-ui';
import type { DataTableColumn, DataTableSort, IconRenderProps } from '@gj-kit/expo-ui';
import { Glyph } from './site-theme';

/**
 * 컴포넌트 상세 페이지에 붙는 실제 렌더 미리보기.
 *
 * 문서용으로 다시 그린 그림이 아니라 워크스페이스의 `@gj-kit/expo-ui`를 그대로
 * import해 렌더한다. 라이브러리가 깨지면 문서도 같이 깨져야 한다.
 */

const sparkIcon = (props: IconRenderProps): ReactElement => <Glyph {...props}>✦</Glyph>;
const plusIcon = (props: IconRenderProps): ReactElement => <Glyph {...props}>＋</Glyph>;

function Row({ children }: { readonly children: React.ReactNode }): ReactElement {
  return <View style={styles.row}>{children}</View>;
}

function Stack({ children }: { readonly children: React.ReactNode }): ReactElement {
  return <View style={styles.stack}>{children}</View>;
}

// ─── 기초 ───────────────────────────────────────────────────────────────────

function TextPreview(): ReactElement {
  return (
    <Stack>
      <Text role="heading">Heading</Text>
      <Text role="title">Title</Text>
      <Text role="body">Body — 본문 문단에 쓰는 기본 역할입니다.</Text>
      <Text role="label">Label</Text>
      <Text role="button">Button</Text>
      <Text role="tab">Tab</Text>
      <Text role="caption" color="textMuted">Caption · textMuted</Text>
    </Stack>
  );
}

// ─── 액션 ───────────────────────────────────────────────────────────────────

function ButtonPreview(): ReactElement {
  const [loading, setLoading] = useState(false);
  return (
    <Stack>
      <Row>
        <Button label="Primary" onPress={() => {}} />
        <Button label="Secondary" variant="secondary" onPress={() => {}} />
        <Button label="Outline" variant="primary-outline" onPress={() => {}} />
      </Row>
      <Row>
        <Button label="Destructive" variant="destructive" size="sm" onPress={() => {}} />
        <Button label="Disabled" size="sm" disabled onPress={() => {}} />
        <Button
          label={loading ? '저장 중' : '눌러서 loading'}
          size="sm"
          loading={loading}
          onPress={() => {
            setLoading(true);
            setTimeout(() => setLoading(false), 1400);
          }}
        />
      </Row>
      <Row>
        <Button label="Small" size="sm" onPress={() => {}} />
        <Button label="Medium" size="md" onPress={() => {}} />
        <Button label="Large" size="lg" onPress={() => {}} />
      </Row>
    </Stack>
  );
}

function IconButtonPreview(): ReactElement {
  const [starred, setStarred] = useState(false);
  return (
    <Row>
      <IconButton
        accessibilityLabel={starred ? '즐겨찾기 해제' : '즐겨찾기 추가'}
        icon={sparkIcon}
        onPress={() => setStarred((value) => !value)}
      />
      <IconButton accessibilityLabel="항목 추가" icon={plusIcon} onPress={() => {}} />
      <IconButton accessibilityLabel="비활성 예시" icon={plusIcon} disabled onPress={() => {}} />
      <Text role="caption" color="textMuted">
        accessibilityLabel은 타입 단계에서 필수입니다.
      </Text>
    </Row>
  );
}

function ChipPreview(): ReactElement {
  const [filtered, setFiltered] = useState(true);
  const [tags, setTags] = useState<readonly string[]>(['접근성', '테마']);
  return (
    <Stack>
      <Row>
        <Chip kind="action" label="액션 칩" onPress={() => {}} />
        <Chip kind="filter" label="Preview만" selected={filtered} onSelectedChange={setFiltered} />
      </Row>
      <Row>
        {tags.map((tag) => (
          <Chip
            key={tag}
            kind="removable"
            label={tag}
            removeAccessibilityLabel={`${tag} 태그 제거`}
            onRemove={() => setTags((current) => current.filter((item) => item !== tag))}
          />
        ))}
        {tags.length === 0 ? (
          <Button label="태그 되돌리기" size="sm" variant="secondary" onPress={() => setTags(['접근성', '테마'])} />
        ) : null}
      </Row>
    </Stack>
  );
}

function FloatingActionButtonPreview(): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.fabStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
      <Text role="caption" color="textMuted">화면 모서리에 고정되는 액션</Text>
      <FloatingActionButton label="새 프로젝트" icon={plusIcon} onPress={() => {}} offset="lg" />
    </View>
  );
}

function ConfirmActionRowPreview(): ReactElement {
  const [state, setState] = useState<'idle' | 'confirmed' | 'cancelled'>('idle');
  return (
    <Stack>
      <ConfirmActionRow
        destructive
        confirmLabel="삭제"
        cancelLabel="취소"
        onCancel={() => setState('cancelled')}
        onConfirm={() => setState('confirmed')}
      />
      <Text role="caption" color="textMuted">
        {state === 'idle' ? '아직 선택하지 않았습니다.' : state === 'confirmed' ? '삭제를 확인했습니다.' : '취소했습니다.'}
      </Text>
    </Stack>
  );
}

// ─── 입력 ───────────────────────────────────────────────────────────────────

function TextFieldPreview(): ReactElement {
  const [value, setValue] = useState('디자인 시스템 개편');
  return (
    <Stack>
      <TextField
        label="프로젝트 이름"
        value={value}
        onChangeText={setValue}
        counter={`${value.length}/30`}
        helperText="라벨·헬퍼·카운터가 같은 토큰을 씁니다."
      />
      <TextField label="에러 상태" value="" onChangeText={() => {}} error="필수 입력 항목입니다." />
    </Stack>
  );
}

function SearchFieldPreview(): ReactElement {
  const [query, setQuery] = useState('');
  return (
    <Stack>
      <SearchField value={query} onChangeText={setQuery} />
      <Text role="caption" color="textMuted">
        {query ? `"${query}" 검색 중` : 'placeholder와 아이콘은 UiProvider에서 주입됩니다.'}
      </Text>
    </Stack>
  );
}

function FormFieldPreview(): ReactElement {
  const [email, setEmail] = useState('');
  const invalid = email.length > 0 && !email.includes('@');
  return (
    <FormField
      label="업무용 이메일"
      required
      requiredAccessibilityLabel="업무용 이메일 (필수)"
      helperText="초대 메일을 받을 주소입니다."
      {...(invalid ? { error: '@ 가 포함된 주소를 입력하세요.' } : {})}
    >
      {(controlProps) => (
        <TextField value={email} onChangeText={setEmail} placeholder="you@team.com" {...controlProps} />
      )}
    </FormField>
  );
}

function SelectPreview(): ReactElement {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<'stable' | 'preview' | null>('stable');
  return (
    <Select
      label="릴리스 채널"
      placeholder="채널 선택"
      items={[
        { value: 'stable', label: 'Stable' },
        { value: 'preview', label: 'Preview', description: '테스트 빌드' },
      ] as const}
      value={value}
      onValueChange={setValue}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

function CheckboxPreview(): ReactElement {
  const [checked, setChecked] = useState<boolean | 'mixed'>('mixed');
  return (
    <Stack>
      <Checkbox
        checked={checked}
        onCheckedChange={setChecked}
        label="이용 약관에 동의합니다"
        description="mixed 상태도 boolean 입력으로 안전하게 전환합니다."
      />
      <Checkbox checked onCheckedChange={() => {}} label="비활성 예시" disabled />
    </Stack>
  );
}

function SwitchPreview(): ReactElement {
  const [enabled, setEnabled] = useState(true);
  return (
    <Stack>
      <Switch value={enabled} onValueChange={setEnabled} label="새 소식 알림" description="주 1회 발송됩니다." />
      <Switch value={false} onValueChange={() => {}} label="비활성 예시" disabled size="sm" />
    </Stack>
  );
}

function RadioGroupPreview(): ReactElement {
  const [channel, setChannel] = useState<'push' | 'email' | 'sms'>('push');
  return (
    <RadioGroup
      accessibilityLabel="알림 채널"
      items={[
        { label: '푸시', value: 'push' },
        { label: '이메일', value: 'email' },
        { label: '문자', value: 'sms', disabled: true },
      ] as const}
      value={channel}
      onValueChange={setChannel}
    />
  );
}

function SliderPreview(): ReactElement {
  const [volume, setVolume] = useState(60);
  return (
    <Stack>
      <View style={styles.labelRow}>
        <Text role="label">알림 음량</Text>
        <Text role="caption" color="textMuted">{volume}%</Text>
      </View>
      <Slider value={volume} min={0} max={100} step={5} accessibilityLabel="알림 음량" onValueChange={setVolume} />
    </Stack>
  );
}

// ─── 선택 ───────────────────────────────────────────────────────────────────

function SelectionIndicatorPreview(): ReactElement {
  const [selected, setSelected] = useState(true);
  return (
    <Row>
      <SelectionIndicator selected={selected} />
      <SelectionIndicator selected={!selected} showUncheckedMark />
      <Button label="상태 바꾸기" size="sm" variant="secondary" onPress={() => setSelected((value) => !value)} />
    </Row>
  );
}

function SelectableRowPreview(): ReactElement {
  const [selected, setSelected] = useState<'weekly' | 'product'>('weekly');
  return (
    <Surface padding="md" radius="md">
      <SelectableRow selected={selected === 'weekly'} onPress={() => setSelected('weekly')}>
        <View style={styles.rowCopy}>
          <Text role="label">주간 회고 알림</Text>
          <Text role="caption" color="textMuted">매주 일요일 오후 8시</Text>
        </View>
      </SelectableRow>
      <SelectableRow selected={selected === 'product'} onPress={() => setSelected('product')}>
        <View style={styles.rowCopy}>
          <Text role="label">제품 업데이트</Text>
          <Text role="caption" color="textMuted">새로운 컴포넌트 소식</Text>
        </View>
      </SelectableRow>
    </Surface>
  );
}

const SELECT_ALL_ITEMS = ['Button', 'TextField', 'Dialog'] as const;

function SelectAllRowPreview(): ReactElement {
  const [selected, setSelected] = useState<readonly string[]>(['Button']);
  const allSelected = selected.length === SELECT_ALL_ITEMS.length;
  return (
    <Surface padding="md" radius="md">
      <SelectAllRow
        selected={allSelected}
        showUncheckedMark
        onPress={() => setSelected(allSelected ? [] : [...SELECT_ALL_ITEMS])}
      />
      {SELECT_ALL_ITEMS.map((item) => (
        <SelectableRow
          key={item}
          selected={selected.includes(item)}
          onPress={() =>
            setSelected((current) =>
              current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item],
            )
          }
        >
          <Text role="label">{item}</Text>
        </SelectableRow>
      ))}
    </Surface>
  );
}

function ToggleGroupPreview(): ReactElement {
  const [density, setDensity] = useState<'spacious' | 'comfortable' | 'compact'>('comfortable');
  return (
    <Stack>
      <ToggleGroup
        selectionMode="single"
        accessibilityLabel="목록 밀도"
        value={density}
        onValueChange={(next) => setDensity(next ?? 'comfortable')}
        allowEmpty={false}
        items={[
          { label: '여유', value: 'spacious' },
          { label: '기본', value: 'comfortable' },
          { label: '압축', value: 'compact' },
        ] as const}
      />
      <Text role="caption" color="textMuted">선택: {density}</Text>
    </Stack>
  );
}

// ─── 탐색 ───────────────────────────────────────────────────────────────────

function TabsPreview(): ReactElement {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  return (
    <Tabs
      accessibilityLabel="미리보기 탭"
      items={[
        { label: 'Preview', value: 'preview' },
        { label: 'Code', value: 'code' },
      ] as const}
      value={tab}
      onChange={setTab}
      panels={{
        preview: <Text color="textMuted">Preview 패널의 내용입니다.</Text>,
        code: <Text color="textMuted">Code 패널의 내용입니다.</Text>,
      }}
    />
  );
}

function LinkPreview(): ReactElement {
  return (
    <Row>
      <Link href="https://www.npmjs.com/package/@gj-kit/expo-ui" target="_blank" rel="noopener noreferrer">
        npm 패키지 열기
      </Link>
      <Link onPress={() => {}}>액션형 Link</Link>
    </Row>
  );
}

function CollapsiblePreview(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible title="설치 요구 사항" open={open} onOpenChange={setOpen} variant="outlined">
      <Text color="textMuted">React Native 0.79 이상, TypeScript 5.x. 런타임 의존성은 없습니다.</Text>
    </Collapsible>
  );
}

function AccordionPreview(): ReactElement {
  const [value, setValue] = useState<'controlled' | 'a11y' | null>('controlled');
  return (
    <Accordion
      items={[
        {
          value: 'controlled',
          title: '왜 controlled API인가요?',
          content: <Text color="textMuted">앱 상태와 UI 상태가 언제나 한 방향으로 흐릅니다.</Text>,
        },
        {
          value: 'a11y',
          title: '접근성은 어디까지 포함하나요?',
          content: <Text color="textMuted">역할, 상태, 키보드 이동과 패널 관계를 기본 제공합니다.</Text>,
        },
      ] as const}
      value={value}
      onValueChange={setValue}
    />
  );
}

function PaginationPreview(): ReactElement {
  const [page, setPage] = useState(3);
  return (
    <Pagination
      mode="numbered"
      countMode="items"
      accessibilityLabel="결제 내역 페이지"
      page={page}
      totalItemCount={128}
      pageSize={20}
      getPageAccessibilityLabel={({ page: target, current }) =>
        current ? `${target}페이지, 현재 페이지` : `${target}페이지로 이동`
      }
      onPageChange={setPage}
    />
  );
}

// ─── 레이아웃 ───────────────────────────────────────────────────────────────

function SurfacePreview(): ReactElement {
  return (
    <Stack>
      <Surface padding="lg" radius="md">
        <Text role="label">bordered · radius="md"</Text>
      </Surface>
      <Surface padding="lg" radius="lg" elevation="sm" bordered={false}>
        <Text role="label">elevation="sm" · bordered={'{false}'}</Text>
      </Surface>
    </Stack>
  );
}

function CardPreview(): ReactElement {
  return (
    <Stack>
      <Card variant="outlined">
        <Text role="label">outlined</Text>
        <Text role="caption" color="textMuted">기본값입니다.</Text>
      </Card>
      <Card variant="elevated">
        <Text role="label">elevated</Text>
      </Card>
      <Card variant="filled">
        <Text role="label">filled</Text>
      </Card>
    </Stack>
  );
}

function AspectRatioPreview(): ReactElement {
  const theme = useTheme();
  return (
    <Stack>
      <AspectRatio ratio={16 / 9}>
        <View style={[styles.ratioBox, { backgroundColor: theme.colors.primarySoft }]}>
          <RNText style={[styles.ratioLabel, { color: theme.colors.primaryStrong }]}>16 : 9</RNText>
        </View>
      </AspectRatio>
      <Text role="caption" color="textMuted">ratio는 0보다 큰 유한수만 허용합니다.</Text>
    </Stack>
  );
}

function ContentFramePreview(): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.frameStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
      <ContentFrame maxWidth={360} center padding="lg">
        <Surface padding="lg" radius="md">
          <Text role="label">maxWidth=360 · center</Text>
          <Text role="caption" color="textMuted">넓은 화면에서도 읽기 폭을 고정합니다.</Text>
        </Surface>
      </ContentFrame>
    </View>
  );
}

function SectionPreview(): ReactElement {
  return (
    <Section
      title="결제 수단"
      subtitle="기본 카드는 한 번에 하나만 지정됩니다."
      actions={<Button label="추가" size="sm" variant="secondary" onPress={() => {}} />}
    >
      <Surface padding="lg" radius="md">
        <Text color="textMuted">섹션 본문이 이 자리에 들어갑니다.</Text>
      </Surface>
    </Section>
  );
}

function StickyActionBarPreview(): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.barStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
      <Text role="caption" color="textMuted">화면 하단에 고정되는 액션 영역</Text>
      <StickyActionBar>
        <Button label="변경 사항 저장" onPress={() => {}} />
      </StickyActionBar>
    </View>
  );
}

function DividerPreview(): ReactElement {
  return (
    <Surface padding="md" radius="md">
      <Text role="label">위 항목</Text>
      <Divider />
      <Text role="label">가운데 항목</Text>
      <Divider inset="md" />
      <Text role="label">inset="md" 아래 항목</Text>
    </Surface>
  );
}

// ─── 상태 · 진행 ────────────────────────────────────────────────────────────

function BadgePreview(): ReactElement {
  return (
    <Row>
      <Badge label="Neutral" />
      <Badge label="Info" variant="info" />
      <Badge label="Success" variant="success" />
      <Badge label="Warning" variant="warning" />
      <Badge label="Error" variant="error" />
      <Badge label="sm" size="sm" variant="info" />
    </Row>
  );
}

function AlertPreview(): ReactElement {
  return (
    <Stack>
      <Alert title="테마가 저장되었습니다" variant="success" live="polite">
        모든 새 화면에 semantic token이 즉시 반영됩니다.
      </Alert>
      <Alert title="미리보기 API입니다" variant="warning">
        npm latest에는 아직 포함되지 않았습니다.
      </Alert>
    </Stack>
  );
}

function SpinnerPreview(): ReactElement {
  return (
    <Row>
      <Spinner accessibilityLabel="불러오는 중" />
      <Spinner accessibilityLabel="작게 불러오는 중" size="sm" />
      <Text role="caption" color="textMuted">size는 테마 metric에서 옵니다.</Text>
    </Row>
  );
}

function ProgressBarPreview(): ReactElement {
  const [value, setValue] = useState(72);
  return (
    <Stack>
      <ProgressBar value={value} accessibilityLabel="문서 생성 진행률" />
      <ProgressBar value={null} variant="info" accessibilityLabel="동기화 진행률" accessibilityValueText="동기화 중" />
      <Row>
        <Button label="-10" size="sm" variant="secondary" onPress={() => setValue((v) => Math.max(0, v - 10))} />
        <Button label="+10" size="sm" variant="secondary" onPress={() => setValue((v) => Math.min(100, v + 10))} />
        <Text role="caption" color="textMuted">determinate {value}% · indeterminate</Text>
      </Row>
    </Stack>
  );
}

// ─── 표시 ───────────────────────────────────────────────────────────────────

function AvatarPreview(): ReactElement {
  return (
    <Row>
      <Avatar name="Ada Lovelace" decorative />
      <Avatar name="Grace Hopper" decorative size="sm" />
      <Text role="caption" color="textMuted">이름에서 이니셜과 색을 파생합니다.</Text>
    </Row>
  );
}

function ListItemPreview(): ReactElement {
  return (
    <Surface padding="sm" radius="md">
      <ListItem
        title="Ada Lovelace"
        description="Design systems contributor"
        leading={<Avatar name="Ada Lovelace" decorative />}
        trailing={<Badge label="Core" variant="info" size="sm" />}
        onPress={() => {}}
      />
      <Divider inset="md" />
      <ListItem
        title="Grace Hopper"
        description="Accessibility reviewer"
        leading={<Avatar name="Grace Hopper" decorative />}
        trailing={<Badge label="A11y" variant="success" size="sm" />}
      />
    </Surface>
  );
}

// ─── 피드백 ─────────────────────────────────────────────────────────────────

function SkeletonPreview(): ReactElement {
  return (
    <Surface padding="lg" radius="md">
      <View style={styles.skeletonRow}>
        <Skeleton radius="pill" style={styles.skeletonAvatar} />
        <View style={styles.skeletonLines}>
          <Skeleton style={styles.skeletonLong} />
          <Skeleton style={styles.skeletonShort} />
        </View>
      </View>
    </Surface>
  );
}

function EmptyStatePreview(): ReactElement {
  return (
    <EmptyState
      title="아직 프로젝트가 없어요"
      body="첫 번째 프로젝트를 만들어보세요."
      action={{ label: '프로젝트 만들기', onPress: () => {} }}
    />
  );
}

function ErrorStatePreview(): ReactElement {
  return <ErrorState message="네트워크 연결을 확인해주세요." onRetry={() => {}} />;
}

function ToastPreview(): ReactElement {
  const theme = useTheme();
  return (
    <Stack>
      <View style={[styles.toastStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
        <Toast message="문서 상태를 저장했습니다." variant="success" bottomOffset={16} />
      </View>
      <Text role="caption" color="textMuted">
        단일 Toast는 위치만 계산합니다. 큐가 필요하면 ToastViewport를 쓰세요.
      </Text>
    </Stack>
  );
}

function ToastViewportPreview(): ReactElement {
  const queue = useToastQueue({ defaultDurationMs: 3_200, maxQueued: 3, maxVisible: 2 });
  return (
    <Stack>
      <Row>
        <Button
          label="성공 알림"
          size="sm"
          onPress={() => queue.show({ message: '문서 상태를 저장했습니다.', variant: 'success' })}
        />
        <Button
          label="에러 알림"
          size="sm"
          variant="destructive-outline"
          onPress={() => queue.show({ message: '저장에 실패했습니다.', variant: 'error' })}
        />
      </Row>
      <Text role="caption" color="textMuted">
        최대 2개를 표시하고 나머지는 FIFO로 대기합니다. 표시 중 {queue.visibleToasts.length}개.
      </Text>
      <ToastViewport
        toasts={queue.visibleToasts}
        onDismiss={queue.dismiss}
        onPause={queue.pause}
        onResume={queue.resume}
        placement="top"
        offset={20}
      />
    </Stack>
  );
}

// ─── 데이터 ─────────────────────────────────────────────────────────────────

type PreviewRow = { readonly id: string; readonly member: string; readonly amount: number; readonly status: string };

const PREVIEW_ROWS: readonly PreviewRow[] = [
  { id: 'a', member: '김하늘', amount: 128_000, status: '완료' },
  { id: 'b', member: '이도윤', amount: 54_000, status: '대기' },
  { id: 'c', member: '박서준', amount: 12_000, status: '실패' },
];

const PREVIEW_COLUMNS = [
  { id: 'member', header: '고객', sortable: true, getTextValue: ({ row }) => row.member },
  {
    id: 'amount',
    header: '금액',
    align: 'end',
    sortable: true,
    getTextValue: ({ row }) => `₩${row.amount.toLocaleString('ko-KR')}`,
  },
  { id: 'status', header: '상태', getTextValue: ({ row }) => row.status },
] as const satisfies readonly DataTableColumn<PreviewRow, 'member' | 'amount' | 'status', string>[];

function DataTablePreview(): ReactElement {
  const [sort, setSort] = useState<DataTableSort<'member' | 'amount'> | null>(null);
  const [selected, setSelected] = useState<readonly string[]>(['a']);
  return (
    <DataTable
      caption="최근 결제"
      description="정렬 요청과 선택 상태만 바뀌며 행 순서는 앱이 계속 소유합니다."
      state={{ status: 'ready', rows: PREVIEW_ROWS }}
      columns={PREVIEW_COLUMNS}
      getRowKey={(row) => row.id}
      rowHeaderColumnId="member"
      sort={sort}
      onSortChange={setSort}
      selection={{
        selectedRowKeys: selected,
        onSelectionChange: setSelected,
        getRowSelectionAccessibilityLabel: ({ row }) => `${row.member} 결제 선택`,
        selectAllAccessibilityLabel: '표시된 결제 전체 선택',
        clearSelectionAccessibilityLabel: '표시된 결제 선택 해제',
      }}
      presentation="auto"
      renderListRow={({ row }) => (
        <View style={styles.dataListRow}>
          <View style={styles.rowCopy}>
            <Text role="label">{row.member}</Text>
            <Text role="caption" color="textMuted">₩{row.amount.toLocaleString('ko-KR')}</Text>
          </View>
          <Badge
            label={row.status}
            size="sm"
            variant={row.status === '완료' ? 'success' : row.status === '대기' ? 'warning' : 'error'}
          />
        </View>
      )}
      minTableWidth={420}
      size="sm"
      striped
      variant="outline"
    />
  );
}

// ─── 오버레이 ───────────────────────────────────────────────────────────────

function DialogPreview(): ReactElement {
  const [visible, setVisible] = useState(false);
  return (
    <Stack>
      <Button label="Dialog 열기" onPress={() => setVisible(true)} />
      <Dialog visible={visible} onDismiss={() => setVisible(false)}>
        <DialogPanel
          title="프로젝트를 삭제할까요?"
          description="이 작업은 되돌릴 수 없습니다."
          footer={
            <ConfirmActionRow
              destructive
              confirmLabel="삭제"
              onCancel={() => setVisible(false)}
              onConfirm={() => setVisible(false)}
            />
          }
        >
          <Text color="textMuted">삭제하면 연결된 문서와 설정도 함께 사라집니다.</Text>
        </DialogPanel>
      </Dialog>
      <Text role="caption" color="textMuted">
        웹에서는 focus trap과 Escape, 네이티브에서는 Modal과 back 처리를 같은 API로 다룹니다.
      </Text>
    </Stack>
  );
}

function DialogPanelPreview(): ReactElement {
  return (
    <Stack>
      <DialogPanel
        title="독립 패널로도 쓸 수 있습니다"
        description="Dialog 없이 렌더하면 닫기 버튼이 나타나지 않습니다."
        footer={<Button label="확인" onPress={() => {}} />}
      >
        <Text color="textMuted">인라인 레이아웃에 그대로 합성할 수 있는 패널입니다.</Text>
      </DialogPanel>
    </Stack>
  );
}

function ActionSheetPreview(): ReactElement {
  const [visible, setVisible] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <Stack>
      <Button label="ActionSheet 열기" onPress={() => setVisible(true)} />
      <ActionSheet
        visible={visible}
        title="프로젝트 작업"
        description="일반 button 의미를 유지하는 adaptive action surface입니다."
        items={[
          { value: 'duplicate', label: '프로젝트 복제' },
          { value: 'delete', label: '프로젝트 삭제', description: '복구할 수 없습니다.', destructive: true },
        ] as const}
        onDismiss={(detail) => {
          setVisible(false);
          if (detail.reason === 'action-select') setLast(detail.value);
        }}
      />
      <Text role="caption" color="textMuted">
        {last ? `마지막 선택: ${last}` : '아직 선택한 액션이 없습니다.'}
      </Text>
    </Stack>
  );
}

function SheetPreview(): ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('디자인 시스템 개편');
  return (
    <Stack>
      <Button label="Sheet 열기" onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        title="프로젝트 설정"
        description="데스크톱에서는 logical end, 작은 화면에서는 bottom에 표시됩니다."
        footer={<Button label="설정 저장" onPress={() => setOpen(false)} />}
        onOpenChange={setOpen}
      >
        <TextField label="프로젝트 이름" value={name} onChangeText={setName} />
        <Text role="caption" color="textMuted">header와 footer는 고정되고 본문만 스크롤됩니다.</Text>
      </Sheet>
    </Stack>
  );
}

function PopoverPreview(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      triggerLabel="계정 도움말"
      title="계정 정보"
      description="controlled rich overlay"
      open={open}
      onOpenChange={setOpen}
      variant="outlined"
    >
      <Text>프로필 공개 범위는 설정에서 언제든 바꿀 수 있습니다.</Text>
    </Popover>
  );
}

function TooltipPreview(): ReactElement {
  return (
    <Tooltip
      triggerLabel="오버레이 도움말"
      triggerIcon={sparkIcon}
      content="웹에서는 시각 설명, 네이티브에서는 접근성 힌트로 제공합니다."
      onPress={() => {}}
    />
  );
}

function MenuPreview(): ReactElement {
  const [open, setOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <Stack>
      <Menu
        triggerLabel="프로젝트 작업"
        items={[
          { kind: 'action', value: 'duplicate', label: '프로젝트 복제' },
          { kind: 'checkbox', value: 'compact', label: '압축 보기', checked: compact },
          { kind: 'action', value: 'delete', label: '프로젝트 삭제', destructive: true },
        ] as const}
        open={open}
        onOpenChange={setOpen}
        onSelect={(detail) => {
          if (detail.kind === 'checkbox') setCompact(detail.checked);
          if (detail.kind === 'action') setLast(detail.value);
        }}
        variant="outlined"
      />
      <Text role="caption" color="textMuted">
        {last ? `마지막 액션: ${last}` : '압축 보기'} · {compact ? 'on' : 'off'}
      </Text>
    </Stack>
  );
}

// ─── 레지스트리 ─────────────────────────────────────────────────────────────

const previews: Readonly<Record<string, ComponentType>> = {
  accordion: AccordionPreview,
  'action-sheet': ActionSheetPreview,
  alert: AlertPreview,
  'aspect-ratio': AspectRatioPreview,
  avatar: AvatarPreview,
  badge: BadgePreview,
  button: ButtonPreview,
  card: CardPreview,
  checkbox: CheckboxPreview,
  chip: ChipPreview,
  collapsible: CollapsiblePreview,
  'confirm-action-row': ConfirmActionRowPreview,
  'content-frame': ContentFramePreview,
  'data-table': DataTablePreview,
  dialog: DialogPreview,
  'dialog-panel': DialogPanelPreview,
  divider: DividerPreview,
  'empty-state': EmptyStatePreview,
  'error-state': ErrorStatePreview,
  'floating-action-button': FloatingActionButtonPreview,
  'form-field': FormFieldPreview,
  'icon-button': IconButtonPreview,
  link: LinkPreview,
  'list-item': ListItemPreview,
  menu: MenuPreview,
  pagination: PaginationPreview,
  popover: PopoverPreview,
  'progress-bar': ProgressBarPreview,
  'radio-group': RadioGroupPreview,
  'search-field': SearchFieldPreview,
  section: SectionPreview,
  select: SelectPreview,
  'select-all-row': SelectAllRowPreview,
  'selectable-row': SelectableRowPreview,
  'selection-indicator': SelectionIndicatorPreview,
  sheet: SheetPreview,
  skeleton: SkeletonPreview,
  slider: SliderPreview,
  spinner: SpinnerPreview,
  'sticky-action-bar': StickyActionBarPreview,
  surface: SurfacePreview,
  switch: SwitchPreview,
  tabs: TabsPreview,
  text: TextPreview,
  'text-field': TextFieldPreview,
  toast: ToastPreview,
  'toast-viewport': ToastViewportPreview,
  'toggle-group': ToggleGroupPreview,
  tooltip: TooltipPreview,
};

export function getComponentPreview(slug: string): ComponentType | undefined {
  return previews[slug];
}

/** 카탈로그 전수 커버리지를 테스트/가드에서 대조하기 위한 목록. */
export const previewSlugs: readonly string[] = Object.keys(previews);

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stack: { gap: 14, width: '100%' },
  rowCopy: { flex: 1, gap: 2, minWidth: 0 },
  labelRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  fabStage: { borderRadius: 16, height: 168, justifyContent: 'flex-start', overflow: 'hidden', padding: 16 },
  frameStage: { borderRadius: 16, paddingVertical: 12 },
  barStage: { borderRadius: 16, gap: 12, overflow: 'hidden', paddingTop: 16 },
  toastStage: { borderRadius: 16, height: 120, overflow: 'hidden' },
  ratioBox: { alignItems: 'center', borderRadius: 14, flex: 1, justifyContent: 'center' },
  ratioLabel: { fontSize: 18, fontWeight: '900' },
  skeletonRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  skeletonAvatar: { height: 44, width: 44 },
  skeletonLines: { flex: 1, gap: 9 },
  skeletonLong: { height: 12, width: '82%' },
  skeletonShort: { height: 12, width: '48%' },
  dataListRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
});
