/**
 * §5.2 타입 테스트 — §4 표의 타입 항목을 실제 픽스처로 닫는다.
 * `[검증필요]`로 남아 있던 주장들이 여기서 참·거짓으로 판정된다.
 */
import { describe, expectTypeOf, it } from 'vitest';

import { createNotificationDispatcher } from '../../src/core/dispatch';
import type { NotificationDispatchSummary } from '../../src/core/dispatch';
import { createNotificationRelay } from '../../src/core/relay';
import type { NotificationRelayOutcome, NotificationRelaySummary } from '../../src/core/relay';
import { createQuietHoursPolicy } from '../../src/core/policy';
import type {
  NotificationAction,
  NotificationCommand,
  NotificationPriority,
  NotificationPublisher,
  NotificationTiming,
} from '../../src/core/contracts';
import type {
  DispatchClaimRequest,
  NotificationRelayStore,
  RelayClaimRequest,
} from '../../src/core/store';
import { chunkExpoPushMessages } from '../../src/expo/chunk';
import { createExpoPushGateway } from '../../src/expo/gateway';
import type { ExpoPushEntry, ExpoPushMessage, ExpoPushTicket } from '../../src/expo/wire';
import { memoryNotificationStores } from '../../src/testing/memory-stores';
import type { NotificationStoreSuite } from '../../src/testing/memory-stores';
import { notificationStoreContractCases } from '../../src/testing/store-contract';

declare const relayStore: NotificationRelayStore;
declare const policy: ReturnType<typeof createQuietHoursPolicy>;
declare const dispatcherOptions: Parameters<typeof createNotificationDispatcher>[0];
declare const maybeActor: string | undefined;
declare const maybeTitle: string | null | undefined;
declare const maybeHref: string | undefined;
declare const hostSuite: NotificationStoreSuite;
declare const relayRun: () => Promise<NotificationRelaySummary>;
declare const dispatchRun: () => Promise<NotificationDispatchSummary>;
/** expo-server-sdk를 설치하지 않은 채 그 인스턴스 메서드의 형태만 세운다. */
declare const sdkSend: (messages: ExpoPushMessage[]) => Promise<ExpoPushTicket[]>;

interface PrismaLikeTx {
  readonly $kind: 'prisma';
}
declare const publisher: NotificationPublisher<PrismaLikeTx>;

describe('필수 옵션은 컴파일 에러로 결정을 강제한다', () => {
  it('presenter가 빠지면 디스패처를 만들 수 없다', () => {
    const { presenter: _presenter, ...withoutPresenter } = dispatcherOptions;
    // @ts-expect-error presenter는 필수다 — 라이브러리는 카피를 배포하지 않는다(§0.2-②).
    createNotificationDispatcher(withoutPresenter);
  });

  it('timeZone이 빠지면 정책을 만들 수 없다', () => {
    // @ts-expect-error 라이브러리는 지역 기본값을 갖지 않는다(§3.2.1).
    createQuietHoursPolicy({ quietHours: { startHour: 22, endHour: 8 } });
  });

  it('providers가 빠지면 디스패처를 만들 수 없다', () => {
    const { providers: _providers, ...withoutProviders } = dispatcherOptions;
    // @ts-expect-error provider 문자열은 호스트 설정이다(§0.4-⑧).
    createNotificationDispatcher(withoutProviders);
  });
});

describe('claim 요청은 순간이 아니라 기간을 나른다 (R12·D8)', () => {
  it('컷오프 Date를 넘길 필드가 타입에 없다', () => {
    expectTypeOf<RelayClaimRequest>().toHaveProperty('claimStaleMs');
    expectTypeOf<RelayClaimRequest['claimStaleMs']>().toEqualTypeOf<number>();
    expectTypeOf<DispatchClaimRequest['claimStaleMs']>().toEqualTypeOf<number>();
    // @ts-expect-error `staleBefore` 같은 컷오프 순간 필드는 존재하지 않는다.
    expectTypeOf<RelayClaimRequest>().toHaveProperty('staleBefore');
  });
});

