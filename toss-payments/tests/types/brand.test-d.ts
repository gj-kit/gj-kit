import { describe, expectTypeOf, it } from 'vitest';

// brand.ts는 내부 모듈 — 패키지 엔트리에서는 절대 도달 불가. 테스트만 상대 경로로 접근한다.
import type { Brand } from '../../src/core/brand';

describe('Brand (타입 스모크)', () => {
  it('외부에서 구조적으로 위조 불가 — 비공개 unique symbol 키를 지칭할 방법이 없다', () => {
    type Verified = Brand<'Verified'>;

    // symbol 인덱스 시그니처로도 필수 브랜드 프로퍼티를 충족할 수 없다
    expectTypeOf<{ readonly [key: symbol]: 'Verified' }>().not.toExtend<Verified>();

    // @ts-expect-error 객체 리터럴로 Brand 제조 불가 — 브랜드 심볼이 비공개
    const forged: Verified = {};
    void forged;
  });
});
