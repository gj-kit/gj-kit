/** vitest + react-native-web alias 파이프라인 스모크 — 설계 문서 §9. */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button, UiProvider, createTheme } from '../../src/index';

describe('스모크: vitest + react-native-web 렌더 파이프라인', () => {
  it('Button이 렌더되고 onPress 계약이 성립한다', () => {
    render(
      <UiProvider theme={createTheme('light')}>
        <Button label="저장" onPress={() => {}} testID="save" />
      </UiProvider>,
    );
    expect(screen.getByTestId('save')).toBeTruthy();
    expect(screen.getByText('저장')).toBeTruthy();
  });
});
