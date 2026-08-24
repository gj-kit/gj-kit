/**
 * §5.1 Expo 헬퍼 — 청크 경계·ticket 분류·토큰 형태·게이트웨이 조립.
 * 전부 SDK 없이 도는 순수 함수 위의 테스트다.
 */
import { describe, expect, it } from 'vitest';

import { chunkExpoPushMessages } from '../../src/expo/chunk';
import { createExpoPushGateway, isExpoPushToken } from '../../src/expo/gateway';
import { classifyExpoPushTickets } from '../../src/expo/tickets';
import type { ExpoPushEntry, ExpoPushMessage, ExpoPushTicket } from '../../src/expo/wire';
import { EXPO_PUSH_CHUNK_SIZE } from '../../src/expo/wire';
import type { NotificationPushPayload } from '../../src/core/push';

function entries(count: number): ExpoPushEntry[] {
  return Array.from({ length: count }, (_unused, index) => ({
    endpoint: { id: `endpoint-${index}`, provider: 'expo', address: `ExpoPushToken[t${index}]` },
    message: { to: `ExpoPushToken[t${index}]`, body: 'body' },
  }));
}

const payload: NotificationPushPayload = {
  notificationId: 'message-1',
  idempotencyKey: 'delivery-1',
  recipientRef: 'recipient-1',
  title: null,
  body: 'body text',
  action: { href: '/x' },
  priority: 'NORMAL',
};

describe('chunkExpoPushMessages', () => {
  it.each([
    [0, 0],
    [1, 1],
    [99, 1],
    [100, 1],
    [101, 2],
    [250, 3],
  ])('%i개 → 청크 %i개', (count, expected) => {
    expect(chunkExpoPushMessages(entries(count))).toHaveLength(expected);
  });

  it('각 청크가 자기 endpoint를 데리고 다닌다 — 대응이 가정이 아니라 자료구조다', () => {
    const chunks = chunkExpoPushMessages(entries(150));
    expect(chunks[0]?.[0]?.endpoint.id).toBe('endpoint-0');
    expect(chunks[1]?.[0]?.endpoint.id).toBe('endpoint-100');
    for (const chunk of chunks) {
      for (const entry of chunk) expect(entry.message.to).toBe(entry.endpoint.address);
    }
  });

  it('chunkSize를 바꿀 수 있고 잘못된 값은 거부한다', () => {
    expect(chunkExpoPushMessages(entries(5), { chunkSize: 2 })).toHaveLength(3);
    expect(() => chunkExpoPushMessages(entries(1), { chunkSize: 0 })).toThrow();
    expect(() => chunkExpoPushMessages(entries(1), { chunkSize: 1.5 })).toThrow();
    expect(EXPO_PUSH_CHUNK_SIZE).toBe(100);
  });
});

describe('classifyExpoPushTickets', () => {
  it('전부 ok면 accepted이고 ticket id를 돌려준다 (receipt 폴링용)', () => {
    const result = classifyExpoPushTickets(entries(2), [
      { status: 'ok', id: 't-0' },
      { status: 'ok', id: 't-1' },
    ]);
    expect(result).toEqual({
      accepted: true,
      invalidEndpointIds: [],
      ticketIds: ['t-0', 't-1'],
      otherErrors: [],
    });
  });

  it('DeviceNotRegistered는 그 endpoint만 무효로 표시하고 핸드오프는 성공이다', () => {
    const result = classifyExpoPushTickets(entries(2), [
      { status: 'ok', id: 't-0' },
      { status: 'error', details: { error: 'DeviceNotRegistered' } },
    ]);
    expect(result.accepted).toBe(true);
    expect(result.invalidEndpointIds).toEqual(['endpoint-1']);
  });

  it('그 밖의 에러는 accepted:false이고 코드만 남는다 — 메시지는 절대 담지 않는다', () => {
    const ticket: ExpoPushTicket = {
      status: 'error',
      message: 'secret-bearing message',
      details: { error: 'MessageTooBig' },
    };
    const result = classifyExpoPushTickets(entries(1), [ticket]);
    expect(result.accepted).toBe(false);
    expect(result.otherErrors).toEqual(['MessageTooBig']);
    expect(JSON.stringify(result)).not.toContain('secret-bearing');
  });

  it('details가 없는 에러는 unknown으로 접힌다', () => {
    const result = classifyExpoPushTickets(entries(1), [{ status: 'error' }]);
    expect(result.otherErrors).toEqual(['unknown']);
  });

  it('undersized 응답은 절대 핸드오프가 아니다', () => {
    const result = classifyExpoPushTickets(entries(3), [{ status: 'ok', id: 't-0' }]);
    expect(result.accepted).toBe(false);
    expect(result.ticketIds).toEqual(['t-0']);
  });

  it('빈 응답도 마찬가지다', () => {
    expect(classifyExpoPushTickets(entries(2), []).accepted).toBe(false);
    // 요청도 응답도 비면 할 일이 없었던 것이다.
    expect(classifyExpoPushTickets([], []).accepted).toBe(true);
  });
});

describe('isExpoPushToken', () => {
  it.each([
    ['ExpoPushToken[abc]', true],
    ['ExponentPushToken[abc]', true],
    ['expopushtoken[abc]', false],
    ['ExpoPushToken', false],
    ['ExpoPushToken[]', false],
    ['ExpoPushToken[a b]', false],
    [' ExpoPushToken[abc]', false],
    ['', false],
  ])('%s → %s', (address, expected) => {
    expect(isExpoPushToken(address)).toBe(expected);
  });
});

