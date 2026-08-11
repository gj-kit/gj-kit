import { StrictMode, createContext, useContext, useEffect } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Text } from 'react-native';
import {
  OverlayProvider,
  useOptionalOverlayStack,
  useOptionalTooltipCoordinator,
} from '../../src/components/overlay/provider';
import {
  OverlayHost,
  OverlayPortal,
} from '../../src/components/overlay/portal';
import {
  OverlayLayerBoundary,
  useOverlayParentId,
} from '../../src/components/overlay/layer';
import type { OverlayStack } from '../../src/components/overlay/stack';
import type { TooltipCoordinator } from '../../src/components/overlay/tooltip-coordinator';
import { UiProvider } from '../../src/components/provider';

afterEach(cleanup);

function requireTooltipCoordinator(
  value: TooltipCoordinator | null,
): TooltipCoordinator {
  if (value === null) throw new Error('Expected TooltipCoordinator to be captured.');
  return value;
}

describe('OverlayProvider / OverlayHost', () => {
  it('내부 host에 portal 내용을 한 번만 렌더하고 업데이트한다', () => {
    const rendered = render(
      <OverlayProvider>
        <OverlayHost />
        <OverlayPortal><Text>첫 내용</Text></OverlayPortal>
      </OverlayProvider>,
    );

    expect(screen.getAllByText('첫 내용')).toHaveLength(1);
    rendered.rerender(
      <OverlayProvider>
        <OverlayHost />
        <OverlayPortal><Text>바뀐 내용</Text></OverlayPortal>
      </OverlayProvider>,
    );
    expect(screen.queryByText('첫 내용')).toBeNull();
    expect(screen.getAllByText('바뀐 내용')).toHaveLength(1);
  });

  it('manual host 모드와 마지막 host 우선 규칙을 지킨다', () => {
    render(
      <OverlayProvider>
        <OverlayHost testID="first-host" />
        <OverlayHost testID="last-host" />
        <OverlayPortal><Text>레이어</Text></OverlayPortal>
      </OverlayProvider>,
    );

    expect(screen.queryByTestId('first-host')).toBeNull();
    expect(screen.getByTestId('last-host')).toBeTruthy();
    expect(screen.getAllByText('레이어')).toHaveLength(1);
  });

  it('중첩 Provider의 registry와 host를 서로 격리한다', () => {
    render(
      <OverlayProvider>
        <OverlayHost />
        <OverlayPortal><Text>바깥</Text></OverlayPortal>
        <OverlayProvider>
          <OverlayHost />
          <OverlayPortal><Text>안쪽</Text></OverlayPortal>
        </OverlayProvider>
      </OverlayProvider>,
    );

    expect(screen.getAllByText('바깥')).toHaveLength(1);
    expect(screen.getAllByText('안쪽')).toHaveLength(1);
  });

  it('중첩 Provider마다 독립 dismiss stack을 만든다', () => {
    const captured: OverlayStack[] = [];
    function CaptureStack() {
      const stack = useOptionalOverlayStack();
      useEffect(() => {
        if (stack !== null) captured.push(stack);
      }, [stack]);
      return null;
    }

    render(
      <OverlayProvider>
        <CaptureStack />
        <OverlayProvider>
          <OverlayHost />
          <CaptureStack />
        </OverlayProvider>
      </OverlayProvider>,
    );

    expect(captured).toHaveLength(2);
    expect(captured[0]).not.toBe(captured[1]);
  });

  it('명시적 nested Provider는 outer layer id를 새 stack의 phantom parent로 상속하지 않는다', () => {
    const capturedStacks: OverlayStack[] = [];
    const capturedParentIds: Array<string | undefined> = [];

    function RegisterInnerRoot() {
      const stack = useOptionalOverlayStack();
      const parentId = useOverlayParentId();
      useEffect(() => {
        if (stack === null) return;
        capturedStacks.push(stack);
        capturedParentIds.push(parentId);
        const handle = stack.mount({
          id: 'inner-root',
          ...(parentId === undefined ? {} : { parentId }),
          onDismiss: () => {},
        });
        return handle.unmount;
      }, [parentId, stack]);
      return null;
    }

    render(
      <OverlayProvider>
        <OverlayLayerBoundary overlayId="outer-dialog">
          <OverlayProvider>
            <RegisterInnerRoot />
          </OverlayProvider>
        </OverlayLayerBoundary>
      </OverlayProvider>,
    );

    expect(capturedStacks).toHaveLength(1);
    expect(capturedParentIds).toEqual([undefined]);
    expect(capturedStacks[0]?.getSnapshot().entries).toEqual([
      expect.objectContaining({ id: 'inner-root' }),
    ]);
    expect(capturedStacks[0]?.getSnapshot().entries[0]).not.toHaveProperty(
      'parentId',
    );
    expect(capturedStacks[0]?.isDescendant('inner-root', 'outer-dialog')).toBe(
      false,
    );
  });

  it('루트 UiProvider는 overlay scope를 자동 제공하고 중첩 테마는 같은 stack을 유지한다', () => {
    const captured: OverlayStack[] = [];
    function CaptureStack() {
      const stack = useOptionalOverlayStack();
      useEffect(() => {
        if (stack !== null) captured.push(stack);
      }, [stack]);
      return null;
    }

    render(
      <UiProvider>
        <CaptureStack />
        <UiProvider><CaptureStack /></UiProvider>
      </UiProvider>,
    );

    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
  });

  it('명시적으로 바깥에 둔 OverlayProvider를 루트 UiProvider가 가리지 않는다', () => {
    const captured: OverlayStack[] = [];
    function CaptureStack() {
      const stack = useOptionalOverlayStack();
      useEffect(() => {
        if (stack !== null) captured.push(stack);
      }, [stack]);
      return null;
    }

    render(
      <OverlayProvider>
        <CaptureStack />
        <UiProvider><CaptureStack /></UiProvider>
      </OverlayProvider>,
    );

    expect(captured).toHaveLength(2);
    expect(captured[0]).toBe(captured[1]);
  });

  it('StrictMode 재실행에서도 entry를 중복하지 않는다', () => {
    render(
      <StrictMode>
        <OverlayProvider>
          <OverlayHost />
          <OverlayPortal><Text>strict layer</Text></OverlayPortal>
        </OverlayProvider>
      </StrictMode>,
    );
    expect(screen.getAllByText('strict layer')).toHaveLength(1);
  });

  it('StrictMode effect replay survives, then real unmount destroys tooltip coordination', async () => {
    const captured: { current: TooltipCoordinator | null } = { current: null };
    const onOpen = vi.fn();
    const onClose = vi.fn();
    function CaptureCoordinator() {
      const current = useOptionalTooltipCoordinator();
      useEffect(() => {
        captured.current = current;
      }, [current]);
      return null;
    }

    const rendered = render(
      <StrictMode>
        <OverlayProvider>
          <CaptureCoordinator />
        </OverlayProvider>
      </StrictMode>,
    );
    await Promise.resolve();
    const coordinator = requireTooltipCoordinator(captured.current);
    coordinator.openNow({ id: 'strict-tooltip', onOpen, onClose });
    expect(onOpen).toHaveBeenCalledTimes(1);

    rendered.unmount();
    await waitFor(() => expect(onClose).toHaveBeenCalledWith('scope-destroyed'));
    expect(coordinator.getSnapshot()).toEqual({
      activeId: null,
      pendingId: null,
      warmed: false,
    });
  });

  it('Provider 밖 Portal을 명확한 오류로 거부한다', () => {
    expect(() => render(<OverlayPortal><Text>고립</Text></OverlayPortal>)).toThrow(
      'OverlayPortal must be rendered inside OverlayProvider.',
    );
  });

  it('host 위치 위의 앱 Context는 portal content에 보존된다', () => {
    const ValueContext = createContext('missing');
    function Consumer() {
      return <Text>{useContext(ValueContext)}</Text>;
    }

    render(
      <ValueContext.Provider value="공유 컨텍스트">
        <OverlayProvider>
          <OverlayHost />
          <OverlayPortal><Consumer /></OverlayPortal>
        </OverlayProvider>
      </ValueContext.Provider>
    );
    expect(screen.getByText('공유 컨텍스트')).toBeTruthy();
  });
});
