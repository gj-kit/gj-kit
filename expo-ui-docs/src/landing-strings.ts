import type { Locale } from './locale';

/**
 * 랜딩(`/`)의 모든 본문 카피. JSX에 문구를 박아 두면 로케일 전환이 불가능해
 * 여기로 뽑았다. 화면 장치 라벨(헤더·푸터 공통)은 site-strings.ts에 있다.
 */
export type LandingStrings = {
  readonly metaTitle: string;
  readonly metaDescription: string;
  readonly schemaDescription: string;

  readonly homeLabel: string;
  readonly navWhy: string;
  readonly navComponents: string;
  readonly navTheme: string;

  readonly heroTitleLead: string;
  readonly heroTitleAccent: string;
  readonly heroDescription: string;
  readonly heroCtaStart: string;
  readonly heroCtaComponents: string;
  readonly heroProofs: readonly string[];
  readonly copyInstallLabel: (command: string) => string;
  readonly copiedToast: string;

  readonly previewDate: string;
  readonly previewTitle: string;
  readonly previewSearchPlaceholder: string;
  readonly previewFocusTitle: string;
  readonly previewFocusCaption: string;
  readonly previewRangeLabel: string;
  readonly previewToday: string;
  readonly previewWeek: string;
  readonly previewTodayRows: readonly { readonly title: string; readonly caption: string }[];
  readonly previewWeekRow: { readonly title: string; readonly caption: string };
  readonly previewCtaDone: string;
  readonly previewCtaPick: string;

  readonly proofSourceComponents: string;
  readonly proofColorRoles: string;
  readonly proofRuntimeDeps: string;
  readonly proofTests: string;

  readonly typeSafetyTitle: string;
  readonly typeSafetyDescription: string;
  readonly typeSafetyErrorMessage: string;
  readonly typeSafetyOkMessage: string;
  readonly typeSafetyLabelLine: string;
  readonly typeSafetyFeatures: readonly {
    readonly symbol: string;
    readonly title: string;
    readonly description: string;
  }[];

  readonly componentsTitle: string;
  readonly componentsDescription: string;
  readonly componentsNpmCta: string;
  readonly componentsCategories: Readonly<Record<DemoCategoryKey, string>>;
  readonly componentsCanvasCaption: string;
  readonly componentsIndexTitle: (count: number) => string;
  readonly componentsSnippets: Readonly<Record<DemoCategoryKey, string>>;

  readonly dialogTitle: string;
  readonly dialogDescription: string;
  readonly dialogCancel: string;
  readonly dialogConfirm: string;
  readonly dialogToast: string;
  readonly actionSheetTitle: string;
  readonly actionSheetDescription: string;
  readonly actionSheetDuplicate: string;
  readonly actionSheetDelete: string;
  readonly actionSheetDeleteHint: string;
  readonly actionSheetToast: (value: string) => string;
  readonly sheetTitle: string;
  readonly sheetDescription: string;
  readonly sheetSave: string;
  readonly sheetToast: string;
  readonly sheetProjectName: string;
  readonly sheetCaption: string;

  readonly demoSave: string;
  readonly demoSaveToast: string;
  readonly demoPreview: string;
  readonly demoPreviewToast: string;
  readonly demoDelete: string;
  readonly demoSyncing: string;
  readonly demoFavorite: string;
  readonly demoFavoriteToast: string;
  readonly demoActionsCaption: string;
  readonly demoProjectNameHelper: string;
  readonly demoViewLabel: string;
  readonly demoPreviewPanel: string;
  readonly demoCodePanel: string;

  readonly demoNotificationPrefs: string;
  readonly demoTermsLabel: string;
  readonly demoTermsDescription: string;
  readonly demoNewsLabel: string;
  readonly demoNewsDescription: string;
  readonly demoChannelLabel: string;
  readonly demoChannelPush: string;
  readonly demoChannelEmail: string;
  readonly demoChannelSms: string;
  readonly demoVolumeLabel: string;
  readonly demoDensityLabel: string;
  readonly demoDensitySpacious: string;
  readonly demoDensityComfortable: string;
  readonly demoDensityCompact: string;

  readonly demoSelectionTitle: string;
  readonly demoSelectionCaption: string;
  readonly demoSelectionRows: readonly { readonly title: string; readonly caption: string }[];

  readonly demoLayoutTitle: string;

  readonly demoAlertTitle: string;
  readonly demoAlertBody: string;
  readonly demoProgressDocs: string;
  readonly demoProgressSync: string;
  readonly demoProgressSyncValue: string;
  readonly demoSpinnerLabel: string;
  readonly demoStatusCaption: string;

  readonly demoProfileToast: string;
  readonly demoAccordion: readonly { readonly title: string; readonly content: string }[];

  readonly demoTableCaption: string;
  readonly demoTableDescription: string;
  readonly demoTableColumnMember: string;
  readonly demoTableColumnAmount: string;
  readonly demoTableColumnStatus: string;
  readonly demoTableStatus: Readonly<Record<'done' | 'pending' | 'failed', string>>;
  readonly demoTableRowSelectLabel: (member: string) => string;
  readonly demoTableSelectAll: string;
  readonly demoTableClearSelection: string;
  readonly demoTableSortCleared: string;
  readonly demoTableSortRequested: (column: string, direction: string) => string;
  readonly demoTableAscending: string;
  readonly demoTableDescending: string;
  readonly demoTableSelectionSummary: (count: number) => string;
  readonly demoPaginationLabel: string;
  readonly demoPageLabel: (page: number, current: boolean) => string;

  readonly demoEmptyTitle: string;
  readonly demoEmptyBody: string;
  readonly demoEmptyAction: string;
  readonly demoEmptyToast: string;
  readonly demoErrorMessage: string;
  readonly demoErrorToast: string;
  readonly demoQueueTitle: string;
  readonly demoQueueCaption: string;
  readonly demoQueueButton: string;
  readonly demoQueueToast: string;

  readonly demoOverlayTitle: string;
  readonly demoOverlayCopy: string;
  readonly demoReleaseChannel: string;
  readonly demoReleaseChannelPlaceholder: string;
  readonly demoReleaseChannelPreviewHint: string;
  readonly demoMenuTrigger: string;
  readonly demoMenuDuplicate: string;
  readonly demoMenuCompact: string;
  readonly demoMenuDelete: string;
  readonly demoMenuToast: (value: string) => string;
  readonly demoPopoverTrigger: string;
  readonly demoPopoverTitle: string;
  readonly demoPopoverBody: string;
  readonly demoTooltipTrigger: string;
  readonly demoTooltipContent: string;
  readonly demoTooltipToast: string;
  readonly demoOpenDialog: string;
  readonly demoOpenSheet: string;
  readonly demoOpenActionSheet: string;

  readonly themeTitle: string;
  readonly themeDescription: string;
  readonly themeGuaranteeTitle: string;
  readonly themeGuaranteeBody: string;
  readonly quickStartTitle: string;
  readonly quickStartSteps: readonly string[];
  readonly quickStartCode: string;

  readonly platformTitle: string;
  readonly platformDescription: string;
  readonly platformItems: readonly {
    readonly eyebrow: string;
    readonly symbol: string;
    readonly title: string;
    readonly description: string;
    readonly code: string;
  }[];

  readonly finalTitle: string;
  readonly finalDescription: string;
  readonly finalDocsLink: string;

  readonly footerTagline: string;
  readonly footerHome: string;
  readonly footerDocs: string;
  readonly footerComponents: string;
  readonly footerGettingStarted: string;
};

