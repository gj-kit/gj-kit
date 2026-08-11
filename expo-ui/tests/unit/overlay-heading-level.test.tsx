/**
 * 오버레이 제목의 문서 heading level.
 *
 * RNW는 `accessibilityRole="header"`에 aria-level이 없으면 `<h1>`을 내보낸다.
 * 다이얼로그·팝오버 제목은 페이지 제목이 아니라 그 안의 섹션 제목이므로,
 * 호스트 페이지에 h1이 두 개 생기면 문서 개요와 SEO가 함께 망가진다.
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Text } from 'react-native';
import { Dialog, DialogPanel } from '../../src/components/dialog';
import { Popover } from '../../src/components/popover';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

describe('오버레이 제목 heading level', () => {
  it('DialogPanel 제목은 h1이 아니라 h2로 렌더된다', () => {
    render(
      <UiProvider>
        <Dialog visible animationType="none" onDismiss={() => {}}>
          <DialogPanel title="Panel title">
            <Text>Body</Text>
          </DialogPanel>
        </Dialog>
      </UiProvider>,
    );

    const heading = screen.getByText('Panel title');
    expect(heading.getAttribute('aria-level')).toBe('2');
    expect(heading.tagName.toLowerCase()).not.toBe('h1');
  });

  it('열린 Popover 제목도 h2로 렌더된다', () => {
    render(
      <UiProvider>
        <Popover triggerLabel="Open" title="Popover title" open onOpenChange={() => {}}>
          <Text>Body</Text>
        </Popover>
      </UiProvider>,
    );

    const heading = screen.getByText('Popover title');
    expect(heading.getAttribute('aria-level')).toBe('2');
    expect(heading.tagName.toLowerCase()).not.toBe('h1');
  });
});
