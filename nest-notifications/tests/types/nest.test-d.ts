/**
 * §5.2 Nest 표면 타입 테스트 — 배럴 경계와 모듈 옵션의 필수 필드.
 */
import { describe, expectTypeOf, it } from 'vitest';

import type { NotificationDispatchSummary } from '../../src/core/dispatch';
import type { NotificationsError } from '../../src/core/errors';
import type { NotificationRelaySummary } from '../../src/core/relay';
import { NestNotificationsModule } from '../../src/nest/module';
import type { NestNotificationsOptions } from '../../src/nest/module';
import {
  NotificationDispatchRunner,
  NotificationRelayRunner,
} from '../../src/nest/runners';

declare const options: NestNotificationsOptions;
declare const relayRunner: NotificationRelayRunner;
declare const dispatchRunner: NotificationDispatchRunner;

type IndexExports = typeof import('../../src/index');

describe('`.` 배럴은 코어의 런타임 값을 재수출하지 않는다 (§2.1)', () => {
  it('파이프라인 팩토리는 `./core`에서만 온다', () => {
    expectTypeOf<IndexExports>().not.toHaveProperty('createNotificationRelay');
    expectTypeOf<IndexExports>().not.toHaveProperty('createNotificationDispatcher');
    expectTypeOf<IndexExports>().not.toHaveProperty('createQuietHoursPolicy');
    expectTypeOf<IndexExports>().not.toHaveProperty('notificationRecipientKey');
  });

  it('Nest 표면과 DI 토큰은 여기 있다', () => {
    expectTypeOf<IndexExports>().toHaveProperty('NestNotificationsModule');
    expectTypeOf<IndexExports>().toHaveProperty('NOTIFICATION_RELAY_STORE');
    expectTypeOf<IndexExports>().toHaveProperty('NotificationRelayRunner');
    expectTypeOf<IndexExports>().toHaveProperty('fromNestLogger');
  });

  it('코어 타입은 타입으로 재수출된다', () => {
    // 값 네임스페이스에는 없고 타입 네임스페이스에만 있다 — 그 구분이 §2.1의 요점이다.
    type Reexported = import('../../src/index').NotificationRelaySummary;
    expectTypeOf<Reexported>().toEqualTypeOf<NotificationRelaySummary>();
  });

  it('NotificationsError는 여기서 타입일 뿐이다 — 값으로 쓰면 컴파일이 막는다', () => {
    // 클래스를 `export type {}` 목록에 넣으면 dts 롤업이 이 이름을 **값으로** 광고하고,
    // 소비자는 컴파일을 통과한 뒤 런타임에 모듈 인스턴스화 실패를 본다. 별칭으로 내면
    // 그 실패가 컴파일 시점으로 당겨진다.
    expectTypeOf<IndexExports>().not.toHaveProperty('NotificationsError');
    type AsType = import('../../src/index').NotificationsError;
    expectTypeOf<AsType>().toEqualTypeOf<NotificationsError>();
  });
});

describe('모듈 옵션', () => {
  it('저장소 3종·게이트웨이·presenter·정책·providers는 전부 필수다', () => {
    const { presenter: _presenter, ...withoutPresenter } = options;
    // @ts-expect-error presenter가 없으면 배선이 컴파일되지 않는다.
    NestNotificationsModule.forRoot(withoutPresenter);

    const { relayStore: _relayStore, ...withoutStore } = options;
    // @ts-expect-error 저장소는 기본값을 가질 수 없다.
    NestNotificationsModule.forRoot(withoutStore);
  });

  it('forRoot와 forRootAsync는 같은 DynamicModule을 돌려준다', () => {
    expectTypeOf(NestNotificationsModule.forRoot).returns.toEqualTypeOf<
      ReturnType<typeof NestNotificationsModule.forRootAsync>
    >();
  });
});

describe('러너 반환 타입이 곧 계약이다 (§1-5)', () => {
  it('run()은 요약을 돌려주고 wakeup은 아무것도 돌려주지 않는다', () => {
    expectTypeOf(relayRunner.run).returns.toEqualTypeOf<Promise<NotificationRelaySummary>>();
    expectTypeOf(dispatchRunner.run).returns.toEqualTypeOf<Promise<NotificationDispatchSummary>>();
    expectTypeOf<
      import('../../src/core/wakeup').NotificationPipelineWakeup['request']
    >().returns.toEqualTypeOf<void>();
  });
});
