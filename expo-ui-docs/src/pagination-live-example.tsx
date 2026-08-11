import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import {
  Pagination,
  Switch,
  ToggleGroup,
  useTheme,
} from '@gj-kit/expo-ui';
import type {
  PaginationDirection,
  PaginationPresentation,
} from '@gj-kit/expo-ui';
import { useLocale } from './locale';
import type { Locale } from './locale';

type ExampleMode = 'items' | 'pages' | 'cursor';

const MODE_ITEMS = [
  { value: 'items', label: 'items' },
  { value: 'pages', label: 'pages' },
  { value: 'cursor', label: 'cursor' },
] as const;

const PRESENTATION_ITEMS = [
  { value: 'auto', label: 'auto' },
  { value: 'full', label: 'full' },
  { value: 'compact', label: 'compact' },
] as const;

const DIRECTION_ITEMS = [
  { value: 'ltr', label: 'LTR' },
  { value: 'rtl', label: 'RTL' },
] as const;

const CURSOR_BATCH_RANGES = ['1–20', '21–40', '41–60', '61–80'] as const;

type ExampleStrings = {
  readonly title: string;
  readonly description: string;
  readonly dataContract: string;
  readonly presentation: string;
  readonly direction: string;
  readonly busyDescription: string;
  readonly itemsLabel: string;
  readonly pagesLabel: string;
  readonly cursorLabel: string;
  readonly pageLabel: (page: number, current: boolean) => string;
  readonly cursorStatus: (batch: number, range: string) => string;
  readonly itemsSummary: string;
  readonly pagesSummary: string;
  readonly cursorSummary: string;
  readonly note: string;
};

const STRINGS: Readonly<Record<Locale, ExampleStrings>> = {
  en: {
    title: 'One component, three navigation contracts',
    description:
      'Switch the mode and presentation, then press the real previous, next, and page buttons to watch the controlled state.',
    dataContract: 'Data contract',
    presentation: 'Presentation',
    direction: 'Direction',
    busyDescription: 'Locks out duplicate page requests.',
    itemsLabel: 'Payment history pages',
    pagesLabel: 'Report pages',
    cursorLabel: 'Search result cursor navigation',
    pageLabel: (page, current) =>
      current ? `Page ${page}, current page` : `Go to page ${page}`,
    cursorStatus: (batch, range) => `Batch ${batch} · results ${range}`,
    itemsSummary: '128 items · 20 per page',
    pagesSummary: '24 pages, counted by the server',
    cursorSummary: 'An opaque cursor only the server understands',
    note:
      'auto keeps full numbering on the web and switches to compact below theme.breakpoints.tablet on native. cursor cannot compute a position, so your app supplies a meaningful statusLabel.',
  },
  ko: {
    title: '한 컴포넌트, 세 가지 탐색 계약',
    description:
      '모드와 표현을 바꾼 뒤 실제 이전·다음·페이지 버튼을 눌러 controlled 상태를 확인하세요.',
    dataContract: '데이터 계약',
    presentation: '표현',
    direction: '방향',
    busyDescription: '중복 페이지 요청을 잠급니다.',
    itemsLabel: '결제 내역 페이지',
    pagesLabel: '리포트 페이지',
    cursorLabel: '검색 결과 커서 탐색',
    pageLabel: (page, current) =>
      current ? `${page}페이지, 현재 페이지` : `${page}페이지로 이동`,
    cursorStatus: (batch, range) => `배치 ${batch} · ${range}번째 결과`,
    itemsSummary: '총 128개 · 페이지당 20개',
    pagesSummary: '서버가 계산한 24페이지',
    cursorSummary: '서버만 아는 opaque cursor',
    note:
      'auto는 웹에서 full 번호를 유지하고, 네이티브에서는 theme.breakpoints.tablet 아래에서 compact로 전환합니다. cursor는 위치를 계산하지 않으므로 앱이 의미 있는 statusLabel을 제공합니다.',
  },
};

function ControlGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  const theme = useTheme();
  return (
    <View style={styles.controlGroup}>
      <RNText style={[styles.controlLabel, { color: theme.colors.textMuted }]}>
        {label}
      </RNText>
      {children}
    </View>
  );
}

