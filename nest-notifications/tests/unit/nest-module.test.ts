/**
 * §5.1 Nest DI 배선 — 실제 Nest 컨테이너를 띄워 토큰·러너·검증을 확인한다.
 *
 * 이 파일이 있어야 "Symbol.for 토큰"과 "명시적 @Inject" 결정이 주장이 아니라 실행이 된다.
 */
import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { isNotificationsError } from '../../src/core/errors';
import {
  NOTIFICATION_APPLICATION_KEY,
  NOTIFICATION_DELIVERY_STORE,
  NOTIFICATION_ENDPOINT_STORE,
  NOTIFICATION_LOGGER,
  NOTIFICATION_PIPELINE_WAKEUP,
  NOTIFICATION_PRESENTER,
  NOTIFICATION_PUBLISHER,
  NOTIFICATION_PUSH_GATEWAY,
  NOTIFICATION_RELAY_STORE,
  NOTIFICATION_RUNTIME,
  NOTIFICATION_SCHEDULING_POLICY,
} from '../../src/nest/inject';
import { NestNotificationsModule } from '../../src/nest/module';
import type { NestNotificationsOptions } from '../../src/nest/module';
import { NotificationDispatchRunner, NotificationRelayRunner } from '../../src/nest/runners';
import { passthroughPresenter } from '../../src/testing/passthrough';
import { recordingNotificationLogger } from '../../src/testing/recording-logger';
import { APP, command, harness, PROVIDER, recordingGateway } from './helpers';
import type { Harness } from './helpers';

function optionsFor(context: Harness, gateway = recordingGateway()): NestNotificationsOptions {
  return {
    applicationKey: APP,
    relayStore: context.stores.relayStore,
    deliveryStore: context.stores.deliveryStore,
    endpointStore: context.stores.endpointStore,
    pushGateway: gateway,
    presenter: passthroughPresenter(),
    policy: context.policy,
    providers: [PROVIDER],
    runtime: context.runtime,
    logger: recordingNotificationLogger(),
  };
}

describe('NestNotificationsModule.forRoot', () => {
  it('11개 토큰과 두 러너를 전부 주입 가능하게 내보낸다', async () => {
    const context = harness();
    const moduleRef = await Test.createTestingModule({
      imports: [NestNotificationsModule.forRoot(optionsFor(context))],
    }).compile();

    for (const token of [
      NOTIFICATION_APPLICATION_KEY,
      NOTIFICATION_RELAY_STORE,
      NOTIFICATION_DELIVERY_STORE,
      NOTIFICATION_ENDPOINT_STORE,
      NOTIFICATION_PUSH_GATEWAY,
      NOTIFICATION_PRESENTER,
      NOTIFICATION_SCHEDULING_POLICY,
      NOTIFICATION_PIPELINE_WAKEUP,
      NOTIFICATION_RUNTIME,
      NOTIFICATION_LOGGER,
    ]) {
      expect(moduleRef.get(token, { strict: false })).toBeDefined();
    }
    // publisher를 안 준 호스트에게는 null이 보인다 — 토큰 자체는 항상 존재한다.
    expect(moduleRef.get(NOTIFICATION_PUBLISHER, { strict: false })).toBeNull();
    expect(moduleRef.get(NotificationRelayRunner)).toBeInstanceOf(NotificationRelayRunner);
    expect(moduleRef.get(NotificationDispatchRunner)).toBeInstanceOf(NotificationDispatchRunner);
    await moduleRef.close();
  });

  it('러너가 실제 파이프라인을 돌린다 — stage → relay → dispatch', async () => {
    const context = harness();
    const gateway = recordingGateway();
    const moduleRef = await Test.createTestingModule({
      imports: [NestNotificationsModule.forRoot(optionsFor(context, gateway))],
    }).compile();

    await context.stores.stage(command({ eventKey: 'e1' }));
    await context.stores.registerEndpoint({
      applicationKey: APP,
      recipientRef: 'recipient-1',
      provider: PROVIDER,
      address: 'ExponentPushToken[abc]',
    });

    const relaySummary = await moduleRef.get(NotificationRelayRunner).run();
    expect(relaySummary).toMatchObject({ ok: true, relayed: 1 });
    const dispatchSummary = await moduleRef.get(NotificationDispatchRunner).run();
    expect(dispatchSummary).toMatchObject({ ok: true, delivered: 1 });
    expect(gateway.sends).toHaveLength(1);
    await moduleRef.close();
  });

  it('세 러너가 같은 런타임 인스턴스를 공유한다', async () => {
    const context = harness();
    const moduleRef = await Test.createTestingModule({
      imports: [NestNotificationsModule.forRoot(optionsFor(context))],
    }).compile();
    expect(moduleRef.get(NOTIFICATION_RUNTIME, { strict: false })).toBe(context.runtime);
    await moduleRef.close();
  });

  it('빈 applicationKey는 부팅에서 죽는다 — 코드는 APPLICATION_KEY_INVALID다', () => {
    const context = harness();
    try {
      NestNotificationsModule.forRoot({ ...optionsFor(context), applicationKey: '  ' });
      throw new Error('did not throw');
    } catch (error) {
      // 이 코드는 유니언의 멤버이고 README 표가 "application key 형태 오류"라고 적는다.
      // 던지는 자리가 없으면 소비자의 switch에 도달 불가능한 분기가 남는다.
      expect(isNotificationsError(error) && error.code).toBe(
        'ERR_NOTIFICATION_APPLICATION_KEY_INVALID',
      );
    }
  });

  it('빈 providers 배열도 부팅에서 죽는다', () => {
    const context = harness();
    try {
      NestNotificationsModule.forRoot({ ...optionsFor(context), providers: [] });
      throw new Error('did not throw');
    } catch (error) {
      expect(isNotificationsError(error) && error.code).toBe('ERR_NOTIFICATION_CONFIG_INVALID');
    }
  });

  it('토큰은 Symbol.for라 이중 로드에서도 같은 값이다', () => {
    expect(NOTIFICATION_RELAY_STORE).toBe(
      Symbol.for('@gj-kit/nest-notifications:relay-store'),
    );
  });
});

describe('NestNotificationsModule.forRootAsync', () => {
  it('팩토리로 조립해도 같은 표면을 내보내고 같은 검증을 통과한다', async () => {
    const context = harness();
    const moduleRef = await Test.createTestingModule({
      imports: [
        NestNotificationsModule.forRootAsync({
          useFactory: () => optionsFor(context),
        }),
      ],
    }).compile();

    expect(moduleRef.get(NOTIFICATION_APPLICATION_KEY, { strict: false })).toBe(APP);
    expect(moduleRef.get(NotificationRelayRunner)).toBeInstanceOf(NotificationRelayRunner);
    await moduleRef.close();
  });

  it('팩토리가 잘못된 설정을 돌려주면 컨테이너 조립이 실패한다', async () => {
    const context = harness();
    await expect(
      Test.createTestingModule({
        imports: [
          NestNotificationsModule.forRootAsync({
            useFactory: () => ({ ...optionsFor(context), providers: [] }),
          }),
        ],
      }).compile(),
    ).rejects.toThrow();
  });
});
