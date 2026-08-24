/**
 * 에러 코드 유니언이 공개 계약이라는 사실의 실행 가능한 형태(AGENTS.md §2).
 *
 * 던지는 자리가 없는 멤버는 소비자의 `switch`에 **도달 불가능한 분기**를 만들고, README의
 * 표 한 줄을 거짓말로 만든다. 그리고 유니언은 공개 계약이라 릴리스 뒤에는 멤버를 뺄 수도
 * 없다. 그래서 "선언만 있고 던지지 않는 멤버"를 여기서 막는다.
 */
import { describe, expect, it } from 'vitest';

import { packageRoot, readSources, srcRoot } from './sources';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const errorsText = readFileSync(join(srcRoot, 'core/errors.ts'), 'utf8');
const unionBlock = /export type NotificationsErrorCode =([\s\S]*?);/u.exec(errorsText)?.[1] ?? '';
const declared = [...unionBlock.matchAll(/'(ERR_NOTIFICATION_[A-Z_]+)'/gu)].map((m) => m[1] ?? '');

const sources = readSources(srcRoot);
const readme = readFileSync(join(packageRoot, 'README.md'), 'utf8');

describe('NotificationsErrorCode', () => {
  it('유니언이 비어 있지 않게 읽혔다', () => {
    expect(declared.length).toBeGreaterThan(0);
  });

  it.each(declared)('%s는 src 어딘가에서 실제로 던져진다', (code) => {
    const throwSites = sources.filter(
      (file) => file.relative !== 'src/core/errors.ts' && file.text.includes(`'${code}'`),
    );
    expect(throwSites.map((file) => file.relative)).not.toHaveLength(0);
  });

  it.each(declared)('%s는 README의 에러 표에 실린다', (code) => {
    expect(readme).toContain(`\`${code}\``);
  });
});
