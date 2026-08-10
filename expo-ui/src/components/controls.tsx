/**
 * Checkbox / Switch — controlled, cross-platform form controls.
 *
 * RNW Pressable activates every role with Enter, while checkbox semantics require
 * Space. Web therefore uses a focusable View with an explicit keyboard bridge;
 * native keeps Pressable and the platform Switch implementation.
 */
import { createElement, useEffect, useId, useRef } from 'react';
import type { ElementRef, ReactElement, ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Switch as RNSwitch,
  Text as RNText,
  View,
} from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { renderIconSlot } from './icons';
import type { RenderIcon } from './icons';
import { useIcons, useTheme } from './provider';

export type ControlSize = 'sm' | 'md';

type VisibleOrAccessibleLabel =
  | { label: string; accessibilityLabel?: string | undefined }
  | { label?: never; accessibilityLabel: string };

type WebKeyboardEvent = {
  readonly key: string;
  preventDefault: () => void;
};

/** src는 DOM lib를 갖지 않는다. RNW 전용 이벤트 prop은 이 좁은 브리지에서만 캐스팅한다. */
function webInteractionProps(
  onActivate: () => void,
  disabled: boolean,
): Record<string, unknown> {
  return {
    onClick: () => {
      if (!disabled) onActivate();
    },
    onKeyDown: (event: WebKeyboardEvent) => {
      if (disabled) return;
      if (event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space') {
        event.preventDefault();
        onActivate();
      }
    },
  };
}

const getStyles = themedStyles((theme: Theme) => ({
  controlRow: {
    alignItems: 'flex-start' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
  checkboxBox: {
    alignItems: 'center' as const,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center' as const,
  },
  mark: {
    fontWeight: theme.typography.title.fontWeight,
    includeFontPadding: false,
    textAlign: 'center' as const,
  },
  copy: {
    flex: 1,
    gap: theme.spacing.xs,
    justifyContent: 'center' as const,
  },
  copyPressable: { flex: 1 },
  label: {
    fontSize: theme.typography.button.fontSize,
    fontWeight: theme.typography.button.fontWeight,
    lineHeight: theme.typography.button.lineHeight,
  },
  description: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: theme.typography.caption.fontWeight,
    lineHeight: theme.typography.caption.lineHeight,
  },
  switchRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.md,
  },
}));

function ControlCopy({
  label,
  description,
  descriptionId,
}: {
  label?: string | undefined;
  description?: string | undefined;
  descriptionId?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  const styles = getStyles(theme);
  if (label === undefined && description === undefined) return null;

  return (
    <View style={styles.copy}>
      {label !== undefined ? (
        <RNText
          style={[
            styles.label,
            { color: theme.colors.text },
            theme.typography.fontFamily !== undefined
              ? { fontFamily: theme.typography.fontFamily }
              : null,
          ]}
        >
          {label}
        </RNText>
      ) : null}
      {description !== undefined ? (
        <RNText
          nativeID={descriptionId}
          style={[
            styles.description,
            { color: theme.colors.textMuted },
            theme.typography.fontFamily !== undefined
              ? { fontFamily: theme.typography.fontFamily }
              : null,
          ]}
        >
          {description}
        </RNText>
      ) : null}
    </View>
  );
}

type CheckboxOwnProps = CommonProps & {
  /** `mixed`는 select-all 같은 부분 선택 상태다. 사용자 입력 결과는 항상 boolean. */
  checked: boolean | 'mixed';
  onCheckedChange: (checked: boolean) => void;
  description?: string | undefined;
  disabled?: boolean | undefined;
  size?: ControlSize | undefined;
  /** check/minus Provider 아이콘보다 우선하는 단일 마크 슬롯. */
  renderMark?: RenderIcon | undefined;
};

export type CheckboxProps = CheckboxOwnProps & VisibleOrAccessibleLabel;

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  accessibilityLabel,
  description,
  disabled = false,
  size = 'md',
  renderMark,
  style,
  className,
  testID,
}: CheckboxProps): ReactElement {
  const theme = useTheme();
  const icons = useIcons();
  const styles = getStyles(theme);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const descriptionId = description === undefined ? undefined : `gj-checkbox-${reactId}-description`;
  const selected = checked !== false;
  const dimension = size === 'sm' ? theme.metrics.icon.sm : theme.metrics.icon.lg;
  const markSize = size === 'sm' ? theme.typography.caption.fontSize : theme.typography.label.fontSize;
  const resolvedLabel = accessibilityLabel ?? label;
  const resolvedMark =
    renderMark ?? (checked === 'mixed' ? icons.minus : checked ? icons.check : undefined);
  const activate = () => onCheckedChange(checked !== true);

  const content = (
    <>
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.checkboxBox,
          {
            width: dimension,
            height: dimension,
            borderRadius: theme.radius.sm / 2,
            borderColor: selected ? theme.colors.primary : theme.colors.textSubtle,
            backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
          },
        ]}
      >
        {selected ? (
          resolvedMark ? (
            renderIconSlot(resolvedMark, { color: theme.colors.onPrimary, size: markSize })
          ) : (
            <RNText
              style={[
                styles.mark,
                {
                  color: theme.colors.onPrimary,
                  fontSize: markSize,
                  lineHeight: dimension,
                },
              ]}
            >
              {checked === 'mixed' ? '−' : '✓'}
            </RNText>
          )
        ) : null}
      </View>
      <ControlCopy label={label} description={description} descriptionId={descriptionId} />
    </>
  );

  const accessibilityProps = {
    accessible: true,
    accessibilityRole: 'checkbox' as const,
    role: 'checkbox' as const,
    accessibilityLabel: resolvedLabel,
    'aria-label': resolvedLabel,
    accessibilityHint: description,
    accessibilityState: { checked, disabled },
    'aria-checked': checked,
    'aria-disabled': disabled,
    ...(Platform.OS === 'web' && descriptionId !== undefined
      ? ({ 'aria-describedby': descriptionId } as Record<string, unknown>)
      : {}),
  };
  const rootStyle = [
    styles.controlRow,
    { minHeight: theme.metrics.control[size], opacity: disabled ? 0.5 : 1 },
    style,
  ];

  if (Platform.OS === 'web') {
    return (
      <View
        {...accessibilityProps}
        focusable={!disabled}
        tabIndex={disabled ? -1 : 0}
        testID={testID}
        {...webInteractionProps(activate, disabled)}
        {...nativeWindProps(className)}
        style={rootStyle}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      {...accessibilityProps}
      disabled={disabled}
      onPress={activate}
      hitSlop={theme.spacing.sm}
      testID={testID}
      {...nativeWindProps(className)}
      style={({ pressed }) => [rootStyle, pressed && !disabled ? { opacity: 0.82 } : null]}
    >
      {content}
    </Pressable>
  );
}

