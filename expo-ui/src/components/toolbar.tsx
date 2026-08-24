/**
 * Toolbar — a named, wrapping row of controls (filters, bulk actions, sort).
 *
 * It is a layout and naming contract only: the web host carries `role="toolbar"`
 * with an `aria-label`, and every child keeps its own focus behavior. The
 * library does not add arrow-key roving focus across children; a toolbar of
 * independent controls (search field, select, buttons) is reached with Tab.
 */
import type { ReactElement, ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import type { ViewStyle } from 'react-native';
import type { SpacingKey, Theme } from '../theme/tokens';
import { nativeWindProps, themedStyles } from './internal';
import type { CommonProps } from './internal';
import { useTheme } from './provider';

/** Main-axis distribution of the controls. */
export type ToolbarAlign = 'start' | 'center' | 'end' | 'space-between';

export interface ToolbarProps extends Omit<CommonProps, 'unstyled'> {
  /** Required: a toolbar landmark is only useful to assistive technology when it is named. */
  accessibilityLabel: string;
  children: ReactNode;
  /** Lets controls flow onto new lines when the row is too narrow. Defaults to true. */
  wrap?: boolean | undefined;
  /** Gap between controls, and between wrapped lines. Defaults to sm. */
  gap?: SpacingKey | undefined;
  /** Defaults to start. */
  align?: ToolbarAlign | undefined;
  /** Draws the toolbar as a bordered surface with inner padding. Defaults to false. */
  bordered?: boolean | undefined;
  unstyled?: never;
}

const getStyles = themedStyles((theme: Theme) => ({
  root: {
    alignItems: 'center' as const,
    alignSelf: 'stretch' as const,
    flexDirection: 'row' as const,
  },
  bordered: {
    borderRadius: theme.radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
}));

const ALIGNMENTS: readonly ToolbarAlign[] = ['start', 'center', 'end', 'space-between'];

export function assertToolbarProps(props: ToolbarProps): void {
  if (typeof props.accessibilityLabel !== 'string' || props.accessibilityLabel.trim().length === 0) {
    throw new Error('Toolbar accessibilityLabel must be a non-empty string.');
  }
  if (props.align !== undefined && !ALIGNMENTS.includes(props.align)) {
    throw new Error('Toolbar align must be "start", "center", "end", or "space-between".');
  }
  if ((props as { readonly unstyled?: unknown }).unstyled !== undefined) {
    throw new Error('Toolbar does not support unstyled.');
  }
}

function justifyContent(align: ToolbarAlign): NonNullable<ViewStyle['justifyContent']> {
  switch (align) {
    case 'center':
      return 'center';
    case 'end':
      return 'flex-end';
    case 'space-between':
      return 'space-between';
    default:
      return 'flex-start';
  }
}

/** A named wrapping row of controls. Children own their focus; no roving tabindex is added. */
export function Toolbar(props: ToolbarProps): ReactElement {
  assertToolbarProps(props);
  const {
    accessibilityLabel,
    children,
    wrap = true,
    gap = 'sm',
    align = 'start',
    bordered = false,
    style,
    className,
    testID,
  } = props;
  const theme = useTheme();
  const styles = getStyles(theme);
  const spacing = theme.spacing[gap];
  if (typeof spacing !== 'number') {
    throw new Error(`Toolbar gap "${String(gap)}" is not a spacing token.`);
  }

  return (
    <View
      accessibilityRole="toolbar"
      role="toolbar"
      accessibilityLabel={accessibilityLabel}
      aria-label={accessibilityLabel}
      {...(Platform.OS === 'web'
        ? ({ 'aria-orientation': 'horizontal' } as Record<string, unknown>)
        : {})}
      testID={testID}
      {...nativeWindProps(className)}
      style={[
        styles.root,
        bordered
          ? [
              styles.bordered,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.line },
            ]
          : null,
        {
          flexWrap: wrap ? 'wrap' : 'nowrap',
          gap: spacing,
          justifyContent: justifyContent(align),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
