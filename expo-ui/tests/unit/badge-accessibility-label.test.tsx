/**
 * Badge accessibilityLabel 패스스루 — admin 백로그 #2.
 *
 * 보이는 라벨은 현지화 문구, 접근성 이름에는 원시 코드를 남기는 경우
 * ("결제 완료 (PAID)") 래퍼 View 없이 루트에서 이름을 재정의한다.
 * 웹에서는 role 없는 generic div의 aria-label이 ARIA에서 금지된 네이밍이라
 * 무시되므로, 루트가 role="img"를 갖고 보이는 라벨은 AT에서 숨긴다
 * (readonly Rating과 같은 패턴). 네이티브는 accessible 루트 평탄화 그대로다.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Badge } from '../../src/components/status';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

describe('Badge accessibilityLabel', () => {
  it('overrides the derived name on the root element while the visible label stays', () => {
    render(
      <UiProvider>
        <Badge label="결제 완료" accessibilityLabel="결제 완료 (PAID)" testID="badge" />
      </UiProvider>,
    );

    const root = screen.getByTestId('badge');
    expect(root.getAttribute('aria-label')).toBe('결제 완료 (PAID)');
    // aria-label 하나만으로는 부족하다 — 재정의가 계산된 접근성 이름이 되려면
    // 이름을 허용하는 role이 있어야 하고, 보이는 텍스트는 숨겨져야 한다.
    expect(root.getAttribute('role')).toBe('img');
    expect(screen.getByRole('img', { name: '결제 완료 (PAID)' })).toBe(root);
    const visibleLabel = screen.getByText('결제 완료');
    expect(visibleLabel.getAttribute('aria-hidden')).toBe('true');
  });

  it('absent prop changes nothing — no aria-label, no role, the label text is the content', () => {
    render(
      <UiProvider>
        <Badge label="결제 완료" testID="badge" />
      </UiProvider>,
    );

    const root = screen.getByTestId('badge');
    expect(root.getAttribute('aria-label')).toBeNull();
    expect(root.getAttribute('role')).toBeNull();
    const visibleLabel = screen.getByText('결제 완료');
    expect(visibleLabel.getAttribute('aria-hidden')).toBeNull();
  });
});
