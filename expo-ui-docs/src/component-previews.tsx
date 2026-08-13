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
  Rating,
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
      <Text role="body">Body — The default role for body paragraphs.</Text>
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
          label={loading ? 'Saving' : 'Press to load'}
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
        accessibilityLabel={starred ? 'Remove from favorites' : 'Add to favorites'}
        icon={sparkIcon}
        onPress={() => setStarred((value) => !value)}
      />
      <IconButton accessibilityLabel="Add item" icon={plusIcon} onPress={() => {}} />
      <IconButton accessibilityLabel="Disabled example" icon={plusIcon} disabled onPress={() => {}} />
      <Text role="caption" color="textMuted">
        accessibilityLabel is required at the type level.
      </Text>
    </Row>
  );
}

function ChipPreview(): ReactElement {
  const [filtered, setFiltered] = useState(true);
  const [tags, setTags] = useState<readonly string[]>(['Accessibility', 'Theming']);
  return (
    <Stack>
      <Row>
        <Chip kind="action" label="Action chip" onPress={() => {}} />
        <Chip kind="filter" label="Preview only" selected={filtered} onSelectedChange={setFiltered} />
      </Row>
      <Row>
        {tags.map((tag) => (
          <Chip
            key={tag}
            kind="removable"
            label={tag}
            removeAccessibilityLabel={`Remove ${tag} tag`}
            onRemove={() => setTags((current) => current.filter((item) => item !== tag))}
          />
        ))}
        {tags.length === 0 ? (
          <Button label="Restore tags" size="sm" variant="secondary" onPress={() => setTags(['Accessibility', 'Theming'])} />
        ) : null}
      </Row>
    </Stack>
  );
}

function FloatingActionButtonPreview(): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.fabStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
      <Text role="caption" color="textMuted">An action pinned to the screen corner</Text>
      <FloatingActionButton label="New project" icon={plusIcon} onPress={() => {}} offset="lg" />
    </View>
  );
}

function ConfirmActionRowPreview(): ReactElement {
  const [state, setState] = useState<'idle' | 'confirmed' | 'cancelled'>('idle');
  return (
    <Stack>
      <ConfirmActionRow
        destructive
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onCancel={() => setState('cancelled')}
        onConfirm={() => setState('confirmed')}
      />
      <Text role="caption" color="textMuted">
        {state === 'idle' ? 'Nothing selected yet.' : state === 'confirmed' ? 'Deletion confirmed.' : 'Cancelled.'}
      </Text>
    </Stack>
  );
}

// ─── 입력 ───────────────────────────────────────────────────────────────────

function TextFieldPreview(): ReactElement {
  const [value, setValue] = useState('Design system refresh');
  return (
    <Stack>
      <TextField
        label="Project name"
        value={value}
        onChangeText={setValue}
        counter={`${value.length}/30`}
        helperText="Label, helper text, and counter share the same tokens."
      />
      <TextField label="Error state" value="" onChangeText={() => {}} error="This field is required." />
    </Stack>
  );
}

function SearchFieldPreview(): ReactElement {
  const [query, setQuery] = useState('');
  return (
    <Stack>
      <SearchField value={query} onChangeText={setQuery} />
      <Text role="caption" color="textMuted">
        {query ? `Searching for "${query}"` : 'The placeholder and icon are injected from UiProvider.'}
      </Text>
    </Stack>
  );
}

