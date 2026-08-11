/**
 * TextField / SearchField — design doc §5.4, §5.5.
 *
 * TextField's `style?: never` is a deliberate blocker. In the predecessor, style
 * meant "input style", so this surfaces as a compile error any migration that
 * would quietly carry the prop over with a changed meaning (§0). The container
 * takes containerStyle and the input takes inputStyle.
 */
import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text as RNText, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import { renderIconSlot } from './icons';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string | undefined;
  /** When set, the border and helper turn danger-toned and it takes precedence over helperText (§6 rejection table: mutual exclusion is not enforced). */
  error?: string | undefined;
  helperText?: string | undefined;
  counter?: string | undefined;
  labelAccessory?: ReactNode | undefined;
  /** Blocks the meaning change of the old library's style (which meant input style) — use containerStyle and inputStyle (§5.4). */
  style?: never;
  containerStyle?: StyleProp<ViewStyle> | undefined;
  inputStyle?: StyleProp<TextStyle> | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  counterStyle?: StyleProp<TextStyle> | undefined;
  helperStyle?: StyleProp<TextStyle> | undefined;
  containerClassName?: string | undefined;
  inputClassName?: string | undefined;
  labelClassName?: string | undefined;
  counterClassName?: string | undefined;
  helperClassName?: string | undefined;
  /** Narrowly supports the RNW field relationships that the React Native core types do not have yet. */
  'aria-describedby'?: string | undefined;
  'aria-errormessage'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  'aria-required'?: boolean | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

/** The default multiline height — two rows of input plus padding. No token concept corresponds to it, so it is named as a constant (§3.8 exception). */
const MULTILINE_MIN_HEIGHT_FACTOR = 2;

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function combineIdRefs(...values: Array<string | undefined>): string | undefined {
  const combined = values.filter((value): value is string => Boolean(value)).join(' ');
  return combined || undefined;
}

function webProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

const getFieldStyles = themedStyles((theme: Theme) => ({
  field: { gap: theme.spacing.sm },
  labelRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
  accessoryRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
  },
  input: {
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    minHeight: theme.metrics.input,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
}));

export function TextField({
  label,
  error,
  helperText,
  counter,
  labelAccessory,
  containerStyle,
  inputStyle,
  labelStyle,
  counterStyle,
  helperStyle,
  containerClassName,
  inputClassName,
  labelClassName,
  counterClassName,
  helperClassName,
  multiline,
  placeholderTextColor,
  nativeID,
  accessibilityLabel,
  accessibilityLabelledBy,
  accessibilityHint,
  accessibilityState,
  editable,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-errormessage': ariaErrorMessage,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  'aria-disabled': ariaDisabled,
  testID,
  ...inputProps
}: TextFieldProps): ReactElement {
  const theme = useTheme();
  const styles = getFieldStyles(theme);
  const reactId = sanitizeId(useId());
  const baseId = `gj-text-field-${reactId}`;
  const inputId = nativeID ?? `${baseId}-control`;
  const labelId = `${baseId}-label`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const hasError = error !== undefined;
  const supportText = error ?? helperText;
  const supportId = hasError
    ? errorId
    : helperText !== undefined
      ? helperId
      : undefined;
  const invalid = hasError || ariaInvalid === true;
  const disabled = ariaDisabled ?? accessibilityState?.disabled ?? false;
  const describedBy = combineIdRefs(ariaDescribedBy, supportId);
  const resolvedAriaLabelledBy = ariaLabelledBy ?? (label !== undefined ? labelId : undefined);
  const resolvedAriaErrorMessage = ariaErrorMessage ?? (hasError ? errorId : undefined);
  const resolvedState: TextInputProps['accessibilityState'] = {
    ...accessibilityState,
    ...(disabled ? { disabled: true } : {}),
  };

  return (
    <View style={[styles.field, containerStyle]} {...nativeWindProps(containerClassName)}>
      {label !== undefined || counter !== undefined || labelAccessory ? (
        <View style={styles.labelRow}>
          {label !== undefined ? (
            <RNTextLike
              nativeID={labelId}
              className={labelClassName}
              style={[roleTextStyle(theme, 'label'), { color: theme.colors.text }, labelStyle]}
            >
              {label}
            </RNTextLike>
          ) : (
            <View />
          )}
          <View style={styles.accessoryRow}>
            {counter ? (
              <RNTextLike
                className={counterClassName}
                style={[roleTextStyle(theme, 'caption'), { color: theme.colors.textMuted }, counterStyle]}
              >
                {counter}
              </RNTextLike>
            ) : null}
            {labelAccessory}
          </View>
        </View>
      ) : null}
      {/* testID는 입력 요소에 — 전신·SearchField와 동일 계약(테스트 리뷰 발견 반영). */}
      <TextInput
        {...inputProps}
        {...webProps({
          ...(resolvedAriaLabelledBy !== undefined
            ? { 'aria-labelledby': resolvedAriaLabelledBy }
            : {}),
          ...(describedBy !== undefined ? { 'aria-describedby': describedBy } : {}),
          ...(resolvedAriaErrorMessage !== undefined
            ? { 'aria-errormessage': resolvedAriaErrorMessage }
            : {}),
          'aria-invalid': invalid,
          ...(ariaRequired !== undefined ? { 'aria-required': ariaRequired } : {}),
          'aria-disabled': disabled,
        })}
        {...nativeWindProps(inputClassName)}
        nativeID={inputId}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityLabelledBy={
          accessibilityLabelledBy ?? (label !== undefined ? labelId : undefined)
        }
        accessibilityHint={accessibilityHint ?? supportText}
        accessibilityState={resolvedState}
        editable={!disabled && (editable ?? true)}
        testID={testID}
        multiline={multiline}
        placeholderTextColor={placeholderTextColor ?? theme.colors.textSubtle}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            fontSize: theme.typography.body.fontSize,
            borderColor: hasError ? theme.colors.danger : theme.colors.textSubtle,
            backgroundColor: theme.colors.surface,
            ...(theme.typography.fontFamily !== undefined
              ? { fontFamily: theme.typography.fontFamily }
              : {}),
          },
          multiline
            ? {
                minHeight: theme.metrics.input * MULTILINE_MIN_HEIGHT_FACTOR + theme.spacing.lg,
                textAlignVertical: 'top' as const,
              }
            : null,
          inputStyle,
        ]}
      />
      {supportText !== undefined ? (
        <RNTextLike
          nativeID={supportId}
          accessibilityLiveRegion={hasError ? 'polite' : undefined}
          className={helperClassName}
          style={[
            roleTextStyle(theme, 'caption'),
            { color: hasError ? theme.colors.danger : theme.colors.textMuted },
            helperStyle,
          ]}
        >
          {supportText}
        </RNTextLike>
      ) : null}
    </View>
  );
}