describe('createExpoPushGateway', () => {
  const okTickets = (count: number): ExpoPushTicket[] =>
    Array.from({ length: count }, (_unused, index) => ({ status: 'ok', id: `t-${index}` }));

  it('로컬 형태 거부는 rejected로만 나가고 invalid와 섞이지 않는다', async () => {
    const gateway = createExpoPushGateway({
      defaultTitle: 'App',
      send: async (messages) => okTickets(messages.length),
    });
    const result = await gateway.send(
      [
        { id: 'good', provider: 'expo', address: 'ExpoPushToken[t0]' },
        { id: 'bad', provider: 'expo', address: 'not-a-token' },
      ],
      payload,
    );
    expect(result.accepted).toBe(true);
    expect(result.rejectedEndpointIds).toEqual(['bad']);
    expect(result.invalidEndpointIds).toEqual([]);
  });

  it('send는 수신자 없이 호출된다 — 바인딩을 잊은 클래스 메서드가 조용히 성공할 수 없다', async () => {
    // `expo-server-sdk`의 `sendPushNotificationsAsync`가 정확히 이 형태다: 프로토타입
    // 메서드가 `this.<무언가>`를 읽는다. 옵션 객체가 수신자가 되면 그 읽기가 "그럴듯한
    // 무언가"에 닿아 실패가 애매해진다. 게이트웨이는 수신자를 떼어 내므로 `this`는
    // 확정적으로 undefined다.
    class Sdk {
      readonly marker = 'sdk';
      calls = 0;
      async sendPushNotificationsAsync(messages: readonly ExpoPushMessage[]) {
        this.calls += 1;
        void this.marker;
        return okTickets(messages.length);
      }
    }
    const sdk = new Sdk();
    const endpoints = [{ id: 'a', provider: 'expo', address: 'ExpoPushToken[t0]' }];

    // 언바인드 — README가 한때 광고하던 형태다. 전송은 한 번도 시도되지 않는다.
    const unbound = createExpoPushGateway({
      defaultTitle: 'App',
      send: sdk.sendPushNotificationsAsync,
    });
    const failed = await unbound.send(endpoints, payload);
    expect(failed.accepted).toBe(false);
    expect(sdk.calls).toBe(0);

    // 바인드 — 실제로 전송된다.
    const bound = createExpoPushGateway({
      defaultTitle: 'App',
      send: (messages) => sdk.sendPushNotificationsAsync(messages),
    });
    const accepted = await bound.send(endpoints, payload);
    expect(accepted.accepted).toBe(true);
    expect(sdk.calls).toBe(1);
  });

  it('this는 옵션 객체가 아니다 — 수신자를 떼어 낸 사실 자체를 고정한다', async () => {
    let receiver: unknown = 'unset';
    const options = {
      defaultTitle: 'App',
      async send(this: unknown, messages: readonly ExpoPushMessage[]) {
        receiver = this;
        return okTickets(messages.length);
      },
    };
    const gateway = createExpoPushGateway(options);
    await gateway.send([{ id: 'a', provider: 'expo', address: 'ExpoPushToken[t0]' }], payload);
    expect(receiver).toBeUndefined();
  });

  it('유효한 endpoint가 하나도 없으면 전송을 시도하지 않는다', async () => {
    let calls = 0;
    const gateway = createExpoPushGateway({
      defaultTitle: null,
      send: async (messages) => {
        calls += 1;
        return okTickets(messages.length);
      },
    });
    const result = await gateway.send([{ id: 'bad', provider: 'expo', address: 'x' }], payload);
    expect(calls).toBe(0);
    expect(result.accepted).toBe(true);
  });

  it('defaultTitle·collapseId·priority 매핑', async () => {
    let captured: readonly { readonly title?: string | undefined }[] = [];
    const gateway = createExpoPushGateway({
      defaultTitle: 'Fallback',
      channelId: 'general',
      send: async (messages) => {
        captured = messages;
        return okTickets(messages.length);
      },
    });
    await gateway.send([{ id: 'a', provider: 'expo', address: 'ExpoPushToken[t0]' }], {
      ...payload,
      priority: 'ESSENTIAL',
    });
    const message = captured[0] as Record<string, unknown>;
    expect(message['title']).toBe('Fallback');
    expect(message['collapseId']).toBe('delivery-1');
    expect(message['priority']).toBe('high');
    expect(message['channelId']).toBe('general');
  });

  it('전송이 throw해도 던지지 않고 accepted:false로 흡수한다', async () => {
    const gateway = createExpoPushGateway({
      defaultTitle: null,
      send: async () => {
        throw new Error('network down');
      },
    });
    const result = await gateway.send(
      [{ id: 'a', provider: 'expo', address: 'ExpoPushToken[t0]' }],
      payload,
    );
    expect(result.accepted).toBe(false);
  });

  it('continueAfterChunkFailure: false면 첫 실패에서 멈춘다', async () => {
    let calls = 0;
    const failing = {
      defaultTitle: null,
      send: async (messages: readonly unknown[]) => {
        calls += 1;
        throw new Error(`chunk ${calls} failed with ${messages.length}`);
      },
    };
    const endpoints = Array.from({ length: 250 }, (_unused, index) => ({
      id: `e-${index}`,
      provider: 'expo',
      address: `ExpoPushToken[t${index}]`,
    }));

    calls = 0;
    await createExpoPushGateway({ ...failing, continueAfterChunkFailure: false }).send(
      endpoints,
      payload,
    );
    expect(calls).toBe(1);

    calls = 0;
    await createExpoPushGateway({ ...failing, continueAfterChunkFailure: true }).send(
      endpoints,
      payload,
    );
    expect(calls).toBe(3);
  });
});
