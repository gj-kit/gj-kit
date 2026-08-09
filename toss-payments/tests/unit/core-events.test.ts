/**
 * §3.3 이미터 런타임 — 핸들러 완전 격리·no-op 계약·구독 전용 표면.
 */
import { describe, expect, it, vi } from 'vitest';

import { createTossEvents, getInternalEmit } from '../../src/core/events';
import type { TossEventsOf } from '../../src/core/events';
import { createTossEvents as createServerTossEvents } from '../../src/server/events';
import type { TossEventMap } from '../../src/server/events';

interface TestMap {
  ping: { readonly n: number };
  pong: { readonly label: string };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** createTossEvents 산출물에서 emit을 꺼낸다 — 테스트 전용 헬퍼(항상 존재 전제). */
function emitOf(events: TossEventsOf<TestMap>) {
  const emit = getInternalEmit<TestMap>(events);
  if (emit === null) throw new Error('createTossEvents 산출물이어야 합니다');
  return emit;
}

describe('createTossEvents — 구독/발화/해제', () => {
  it('발화 이벤트에 type 판별자와 at(ISO 8601)이 덧붙는다', () => {
    const events = createTossEvents<TestMap>();
    const seen: Array<{ type: string; at: string; n: number }> = [];
    events.on('ping', (e) => {
      seen.push({ type: e.type, at: e.at, n: e.n });
    });
    emitOf(events).emit('ping', { n: 7 });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.type).toBe('ping');
    expect(seen[0]?.n).toBe(7);
    expect(Number.isNaN(Date.parse(seen[0]?.at ?? ''))).toBe(false);
  });

  it('on 반환값 = 구독 해제 — 해제 후 발화는 도달하지 않는다', () => {
    const events = createTossEvents<TestMap>();
    const handler = vi.fn();
    const off = events.on('ping', handler);
    emitOf(events).emit('ping', { n: 1 });
    off();
    emitOf(events).emit('ping', { n: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('이벤트 이름별 라우팅 — 다른 이벤트 구독자에게 새지 않는다', () => {
    const events = createTossEvents<TestMap>();
    const ping = vi.fn();
    const pong = vi.fn();
    events.on('ping', ping);
    events.on('pong', pong);
    emitOf(events).emit('ping', { n: 1 });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(pong).not.toHaveBeenCalled();
  });

  it('미구독 이벤트 emit은 no-op(순회 0회) — 예외 없음', () => {
    const events = createTossEvents<TestMap>();
    expect(() => emitOf(events).emit('ping', { n: 1 })).not.toThrow();
  });
});

describe('createTossEvents — 핸들러 완전 격리 (협상 불가)', () => {
  it('sync throw 핸들러가 있어도 다른 핸들러는 전부 실행되고 emit은 throw하지 않는다', () => {
    const onHandlerError = vi.fn();
    const events = createTossEvents<TestMap>({ onHandlerError });
    const after = vi.fn();
    events.on('ping', () => {
      throw new Error('handler-sync-boom');
    });
    events.on('ping', after);

    expect(() => emitOf(events).emit('ping', { n: 1 })).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(onHandlerError).toHaveBeenCalledTimes(1);
    expect(onHandlerError.mock.calls[0]?.[0]).toMatchObject({ type: 'ping' });
    expect((onHandlerError.mock.calls[0]?.[0] as { cause: Error }).cause.message).toBe(
      'handler-sync-boom',
    );
  });

  it('async rejection도 onHandlerError로만 보고된다 (unhandled rejection 없음)', async () => {
    const onHandlerError = vi.fn();
    const events = createTossEvents<TestMap>({ onHandlerError });
    events.on('ping', async () => {
      throw new Error('handler-async-boom');
    });
    emitOf(events).emit('ping', { n: 1 });
    await tick();
    expect(onHandlerError).toHaveBeenCalledTimes(1);
    expect((onHandlerError.mock.calls[0]?.[0] as { cause: Error }).cause.message).toBe(
      'handler-async-boom',
    );
  });

  it('onHandlerError 자신의 throw도 삼켜진다', () => {
    const events = createTossEvents<TestMap>({
      onHandlerError: () => {
        throw new Error('observer-boom');
      },
    });
    events.on('ping', () => {
      throw new Error('handler-boom');
    });
    expect(() => emitOf(events).emit('ping', { n: 1 })).not.toThrow();
  });

  it('발화 중 구독 해제해도 이번 발화 스냅샷은 불변', () => {
    // 첫 핸들러가 두 번째 핸들러를 해제 — 스냅샷 순회라 이번 발화에서는 여전히 호출된다
    const events = createTossEvents<TestMap>();
    let offSecond: (() => void) | null = null;
    const secondHandler = vi.fn();
    events.on('ping', () => {
      offSecond?.();
    });
    offSecond = events.on('ping', secondHandler);
    emitOf(events).emit('ping', { n: 1 });
    expect(secondHandler).toHaveBeenCalledTimes(1);
    emitOf(events).emit('ping', { n: 2 });
    expect(secondHandler).toHaveBeenCalledTimes(1); // 다음 발화부터 미도달
  });
});

describe('getInternalEmit — 발행은 createTossEvents 산출물에만 흐른다', () => {
  it('구조적 모조 이미터는 null — 발행 지점이 조용히 no-op이 될 수 있게', () => {
    const fake: TossEventsOf<TestMap> = { on: () => () => undefined };
    expect(getInternalEmit(fake)).toBeNull();
    expect(getInternalEmit<TestMap>(undefined)).toBeNull();
  });

  it('내부 emit 계층은 비열거 — JSON/스프레드에 새지 않는다', () => {
    const events = createTossEvents<TestMap>();
    expect(Object.keys(events)).toEqual(['on']);
    expect(JSON.stringify(events)).not.toContain('emit');
  });

  it('server 별칭 createTossEvents도 동일 런타임 — TossEventMap 이벤트로 왕복', () => {
    const events = createServerTossEvents();
    const seen = vi.fn();
    events.on('api.call', seen);
    const emit = getInternalEmit<TossEventMap>(events);
    expect(emit).not.toBeNull();
    emit?.emit('api.call', {
      method: 'POST',
      path: '/v1/payments/confirm',
      outcome: 'ok',
      httpStatus: 200,
      durationMs: 12,
      traceId: 'trace-1',
      attempts: 1,
    });
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toMatchObject({ type: 'api.call', outcome: 'ok', attempts: 1 });
  });
});
