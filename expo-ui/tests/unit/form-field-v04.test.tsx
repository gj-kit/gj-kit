/** FormField v0.4 및 TextField 접근성 연결 회귀 테스트. */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TextInput, View } from 'react-native';
import { FormField } from '../../src/components/form-field';
import type { FormFieldControlProps } from '../../src/components/form-field';
import { TextField } from '../../src/components/fields';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

describe('v0.4 FormField', () => {
  it('보이는 label·helper와 제어를 안정적인 ID로 연결한다', () => {
    const received: FormFieldControlProps[] = [];

    render(
      <UiProvider>
        <FormField label="Email" helperText="업무용 주소를 입력하세요">
          {(controlProps) => {
            received.push(controlProps);
            return <TextInput {...controlProps} testID="email-control" />;
          }}
        </FormField>
      </UiProvider>,
    );

    const label = screen.getByText('Email');
    const helper = screen.getByText('업무용 주소를 입력하세요');
    const control = screen.getByTestId('email-control');

    expect(label.id).toMatch(/^gj-form-field-.*-label$/);
    expect(helper.id).toMatch(/^gj-form-field-.*-helper$/);
    expect(control.id).toMatch(/^gj-form-field-.*-control$/);
    expect(control.getAttribute('aria-labelledby')).toBe(label.id);
    expect(control.getAttribute('aria-describedby')).toBe(helper.id);
    expect(control.getAttribute('aria-errormessage')).toBeNull();
    expect(control.getAttribute('aria-invalid')).toBe('false');
    expect(control.getAttribute('aria-required')).toBe('false');
    expect(screen.getByRole('textbox', { name: 'Email' })).toBe(control);

    expect(received.at(-1)).toMatchObject({
      nativeID: control.id,
      accessibilityLabel: 'Email',
      accessibilityLabelledBy: label.id,
      accessibilityHint: '업무용 주소를 입력하세요',
    });
  });

  it('error가 helperText보다 우선하고 같은 오류 ID를 설명·오류 관계에 사용한다', () => {
    const received: FormFieldControlProps[] = [];

    render(
      <UiProvider>
        <FormField label="Email" helperText="도움말" error="올바른 주소가 아닙니다">
          {(controlProps) => {
            received.push(controlProps);
            return <TextInput {...controlProps} testID="invalid-control" />;
          }}
        </FormField>
      </UiProvider>,
    );

    const error = screen.getByText('올바른 주소가 아닙니다');
    const control = screen.getByTestId('invalid-control');

    expect(screen.queryByText('도움말')).toBeNull();
    expect(error.id).toMatch(/^gj-form-field-.*-error$/);
    expect(error.getAttribute('aria-live')).toBe('polite');
    expect(error.getAttribute('role')).not.toBe('alert');
    expect(control.getAttribute('aria-describedby')).toBe(error.id);
    expect(control.getAttribute('aria-errormessage')).toBe(error.id);
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(received.at(-1)).toMatchObject({
      accessibilityHint: '올바른 주소가 아닙니다',
    });
  });

  it('required 상태와 label accessory·스타일 훅을 노출한다', () => {
    const received: FormFieldControlProps[] = [];

    render(
      <UiProvider>
        <FormField
          label="초대 코드"
          required
          requiredAccessibilityLabel="초대 코드, 필수"
          labelAccessory={<View testID="label-accessory" />}
          className="field-root"
          labelClassName="field-label"
          helperClassName="field-helper"
          style={{ padding: 7 }}
          labelStyle={{ opacity: 0.9 }}
          helperStyle={{ opacity: 0.8 }}
          helperText="관리자에게 문의하세요"
          testID="field"
        >
          {(controlProps) => {
            received.push(controlProps);
            return <TextInput {...controlProps} testID="required-control" />;
          }}
        </FormField>
      </UiProvider>,
    );

    const root = screen.getByTestId('field');
    const label = screen.getByText('초대 코드 *');
    const helper = screen.getByText('관리자에게 문의하세요');
    const control = screen.getByTestId('required-control');

    // className은 라이브러리가 해석하지 않고 NativeWind 호스트에 전달하는 계약이다.
    expect(root.style.padding).toBe('7px');
    expect(label.style.opacity).toBe('0.9');
    expect(helper.style.opacity).toBe('0.8');
    expect(screen.getByTestId('label-accessory')).toBeTruthy();
    expect(control.getAttribute('aria-required')).toBe('true');
    expect(received.at(-1)?.accessibilityLabel).toBe('초대 코드, 필수');
    expect(received.at(-1)).not.toHaveProperty('accessibilityState');
  });

  it('한 화면의 여러 필드가 label·control·helper ID를 공유하지 않는다', () => {
    render(
      <UiProvider>
        <FormField label="이름" helperText="실명">
          {(controlProps) => <TextInput {...controlProps} testID="name" />}
        </FormField>
        <FormField label="회사" helperText="소속">
          {(controlProps) => <TextInput {...controlProps} testID="company" />}
        </FormField>
      </UiProvider>,
    );

    const name = screen.getByTestId('name');
    const company = screen.getByTestId('company');
    expect(name.id).not.toBe(company.id);
    expect(name.getAttribute('aria-labelledby')).not.toBe(
      company.getAttribute('aria-labelledby'),
    );
    expect(name.getAttribute('aria-describedby')).not.toBe(
      company.getAttribute('aria-describedby'),
    );
  });

  it('helper에서 error로 전환해도 label·control ID는 안정적이고 설명 ID만 바뀐다', () => {
    const field = (error?: string) => (
      <UiProvider>
        <FormField label="Email" helperText="도움말" error={error}>
          {(controlProps) => <TextInput {...controlProps} testID="stable-control" />}
        </FormField>
      </UiProvider>
    );
    const { rerender } = render(field());
    const firstControl = screen.getByTestId('stable-control');
    const controlId = firstControl.id;
    const labelId = firstControl.getAttribute('aria-labelledby');
    const helperId = firstControl.getAttribute('aria-describedby');

    rerender(field('오류가 있습니다'));

    const nextControl = screen.getByTestId('stable-control');
    const error = screen.getByText('오류가 있습니다');
    expect(nextControl.id).toBe(controlId);
    expect(nextControl.getAttribute('aria-labelledby')).toBe(labelId);
    expect(nextControl.getAttribute('aria-describedby')).toBe(error.id);
    expect(error.id).not.toBe(helperId);
    expect(nextControl.getAttribute('aria-errormessage')).toBe(error.id);
  });
});

