// 공용 bounded LRU — 설계 문서 §7-7.
//
// 두 메모 테이블(zone·number)이 이 한 구현을 공유한다. 상한이 없으면 요청마다 다른 IANA
// 이름이나 `Accept-Language`를 넘기는 서버가 프로세스 수명 내내 포매터를 쌓는다. 상한만
// 있고 recency 갱신이 없으면 반대로 **뜨거운 항목이 축출**돼 캐시가 무의미해진다 — 두
// 성질을 다 고정한다.
import { describe, expect, it } from 'vitest';

import { CACHE_LIMIT, createBoundedCache } from '../../src/cache';

describe('createBoundedCache', () => {
  it('상한까지는 전부 남는다', () => {
    const cache = createBoundedCache<number>(3);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect([cache.get('a'), cache.get('b'), cache.get('c')]).toEqual([1, 2, 3]);
  });

  it('상한을 넘으면 가장 오래된 것부터 축출된다', () => {
    const cache = createBoundedCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('읽으면 recency가 갱신된다 — 뜨거운 항목은 살아남는다', () => {
    const cache = createBoundedCache<number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1); // a를 다시 뜨겁게
    cache.set('c', 3);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBeUndefined();
  });

  it('같은 키를 다시 쓰면 항목 수가 늘지 않는다', () => {
    const cache = createBoundedCache<number>(2);
    cache.set('a', 1);
    cache.set('a', 2);
    cache.set('b', 3);
    expect(cache.get('a')).toBe(2);
    expect(cache.get('b')).toBe(3);
  });

  it('임의 개수를 넣어도 상한을 넘지 않는다 — 이것이 zone·locale 양쪽의 계약이다', () => {
    const cache = createBoundedCache<number>(CACHE_LIMIT);
    for (let index = 0; index < 5_000; index++) cache.set(`key-${index}`, index);
    let alive = 0;
    for (let index = 0; index < 5_000; index++) {
      if (cache.get(`key-${index}`) !== undefined) alive++;
    }
    expect(alive).toBe(CACHE_LIMIT);
    // 살아 있는 것은 가장 최근 CACHE_LIMIT개다.
    expect(cache.get('key-4999')).toBe(4999);
    expect(cache.get('key-0')).toBeUndefined();
  });

  it('clear는 전부 지운다 (zone 자기검사 리셋 seam)', () => {
    const cache = createBoundedCache<number>(2);
    cache.set('a', 1);
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
  });

  it('두 캐시가 같은 상한을 쓴다 — 정책이 갈라질 수 없다', () => {
    expect(CACHE_LIMIT).toBe(32);
  });
});
