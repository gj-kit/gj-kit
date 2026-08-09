/**
 * events — 타입드 in-process pub/sub 이미터 런타임 (설계 §3.3).
 *
 * 제네릭 런타임만 core에 둔다(의존성 0·환경 중립). `TossEventMap` 전체와 별칭
 * (TossEvents/createTossEvents)은 server 타입 참조가 필요하므로 "./server"에서 export한다
 * — 이 모듈은 core/index.ts에서 재export하지 않는다(brand.ts와 같은 내부 모듈 규칙).
 *
 * 협상 불가 계약:
 * - 공개 표면은 구독 전용(`on`) — emit은 내부 심볼 인터페이스로만 흐른다(라이브러리만 발행).
 * - emit은 Result 확정 **후** 동기 fire-and-forget 발화, 반환값 무시·await 없음 —
 *   이벤트가 플로우 결과를 바꾸는 경로가 타입상 존재하지 않는다.
 * - 핸들러별 try/catch 격리 — sync throw·async rejection 모두 `onHandlerError`로만 보고되고,
 *   그 콜백의 throw도 삼켜진다.
 * - 전달 보장은 at-most-once·in-process·비영속 — 이벤트로 원장(ledger)을 만들지 말 것
 *   (원장은 OrderStore/DB + Result 트랜잭션 처리, 이벤트는 관측·부수 반응 전용).
 */

/**
 * 이벤트 맵 형태 제약 — 이벤트 이름(string) → payload(object).
 * `Record<string, object>` 고정이 아니라 자기 참조 제약이다 — 인덱스 시그니처 없는
 * 인터페이스(server의 TossEventMap)도 충족하도록.
 */
export type EventPayloadMap<M> = { readonly [K in keyof M]: object };

/** 발화된 이벤트 값 — payload에 판별자 type과 ISO 8601 발화 시각 at이 덧붙는다. */
export type EventOf<M extends EventPayloadMap<M>, K extends keyof M & string> = {
  readonly type: K;
  readonly at: string;
} & M[K];

/**
 * 구독 전용 표면 — server의 `TossEvents`가 이 형태의 별칭이다.
 * emit이 공개 표면에 없으므로 사용자 코드가 라이브러리 이벤트를 위조 발행할 수 없다.
 */
export interface TossEventsOf<M extends EventPayloadMap<M>> {
  /** 반환값 = 구독 해제 함수. */
  on<K extends keyof M & string>(
    type: K,
    handler: (event: EventOf<M, K>) => void | Promise<void>,
  ): () => void;
}

/** (내부) 발행 인터페이스 — getInternalEmit으로만 획득 가능. */
export interface InternalTossEmit<M extends EventPayloadMap<M>> {
  emit<K extends keyof M & string>(type: K, payload: M[K]): void;
}

export interface CreateTossEventsOptions<M extends EventPayloadMap<M>> {
  /** 핸들러 예외 통지. 기본 무시 — 이 콜백의 throw도 삼켜진다. */
  readonly onHandlerError?: (info: {
    readonly type: keyof M & string;
    readonly cause: unknown;
  }) => void;
}

/**
 * (내부) 이미터에 emit 계층을 매다는 비공개 심볼 — 비열거라 JSON/스프레드에 새지 않고
 * 공개 타입에도 나타나지 않는다 (server/client.ts의 internalHttp와 동일 패턴).
 */
const internalEmit: unique symbol = Symbol('gj-kit/toss-payments#events-emit');

/** 내부 저장용 광의 핸들러 형태 — 발화 시 이벤트 이름별 Set에서 꺼내므로 K 일치가 보장된다. */
type StoredHandler = (event: object) => void | Promise<void>;

/**
 * 제네릭 이미터 — server의 `createTossEvents`가 `TossEventMap`으로 인스턴스화해 재export한다.
 *
 * 미구독 이벤트의 emit은 Set 조회 1회 후 즉시 반환한다(순회 0회) — 버스 미주입 시에는
 * 발행 지점 자체가 no-op이므로 옵션 꺼짐 비용이 0에 수렴한다.
 */
export function createTossEvents<M extends EventPayloadMap<M>>(
  options?: CreateTossEventsOptions<M>,
): TossEventsOf<M> {
  const handlers = new Map<string, Set<StoredHandler>>();
  const onHandlerError = options?.onHandlerError;

  const notify = (type: keyof M & string, cause: unknown): void => {
    try {
      onHandlerError?.({ type, cause });
    } catch {
      // onHandlerError의 throw도 삼킨다 — 관측 실패가 플로우에 영향을 주는 경로 차단
    }
  };

  const surface: TossEventsOf<M> = {
    on(type, handler) {
      let set = handlers.get(type);
      if (set === undefined) {
        set = new Set();
        handlers.set(type, set);
      }
      // 저장용 광의 캐스트 — on의 K와 emit의 K가 같은 Map 키로 묶여 발화 시 형태가 일치한다
      const stored = handler as StoredHandler;
      set.add(stored);
      return () => {
        set.delete(stored);
      };
    },
  };

  const emitter: InternalTossEmit<M> = {
    emit(type, payload) {
      const set = handlers.get(type);
      if (set === undefined || set.size === 0) return; // 미구독 = 순회 0회
      const event: object = { ...payload, type, at: new Date().toISOString() };
      // 스냅샷 순회 — 핸들러가 발화 중 구독/해제해도 이번 발화 대상은 불변
      for (const handler of [...set]) {
        try {
          // sync throw는 catch로, async rejection은 then의 실패 콜백으로 — 양쪽 다 격리
          void Promise.resolve(handler(event)).then(undefined, (cause) => notify(type, cause));
        } catch (cause) {
          notify(type, cause);
        }
      }
    },
  };

  Object.defineProperty(surface, internalEmit, { value: emitter, enumerable: false });
  return surface;
}

/**
 * (내부) createTossEvents 산출물에서 emit 계층을 꺼낸다 — 구조적 모조 이미터면 null.
 * null이면 발행 지점은 조용히 no-op — 사용자 구현 TossEvents로는 발행이 흐르지 않는다
 * (공개 표면 구독 전용 계약의 런타임 짝).
 */
export function getInternalEmit<M extends EventPayloadMap<M>>(
  events: TossEventsOf<M> | undefined,
): InternalTossEmit<M> | null {
  if (events === undefined) return null;
  // 비공개 심볼 프로퍼티 조회 — 공개 타입에 없는 필드라 단언이 불가피 (심볼은 이 모듈 밖 비공개)
  const holder = events as { readonly [internalEmit]?: InternalTossEmit<M> };
  return holder[internalEmit] ?? null;
}
