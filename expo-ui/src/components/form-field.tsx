/**
 * FormField — 보이는 필드 설명과 임의의 제어를 접근성 ID 계약으로 연결한다.
 *
 * 자식을 clone하지 않고 render prop으로 필요한 제어 prop을 넘긴다. 따라서
 * TextInput뿐 아니라 앱이 소유한 선택기·복합 제어도 prop의 적용 위치를 직접
 * 결정할 수 있다.
 */
import { useId } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Platform, Text as RNText, View } from 'react-native';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import type { Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import { useTheme } from './provider';
import { roleTextStyle } from './text';

/**
 * FormField의 render prop이 제어에 전달하는 접근성 연결 정보.
 * `aria-*`는 RNW에서만 런타임 객체에 포함되며, DOM 타입을 src에 들이지 않기
 * 위해 이 좁은 공개 타입으로만 표현한다.
 */
export interface FormFieldControlProps {
  nativeID: string;
  accessibilityLabel: string;
  accessibilityLabelledBy: string;
  accessibilityHint?: string | undefined;
  'aria-labelledby'?: string | undefined;
  'aria-describedby'?: string | undefined;
  'aria-errormessage'?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  'aria-required'?: boolean | undefined;
}

type FormFieldBaseProps = {
  label: string;
  children: (controlProps: FormFieldControlProps) => ReactElement;
  helperText?: string | undefined;
  /** 지정 시 helperText보다 우선하며 polite live region으로 알린다. */
  error?: string | undefined;
  labelAccessory?: ReactNode | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  labelStyle?: StyleProp<TextStyle> | undefined;
  helperStyle?: StyleProp<TextStyle> | undefined;
  className?: string | undefined;
  labelClassName?: string | undefined;
  helperClassName?: string | undefined;
  testID?: string | undefined;
  unstyled?: never;
};

type OptionalFormFieldProps = {
  required?: false | undefined;
  requiredAccessibilityLabel?: never;
};

type RequiredFormFieldProps = {
  required: true;
  /** iOS VoiceOver에도 필수 상태가 포함되도록 한 현지화된 전체 제어 이름. */
  requiredAccessibilityLabel: string;
};

export type FormFieldProps = FormFieldBaseProps &
  (OptionalFormFieldProps | RequiredFormFieldProps);

const getStyles = themedStyles((theme: Theme) => ({
  root: { gap: theme.spacing.sm },
  labelRow: {
    alignItems: 'center' as const,
    flexDirection: 'row' as const,
    justifyContent: 'space-between' as const,
  },
}));

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '');
}

function webControlProps(values: Record<string, unknown>): Record<string, unknown> {
  return Platform.OS === 'web' ? values : {};
}

export function FormField({
  label,
  children,
  helperText,
  error,
  required = false,
  requiredAccessibilityLabel,
  labelAccessory,
  style,
  labelStyle,
  helperStyle,
  className,
  labelClassName,
  helperClassName,
  testID,
}: FormFieldProps): ReactElement {
  const theme = useTheme();
  const styles = getStyles(theme);
  const reactId = sanitizeId(useId());
  const baseId = `gj-form-field-${reactId}`;
  const labelId = `${baseId}-label`;
  const controlId = `${baseId}-control`;
  const helperId = `${baseId}-helper`;
  const errorId = `${baseId}-error`;
  const supportText = error ?? helperText;
  const supportId = error !== undefined
    ? errorId
    : helperText !== undefined
      ? helperId
      : undefined;
  const invalid = error !== undefined;

  const controlProps = {
    nativeID: controlId,
    accessibilityLabel:
      required && requiredAccessibilityLabel !== undefined
        ? requiredAccessibilityLabel
        : label,
    accessibilityLabelledBy: labelId,
    accessibilityHint: supportText,
    ...webControlProps({
      'aria-labelledby': labelId,
      ...(supportId !== undefined ? { 'aria-describedby': supportId } : {}),
      ...(invalid ? { 'aria-errormessage': errorId } : {}),
      'aria-invalid': invalid,
      'aria-required': required,
    }),
  } as FormFieldControlProps;

  return (
    <View
      testID={testID}
      {...nativeWindProps(className)}
      style={[styles.root, style]}
    >
      <View style={styles.labelRow}>
        <RNText
          nativeID={labelId}
          {...nativeWindProps(labelClassName)}
          style={[roleTextStyle(theme, 'label'), { color: theme.colors.text }, labelStyle]}
        >
          {label}
          {required ? ' *' : null}
        </RNText>
        {labelAccessory}
      </View>

      {children(controlProps)}

      {supportText !== undefined ? (
        <RNText
          nativeID={supportId}
          accessibilityLiveRegion={invalid ? 'polite' : 'none'}
          {...nativeWindProps(helperClassName)}
          style={[
            roleTextStyle(theme, 'caption'),
            { color: invalid ? theme.colors.danger : theme.colors.textMuted },
            helperStyle,
          ]}
        >
          {supportText}
        </RNText>
      ) : null}
    </View>
  );
}