function FormFieldPreview(): ReactElement {
  const [email, setEmail] = useState('');
  const invalid = email.length > 0 && !email.includes('@');
  return (
    <FormField
      label="Work email"
      required
      requiredAccessibilityLabel="Work email (required)"
      helperText="Where the invitation will be sent."
      {...(invalid ? { error: 'Enter an address that contains @.' } : {})}
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
      label="Release channel"
      placeholder="Select a channel"
      items={[
        { value: 'stable', label: 'Stable' },
        { value: 'preview', label: 'Preview', description: 'Test builds' },
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
        label="I agree to the terms of service"
        description="The mixed state also resolves safely from boolean input."
      />
      <Checkbox checked onCheckedChange={() => {}} label="Disabled example" disabled />
    </Stack>
  );
}

function SwitchPreview(): ReactElement {
  const [enabled, setEnabled] = useState(true);
  return (
    <Stack>
      <Switch value={enabled} onValueChange={setEnabled} label="Product updates" description="Sent once a week." />
      <Switch value={false} onValueChange={() => {}} label="Disabled example" disabled size="sm" />
    </Stack>
  );
}

function RadioGroupPreview(): ReactElement {
  const [channel, setChannel] = useState<'push' | 'email' | 'sms'>('push');
  return (
    <RadioGroup
      accessibilityLabel="Notification channel"
      items={[
        { label: 'Push', value: 'push' },
        { label: 'Email', value: 'email' },
        { label: 'SMS', value: 'sms', disabled: true },
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
        <Text role="label">Notification volume</Text>
        <Text role="caption" color="textMuted">{volume}%</Text>
      </View>
      <Slider value={volume} min={0} max={100} step={5} accessibilityLabel="Notification volume" onValueChange={setVolume} />
    </Stack>
  );
}

function RatingPreview(): ReactElement {
  const [rating, setRating] = useState<number | undefined>(3.5);
  return (
    <Stack>
      <View style={styles.labelRow}>
        <Text role="label">Coffee rating</Text>
        <Text role="caption" color="textMuted">
          {rating === undefined ? 'No rating' : `${rating} out of 5`}
        </Text>
      </View>
      <Rating
        value={rating}
        onChange={setRating}
        halfStep
        clearable
        accessibilityLabel="Coffee rating"
      />
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
      <Button label="Toggle state" size="sm" variant="secondary" onPress={() => setSelected((value) => !value)} />
    </Row>
  );
}

function SelectableRowPreview(): ReactElement {
  const [selected, setSelected] = useState<'weekly' | 'product'>('weekly');
  return (
    <Surface padding="md" radius="md">
      <SelectableRow selected={selected === 'weekly'} onPress={() => setSelected('weekly')}>
        <View style={styles.rowCopy}>
          <Text role="label">Weekly review reminder</Text>
          <Text role="caption" color="textMuted">Every Sunday at 8 PM</Text>
        </View>
      </SelectableRow>
      <SelectableRow selected={selected === 'product'} onPress={() => setSelected('product')}>
        <View style={styles.rowCopy}>
          <Text role="label">Product updates</Text>
          <Text role="caption" color="textMuted">New component releases</Text>
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
        accessibilityLabel="List density"
        value={density}
        onValueChange={(next) => setDensity(next ?? 'comfortable')}
        allowEmpty={false}
        items={[
          { label: 'Spacious', value: 'spacious' },
          { label: 'Default', value: 'comfortable' },
          { label: 'Compact', value: 'compact' },
        ] as const}
      />
      <Text role="caption" color="textMuted">Selected: {density}</Text>
    </Stack>
  );
}

// ─── 탐색 ───────────────────────────────────────────────────────────────────

function TabsPreview(): ReactElement {
  const [tab, setTab] = useState<'preview' | 'code'>('preview');
  return (
    <Tabs
      accessibilityLabel="Preview tabs"
      items={[
        { label: 'Preview', value: 'preview' },
        { label: 'Code', value: 'code' },
      ] as const}
      value={tab}
      onChange={setTab}
      panels={{
        preview: <Text color="textMuted">Contents of the Preview panel.</Text>,
        code: <Text color="textMuted">Contents of the Code panel.</Text>,
      }}
    />
  );
}

function LinkPreview(): ReactElement {
  return (
    <Row>
      <Link href="https://www.npmjs.com/package/@gj-kit/expo-ui" target="_blank" rel="noopener noreferrer">
        Open the npm package
      </Link>
      <Link onPress={() => {}}>Action Link</Link>
    </Row>
  );
}

function CollapsiblePreview(): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <Collapsible title="Installation requirements" open={open} onOpenChange={setOpen} variant="outlined">
      <Text color="textMuted">React Native 0.79 or newer, TypeScript 5.x. No runtime dependencies.</Text>
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
          title: 'Why a controlled API?',
          content: <Text color="textMuted">App state and UI state always flow in one direction.</Text>,
        },
        {
          value: 'a11y',
          title: 'How much accessibility is built in?',
          content: <Text color="textMuted">Roles, states, keyboard movement, and panel relationships come by default.</Text>,
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
      accessibilityLabel="Payment history pages"
      page={page}
      totalItemCount={128}
      pageSize={20}
      getPageAccessibilityLabel={({ page: target, current }) =>
        current ? `Page ${target}, current page` : `Go to page ${target}`
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
        <Text role="caption" color="textMuted">This is the default.</Text>
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
      <Text role="caption" color="textMuted">ratio accepts only a finite number greater than zero.</Text>
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
          <Text role="caption" color="textMuted">Keeps the reading width fixed even on wide screens.</Text>
        </Surface>
      </ContentFrame>
    </View>
  );
}

function SectionPreview(): ReactElement {
  return (
    <Section
      title="Payment methods"
      subtitle="Only one card can be the default at a time."
      actions={<Button label="Add" size="sm" variant="secondary" onPress={() => {}} />}
    >
      <Surface padding="lg" radius="md">
        <Text color="textMuted">Section body goes here.</Text>
      </Surface>
    </Section>
  );
}

function StickyActionBarPreview(): ReactElement {
  const theme = useTheme();
  return (
    <View style={[styles.barStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
      <Text role="caption" color="textMuted">An action area pinned to the bottom of the screen</Text>
      <StickyActionBar>
        <Button label="Save changes" onPress={() => {}} />
      </StickyActionBar>
    </View>
  );
}

function DividerPreview(): ReactElement {
  return (
    <Surface padding="md" radius="md">
      <Text role="label">Item above</Text>
      <Divider />
      <Text role="label">Middle item</Text>
      <Divider inset="md" />
      <Text role="label">inset="md" Item below</Text>
    </Surface>
  );
}

// ─── Status · 진행 ────────────────────────────────────────────────────────────

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
      <Alert title="Theme saved" variant="success" live="polite">
        Semantic tokens apply immediately to every new screen.
      </Alert>
      <Alert title="This is a preview API" variant="warning">
        Not included in npm latest yet.
      </Alert>
    </Stack>
  );
}

function SpinnerPreview(): ReactElement {
  return (
    <Row>
      <Spinner accessibilityLabel="Loading" />
      <Spinner accessibilityLabel="Loading, small" size="sm" />
      <Text role="caption" color="textMuted">size comes from the theme metrics.</Text>
    </Row>
  );
}

function ProgressBarPreview(): ReactElement {
  const [value, setValue] = useState(72);
  return (
    <Stack>
      <ProgressBar value={value} accessibilityLabel="Document build progress" />
      <ProgressBar value={null} variant="info" accessibilityLabel="Sync progress" accessibilityValueText="Syncing" />
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
      <Text role="caption" color="textMuted">Initials and color derive from the name.</Text>
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
      title="No projects yet"
      body="Create your first project."
      action={{ label: 'Create a project', onPress: () => {} }}
    />
  );
}

function ErrorStatePreview(): ReactElement {
  return <ErrorState message="Check your network connection." onRetry={() => {}} />;
}

function ToastPreview(): ReactElement {
  const theme = useTheme();
  return (
    <Stack>
      <View style={[styles.toastStage, { backgroundColor: theme.colors.surfaceSubtle }]}>
        <Toast message="Document state saved." variant="success" bottomOffset={16} />
      </View>
      <Text role="caption" color="textMuted">
        A single Toast only computes position. Use ToastViewport when you need a queue.
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
          label="Success toast"
          size="sm"
          onPress={() => queue.show({ message: 'Document state saved.', variant: 'success' })}
        />
        <Button
          label="Error toast"
          size="sm"
          variant="destructive-outline"
          onPress={() => queue.show({ message: 'Saving failed.', variant: 'error' })}
        />
      </Row>
      <Text role="caption" color="textMuted">
        Shows at most two and queues the rest FIFO. Visible: {queue.visibleToasts.length}.
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
  { id: 'a', member: 'Ada Lovelace', amount: 128_000, status: 'Paid' },
  { id: 'b', member: 'Grace Hopper', amount: 54_000, status: 'Pending' },
  { id: 'c', member: 'Alan Turing', amount: 12_000, status: 'Failed' },
];

const PREVIEW_COLUMNS = [
  { id: 'member', header: 'Customer', sortable: true, getTextValue: ({ row }) => row.member },
  {
    id: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    getTextValue: ({ row }) => `₩${row.amount.toLocaleString('ko-KR')}`,
  },
  { id: 'status', header: 'Status', getTextValue: ({ row }) => row.status },
] as const satisfies readonly DataTableColumn<PreviewRow, 'member' | 'amount' | 'status', string>[];

function DataTablePreview(): ReactElement {
  const [sort, setSort] = useState<DataTableSort<'member' | 'amount'> | null>(null);
  const [selected, setSelected] = useState<readonly string[]>(['a']);
  return (
    <DataTable
      caption="Recent payments"
      description="Only the sort request and selection change; the app still owns row order."
      state={{ status: 'ready', rows: PREVIEW_ROWS }}
      columns={PREVIEW_COLUMNS}
      getRowKey={(row) => row.id}
      rowHeaderColumnId="member"
      sort={sort}
      onSortChange={setSort}
      selection={{
        selectedRowKeys: selected,
        onSelectionChange: setSelected,
        getRowSelectionAccessibilityLabel: ({ row }) => `Select payment from ${row.member}`,
        selectAllAccessibilityLabel: 'Select all shown payments',
        clearSelectionAccessibilityLabel: 'Clear selection of shown payments',
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
            variant={row.status === 'Paid' ? 'success' : row.status === 'Pending' ? 'warning' : 'error'}
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
      <Button label="Open Dialog" onPress={() => setVisible(true)} />
      <Dialog visible={visible} onDismiss={() => setVisible(false)}>
        <DialogPanel
          title="Delete this project?"
          description="This cannot be undone."
          footer={
            <ConfirmActionRow
              destructive
              confirmLabel="Delete"
              onCancel={() => setVisible(false)}
              onConfirm={() => setVisible(false)}
            />
          }
        >
          <Text color="textMuted">Deleting also removes the linked documents and settings.</Text>
        </DialogPanel>
      </Dialog>
      <Text role="caption" color="textMuted">
        Focus trap and Escape on web, Modal and Back on native, behind one API.
      </Text>
    </Stack>
  );
}

function DialogPanelPreview(): ReactElement {
  return (
    <Stack>
      <DialogPanel
        title="Usable as a standalone panel"
        description="Rendered without Dialog, so no close button appears."
        footer={<Button label="OK" onPress={() => {}} />}
      >
        <Text color="textMuted">A panel you can compose directly into an inline layout.</Text>
      </DialogPanel>
    </Stack>
  );
}

function ActionSheetPreview(): ReactElement {
  const [visible, setVisible] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  return (
    <Stack>
      <Button label="Open ActionSheet" onPress={() => setVisible(true)} />
      <ActionSheet
        visible={visible}
        title="Project actions"
        description="An adaptive action surface that keeps plain button semantics."
        items={[
          { value: 'duplicate', label: 'Duplicate project' },
          { value: 'delete', label: 'Delete project', description: 'This cannot be recovered.', destructive: true },
        ] as const}
        onDismiss={(detail) => {
          setVisible(false);
          if (detail.reason === 'action-select') setLast(detail.value);
        }}
      />
      <Text role="caption" color="textMuted">
        {last ? `Last selected: ${last}` : 'No action selected yet.'}
      </Text>
    </Stack>
  );
}

function SheetPreview(): ReactElement {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Design system refresh');
  return (
    <Stack>
      <Button label="Open Sheet" onPress={() => setOpen(true)} />
      <Sheet
        open={open}
        title="Project settings"
        description="Shown at the logical end on desktop and at the bottom on small screens."
        footer={<Button label="Save settings" onPress={() => setOpen(false)} />}
        onOpenChange={setOpen}
      >
        <TextField label="Project name" value={name} onChangeText={setName} />
        <Text role="caption" color="textMuted">The header and footer stay pinned; only the body scrolls.</Text>
      </Sheet>
    </Stack>
  );
}

function PopoverPreview(): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      triggerLabel="Account help"
      title="Account details"
      description="controlled rich overlay"
      open={open}
      onOpenChange={setOpen}
      variant="outlined"
    >
      <Text>You can change profile visibility any time in settings.</Text>
    </Popover>
  );
}

function TooltipPreview(): ReactElement {
  return (
    <Tooltip
      triggerLabel="Overlay help"
      triggerIcon={sparkIcon}
      content="A visual tooltip on web and an accessibility hint on native."
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
        triggerLabel="Project actions"
        items={[
          { kind: 'action', value: 'duplicate', label: 'Duplicate project' },
          { kind: 'checkbox', value: 'compact', label: 'Compact view', checked: compact },
          { kind: 'action', value: 'delete', label: 'Delete project', destructive: true },
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
        {last ? `Last action: ${last}` : 'Compact view'} · {compact ? 'on' : 'off'}
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
  rating: RatingPreview,
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
