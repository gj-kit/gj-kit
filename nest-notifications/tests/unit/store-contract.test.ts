/**
 * §5.4 적합성 케이스 — R1–R13 · D1–D9 · I1–I3 · L1–L4를 인메모리 구현에 돌린다.
 *
 * 이 루프 자체가 README가 호스트에게 복사하라고 싣는 6줄이다. 호스트는 factory만
 * 자기 스토어로 바꾼다 — `run`의 파라미터가 `NotificationStoreSuite`이므로 인메모리 타입을
 * 한 번도 언급하지 않고 통과한다.
 */
import { describe, expect, it } from 'vitest';

import { fakeNotificationRuntime } from '../../src/testing/fake-runtime';
import { memoryNotificationStores } from '../../src/testing/memory-stores';
import { notificationStoreContractCases } from '../../src/testing/store-contract';
import type { NotificationObligation } from '../../src/testing/store-contract';

const cases = notificationStoreContractCases();

describe('notificationStoreContractCases', () => {
  it('29개 의무를 하나도 빠뜨리지 않는다', () => {
    const covered = new Set<NotificationObligation>(cases.map((entry) => entry.obligation));
    const expected: NotificationObligation[] = [
      'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10', 'R11', 'R12', 'R13',
      'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9',
      'I1', 'I2', 'I3',
      'L1', 'L2', 'L3', 'L4',
    ];
    expect([...covered].sort()).toEqual([...expected].sort());
  });

  it('skip 옵션이 해당 의무의 케이스를 전부 뺀다', () => {
    const skipped = notificationStoreContractCases({ skip: ['R1', 'L4'] });
    expect(skipped.some((entry) => entry.obligation === 'R1')).toBe(false);
    expect(skipped.some((entry) => entry.obligation === 'L4')).toBe(false);
    expect(skipped.length).toBe(cases.length - 2);
  });

  for (const testCase of cases) {
    it(testCase.name, async () => {
      await testCase.run(() => memoryNotificationStores(fakeNotificationRuntime()));
    });
  }
});
