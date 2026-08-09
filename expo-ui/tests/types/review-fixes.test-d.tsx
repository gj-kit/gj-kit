/**
 * 적대적 리뷰 확정 발견의 타입 강제 회귀 고정 (2026-08-10).
 */
import { describe, it } from 'vitest';
import { Button } from '../../src/index';

describe('리뷰 수정 — §6 ③ 경계 강화: children의 명시적 undefined/null 차단', () => {
  it('children={undefined}·{null}은 컴파일 에러, 유효 노드는 통과한다', () => {
    // @ts-expect-error children에 명시적 undefined — 내용·a11y 라벨이 모두 비는 우회 차단
    void (<Button onPress={() => undefined} children={undefined} />);
    // @ts-expect-error children에 null
    void (<Button onPress={() => undefined} children={null} />);
    // 정상 경로 — 문자열 children
    void (<Button onPress={() => undefined}>저장</Button>);
    // 정상 경로 — label과 함께라면 children 생략 가능
    void (<Button label="저장" onPress={() => undefined} />);
  });
});