/** Interactive proof kept separate so the generic static component route stays hook-free. */
export function PaginationLiveExample(): ReactElement {
  const theme = useTheme();
  const t = STRINGS[useLocale().locale];
  const [mode, setMode] = useState<ExampleMode>('items');
  const [presentation, setPresentation] =
    useState<PaginationPresentation>('auto');
  const [direction, setDirection] = useState<PaginationDirection>('ltr');
  const [disabled, setDisabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [itemPage, setItemPage] = useState(3);
  const [page, setPage] = useState(8);
  const [cursorBatch, setCursorBatch] = useState(1);

  const pagination = mode === 'items' ? (
    <Pagination
      mode="numbered"
      countMode="items"
      accessibilityLabel={t.itemsLabel}
      page={itemPage}
      totalItemCount={128}
      pageSize={20}
      presentation={presentation}
      direction={direction}
      disabled={disabled}
      busy={busy}
      getPageAccessibilityLabel={({ page: targetPage, current }) =>
        t.pageLabel(targetPage, current)
      }
      onPageChange={setItemPage}
      style={styles.pagination}
      testID="pagination-live-items"
    />
  ) : mode === 'pages' ? (
    <Pagination
      mode="numbered"
      countMode="pages"
      accessibilityLabel={t.pagesLabel}
      page={page}
      pageCount={24}
      presentation={presentation}
      direction={direction}
      disabled={disabled}
      busy={busy}
      getPageAccessibilityLabel={({ page: targetPage, current }) =>
        t.pageLabel(targetPage, current)
      }
      onPageChange={setPage}
      style={styles.pagination}
      testID="pagination-live-pages"
    />
  ) : (
    <Pagination
      mode="cursor"
      accessibilityLabel={t.cursorLabel}
      statusLabel={t.cursorStatus(cursorBatch + 1, CURSOR_BATCH_RANGES[cursorBatch] ?? '')}
      hasPreviousPage={cursorBatch > 0}
      hasNextPage={cursorBatch < CURSOR_BATCH_RANGES.length - 1}
      direction={direction}
      disabled={disabled}
      busy={busy}
      onNavigate={(nextDirection) => {
        setCursorBatch((current) =>
          nextDirection === 'previous'
            ? Math.max(0, current - 1)
            : Math.min(CURSOR_BATCH_RANGES.length - 1, current + 1),
        );
      }}
      style={styles.pagination}
      testID="pagination-live-cursor"
    />
  );

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
      ]}
    >
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <RNText style={[styles.eyebrow, { color: theme.colors.primaryStrong }]}>
            LIVE PLAYGROUND
          </RNText>
          <RNText
            accessibilityRole="header"
            aria-level={3}
            style={[styles.title, { color: theme.colors.text }]}
          >
            {t.title}
          </RNText>
          <RNText style={[styles.description, { color: theme.colors.textMuted }]}>
            {t.description}
          </RNText>
        </View>
        <View
          style={[styles.controlledBadge, { backgroundColor: theme.colors.successSoft }]}
        >
          <RNText style={[styles.controlledBadgeText, { color: theme.colors.success }]}>controlled</RNText>
        </View>
      </View>

      <View style={[styles.configPanel, { backgroundColor: theme.colors.background }]}>
        <View style={styles.configRow}>
          <ControlGroup label={t.dataContract}>
            <ToggleGroup
              selectionMode="single"
              value={mode}
              onValueChange={(nextMode) => {
                if (nextMode !== null) setMode(nextMode);
              }}
              accessibilityLabel={`Pagination ${t.dataContract}`}
              items={MODE_ITEMS}
              allowEmpty={false}
              size="sm"
              variant="outlined"
            />
          </ControlGroup>

          <ControlGroup label={t.presentation}>
            <ToggleGroup
              selectionMode="single"
              value={presentation}
              onValueChange={(nextPresentation) => {
                if (nextPresentation !== null) setPresentation(nextPresentation);
              }}
              accessibilityLabel={`Pagination ${t.presentation}`}
              items={PRESENTATION_ITEMS}
              allowEmpty={false}
              disabled={mode === 'cursor'}
              size="sm"
              variant="outlined"
            />
          </ControlGroup>

          <ControlGroup label={t.direction}>
            <ToggleGroup
              selectionMode="single"
              value={direction}
              onValueChange={(nextDirection) => {
                if (nextDirection !== null) setDirection(nextDirection);
              }}
              accessibilityLabel={`Pagination ${t.direction}`}
              items={DIRECTION_ITEMS}
              allowEmpty={false}
              size="sm"
              variant="outlined"
            />
          </ControlGroup>
        </View>

        <View style={styles.switchRow}>
          <Switch
            label="Disabled"
            value={disabled}
            onValueChange={setDisabled}
            size="sm"
          />
          <Switch
            label="Busy"
            description={t.busyDescription}
            value={busy}
            onValueChange={setBusy}
            size="sm"
          />
        </View>
      </View>

      <View
        style={[
          styles.canvas,
          { backgroundColor: theme.colors.surfaceSubtle, borderColor: theme.colors.line },
        ]}
      >
        <View style={styles.canvasHeader}>
          <RNText style={[styles.canvasTitle, { color: theme.colors.text }]}>
            {mode === 'items'
              ? t.itemsSummary
              : mode === 'pages'
                ? t.pagesSummary
                : t.cursorSummary}
          </RNText>
          <RNText style={[styles.canvasMeta, { color: theme.colors.textMuted }]}>
            {direction.toUpperCase()} · {mode === 'cursor' ? 'compact' : presentation}
          </RNText>
        </View>
        <View style={styles.paginationHost}>{pagination}</View>
      </View>

      <RNText style={[styles.note, { color: theme.colors.textMuted }]}>
        {t.note}
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 18,
    minWidth: 0,
    padding: 20,
    width: '100%',
  },
  heading: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
    justifyContent: 'space-between',
  },
  headingCopy: { flex: 1, minWidth: 220 },
  eyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  title: { fontSize: 20, fontWeight: '800', lineHeight: 28, marginTop: 5 },
  description: { fontSize: 13, lineHeight: 21, marginTop: 6, maxWidth: 680 },
  controlledBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  controlledBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  configPanel: { borderRadius: 16, gap: 16, minWidth: 0, padding: 14 },
  configRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  controlGroup: { gap: 7, minWidth: 0 },
  controlLabel: { fontSize: 11, fontWeight: '800' },
  switchRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  canvas: { borderRadius: 16, borderWidth: 1, gap: 22, minWidth: 0, padding: 18 },
  canvasHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  canvasTitle: { fontSize: 13, fontWeight: '800' },
  canvasMeta: { fontSize: 10, fontWeight: '800', letterSpacing: 0.7 },
  paginationHost: { alignItems: 'center', minWidth: 0, width: '100%' },
  pagination: { alignSelf: 'stretch', maxWidth: '100%', minWidth: 0 },
  note: { fontSize: 12, lineHeight: 20 },
});
