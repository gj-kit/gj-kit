// `"./web"` — DOM File → PendingBinaryItem. 전신 memorylog2 `pendingPhotosFromWebFiles`의 File 분기.
//
// ⚠ 이 파일이 지키는 것 셋:
//   ① preview는 object URL이고, **항목이 selection을 떠날 때 `URL.revokeObjectURL`이 정확히 한 번** 불린다.
//   ② HEIC/HEIF에는 object URL을 만들지 않는다 — 브라우저가 디코딩하지 못하는 preview는 누수일 뿐이다.
//   ③ `URL.createObjectURL`이 없는 환경(SSR·일부 jsdom)에서는 preview 없이 항목만 만든다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPendingSelection } from '../../src/core/pending-selection';
import { pendingItemFromFile } from '../../src/web/pendingItem';

const created: File[] = [];
const revoked: string[] = [];

const webFile = (name: string, type: string, lastModified = 1_700_000_000_000): File =>
  new File([new Uint8Array([1, 2, 3])], name, { type, lastModified });

beforeEach(() => {
  created.length = 0;
  revoked.length = 0;
  URL.createObjectURL = vi.fn((blob: Blob) => {
    created.push(blob as File);
    return `blob:preview-${created.length}`;
  });
  URL.revokeObjectURL = vi.fn((uri: string) => {
    revoked.push(uri);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('pendingItemFromFile', () => {
  it('JPEG: object URL을 preview로 달고 File을 source로, lastModified를 키 재료로 보존한다', () => {
    const file = webFile('a.jpg', 'image/jpeg', 42);
    const item = pendingItemFromFile(file);
    expect(item.kind).toBe('binary');
    expect(item.source).toBe(file);
    expect(item.previewUri).toBe('blob:preview-1');
    expect(item.lastModified).toBe(42);
    expect(created).toEqual([file]);

    const selection = createPendingSelection({ max: 5 });
    expect(selection.keyOf(item)).toBe('binary:a.jpg:3:42');
    expect(selection.canPreview(item)).toBe(true);
    expect(selection.previewUriOf(item)).toBe('blob:preview-1');
  });

  it('selection에서 제거되면 revokeObjectURL이 정확히 한 번 불린다', () => {
    const selection = createPendingSelection({ max: 5 });
    const item = pendingItemFromFile(webFile('a.jpg', 'image/jpeg'));
    const { state } = selection.add([], [item]);
    const next = selection.remove(state, selection.keyOf(item));
    expect(next).toEqual([]);
    expect(revoked).toEqual(['blob:preview-1']);
    selection.clear(state);
    selection.release([item]);
    expect(revoked).toEqual(['blob:preview-1']);
  });

  it.each([
    ['image/heic', 'a.heic'],
    ['image/heif', 'a.heif'],
    ['', 'IMG_0001.HEIC'],
  ])('HEIC/HEIF(%s %s): object URL을 만들지 않고 preview 불가로 남긴다', (type, name) => {
    const item = pendingItemFromFile(webFile(name, type));
    expect(created).toEqual([]);
    expect(item.previewUri).toBeUndefined();
    expect(item.revoke).toBeUndefined();
    const selection = createPendingSelection({ max: 5 });
    expect(selection.canPreview(item)).toBe(false);
    // 첨부 자체는 가능하다 — 업로드 경로는 preview와 무관하다.
    expect(selection.add([], [item]).added).toEqual([item]);
    expect(selection.toBinarySources(selection.add([], [item]).state)).toEqual([item.source]);
  });

  it('URL.createObjectURL이 없으면 preview 없이 항목만 만든다', () => {
    (URL as { createObjectURL?: unknown }).createObjectURL = undefined;
    const item = pendingItemFromFile(webFile('a.png', 'image/png'));
    expect(item.previewUri).toBeUndefined();
    expect(item.revoke).toBeUndefined();
    expect(createPendingSelection({ max: 5 }).canPreview(item)).toBe(false);
  });

  it('같은 File을 두 번 감싸면 dedup 키는 같고 object URL은 각각이다 — 거절분은 release로 해제한다', () => {
    const file = webFile('a.jpg', 'image/jpeg');
    const first = pendingItemFromFile(file);
    const second = pendingItemFromFile(file);
    const selection = createPendingSelection({ max: 5 });
    const { state } = selection.add([], [first]);
    const result = selection.add(state, [second]);
    expect(result.rejected).toEqual([{ item: second, reason: 'duplicate' }]);
    expect(revoked).toEqual([]);
    selection.release(result.rejected.map((r) => r.item));
    expect(revoked).toEqual(['blob:preview-2']);
    // 살아 있는 첫 항목의 preview는 그대로다.
    expect(selection.previewUriOf(result.state[0] ?? first)).toBe('blob:preview-1');
  });
});
