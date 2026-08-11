import { describe, expectTypeOf, it } from 'vitest';
import {
  ToastViewport,
  useToastQueue,
} from '../../src/index';
import type {
  ToastAction,
  ToastAnnouncement,
  ToastDismissReason,
  ToastId,
  ToastQueueController,
  ToastRecord,
  ToastRequest,
  ToastUpdate,
  ToastViewportDismissReason,
  ToastViewportProps,
  UseToastQueueOptions,
} from '../../src/index';

const noop = (): void => undefined;

describe('Toast queue 공개 타입 계약', () => {
  it('show가 branded id를 만들고 plain string 조작을 막는다', () => {
    const queue = useToastQueue();
    const id = queue.show({ message: '저장했습니다' });
    expectTypeOf(id).toEqualTypeOf<ToastId>();
    expectTypeOf(queue).toEqualTypeOf<ToastQueueController>();
    expectTypeOf(queue.records).toEqualTypeOf<readonly ToastRecord[]>();
    expectTypeOf(queue.visibleToasts).toEqualTypeOf<readonly ToastRecord[]>();
    expectTypeOf(queue.queuedCount).toEqualTypeOf<number>();
    void queue.update(id, { message: '완료' });
    void queue.dismiss(id);
    void queue.pause(id);
    void queue.resume(id);

    // @ts-expect-error queue가 발급하지 않은 일반 문자열은 ToastId가 아니다
    queue.dismiss('toast-1');
    // @ts-expect-error update도 branded id만 받는다
    queue.update('toast-1', { message: '오류' });
    // @ts-expect-error timeout 외 임의 문자열은 dismiss reason이 아니다
    queue.dismiss(id, 'swipe');
  });

  it('영속 duration과 action/announcement/dedupe 요청을 타입으로 고정한다', () => {
    const action: ToastAction = {
      label: '되돌리기',
      accessibilityLabel: '삭제 되돌리기',
      onPress: noop,
    };
    const request: ToastRequest = {
      title: '삭제됨',
      message: '사진이 삭제되었습니다.',
      variant: 'warning',
      durationMs: null,
      announcement: 'assertive',
      action,
      dedupeKey: 'delete-photo',
    };
    void request;
    const persistent: ToastRequest = { message: '오프라인', durationMs: null };
    void persistent;

    // @ts-expect-error message는 필수다
    const missingMessage: ToastRequest = { variant: 'info' };
    void missingMessage;
    // @ts-expect-error durationMs는 number|null만 받는다
    const invalidDuration: ToastRequest = { message: 'x', durationMs: 'forever' };
    void invalidDuration;
    // @ts-expect-error action은 label과 onPress를 함께 가져야 한다
    const deadAction: ToastRequest = { message: 'x', action: { label: '실행' } };
    void deadAction;
    // @ts-expect-error 임의 announcement를 허용하지 않는다
    const loud: ToastRequest = { message: 'x', announcement: 'loud' };
    void loud;
  });

  it('record는 정규화 필드가 필수이고 update의 null 제거 계약을 노출한다', () => {
    expectTypeOf<ToastRecord['variant']>().toEqualTypeOf<
      'error' | 'success' | 'info' | 'warning'
    >();
    expectTypeOf<ToastRecord['durationMs']>().toEqualTypeOf<number | null>();
    expectTypeOf<ToastRecord['announcement']>().toEqualTypeOf<ToastAnnouncement>();
    const update: ToastUpdate = {
      title: null,
      action: null,
      dedupeKey: null,
      durationMs: null,
    };
    void update;
    // @ts-expect-error message는 null로 제거할 수 없다
    const invalid: ToastUpdate = { message: null };
    void invalid;
  });

  it('옵션과 dismiss reason union이 닫혀 있다', () => {
    const reasons: readonly ToastDismissReason[] = [
      'timeout',
      'close-action',
      'action',
      'programmatic',
      'queue-overflow',
    ];
    void reasons;
    const options: UseToastQueueOptions = {
      maxVisible: 2,
      maxQueued: 8,
      defaultDurationMs: 4_000,
      onDismiss(toast, reason) {
        expectTypeOf(toast).toEqualTypeOf<ToastRecord>();
        expectTypeOf(reason).toEqualTypeOf<ToastDismissReason>();
      },
    };
    void useToastQueue(options);
  });
});

describe('ToastViewport 공개 타입 계약', () => {
  it('controller callbacks를 그대로 연결하고 Common 꼬리를 제공한다', () => {
    const queue = useToastQueue();
    void (
      <ToastViewport
        toasts={queue.visibleToasts}
        onDismiss={queue.dismiss}
        onPause={queue.pause}
        onResume={queue.resume}
        placement="top"
        offset={24}
        style={{ opacity: 0.8 }}
        className="toast-host"
        testID="toast-host"
      />
    );
    expectTypeOf<ToastViewportProps['onDismiss']>().parameter(1).toEqualTypeOf<
      ToastViewportDismissReason
    >();
    // @ts-expect-error pause callback은 ToastId와 무관한 값을 받을 수 없다
    void (<ToastViewport toasts={[]} onDismiss={queue.dismiss} onPause={(id: number) => id} onResume={queue.resume} />);
    // @ts-expect-error position은 닫힌 union이다
    void (<ToastViewport toasts={[]} onDismiss={queue.dismiss} onPause={queue.pause} onResume={queue.resume} placement="center" />);
    // @ts-expect-error 공통 이관 잔재 prop 차단
    void (<ToastViewport toasts={[]} onDismiss={queue.dismiss} onPause={queue.pause} onResume={queue.resume} unstyled />);
    // @ts-expect-error close 동작을 큐에 돌려줄 callback은 필수다
    void (<ToastViewport toasts={[]} onPause={queue.pause} onResume={queue.resume} />);
  });
});
