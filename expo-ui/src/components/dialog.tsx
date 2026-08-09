/**
 * DialogPanel / Dialog / ConfirmActionRow — 설계 문서 §5.12.
 *
 * Modal/portal/키보드 고급 제어는 앱 소유(§11) — 이 모듈은 레고 조각까지만.
 * 전신 ConfirmDialog(30개 스타일 props)는 의도적으로 편입하지 않았다.
 */
import type { ReactElement, ReactNode } from 'react';
import { Modal, Pressable, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';
import { Button } from './button';
import type { ButtonVariant } from './button';

/** 패널 최대 폭 — 전신 실측 보존(모바일 시트/데스크톱 다이얼로그 공용). */
const DIALOG_MAX_WIDTH = 550;

export interface DialogPanelProps extends Omit<CommonProps, 'unstyled'> {
  children?: ReactNode | undefined;
  title: string;
  description?: string | undefined;
  leading?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  titleStyle?: StyleProp<TextStyle> | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  panel: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    gap: theme.spacing.lg,
    maxWidth: DIALOG_MAX_WIDTH,
    padding: theme.spacing.xxl,
    width: '100%' as const,
  },
  copy: { gap: theme.spacing.sm },
  overlay: {
    alignItems: 'center' as const,
    flex: 1,
    justifyContent: 'center' as const,
    padding: theme.spacing.xl,
  },
  inner: { maxWidth: DIALOG_MAX_WIDTH, width: '100%' as const },
  actionRow: { flexDirection: 'row' as const, gap: theme.spacing.md },
  actionButton: { flex: 1 },
}));

/** 모달 내부 패널만 담당 — Modal/portal/safe-area는 앱 소유(전신 경계 계승). */
export function DialogPanel({
  children,
  title,
  description,
  leading,
  footer,
  titleStyle,
  style,
  className,
  testID,
}: DialogPanelProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.panel,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
        style,
      ]}
    >
      {leading}
      <View style={styles.copy}>
        <RNText style={[roleTextStyle(theme, 'title'), { color: theme.colors.text }, titleStyle]}>
          {title}
        </RNText>
        {description ? (
          <RNText style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }]}>
            {description}
          </RNText>
        ) : null}
      </View>
      {children}
      {footer}
    </View>
  );
}

export interface DialogProps {
  children?: ReactNode | undefined;
  visible: boolean;
  onDismiss: () => void;
  /** 기본 true. 백드롭 a11y 라벨 = strings.close. */
  dismissOnBackdrop?: boolean | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

/** 구 BasicDialog 개명(§5.12). 자체 오버레이 호스트가 없는 소비자용 최소 구현. */
export function Dialog({
  children,
  visible,
  onDismiss,
  dismissOnBackdrop = true,
  testID,
}: DialogProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={strings.close}
        onPress={dismissOnBackdrop ? onDismiss : undefined}
        style={[styles.overlay, { backgroundColor: theme.colors.overlay }]}
      >
        {/* 내부 탭은 백드롭 dismiss로 전파되지 않는다 — 전신 동작 보존. */}
        <Pressable onPress={() => undefined} style={styles.inner}>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface ConfirmActionRowProps extends Omit<CommonProps, 'unstyled'> {
  onCancel: () => void;
  onConfirm: () => void;
  /** 기본 strings.cancel. */
  cancelLabel?: string | undefined;
  /** 기본 strings.confirm. */
  confirmLabel?: string | undefined;
  /** 기본 'secondary'. */
  cancelVariant?: ButtonVariant | undefined;
  /** 기본 'primary'. destructive가 true면 'destructive'. */
  confirmVariant?: ButtonVariant | undefined;
  /** 슈가 — 앱 ConfirmDialog가 매번 손으로 하던 매핑(§5.12). */
  destructive?: boolean | undefined;
  /** confirm 로딩 — cancel 자동 disabled. */
  loading?: boolean | undefined;
  cancelLoading?: boolean | undefined;
  unstyled?: never;
}

export function ConfirmActionRow({
  onCancel,
  onConfirm,
  cancelLabel,
  confirmLabel,
  cancelVariant = 'secondary',
  confirmVariant,
  destructive = false,
  loading,
  cancelLoading,
  style,
  className,
  testID,
}: ConfirmActionRowProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const styles = getStyles(theme);
  return (
    <View testID={testID} {...nativeWindProps(className)} style={[styles.actionRow, style]}>
      <Button
        label={cancelLabel ?? strings.cancel}
        variant={cancelVariant}
        onPress={onCancel}
        disabled={Boolean(loading)}
        loading={Boolean(cancelLoading)}
        style={styles.actionButton}
      />
      <Button
        label={confirmLabel ?? strings.confirm}
        variant={confirmVariant ?? (destructive ? 'destructive' : 'primary')}
        onPress={onConfirm}
        disabled={Boolean(cancelLoading)}
        loading={Boolean(loading)}
        style={styles.actionButton}
      />
    </View>
  );
}
