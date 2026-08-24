/**
 * §5.3 no-product-strings — 승격 과정에서 제품 고유값이 딸려 오는 것을 막는다.
 * 클라우드 흔적은 인벤토리로만 허용하고, 그 상한을 횟수로 고정한다(§3.6).
 */
import { describe, expect, it } from 'vitest';

import { readSources, srcRoot } from './sources';

const FORBIDDEN = ['memorylog', 'asia-northeast1', 'gcloud', 'K_REVISION'] as const;
const CLOUD_TRACE = 'cloudscheduler';
const CLOUD_TRACE_FILE = 'src/nest/controller.ts';

describe('§5.3 no-product-strings', () => {
  it.each(FORBIDDEN)('src/**에 "%s"가 한 번도 없다', (token) => {
    const offenders = readSources(srcRoot)
      .filter((file) => file.text.toLowerCase().includes(token.toLowerCase()))
      .map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it('클라우드 헤더 이름은 컨트롤러 JSDoc에 정확히 1회, 다른 파일에는 0회', () => {
    const counts = new Map<string, number>();
    for (const file of readSources(srcRoot)) {
      const matches = file.text.toLowerCase().split(CLOUD_TRACE).length - 1;
      if (matches > 0) counts.set(file.relative, matches);
    }
    expect([...counts.entries()]).toEqual([[CLOUD_TRACE_FILE, 1]]);
  });
});
