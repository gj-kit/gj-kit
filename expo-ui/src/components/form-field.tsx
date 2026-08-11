/**
 * FormField — connects a visible field description to an arbitrary control through
 * an accessibility ID contract.
 *
 * It passes the control props through a render prop instead of cloning the child,
 * so a TextInput — or an app-owned picker or composite control — decides for
 * itself where each prop lands.
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
 * The accessibility wiring a FormField render prop hands to its control.
 * `aria-*` only appears on the runtime object under RNW; this narrow public type
 * expresses it without bringing DOM types into src.
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
  /** When set, it takes precedence over helperText and is announced through a polite live region. */
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
  /** A localized, complete control name so that iOS VoiceOver also announces the required state. */
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
