/**
 * TextField / SearchField — 설계 문서 §5.4, §5.5.
 *
 * TextField의 `style?: never`는 의도된 차단 장치다 — 전신에서 style은 "입력
 * 스타일"이었으므로, 의미가 바뀐 채 조용히 이관되는 사고를 컴파일 에러로
 * 표면화한다(§0). 컨테이너는 containerStyle, 입력은 inputStyle.
 */
import type { ReactElement, ReactNode } from 'react';
import { Text as RNText, TextInput, View } from 'react-native';
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import { renderIconSlot } from './icons';
import { useIcons, useStrings, useTheme } from './provider';
import { roleTextStyle } from './text';

export interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string | undefined;
  /** 지정 시 보더/헬퍼가 danger 계열 — helperText보다 우선(§6 기각 표: 상호배제 강제 안 함). */
  error?: string | undefined;
  helperText?: string | undefined;
  counter?: string | undefined;
  labelAccessory?: ReactNode | undefined;
  /** 구 라이브러리의 style(=입력 스타일) 의미 변경 차단 — containerStyle/inputStyle 사용(§5.4). */
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
  testID?: string | undefined;
  unstyled?: never;
}

/** 멀티라인 기본 높이 — 입력 2행 + 여백. 토큰에 대응 개념이 없어 상수로 명명(§3.8 예외). */
const MULTILINE_MIN_HEIGHT_FACTOR = 2;

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
  testID,
  ...inputProps
}: TextFieldProps): ReactElement {
  const theme = useTheme();
  const styles = getFieldStyles(theme);

  return (
    <View style={[styles.field, containerStyle]} {...nativeWindProps(containerClassName)}>
      {label || counter || labelAccessory ? (
        <View style={styles.labelRow}>
          {label ? (
            <RNTextLike
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
        {...nativeWindProps(inputClassName)}
        testID={testID}
        multiline={multiline}
        placeholderTextColor={placeholderTextColor ?? theme.colors.textSubtle}
        style={[
          styles.input,
          {
            color: theme.colors.text,
            fontSize: theme.typography.body.fontSize,
            borderColor: error ? theme.colors.danger : theme.colors.line,
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
      {error || helperText ? (
        <RNTextLike
          className={helperClassName}
          style={[
            roleTextStyle(theme, 'caption'),
            { color: error ? theme.colors.danger : theme.colors.textMuted },
            helperStyle,
          ]}
        >
          {error ?? helperText}
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
  /** 기본 strings.searchPlaceholder(§4.1). */
  placeholder?: string | undefined;
  /** 기본 icons.search 렌더(§4.2). */
  leading?: ReactNode | undefined;
  inputStyle?: StyleProp<TextStyle> | undefined;
  inputClassName?: string | undefined;
  /** 컨테이너(pill). */
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
        { borderColor: theme.colors.line, backgroundColor: theme.colors.surface },
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
  className,
  style,
  children,
}: {
  className?: string | undefined;
  style?: StyleProp<TextStyle> | undefined;
  children?: ReactNode | undefined;
}): ReactElement {
  return (
    <RNText {...nativeWindProps(className)} style={style}>
      {children}
    </RNText>
  );
}
