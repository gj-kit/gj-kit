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

const CURSOR_BATCHES = [
  '1–20번째 결과',
  '21–40번째 결과',
  '41–60번째 결과',
  '61–80번째 결과',
] as const;

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
      accessibilityLabel="결제 내역 페이지"
      page={itemPage}
      totalItemCount={128}
      pageSize={20}
      presentation={presentation}
      direction={direction}
      disabled={disabled}
      busy={busy}
      getPageAccessibilityLabel={({ page: targetPage, current }) =>
        current
          ? `${targetPage}페이지, 현재 페이지`
          : `${targetPage}페이지로 이동`
      }
      onPageChange={setItemPage}
      style={styles.pagination}
      testID="pagination-live-items"
    />
  ) : mode === 'pages' ? (
    <Pagination
      mode="numbered"
      countMode="pages"
      accessibilityLabel="리포트 페이지"
      page={page}
      pageCount={24}
      presentation={presentation}
      direction={direction}
      disabled={disabled}
      busy={busy}
      getPageAccessibilityLabel={({ page: targetPage, current }) =>
        current
          ? `${targetPage}페이지, 현재 페이지`
          : `${targetPage}페이지로 이동`
      }
      onPageChange={setPage}
      style={styles.pagination}
      testID="pagination-live-pages"
    />
  ) : (
    <Pagination
      mode="cursor"
      accessibilityLabel="검색 결과 커서 탐색"
      statusLabel={`배치 ${cursorBatch + 1} · ${CURSOR_BATCHES[cursorBatch]}`}
      hasPreviousPage={cursorBatch > 0}
      hasNextPage={cursorBatch < CURSOR_BATCHES.length - 1}
      direction={direction}
      disabled={disabled}
      busy={busy}
      onNavigate={(nextDirection) => {
        setCursorBatch((current) =>
          nextDirection === 'previous'
            ? Math.max(0, current - 1)
            : Math.min(CURSOR_BATCHES.length - 1, current + 1),
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
            한 컴포넌트, 세 가지 탐색 계약
          </RNText>
          <RNText style={[styles.description, { color: theme.colors.textMuted }]}>
            모드와 표현을 바꾼 뒤 실제 이전·다음·페이지 버튼을 눌러 controlled 상태를 확인하세요.
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
          <ControlGroup label="데이터 계약">
            <ToggleGroup
              selectionMode="single"
              value={mode}
              onValueChange={(nextMode) => {
                if (nextMode !== null) setMode(nextMode);
              }}
              accessibilityLabel="Pagination 데이터 계약"
              items={MODE_ITEMS}
              allowEmpty={false}
              size="sm"
              variant="outlined"
            />
          </ControlGroup>

          <ControlGroup label="표현">
            <ToggleGroup
              selectionMode="single"
              value={presentation}
              onValueChange={(nextPresentation) => {
                if (nextPresentation !== null) setPresentation(nextPresentation);
              }}
              accessibilityLabel="Pagination 표현"
              items={PRESENTATION_ITEMS}
              allowEmpty={false}
              disabled={mode === 'cursor'}
              size="sm"
              variant="outlined"
            />
          </ControlGroup>

          <ControlGroup label="방향">
            <ToggleGroup
              selectionMode="single"
              value={direction}
              onValueChange={(nextDirection) => {
                if (nextDirection !== null) setDirection(nextDirection);
              }}
              accessibilityLabel="Pagination 쓰기 방향"
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
            description="중복 페이지 요청을 잠급니다."
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
              ? '총 128개 · 페이지당 20개'
              : mode === 'pages'
                ? '서버가 계산한 24페이지'
                : '서버만 아는 opaque cursor'}
          </RNText>
          <RNText style={[styles.canvasMeta, { color: theme.colors.textMuted }]}>
            {direction.toUpperCase()} · {mode === 'cursor' ? 'compact' : presentation}
          </RNText>
        </View>
        <View style={styles.paginationHost}>{pagination}</View>
      </View>

      <RNText style={[styles.note, { color: theme.colors.textMuted }]}>
        auto는 웹에서 full 번호를 유지하고, 네이티브에서는 theme.breakpoints.tablet 아래에서 compact로 전환합니다. cursor는 위치를 계산하지 않으므로 앱이 의미 있는 statusLabel을 제공합니다.
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