describe('닫힌 유니언은 전수 처리를 강제한다', () => {
  it('NotificationRelayOutcome 4종을 다 다루지 않으면 never 할당이 깨진다', () => {
    const exhaustive = (outcome: NotificationRelayOutcome): string => {
      switch (outcome) {
        case 'relayed':
          return 'a';
        case 'suppressed':
          return 'b';
        case 'already-relayed':
          return 'c';
        case 'no-longer-live':
          return 'd';
        default: {
          const never: never = outcome;
          return never;
        }
      }
    };
    expectTypeOf(exhaustive).parameter(0).toEqualTypeOf<NotificationRelayOutcome>();
  });

  it('NotificationTiming은 판별 유니언으로 좁혀진다', () => {
    const read = (timing: NotificationTiming): string => {
      if (timing.mode === 'SCHEDULED') return timing.at;
      // @ts-expect-error IMMEDIATE 분기에는 `at`이 없다.
      return timing.at ?? 'immediate';
    };
    expectTypeOf(read).returns.toEqualTypeOf<string>();
  });

  it('NotificationPriority는 닫혀 있다', () => {
    expectTypeOf<NotificationPriority>().toEqualTypeOf<'NORMAL' | 'ESSENTIAL'>();
  });
});

describe('EOP 소비자 보호 (§1-8)', () => {
  it('옵셔널 필드에 `T | undefined`를 그대로 넘길 수 있다', () => {
    const command: NotificationCommand = {
      applicationKey: 'app',
      recipientRef: 'r',
      category: 'c',
      priority: 'NORMAL',
      body: 'b',
      eventKey: 'e',
      actorRef: maybeActor,
      title: maybeTitle,
    };
    expectTypeOf(command).toMatchTypeOf<NotificationCommand>();
  });

  it('NotificationAction의 인덱스 시그니처가 undefined를 허용한다', () => {
    const action: NotificationAction = { href: maybeHref, threadId: 7 };
    expectTypeOf(action).toMatchTypeOf<NotificationAction>();
  });
});

describe('NotificationPublisher는 호스트 트랜잭션 타입을 그대로 나른다', () => {
  it('Tx가 정확히 추론된다', () => {
    expectTypeOf(publisher.stage).parameter(0).toEqualTypeOf<PrismaLikeTx>();
    expectTypeOf(publisher.stage).parameter(1).toEqualTypeOf<NotificationCommand>();
  });
});

describe('저장소 포트는 구조적으로 적합하면 통과한다', () => {
  it('4메서드 구현체가 릴레이에 들어간다', () => {
    expectTypeOf(createNotificationRelay).toBeCallableWith({
      applicationKey: 'app',
      store: relayStore,
      policy,
    });
  });

  it('completeClaim이 없으면 저장소가 아니다', () => {
    const { completeClaim: _completeClaim, ...incomplete } = relayStore;
    // @ts-expect-error 멱등 완료(R8)는 포트의 일부다.
    const broken: NotificationRelayStore = incomplete;
    expectTypeOf(broken).toMatchTypeOf<NotificationRelayStore>();
  });
});

describe('잡 어댑터 접합 — 요약이 type alias여야만 성립한다 (§3.8.2)', () => {
  it('형제의 run 시그니처에 러너의 run이 그대로 대입된다', () => {
    type JobSummaryLike = Record<string, unknown>;
    const asRelayJob: (input: never, context: never) => Promise<JobSummaryLike | void> = relayRun;
    const asDispatchJob: (input: never, context: never) => Promise<JobSummaryLike | void> =
      dispatchRun;
    expectTypeOf(asRelayJob).toBeFunction();
    expectTypeOf(asDispatchJob).toBeFunction();
  });
});

describe('Expo 게이트웨이 접합 — SDK를 설치하지 않은 채 형태만 세운다 (§2.2-C)', () => {
  it('SDK의 sendPushNotificationsAsync가 메서드 문법 덕분에 그대로 대입된다', () => {
    const gateway = createExpoPushGateway({ send: sdkSend, defaultTitle: null });
    expectTypeOf(gateway.isValidEndpoint).toBeFunction();
  });

  it('청킹은 메시지 배열이 아니라 entry 배열을 돌려준다 — 대응이 자료구조다', () => {
    expectTypeOf(chunkExpoPushMessages).returns.toEqualTypeOf<
      readonly (readonly ExpoPushEntry[])[]
    >();
  });
});

describe('적합성 스위트 seam은 호스트 객체를 받는다 (§4-30)', () => {
  it('인메모리 타입을 한 번도 언급하지 않는 객체가 팩토리로 통과한다', () => {
    const [first] = notificationStoreContractCases();
    expectTypeOf(first?.run).toMatchTypeOf<
      | ((factory: () => NotificationStoreSuite | Promise<NotificationStoreSuite>) => Promise<void>)
      | undefined
    >();
    void (async (): Promise<void> => {
      await first?.run(() => hostSuite);
      // 인메모리 구현도 같은 입구로 들어간다 — 좁혀진 파라미터가 아니라는 증거.
      await first?.run(() => memoryNotificationStores());
    });
  });
});
