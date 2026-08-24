/**
 * §5.1 수신자 키 · 에러 · 명령 검증 · wakeup.
 * 소스 스펙의 케이스를 이식하고, 변경된 동작(NUL 거부·타입드 에러)을 추가로 고정한다.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  assertNotificationCommand,
  notificationPriorityFrom,
} from '../../src/core/contracts';
import { isNotificationsError, NotificationsError, safeErrorCode } from '../../src/core/errors';
import { notificationRecipientKey } from '../../src/core/recipient-key';
import { createNotificationWakeup } from '../../src/core/wakeup';
import { fakeNotificationRuntime } from '../../src/testing/fake-runtime';
import { recordingNotificationLogger } from '../../src/testing/recording-logger';
import { command } from './helpers';

describe('notificationRecipientKey', () => {
  it('소문자 64자 hex이고 결정적이다', () => {
    const key = notificationRecipientKey('app', 'user');
    expect(key).toMatch(/^[0-9a-f]{64}$/u);
    expect(notificationRecipientKey('app', 'user')).toBe(key);
  });

  it('digest가 sha256(app + U+0000 + ref)와 비트 동일하다 — 기존 tombstone 마이그레이션 0', () => {
    const expected = createHash('sha256').update('app\u0000user', 'utf8').digest('hex');
    expect(notificationRecipientKey('app', 'user')).toBe(expected);
  });

  it('앱이 다르면 키가 다르고, 수신자가 다르면 키가 다르다', () => {
    expect(notificationRecipientKey('app-a', 'user')).not.toBe(
      notificationRecipientKey('app-b', 'user'),
    );
    expect(notificationRecipientKey('app', 'user-a')).not.toBe(
      notificationRecipientKey('app', 'user-b'),
    );
  });

  it('콜론 형태로 경계를 위장할 수 없다', () => {
    expect(notificationRecipientKey('a:b', 'c')).not.toBe(notificationRecipientKey('a', 'b:c'));
  });

  it('빈 수신자 ref는 허용된다', () => {
    expect(notificationRecipientKey('app', '')).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([
    ['app\u0000x', 'user'],
    ['app', 'user\u0000x'],
  ])('U+0000이 섞인 입력은 거부된다 — 구분자가 단사가 아니게 되므로', (app, ref) => {
    try {
      notificationRecipientKey(app, ref);
      throw new Error('did not throw');
    } catch (error) {
      expect(isNotificationsError(error) && error.code).toBe(
        'ERR_NOTIFICATION_RECIPIENT_KEY_INPUT',
      );
    }
  });
});

describe('에러', () => {
  it('safeErrorCode는 타입드 코드를 그대로 돌려준다', () => {
    expect(safeErrorCode(new NotificationsError('ERR_NOTIFICATION_POLICY_INVALID', 'x'))).toBe(
      'ERR_NOTIFICATION_POLICY_INVALID',
    );
  });

  it('일반 예외는 이름만 남고 메시지는 사라진다', () => {
    expect(safeErrorCode(new TypeError('token=hunter2'))).toBe('TypeError');
  });

  it.each([['thrown string'], [42], [null], [undefined], [{ nope: true }]])(
    '비-Error 던지기(%s)는 unknown-error로 접힌다',
    (value) => {
      expect(safeErrorCode(value)).toBe('unknown-error');
    },
  );

  it('code 프로퍼티를 가진 객체는 그 코드를 쓴다', () => {
    expect(safeErrorCode({ code: 'ECONNRESET' })).toBe('ECONNRESET');
  });

  it('길이를 넘으면 잘린다', () => {
    const long = new Error('x');
    long.name = 'A'.repeat(500);
    expect(safeErrorCode(long)).toHaveLength(120);
    expect(safeErrorCode(long, 10)).toHaveLength(10);
  });

  it('isNotificationsError는 이중 로드로 클래스가 둘이어도 참이다', () => {
    // 다른 realm에서 만들어진 것처럼 브랜드만 가진 객체.
    const brand = Symbol.for('@gj-kit/nest-notifications:error');
    const foreign = Object.assign(new Error('foreign'), {
      code: 'ERR_NOTIFICATION_CONFIG_INVALID',
      [brand]: true,
    });
    expect(isNotificationsError(foreign)).toBe(true);
    expect(isNotificationsError(new Error('plain'))).toBe(false);
    expect(isNotificationsError(null)).toBe(false);
  });
});

describe('명령 검증', () => {
  it('정상 명령은 통과한다', () => {
    expect(() => assertNotificationCommand(command({ eventKey: 'e1' }))).not.toThrow();
  });

  it.each([
    ['applicationKey', { applicationKey: '' }],
    ['recipientRef', { recipientRef: '  ' }],
    ['category', { category: '' }],
    ['body', { body: '' }],
    ['eventKey', { eventKey: '' }],
  ])('빈 %s는 ERR_NOTIFICATION_COMMAND_INVALID', (_field, overrides) => {
    try {
      assertNotificationCommand(command({ eventKey: 'e1', ...overrides }));
      throw new Error('did not throw');
    } catch (error) {
      expect(isNotificationsError(error) && error.code).toBe('ERR_NOTIFICATION_COMMAND_INVALID');
    }
  });

  it('SCHEDULED의 at은 ISO 8601이어야 한다', () => {
    expect(() =>
      assertNotificationCommand(
        command({ eventKey: 'e1', timing: { mode: 'SCHEDULED', at: 'not-a-date' } }),
      ),
    ).toThrow();
  });

  it('batch.itemCount는 양의 정수여야 한다', () => {
    expect(() =>
      assertNotificationCommand(command({ eventKey: 'e1', batch: { key: 'k', itemCount: 0 } })),
    ).toThrow();
  });

  it('notificationPriorityFrom은 알 수 없는 값을 타입드 에러로 거부한다', () => {
    expect(notificationPriorityFrom('NORMAL')).toBe('NORMAL');
    try {
      notificationPriorityFrom('URGENT');
      throw new Error('did not throw');
    } catch (error) {
      expect(isNotificationsError(error) && error.code).toBe(
        'ERR_NOTIFICATION_PRIORITY_UNSUPPORTED',
      );
    }
  });
});

describe('wakeup — 명시적 best-effort', () => {
  function stubs() {
    const calls = { relay: 0, dispatch: 0 };
    let relayed = 1;
    let relayThrows = false;
    return {
      calls,
      setRelayed: (value: number) => {
        relayed = value;
      },
      setRelayThrows: (value: boolean) => {
        relayThrows = value;
      },
      relay: {
        relayDue: async () => {
          calls.relay += 1;
          if (relayThrows) throw new Error('relay exploded');
          return {
            ok: true,
            claimed: relayed,
            relayed,
            suppressed: 0,
            alreadyRelayed: 0,
            noLongerLive: 0,
            failed: 0,
          };
        },
      },
      dispatcher: {
        dispatchDue: async () => {
          calls.dispatch += 1;
          return { ok: true, claimed: 0, delivered: 0, failed: 0, endpointsDisabled: 0 };
        },
      },
    };
  }

  it('호출자 스택에서는 아무 일도 하지 않는다', () => {
    const runtime = fakeNotificationRuntime();
    const parts = stubs();
    createNotificationWakeup({ relay: parts.relay, dispatcher: parts.dispatcher, runtime }).request();
    expect(parts.calls.relay).toBe(0);
  });

  it('버스트를 한 패스로 접는다', async () => {
    const runtime = fakeNotificationRuntime();
    const parts = stubs();
    const wakeup = createNotificationWakeup({
      relay: parts.relay,
      dispatcher: parts.dispatcher,
      runtime,
    });
    wakeup.request();
    wakeup.request();
    wakeup.request();
    runtime.flush();
    await Promise.resolve();
    expect(parts.calls.relay).toBe(1);
  });

  it('relay가 하나도 relay하지 못했으면 dispatcher를 부르지 않는다', async () => {
    const runtime = fakeNotificationRuntime();
    const parts = stubs();
    parts.setRelayed(0);
    const wakeup = createNotificationWakeup({
      relay: parts.relay,
      dispatcher: parts.dispatcher,
      runtime,
    });
    wakeup.request();
    runtime.flush();
    await Promise.resolve();
    expect(parts.calls.relay).toBe(1);
    expect(parts.calls.dispatch).toBe(0);
  });

  it('실패를 삼키고 error.name만 로그에 남긴 뒤 재사용 가능하다', async () => {
    const runtime = fakeNotificationRuntime();
    const logger = recordingNotificationLogger();
    const parts = stubs();
    parts.setRelayThrows(true);
    const wakeup = createNotificationWakeup({
      relay: parts.relay,
      dispatcher: parts.dispatcher,
      runtime,
      logger,
    });
    wakeup.request();
    runtime.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(logger.entries[0]?.level).toBe('warn');
    expect(logger.entries[0]?.fields['error']).toBe('Error');

    parts.setRelayThrows(false);
    wakeup.request();
    runtime.flush();
    await Promise.resolve();
    expect(parts.calls.relay).toBe(2);
  });

  it('enabled: false면 완전히 무동작이다', () => {
    const runtime = fakeNotificationRuntime();
    const parts = stubs();
    const wakeup = createNotificationWakeup({
      relay: parts.relay,
      dispatcher: parts.dispatcher,
      runtime,
      enabled: false,
    });
    wakeup.request();
    runtime.flush();
    expect(parts.calls.relay).toBe(0);
  });
});