export type DemoCategoryKey =
  | 'actions'
  | 'forms'
  | 'controls'
  | 'selection'
  | 'layout'
  | 'status'
  | 'display'
  | 'data'
  | 'feedback'
  | 'dialog';

const en: LandingStrings = {
  metaTitle: 'Expo & React Native UI library | @gj-kit/expo-ui',
  metaDescription:
    'A TypeScript UI component library for Expo and React Native that makes invalid UI states hard to write. Token-based light and dark themes, accessibility contracts, React Native Web support, and safe-area plus keyboard utilities.',
  schemaDescription: 'Type-safe UI component library for Expo and React Native',

  homeLabel: '@gj-kit/expo-ui home',
  navWhy: 'Why gj-kit',
  navComponents: 'Components',
  navTheme: 'Theme',

  heroTitleLead: 'Expo & React Native UI,',
  heroTitleAccent: 'hard to get wrong.',
  heroDescription:
    'Theme tokens and accessibility contracts live in the TypeScript API. Keep one design language across Expo, bare React Native, and the web — with the compiler on your side.',
  heroCtaStart: 'Get started',
  heroCtaComponents: 'Browse components',
  heroProofs: ['Expo & bare RN', 'React Native ≥ 0.79', 'TypeScript first'],
  copyInstallLabel: (command) => `Copy the install command: ${command}`,
  copiedToast: 'Copied to clipboard.',

  previewDate: 'MONDAY, AUG 10',
  previewTitle: "Today's focus",
  previewSearchPlaceholder: 'Search notes',
  previewFocusTitle: 'Polish the UI library',
  previewFocusCaption: '2 tasks left',
  previewRangeLabel: 'Range',
  previewToday: 'Today',
  previewWeek: 'This week',
  previewTodayRows: [
    { title: 'Review component APIs', caption: 'Type contracts reject invalid states' },
    { title: 'Check the dark theme', caption: 'No missing tokens' },
  ],
  previewWeekRow: {
    title: 'Accessibility regression pass',
    caption: 'Keyboard and screen reader contracts',
  },
  previewCtaDone: 'Finish today',
  previewCtaPick: 'Pick a task',

  proofSourceComponents: 'Source components',
  proofColorRoles: 'Color roles',
  proofRuntimeDeps: 'Direct runtime deps',
  proofTests: '534 unit + 91 type',

  typeSafetyTitle: 'A compile error, before a broken screen.',
  typeSafetyDescription:
    'Missing accessibility labels, dead actions, and typo-ed token keys surface right where you use them. Catch while writing what you would otherwise find after the app is running.',
  typeSafetyErrorMessage: '× Property accessibilityLabel is required.',
  typeSafetyOkMessage: '✓ The screen reader contract lives in the props.',
  typeSafetyLabelLine: '  accessibilityLabel="Open settings"',
  typeSafetyFeatures: [
    {
      symbol: 'T',
      title: 'Complete themes only',
      description:
        'The Provider accepts only full token objects built through createTheme. Half-finished themes cannot sneak in.',
    },
    {
      symbol: 'A',
      title: 'Accessibility as API',
      description:
        'Easy-to-forget contracts — like an IconButton label and its action handler — are modeled as required props.',
    },
    {
      symbol: '↗',
      title: 'Your app owns the extensions',
      description:
        'Inject your own strings and icons; NativeWind stays optional. The library never takes over decisions your app should make.',
    },
  ],

  componentsTitle: 'Real components beat any description.',
  componentsDescription:
    'Every demo on this page imports the published package directly. Switch the theme, type into the fields, press the buttons.',
  componentsNpmCta: 'View on npm',
  componentsCategories: {
    actions: 'Actions',
    forms: 'Forms',
    controls: 'Controls',
    selection: 'Selection',
    layout: 'Layout',
    status: 'Status',
    display: 'Display',
    data: 'Data',
    feedback: 'Feedback',
    dialog: 'Overlay',
  },
  componentsCanvasCaption: 'Change the state for real.',
  componentsIndexTitle: (count) => `${count} small parts, one design language`,
  componentsSnippets: {
    actions: `<Button label="Save" onPress={save} />\n<Button variant="secondary" label="Preview" onPress={preview} />\n<IconButton accessibilityLabel="Open settings" icon={Settings} onPress={openSettings} />`,
    forms: `<SearchField value={query} onChangeText={setQuery} />\n<TextField\n  label="Project name"\n  counter={\`\${name.length}/30\`}\n/>`,
    controls: `const [volume, setVolume] = useState(60);\n\n<Slider\n  value={volume}\n  min={0}\n  max={100}\n  step={5}\n  accessibilityLabel="Notification volume"\n  onValueChange={setVolume}\n/>\n<ToggleGroup\n  selectionMode="single"\n  value={density}\n  onValueChange={setDensity}\n  accessibilityLabel="List density"\n  items={densityItems}\n  allowEmpty={false}\n/>`,
    selection: `<SelectableRow\n  selected={selected}\n  onPress={() => setSelected(!selected)}\n>\n  <Text>Weekly review reminder</Text>\n</SelectableRow>`,
    layout: `<Surface padding="xl" radius="lg" elevation="sm">\n  <Text role="title">Assemble it from tokens.</Text>\n  <Text color="textMuted">Spacing, radius, and elevation included.</Text>\n</Surface>`,
    status: `<Badge label="New" variant="success" />\n<Alert title="Saved" variant="success" live="polite" />\n<ProgressBar value={72} accessibilityLabel="Upload progress" />\n<ProgressBar value={null} accessibilityLabel="Sync progress" />\n<Spinner accessibilityLabel="Loading" />`,
    display: `<ListItem\n  title="Ada Lovelace"\n  description="Core contributor"\n  leading={<Avatar name="Ada Lovelace" decorative />}\n  onPress={openProfile}\n/>\n<Divider />\n<Accordion items={sections} value={open} onValueChange={setOpen} />`,
    data: `const [page, setPage] = useState(1);\nconst [sort, setSort] = useState<DataTableSort<'member' | 'amount'> | null>(null);\nconst [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);\n\n<DataTable\n  caption="Recent payments"\n  state={{ status: 'ready', rows: currentPageRows }}\n  columns={columns}\n  getRowKey={(row) => row.id}\n  rowHeaderColumnId="member"\n  sort={sort}\n  onSortChange={(next) => {\n    setSort(next);\n    notifySort(next); // Your app still owns row order.\n  }}\n  selection={{\n    selectedRowKeys: selectedKeys,\n    onSelectionChange: setSelectedKeys,\n    getRowSelectionAccessibilityLabel: ({ row }) => \`Select payment from \${row.member}\`,\n  }}\n  presentation="auto"\n  renderListRow={({ row }) => <PaymentRow payment={row} />}\n/>\n<Pagination\n  mode="numbered"\n  countMode="items"\n  accessibilityLabel="Payment pages"\n  page={page}\n  totalItemCount={totalItemCount}\n  pageSize={3}\n  onPageChange={setPage}\n/>`,
    feedback: `const queue = useToastQueue({ maxVisible: 2 });\n\n<Button label="Save" onPress={() => queue.show({ message: 'Saved', variant: 'success' })} />\n<ToastViewport\n  toasts={queue.visibleToasts}\n  onDismiss={queue.dismiss}\n  onPause={queue.pause}\n  onResume={queue.resume}\n/>`,
    dialog: `<Popover\n  triggerLabel="Account help"\n  title="Account details"\n  open={popoverOpen}\n  onOpenChange={(next) => setPopoverOpen(next)}\n>\n  <Text>Choose who can see your profile.</Text>\n</Popover>\n<Sheet\n  open={sheetOpen}\n  title="Project settings"\n  onOpenChange={(next) => setSheetOpen(next)}\n  footer={<Button label="Save" onPress={save} />}\n>\n  <TextField label="Project name" value={name} />\n</Sheet>`,
  },

  dialogTitle: 'Delete this project?',
  dialogDescription: 'A real example composed from Dialog, DialogPanel, and ConfirmActionRow.',
  dialogCancel: 'No',
  dialogConfirm: 'Delete',
  dialogToast: 'That was the delete example.',
  actionSheetTitle: 'Project actions',
  actionSheetDescription: 'An adaptive action surface that keeps plain button semantics.',
  actionSheetDuplicate: 'Duplicate project',
  actionSheetDelete: 'Delete project',
  actionSheetDeleteHint: 'This cannot be undone.',
  actionSheetToast: (value) => `You picked the ${value} action.`,
  sheetTitle: 'Project settings',
  sheetDescription: 'Anchored to the logical end on desktop, to the bottom on small screens.',
  sheetSave: 'Save settings',
  sheetToast: 'Sheet settings saved.',
  sheetProjectName: 'Project name',
  sheetCaption: 'The header and footer stay put; only this body scrolls.',

  demoSave: 'Save',
  demoSaveToast: 'Saved safely.',
  demoPreview: 'Preview',
  demoPreviewToast: 'This is the preview.',
  demoDelete: 'Delete',
  demoSyncing: 'Syncing',
  demoFavorite: 'Favorite',
  demoFavoriteToast: 'Added to favorites.',
  demoActionsCaption: '7 variants · 3 sizes · loading · disabled · icon',
  demoProjectNameHelper: 'Input, label, and helper all read from the same tokens.',
  demoViewLabel: 'Demo view',
  demoPreviewPanel: 'The Preview panel is selected.',
  demoCodePanel: 'The Code panel is selected.',

  demoNotificationPrefs: 'Notification preferences',
  demoTermsLabel: 'I agree to the terms of service',
  demoTermsDescription: 'Mixed state converts safely to a boolean input.',
  demoNewsLabel: 'Product announcements',
  demoNewsDescription: 'Keeps the native Switch keyboard and screen reader behavior.',
  demoChannelLabel: 'Notification channel',
  demoChannelPush: 'Push',
  demoChannelEmail: 'Email',
  demoChannelSms: 'SMS',
  demoVolumeLabel: 'Notification volume',
  demoDensityLabel: 'List density',
  demoDensitySpacious: 'Spacious',
  demoDensityComfortable: 'Default',
  demoDensityCompact: 'Compact',

  demoSelectionTitle: 'Notification settings',
  demoSelectionCaption: 'Selection state and accessibility state change together.',
  demoSelectionRows: [
    { title: 'Weekly review reminder', caption: 'Every Sunday at 8pm' },
    { title: 'Product updates', caption: 'News about new components' },
  ],

  demoLayoutTitle: 'Assemble it from tokens.',

  demoAlertTitle: 'New theme saved',
  demoAlertBody: 'Semantic tokens apply to every new screen immediately.',
  demoProgressDocs: 'Document generation progress',
  demoProgressSync: 'Component sync progress',
  demoProgressSyncValue: 'Syncing',
  demoSpinnerLabel: 'Loading components',
  demoStatusCaption: 'determinate · indeterminate · localized loading',

  demoProfileToast: 'Opened the profile.',
  demoAccordion: [
    {
      title: 'Why a controlled API?',
      content: 'App state and UI state always flow in one direction.',
    },
    {
      title: 'How far does accessibility go?',
      content: 'Roles, states, keyboard movement, and panel relationships ship by default.',
    },
  ],

  demoTableCaption: 'Recent payments',
  demoTableDescription:
    'Only the sort request and selection state change — your app keeps owning row order.',
  demoTableColumnMember: 'Customer',
  demoTableColumnAmount: 'Amount',
  demoTableColumnStatus: 'Status',
  demoTableStatus: { done: 'Paid', pending: 'Pending', failed: 'Failed' },
  demoTableRowSelectLabel: (member) => `Select payment from ${member}`,
  demoTableSelectAll: 'Select every visible payment',
  demoTableClearSelection: 'Clear the visible payment selection',
  demoTableSortCleared: 'Sorting cleared. Row order is unchanged.',
  demoTableSortRequested: (column, direction) => `Requested ${column} ${direction}.`,
  demoTableAscending: 'ascending',
  demoTableDescending: 'descending',
  demoTableSelectionSummary: (count) =>
    `${count} selected · failed rows cannot be selected`,
  demoPaginationLabel: 'Payment pages',
  demoPageLabel: (page, current) => `Page ${page}${current ? ' (current)' : ''}`,

  demoEmptyTitle: 'No projects yet',
  demoEmptyBody: 'Create your first project to get going.',
  demoEmptyAction: 'Create a project',
  demoEmptyToast: 'Starting a new project.',
  demoErrorMessage: 'Check your network connection.',
  demoErrorToast: 'Trying again.',
  demoQueueTitle: 'ToastViewport · FIFO queue',
  demoQueueCaption:
    'Shows at most two at a time and preserves the remaining time in hidden tabs and backgrounded apps.',
  demoQueueButton: 'Queue a save toast',
  demoQueueToast: 'Document state saved.',

  demoOverlayTitle: 'The same language, even when you need confirmation.',
  demoOverlayCopy:
    'From a web non-modal to a native adaptive Dialog and its accessibility hints — one API boundary adapts to each.',
  demoReleaseChannel: 'Release channel',
  demoReleaseChannelPlaceholder: 'Choose a channel',
  demoReleaseChannelPreviewHint: 'Test builds',
  demoMenuTrigger: 'Project actions',
  demoMenuDuplicate: 'Duplicate project',
  demoMenuCompact: 'Compact view',
  demoMenuDelete: 'Delete project',
  demoMenuToast: (value) => `You picked the ${value} menu item.`,
  demoPopoverTrigger: 'Account help',
  demoPopoverTitle: 'Account details',
  demoPopoverBody: 'You can change who sees your profile at any time in settings.',
  demoTooltipTrigger: 'Overlay help',
  demoTooltipContent:
    'A visual description on the web, an accessibility hint on native.',
  demoTooltipToast: 'Opened the overlay help.',
  demoOpenDialog: 'Open Dialog',
  demoOpenSheet: 'Open Sheet',
  demoOpenActionSheet: 'Open ActionSheet',

  themeTitle: 'Decide once, and every screen moves with you.',
  themeDescription:
    '31 color roles, 7 typography roles, plus spacing, radius, elevation, and metrics — managed as one complete theme. Build light and dark as a pair and follow the system setting.',
  themeGuaranteeTitle: 'ThemePair completeness, guaranteed',
  themeGuaranteeBody: 'There is no way to end up with light or dark half-filled.',
  quickStartTitle: 'Three minutes to your first screen.',
  quickStartSteps: ['Create the theme', 'Mount the Provider', 'Use the components'],
  quickStartCode: `import { UiProvider, Button, enStrings } from '@gj-kit/expo-ui';\nimport { createThemes } from '@gj-kit/expo-ui/theme';\n\nconst themes = createThemes();\n\nexport function App() {\n  return (\n    <UiProvider theme={themes} strings={enStrings}>\n      <Button label="Get started" onPress={() => {}} />\n    </UiProvider>\n  );\n}`,

  platformTitle: 'Behind the web demo, it knows native reality.',
  platformDescription:
    'The platform problems that actually keep recurring in Expo apps, solved with small utilities and clear boundaries.',
  platformItems: [
    {
      eyebrow: '/INSETS',
      symbol: '⌁',
      title: 'Safe area and the keyboard',
      description:
        'Battle-tested utilities for bottom insets and for keyboard overlap inside Android edge-to-edge Modals.',
      code: 'useModalKeyboardOverlap()',
    },
    {
      eyebrow: '/TAILWIND',
      symbol: '#',
      title: 'NativeWind stays optional',
      description:
        'className passthrough and a Tailwind preset derived from your theme — without depending on NativeWind itself.',
      code: 'createTailwindPreset(theme)',
    },
    {
      eyebrow: 'STRINGS + ICONS',
      symbol: '文',
      title: 'Your app, in your language',
      description:
        'Inject English or Korean strings and your own icon renderers through the Provider. No wrapper layer needed.',
      code: 'strings={enStrings}',
    },
  ],

  finalTitle: 'Good UI starts from good constraints.',
  finalDescription: 'Light to install. Firm about themes and accessibility contracts.',
  finalDocsLink: 'Start from the docs',

  footerTagline: 'Type-safe primitives for Expo & React Native.',
  footerHome: 'Home',
  footerDocs: 'Docs',
  footerComponents: 'Components',
  footerGettingStarted: 'Getting started',
};

