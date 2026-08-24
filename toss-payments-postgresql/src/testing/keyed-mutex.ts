/**
 * @internal 키별 promise-chain mutex — `./testing` 인메모리 aggregate의 advisory lock 대역.
 *
 * PostgreSQL advisory lock처럼 **같은 키의 획득은 FIFO로 직렬화**되고 다른 키는 독립이다.
 * 대기자는 앞선 보유자의 release를 promise로 기다리므로 테스트가 contention을 실제로
 * 관측할 수 있다(두 번째 callback은 첫 번째가 끝나기 전에는 시작되지 않는다).
 */
export interface KeyedMutex {
  /** 키를 획득할 때까지 기다린 뒤 release 함수를 돌려준다. release는 정확히 1회만 유효하다. */
  acquire(key: string): Promise<() => void>;
  /** 보유 중인 lock이 없을 때만 호출한다(테스트 간 reset). */
  clear(): void;
}

export function createKeyedMutex(): KeyedMutex {
  const tails = new Map<string, Promise<void>>();

  return {
    async acquire(key) {
      const previous = tails.get(key) ?? Promise.resolve();
      let release!: () => void;
      const current = new Promise<void>((resolve) => {
        release = resolve;
      });
      // 다음 대기자는 이 보유자의 release까지 기다린다 — previous가 끝난 뒤 current.
      const tail = previous.then(() => current);
      tails.set(key, tail);
      await previous;

      let released = false;
      return () => {
        if (released) return;
        released = true;
        release();
        // 뒤에 대기자가 없으면 map 항목을 정리한다(뒤가 있으면 tail이 교체돼 있다).
        if (tails.get(key) === tail) tails.delete(key);
      };
    },
    clear() {
      tails.clear();
    },
  };
}