describe('TextField 접근성 연결 회귀', () => {
  it('기존 visible label·helper를 input에 연결한다', () => {
    render(
      <UiProvider>
        <TextField label="사용자 이름" helperText="공개 프로필에 표시됩니다" testID="username" />
      </UiProvider>,
    );

    const label = screen.getByText('사용자 이름');
    const helper = screen.getByText('공개 프로필에 표시됩니다');
    const input = screen.getByTestId('username');
    expect(input.id).toMatch(/^gj-text-field-.*-control$/);
    expect(input.getAttribute('aria-labelledby')).toBe(label.id);
    expect(input.getAttribute('aria-describedby')).toBe(helper.id);
    expect(input.getAttribute('aria-invalid')).toBe('false');
    expect(screen.getByRole('textbox', { name: '사용자 이름' })).toBe(input);
  });

  it('error를 polite live region과 aria-errormessage로 연결한다', () => {
    render(
      <UiProvider>
        <TextField label="Email" helperText="도움말" error="필수 항목입니다" testID="email" />
      </UiProvider>,
    );

    const error = screen.getByText('필수 항목입니다');
    const input = screen.getByTestId('email');
    expect(screen.queryByText('도움말')).toBeNull();
    expect(error.getAttribute('aria-live')).toBe('polite');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(input.getAttribute('aria-errormessage')).toBe(error.id);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('supplied nativeID·accessible name·외부 관계·상태를 보존한다', () => {
    render(
      <UiProvider>
        <View nativeID="external-help" />
        <TextField
          label="내부 라벨"
          helperText="내부 도움말"
          nativeID="custom-input-id"
          accessibilityLabel="직접 지정한 이름"
          accessibilityHint="직접 지정한 힌트"
          accessibilityState={{ disabled: true, busy: true }}
          aria-labelledby="external-label"
          aria-describedby="external-help"
          aria-required
          testID="custom-input"
        />
      </UiProvider>,
    );

    const input = screen.getByTestId('custom-input');
    const helper = screen.getByText('내부 도움말');
    expect(input.id).toBe('custom-input-id');
    expect(input.getAttribute('aria-label')).toBe('직접 지정한 이름');
    expect(input.getAttribute('aria-labelledby')).toBe('external-label');
    expect(input.getAttribute('aria-describedby')).toBe(`external-help ${helper.id}`);
    expect(input.getAttribute('aria-required')).toBe('true');
    expect(input.getAttribute('aria-disabled')).toBe('true');
    expect(input.hasAttribute('readonly')).toBe(true);
    // RNW TextInput은 accessibilityState.busy를 DOM에 투영하지 않지만, 구현은
    // 원본 state를 병합한 뒤 그대로 TextInput에 전달한다.
  });
});