const ko: LandingStrings = {
  metaTitle: 'Expo·React Native UI 라이브러리 | @gj-kit/expo-ui',
  metaDescription:
    'TypeScript로 잘못된 UI 상태를 줄이는 Expo·React Native 컴포넌트 라이브러리입니다. 토큰 기반 light·dark 테마, 접근성 계약, React Native Web과 safe-area·키보드 유틸을 제공합니다.',
  schemaDescription: 'Expo와 React Native를 위한 타입 안전 UI 컴포넌트 라이브러리',

  homeLabel: '@gj-kit/expo-ui 홈',
  navWhy: '왜 gj-kit인가',
  navComponents: '컴포넌트',
  navTheme: '테마',

  heroTitleLead: 'Expo·React Native UI,',
  heroTitleAccent: '실수할 수 없게.',
  heroDescription:
    '토큰 기반 테마와 접근성 계약을 TypeScript API에 담았습니다. Expo, bare React Native, Web에서 같은 설계 언어를 더 안전하게 유지하세요.',
  heroCtaStart: '빠르게 시작하기',
  heroCtaComponents: '컴포넌트 보기',
  heroProofs: ['Expo & bare RN', 'React Native ≥ 0.79', 'TypeScript first'],
  copyInstallLabel: (command) => `${command} 설치 명령 복사`,
  copiedToast: '클립보드에 복사했습니다.',

  previewDate: 'MONDAY, AUG 10',
  previewTitle: '오늘의 포커스',
  previewSearchPlaceholder: '기록 검색',
  previewFocusTitle: 'UI 라이브러리 다듬기',
  previewFocusCaption: '완료까지 2개의 작업',
  previewRangeLabel: '기간',
  previewToday: '오늘',
  previewWeek: '이번 주',
  previewTodayRows: [
    { title: '컴포넌트 API 검토', caption: '타입 계약으로 잘못된 상태 차단' },
    { title: '다크 테마 확인', caption: '토큰 누락 없이' },
  ],
  previewWeekRow: {
    title: '접근성 회귀 테스트',
    caption: '키보드와 스크린리더 계약',
  },
  previewCtaDone: '오늘 작업 완료',
  previewCtaPick: '작업 선택하기',

  proofSourceComponents: '소스 컴포넌트',
  proofColorRoles: '색 역할',
  proofRuntimeDeps: '직접 런타임 의존성',
  proofTests: 'unit 534 + type 91',

  typeSafetyTitle: '깨진 UI보다 먼저 오는 컴파일 에러.',
  typeSafetyDescription:
    '접근성 라벨 누락, 죽은 액션, 존재하지 않는 토큰 키를 사용 지점에서 바로 드러냅니다. 앱이 실행된 뒤 발견할 문제를 코드 작성 중에 줄이세요.',
  typeSafetyErrorMessage: '× accessibilityLabel 속성이 필요합니다.',
  typeSafetyOkMessage: '✓ 스크린리더 계약이 props에 포함됩니다.',
  typeSafetyLabelLine: '  accessibilityLabel="설정 열기"',
  typeSafetyFeatures: [
    {
      symbol: 'T',
      title: '완성된 테마만',
      description:
        'createTheme을 거친 완전한 토큰 객체만 Provider가 받습니다. 반쪽 테마가 숨어들지 않습니다.',
    },
    {
      symbol: 'A',
      title: '접근성을 API로',
      description:
        'IconButton의 라벨과 액션 핸들러처럼 빠뜨리기 쉬운 계약을 필수 prop으로 표현합니다.',
    },
    {
      symbol: '↗',
      title: '앱이 소유하는 확장',
      description:
        '문구와 아이콘은 주입하고, NativeWind는 선택합니다. 라이브러리가 앱의 결정을 가로채지 않습니다.',
    },
  ],

  componentsTitle: '설명보다 빠른, 실제 컴포넌트.',
  componentsDescription:
    '이 페이지의 데모는 배포 패키지를 직접 import합니다. 테마를 바꾸고, 입력하고, 눌러보세요.',
  componentsNpmCta: 'npm에서 보기',
  componentsCategories: {
    actions: '액션',
    forms: '폼',
    controls: '컨트롤',
    selection: '선택',
    layout: '레이아웃',
    status: '상태',
    display: '표시',
    data: '데이터',
    feedback: '피드백',
    dialog: '오버레이',
  },
  componentsCanvasCaption: '실제 상태를 바꿔보세요.',
  componentsIndexTitle: (count) => `${count}개의 작은 조각, 하나의 설계 언어`,
  componentsSnippets: {
    actions: `<Button label="저장" onPress={save} />\n<Button variant="secondary" label="미리보기" onPress={preview} />\n<IconButton accessibilityLabel="설정 열기" icon={Settings} onPress={openSettings} />`,
    forms: `<SearchField value={query} onChangeText={setQuery} />\n<TextField\n  label="프로젝트 이름"\n  counter={\`\${name.length}/30\`}\n/>`,
    controls: `const [volume, setVolume] = useState(60);\n\n<Slider\n  value={volume}\n  min={0}\n  max={100}\n  step={5}\n  accessibilityLabel="알림 음량"\n  onValueChange={setVolume}\n/>\n<ToggleGroup\n  selectionMode="single"\n  value={density}\n  onValueChange={setDensity}\n  accessibilityLabel="목록 밀도"\n  items={densityItems}\n  allowEmpty={false}\n/>`,
    selection: `<SelectableRow\n  selected={selected}\n  onPress={() => setSelected(!selected)}\n>\n  <Text>주간 회고 알림</Text>\n</SelectableRow>`,
    layout: `<Surface padding="xl" radius="lg" elevation="sm">\n  <Text role="title">토큰으로 조립하세요.</Text>\n  <Text color="textMuted">간격, 라운드, 그림자까지.</Text>\n</Surface>`,
    status: `<Badge label="New" variant="success" />\n<Alert title="저장했습니다" variant="success" live="polite" />\n<ProgressBar value={72} accessibilityLabel="업로드 진행률" />\n<ProgressBar value={null} accessibilityLabel="동기화 진행률" />\n<Spinner accessibilityLabel="불러오는 중" />`,
    display: `<ListItem\n  title="Ada Lovelace"\n  description="Core contributor"\n  leading={<Avatar name="Ada Lovelace" decorative />}\n  onPress={openProfile}\n/>\n<Divider />\n<Accordion items={sections} value={open} onValueChange={setOpen} />`,
    data: `const [page, setPage] = useState(1);\nconst [sort, setSort] = useState<DataTableSort<'member' | 'amount'> | null>(null);\nconst [selectedKeys, setSelectedKeys] = useState<readonly string[]>([]);\n\n<DataTable\n  caption="최근 결제"\n  state={{ status: 'ready', rows: currentPageRows }}\n  columns={columns}\n  getRowKey={(row) => row.id}\n  rowHeaderColumnId="member"\n  sort={sort}\n  onSortChange={(next) => {\n    setSort(next);\n    notifySort(next); // rows 순서는 앱이 소유합니다.\n  }}\n  selection={{\n    selectedRowKeys: selectedKeys,\n    onSelectionChange: setSelectedKeys,\n    getRowSelectionAccessibilityLabel: ({ row }) => \`\${row.member} 결제 선택\`,\n  }}\n  presentation="auto"\n  renderListRow={({ row }) => <PaymentRow payment={row} />}\n/>\n<Pagination\n  mode="numbered"\n  countMode="items"\n  accessibilityLabel="결제 페이지"\n  page={page}\n  totalItemCount={totalItemCount}\n  pageSize={3}\n  onPageChange={setPage}\n/>`,
    feedback: `const queue = useToastQueue({ maxVisible: 2 });\n\n<Button label="저장" onPress={() => queue.show({ message: '저장했습니다', variant: 'success' })} />\n<ToastViewport\n  toasts={queue.visibleToasts}\n  onDismiss={queue.dismiss}\n  onPause={queue.pause}\n  onResume={queue.resume}\n/>`,
    dialog: `<Popover\n  triggerLabel="계정 도움말"\n  title="계정 정보"\n  open={popoverOpen}\n  onOpenChange={(next) => setPopoverOpen(next)}\n>\n  <Text>프로필 공개 범위를 설정합니다.</Text>\n</Popover>\n<Sheet\n  open={sheetOpen}\n  title="프로젝트 설정"\n  onOpenChange={(next) => setSheetOpen(next)}\n  footer={<Button label="저장" onPress={save} />}\n>\n  <TextField label="프로젝트 이름" value={name} />\n</Sheet>`,
  },

  dialogTitle: '프로젝트를 삭제할까요?',
  dialogDescription: 'Dialog, DialogPanel, ConfirmActionRow를 조합한 실제 예제입니다.',
  dialogCancel: '아니요',
  dialogConfirm: '삭제',
  dialogToast: '삭제 예제를 확인했습니다.',
  actionSheetTitle: '프로젝트 작업',
  actionSheetDescription: '일반 button 의미를 유지하는 adaptive action surface입니다.',
  actionSheetDuplicate: '프로젝트 복제',
  actionSheetDelete: '프로젝트 삭제',
  actionSheetDeleteHint: '복구할 수 없습니다.',
  actionSheetToast: (value) => `${value} 액션을 선택했습니다.`,
  sheetTitle: '프로젝트 설정',
  sheetDescription: '데스크톱에서는 logical end, 작은 화면에서는 bottom에 표시됩니다.',
  sheetSave: '설정 저장',
  sheetToast: 'Sheet 설정을 저장했습니다.',
  sheetProjectName: '프로젝트 이름',
  sheetCaption: 'header와 footer는 고정되고 이 본문만 스크롤됩니다.',

  demoSave: '저장',
  demoSaveToast: '안전하게 저장했습니다.',
  demoPreview: '미리보기',
  demoPreviewToast: '미리보기입니다.',
  demoDelete: '삭제',
  demoSyncing: '동기화 중',
  demoFavorite: '즐겨찾기',
  demoFavoriteToast: '즐겨찾기에 추가했습니다.',
  demoActionsCaption: '7 variants · 3 sizes · loading · disabled · icon',
  demoProjectNameHelper: '입력, 라벨, 헬퍼가 같은 토큰을 사용합니다.',
  demoViewLabel: '데모 보기',
  demoPreviewPanel: 'Preview 패널이 선택되었습니다.',
  demoCodePanel: 'Code 패널이 선택되었습니다.',

  demoNotificationPrefs: '알림 환경설정',
  demoTermsLabel: '이용 약관에 동의합니다',
  demoTermsDescription: 'mixed 상태도 boolean 입력으로 안전하게 전환합니다.',
  demoNewsLabel: '새 소식 알림',
  demoNewsDescription: '네이티브 Switch의 키보드·스크린리더 동작을 보존합니다.',
  demoChannelLabel: '알림 채널',
  demoChannelPush: '푸시',
  demoChannelEmail: '이메일',
  demoChannelSms: '문자',
  demoVolumeLabel: '알림 음량',
  demoDensityLabel: '목록 밀도',
  demoDensitySpacious: '여유',
  demoDensityComfortable: '기본',
  demoDensityCompact: '압축',

  demoSelectionTitle: '알림 설정',
  demoSelectionCaption: '선택 상태와 접근성 상태가 함께 바뀝니다.',
  demoSelectionRows: [
    { title: '주간 회고 알림', caption: '매주 일요일 오후 8시' },
    { title: '제품 업데이트', caption: '새로운 컴포넌트 소식' },
  ],

  demoLayoutTitle: '토큰으로 조립하세요.',

  demoAlertTitle: '새 테마가 저장되었습니다',
  demoAlertBody: '모든 새 화면에 semantic token이 즉시 반영됩니다.',
  demoProgressDocs: '문서 생성 진행률',
  demoProgressSync: '컴포넌트 동기화 진행률',
  demoProgressSyncValue: '동기화 중',
  demoSpinnerLabel: '컴포넌트 불러오는 중',
  demoStatusCaption: 'determinate · indeterminate · localized loading',

  demoProfileToast: '프로필을 열었습니다.',
  demoAccordion: [
    {
      title: '왜 controlled API인가요?',
      content: '앱 상태와 UI 상태가 언제나 한 방향으로 흐릅니다.',
    },
    {
      title: '접근성은 어디까지 포함하나요?',
      content: '역할, 상태, 키보드 이동과 패널 관계를 기본 제공합니다.',
    },
  ],

  demoTableCaption: '최근 결제',
  demoTableDescription: '정렬 요청과 선택 상태만 바뀌며 행 순서는 앱이 계속 소유합니다.',
  demoTableColumnMember: '고객',
  demoTableColumnAmount: '금액',
  demoTableColumnStatus: '상태',
  demoTableStatus: { done: '완료', pending: '대기', failed: '실패' },
  demoTableRowSelectLabel: (member) => `${member} 결제 선택`,
  demoTableSelectAll: '표시된 결제 전체 선택',
  demoTableClearSelection: '표시된 결제 선택 해제',
  demoTableSortCleared: '정렬을 해제했습니다. 행 순서는 그대로입니다.',
  demoTableSortRequested: (column, direction) => `${column} ${direction} 정렬을 요청했습니다.`,
  demoTableAscending: '오름차순',
  demoTableDescending: '내림차순',
  demoTableSelectionSummary: (count) => `${count}개 선택 · 실패 행은 선택 대상에서 제외`,
  demoPaginationLabel: '결제 페이지',
  demoPageLabel: (page, current) => `${page}페이지${current ? ' (현재)' : ''}`,

  demoEmptyTitle: '아직 프로젝트가 없어요',
  demoEmptyBody: '첫 번째 프로젝트를 만들어보세요.',
  demoEmptyAction: '프로젝트 만들기',
  demoEmptyToast: '새 프로젝트를 시작합니다.',
  demoErrorMessage: '네트워크 연결을 확인해주세요.',
  demoErrorToast: '다시 시도합니다.',
  demoQueueTitle: 'ToastViewport · FIFO queue',
  demoQueueCaption: '최대 두 개를 표시하고, 숨겨진 탭·앱에서는 남은 시간을 보존합니다.',
  demoQueueButton: '저장 알림 추가',
  demoQueueToast: '문서 상태를 저장했습니다.',

  demoOverlayTitle: '확인이 필요한 순간도 같은 언어로.',
  demoOverlayCopy:
    '웹 non-modal부터 네이티브 adaptive Dialog와 접근성 힌트까지 같은 API 경계로 적응합니다.',
  demoReleaseChannel: '릴리스 채널',
  demoReleaseChannelPlaceholder: '채널 선택',
  demoReleaseChannelPreviewHint: '테스트 빌드',
  demoMenuTrigger: '프로젝트 작업',
  demoMenuDuplicate: '프로젝트 복제',
  demoMenuCompact: '압축 보기',
  demoMenuDelete: '프로젝트 삭제',
  demoMenuToast: (value) => `${value} 메뉴를 선택했습니다.`,
  demoPopoverTrigger: '계정 도움말',
  demoPopoverTitle: '계정 정보',
  demoPopoverBody: '프로필 공개 범위는 설정에서 언제든 바꿀 수 있습니다.',
  demoTooltipTrigger: '오버레이 도움말',
  demoTooltipContent: '웹에서는 시각 설명, 네이티브에서는 접근성 힌트로 제공합니다.',
  demoTooltipToast: '오버레이 도움말을 열었습니다.',
  demoOpenDialog: 'Dialog 열기',
  demoOpenSheet: 'Sheet 열기',
  demoOpenActionSheet: 'ActionSheet 열기',

  themeTitle: '한 번 정하면, 모든 화면이 함께 움직입니다.',
  themeDescription:
    '색상 31롤, 서체 7롤, 간격·라운드·그림자·치수까지 하나의 완성된 테마로 관리합니다. 라이트와 다크를 쌍으로 만들고 시스템 설정을 따르세요.',
  themeGuaranteeTitle: 'ThemePair 완전성 보장',
  themeGuaranteeBody: '라이트나 다크 한쪽이 비어 있는 상태를 만들 수 없습니다.',
  quickStartTitle: '첫 화면까지 3분.',
  quickStartSteps: ['테마 생성', 'Provider 연결', '컴포넌트 사용'],
  quickStartCode: `import { UiProvider, Button, koStrings } from '@gj-kit/expo-ui';\nimport { createThemes } from '@gj-kit/expo-ui/theme';\n\nconst themes = createThemes();\n\nexport function App() {\n  return (\n    <UiProvider theme={themes} strings={koStrings}>\n      <Button label="시작하기" onPress={() => {}} />\n    </UiProvider>\n  );\n}`,

  platformTitle: '웹 데모 뒤에도, 네이티브 현실을 압니다.',
  platformDescription:
    'Expo 앱에서 실제로 반복되는 플랫폼 문제를 작은 유틸과 명확한 경계로 해결합니다.',
  platformItems: [
    {
      eyebrow: '/INSETS',
      symbol: '⌁',
      title: 'Safe area와 키보드까지',
      description:
        'Android edge-to-edge Modal의 키보드 겹침과 하단 inset을 다루는 검증된 유틸을 제공합니다.',
      code: 'useModalKeyboardOverlap()',
    },
    {
      eyebrow: '/TAILWIND',
      symbol: '#',
      title: 'NativeWind는 선택 사항',
      description:
        '의존하지 않으면서 className passthrough와 테마에서 파생한 Tailwind preset을 제공합니다.',
      code: 'createTailwindPreset(theme)',
    },
    {
      eyebrow: 'STRINGS + ICONS',
      symbol: '文',
      title: '앱의 언어를 그대로',
      description:
        '한국어·영어 문구와 아이콘 렌더러를 Provider에서 주입합니다. 별도 래퍼가 필요 없습니다.',
      code: 'strings={koStrings}',
    },
  ],

  finalTitle: '좋은 UI는, 좋은 제약에서 시작됩니다.',
  finalDescription: '설치는 가볍게. 테마와 접근성 계약은 단단하게.',
  finalDocsLink: '문서에서 시작하기',

  footerTagline: 'Expo와 React Native를 위한 타입 안전 프리미티브.',
  footerHome: '홈',
  footerDocs: '문서',
  footerComponents: '컴포넌트',
  footerGettingStarted: '시작 가이드',
};

const catalog: Readonly<Record<Locale, LandingStrings>> = { en, ko };

export function landingStrings(locale: Locale): LandingStrings {
  return catalog[locale];
}