export interface SearchFieldProps
  extends Pick<
    TextInputProps,
    'value' | 'onChangeText' | 'onSubmitEditing' | 'autoFocus' | 'returnKeyType'
  > {
  /** Defaults to strings.searchPlaceholder (§4.1). */
  placeholder?: string | undefined;
  /** Renders icons.search by default (§4.2). */
  leading?: ReactNode | undefined;
  inputStyle?: StyleProp<TextStyle> | undefined;
  inputClassName?: string | undefined;
  /** The container (pill). */
  style?: StyleProp<ViewStyle> | undefined;
  className?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
}

const getSearchStyles = themedStyles((theme: Theme) => ({
  container: {
    alignItems: 'center' as const,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    flexDirection: 'row' as const,
    gap: theme.spacing.sm,
    minHeight: theme.metrics.input,
    paddingHorizontal: theme.spacing.lg,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 0 },
}));

export function SearchField({
  value,
  onChangeText,
  onSubmitEditing,
  autoFocus,
  returnKeyType = 'search',
  placeholder,
  leading,
  inputStyle,
  inputClassName,
  style,
  className,
  testID,
}: SearchFieldProps): ReactElement {
  const theme = useTheme();
  const strings = useStrings();
  const icons = useIcons();
  const styles = getSearchStyles(theme);
  const resolvedLeading =
    leading ??
    renderIconSlot(icons.search, {
      color: theme.colors.textSubtle,
      size: theme.metrics.icon.md,
    });

  return (
    <View
      {...nativeWindProps(className)}
      style={[
        styles.container,
        { borderColor: theme.colors.textSubtle, backgroundColor: theme.colors.surface },
        style,
      ]}
    >
      {resolvedLeading}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType}
        placeholder={placeholder ?? strings.searchPlaceholder}
        placeholderTextColor={theme.colors.textSubtle}
        testID={testID}
        {...nativeWindProps(inputClassName)}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            fontSize: theme.typography.body.fontSize,
            ...(theme.typography.fontFamily !== undefined
              ? { fontFamily: theme.typography.fontFamily }
              : {}),
          },
          inputStyle,
        ]}
      />
    </View>
  );
}

// ─── (내부) 필드 전용 텍스트 — className 브리지를 가진 얇은 래퍼 ───────────
function RNTextLike({
  nativeID,
  accessibilityLiveRegion,
  className,
  style,
  children,
}: {
  nativeID?: string | undefined;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive' | undefined;
  className?: string | undefined;
  style?: StyleProp<TextStyle> | undefined;
  children?: ReactNode | undefined;
}): ReactElement {
  return (
    <RNText
      nativeID={nativeID}
      accessibilityLiveRegion={accessibilityLiveRegion}
      {...nativeWindProps(className)}
      style={style}
    >
      {children}
    </RNText>
  );
}