type SwitchOwnProps = CommonProps & {
  value: boolean;
  onValueChange: (value: boolean) => void;
  description?: string | undefined;
  disabled?: boolean | undefined;
  size?: ControlSize | undefined;
};

export type SwitchProps = SwitchOwnProps & VisibleOrAccessibleLabel;

/** 네이티브 Switch를 그대로 사용해 플랫폼 키보드·스크린리더 동작을 보존한다. */
export function Switch({
  value,
  onValueChange,
  label,
  accessibilityLabel,
  description,
  disabled = false,
  size = 'md',
  style,
  className,
  testID,
}: SwitchProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const reactId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const inputId = `gj-switch-${reactId}`;
  const descriptionId = description === undefined ? undefined : `${inputId}-description`;
  const switchRef = useRef<ElementRef<typeof RNSwitch>>(null);
  const resolvedLabel = accessibilityLabel ?? label;
  const scale = theme.metrics.control.sm / theme.metrics.control.md;

  // RNW Switch는 unknown aria prop을 wrapper에 두므로 실제 input ref에 연결한다.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const input = switchRef.current as unknown as {
      setAttribute?: ((name: string, value: string) => void) | undefined;
      removeAttribute?: ((name: string) => void) | undefined;
    } | null;
    input?.setAttribute?.('id', inputId);
    if (descriptionId !== undefined) input?.setAttribute?.('aria-describedby', descriptionId);
    return () => {
      input?.removeAttribute?.('id');
      input?.removeAttribute?.('aria-describedby');
    };
  }, [descriptionId, inputId]);
  // RNW Switch already renders one native <input role="switch">. Repeating role/
  // accessibilityRole on its wrapper creates two accessibility nodes. 웹 input은
  // checked/disabled를 native 속성에서 이미 내므로 색 prop만 별도로 넘긴다.
  const platformAccessibilityProps =
    Platform.OS === 'web'
      ? ({ activeThumbColor: theme.colors.surface } as unknown as Record<string, unknown>)
      : {
          accessible: true,
          accessibilityRole: 'switch' as const,
          role: 'switch' as const,
          accessibilityHint: description,
          accessibilityState: { checked: value, disabled },
          'aria-checked': value,
          'aria-disabled': disabled,
        };

  return (
    <View
      {...nativeWindProps(className)}
      style={[
        styles.switchRow,
        { minHeight: theme.metrics.control[size], opacity: disabled ? 0.5 : 1 },
        style,
      ]}
    >
      <RNSwitch
        ref={switchRef}
        {...platformAccessibilityProps}
        accessibilityLabel={resolvedLabel}
        aria-label={resolvedLabel}
        disabled={disabled}
        value={value}
        onValueChange={(next) => {
          if (!disabled) onValueChange(next);
        }}
        trackColor={{ false: theme.colors.textSubtle, true: theme.colors.primary }}
        thumbColor={theme.colors.surface}
        ios_backgroundColor={theme.colors.textSubtle}
        testID={testID}
        style={size === 'sm' ? { transform: [{ scaleX: scale }, { scaleY: scale }] } : undefined}
      />
      {label !== undefined || description !== undefined
        ? Platform.OS === 'web'
          ? createElement(
            'label',
            {
              htmlFor: inputId,
              style: { cursor: disabled ? 'default' : 'pointer', flex: 1 },
            },
            <ControlCopy
              label={label}
              description={description}
              descriptionId={descriptionId}
            />,
            )
          : (
              <Pressable
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                disabled={disabled}
                hitSlop={theme.spacing.sm}
                onPress={() => onValueChange(!value)}
                style={styles.copyPressable}
              >
                <ControlCopy label={label} description={description} />
              </Pressable>
            )
        : null}
    </View>
  );
}
