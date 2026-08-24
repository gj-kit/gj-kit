// expo-secure-store의 vitest alias 대체물 — 유일한 모킹 허용 지점 (설계 문서 §5.2 말미).
// vi.mock이 아니라 resolve.alias 한 개다: src/storage.ts의 정적 import가 이 파일로 해석된다.

const store = new Map<string, string>();
let getItemCallCount = 0;
let readGate: Promise<void> | null = null;

export async function getItemAsync(key: string): Promise<string | null> {
  getItemCallCount += 1;
  // 값은 호출 시점에 캡처하고 완료(resolve)는 게이트 해제까지 늦춘다 — 실제 네이티브 IPC처럼
  // "읽기 시작과 완료 사이"에 다른 쓰기가 끼어드는 시나리오(H10 캐시 경합)를 재현한다:
  // 늦게 도착한 읽기 결과는 그 사이의 쓰기를 모르는 stale 값이다.
  const valueAtCallTime = store.get(key) ?? null;
  if (readGate !== null) await readGate;
  return valueAtCallTime;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

// ── 테스트 관측용 (실모듈에는 없는 표면 — 테스트만 상대경로로 import한다) ──
export function __reset(): void {
  store.clear();
  getItemCallCount = 0;
  readGate = null;
}

/** 읽기 완료를 이 promise가 resolve될 때까지 지연시킨다 (null = 게이트 해제). */
export function __setReadGate(gate: Promise<void> | null): void {
  readGate = gate;
}

export function __getItemCallCount(): number {
  return getItemCallCount;
}

export function __rawStore(): Map<string, string> {
  return store;
}
