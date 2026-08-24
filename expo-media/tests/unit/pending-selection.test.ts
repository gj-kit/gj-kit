// Staged selection — 전신 memorylog2 `pendingPhotos.ts`의 동작을 코어 순수 모델로 올린 것.
//
// ⚠ 이 파일이 지키는 것 넷:
//   ① **dedup 1차 키는 assetId, 폴백은 uri.** uri만 쓰면 스테이징 사본 uri가 resolve마다 재생성돼
//      같은 사진을 두 번 골라도 통과한다(`PickedAsset.assetId` TSDoc).
//   ② **상한 초과와 중복이 사유로 갈린다** — 화면이 "이미 첨부한 사진"과 "최대 N장"을 다른 문구로 말한다.
//   ③ **revoke는 항목 객체당 정확히 한 번.** remove 뒤 clear, StrictMode 이중 updater, 두 인스턴스 경유,
//      두 **모듈 사본** 경유(`.`/`./core` · ESM/CJS) 어느 경로로도 두 번 불리지 않는다.
//   ④ **HEIC/HEIF 바이너리는 previewUri가 있어도 preview 불가** — 브라우저가 디코딩하지 못한다.
//   ⑤ **`releasable`은 state에 같은 객체로 남은 거절분을 뺀다** — README 레시피 `release(result.releasable)`가
//      같은 항목을 다시 add한 경우(StrictMode 이중 effect)에도 살아 있는 preview를 죽이지 않는다.

import { describe, expect, it, vi } from 'vitest';

import type { PickedAsset } from '../../src/core/adapters';
import { mediaErrorCode } from '../../src/core/errors';
import type {
  PendingBinaryItem,
  PendingMediaItem,
  PendingPickedItem,
} from '../../src/core/pending-selection';
import { createPendingSelection } from '../../src/core/pending-selection';
import {
  EXIF_FIXTURE,
  createBinarySource,
  exifCapturedAtIso,
  fakeBytes,
  jpegWithExif,
  jpegWithoutExif,
} from '../../src/testing';

const picked = (asset: PickedAsset): PendingPickedItem => ({ kind: 'picked', asset });

function binary(input: {
  readonly name: string;
  readonly size?: number | undefined;
  readonly type?: string | undefined;
  readonly previewUri?: string | undefined;
  readonly lastModified?: number | undefined;
  readonly revoke?: (() => void) | undefined;
}): PendingBinaryItem {
  return {
    kind: 'binary',
    source: createBinarySource(fakeBytes(input.size ?? 10), { name: input.name, type: input.type }),
    ...(input.previewUri !== undefined ? { previewUri: input.previewUri } : {}),
    ...(input.lastModified !== undefined ? { lastModified: input.lastModified } : {}),
    ...(input.revoke !== undefined ? { revoke: input.revoke } : {}),
  };
}

const EMPTY: readonly PendingMediaItem[] = [];

describe('createPendingSelection — max 검증 (부팅 시 즉사)', () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown as number])(
    'max=%o 는 config-invalid',
    (max) => {
      const error = (() => {
        try {
          createPendingSelection({ max });
          return null;
        } catch (thrown: unknown) {
          return thrown;
        }
      })();
      expect(mediaErrorCode(error)).toBe('config-invalid');
    },
  );

  it.each([1, 2, 12, 100])('max=%o 는 통과하고 그대로 노출된다', (max) => {
    expect(createPendingSelection({ max }).max).toBe(max);
  });
});

describe('keyOf — 정체성', () => {
  const selection = createPendingSelection({ max: 10 });

  it('picked: assetId가 1차 키다 (uri가 달라도 같은 사진)', () => {
    const a = picked({ uri: 'file:///cache/copy-1.jpg', assetId: 'ph/L0/001' });
    const b = picked({ uri: 'file:///cache/copy-2.jpg', assetId: 'ph/L0/001' });
    expect(selection.keyOf(a)).toBe('asset:ph/L0/001');
    expect(selection.keyOf(a)).toBe(selection.keyOf(b));
  });

  it('picked: assetId가 없거나 빈 문자열이면 uri로 폴백한다', () => {
    expect(selection.keyOf(picked({ uri: 'file:///a.jpg' }))).toBe('asset:file:///a.jpg');
    expect(selection.keyOf(picked({ uri: 'file:///a.jpg', assetId: '' }))).toBe('asset:file:///a.jpg');
  });

  it('picked: 같은 uri라도 assetId가 다르면 다른 사진이다', () => {
    const a = picked({ uri: 'file:///same.jpg', assetId: 'one' });
    const b = picked({ uri: 'file:///same.jpg', assetId: 'two' });
    expect(selection.keyOf(a)).not.toBe(selection.keyOf(b));
  });

  it('binary: name·size·lastModified 3조합이며 lastModified 부재는 0이다', () => {
    expect(selection.keyOf(binary({ name: 'a.jpg', size: 1000, lastModified: 7 }))).toBe(
      'binary:a.jpg:1000:7',
    );
    expect(selection.keyOf(binary({ name: 'a.jpg', size: 1000 }))).toBe('binary:a.jpg:1000:0');
  });

  it('picked와 binary의 키 공간은 겹치지 않는다', () => {
    const a = picked({ uri: 'x:1000:0', assetId: undefined });
    const b = binary({ name: 'x', size: 1000 });
    expect(selection.keyOf(a)).not.toBe(selection.keyOf(b));
  });
});

describe('add — dedup', () => {
  const selection = createPendingSelection({ max: 10 });

  it('이미 있는 assetId는 duplicate로 거절되고 state는 같은 참조다', () => {
    const first = selection.add(EMPTY, [picked({ uri: 'file:///1.jpg', assetId: 'A' })]);
    const again = picked({ uri: 'file:///1-again.jpg', assetId: 'A' });
    const result = selection.add(first.state, [again]);
    expect(result.state).toBe(first.state);
    expect(result.added).toEqual([]);
    expect(result.rejected).toEqual([{ item: again, reason: 'duplicate' }]);
  });

  it('같은 배치 안의 중복도 두 번째부터 duplicate다', () => {
    const a = picked({ uri: 'file:///1.jpg', assetId: 'A' });
    const b = picked({ uri: 'file:///2.jpg', assetId: 'A' });
    const result = selection.add(EMPTY, [a, b]);
    expect(result.state).toEqual([a]);
    expect(result.added).toEqual([a]);
    expect(result.rejected).toEqual([{ item: b, reason: 'duplicate' }]);
  });

  it('uri 폴백: assetId 없는 picked는 uri가 같을 때만 중복이다', () => {
    const a = picked({ uri: 'file:///1.jpg' });
    const b = picked({ uri: 'file:///1.jpg' });
    const c = picked({ uri: 'file:///2.jpg' });
    const result = selection.add(EMPTY, [a, b, c]);
    expect(result.state).toEqual([a, c]);
    expect(result.rejected).toEqual([{ item: b, reason: 'duplicate' }]);
  });

  it('binary: name·size가 같아도 lastModified가 다르면 다른 파일이다', () => {
    const a = binary({ name: 'a.jpg', size: 100, lastModified: 1 });
    const b = binary({ name: 'a.jpg', size: 100, lastModified: 2 });
    const c = binary({ name: 'a.jpg', size: 100, lastModified: 1 });
    const result = selection.add(EMPTY, [a, b, c]);
    expect(result.state).toEqual([a, b]);
    expect(result.rejected).toEqual([{ item: c, reason: 'duplicate' }]);
  });

  it('picked와 binary를 한 state에 섞을 수 있다', () => {
    const a = picked({ uri: 'file:///1.jpg', assetId: 'A' });
    const b = binary({ name: 'a.jpg' });
    const result = selection.add(EMPTY, [a, b]);
    expect(result.state).toEqual([a, b]);
    expect(selection.toPickedAssets(result.state)).toEqual([a.asset]);
    expect(selection.toBinarySources(result.state)).toEqual([b.source]);
  });
});

describe('add — 상한', () => {
  it('max를 넘는 항목은 over-limit로 거절되고 입력 순서가 보존된다', () => {
    const selection = createPendingSelection({ max: 2 });
    const items = [1, 2, 3, 4].map((n) => picked({ uri: `file:///${n}.jpg`, assetId: `${n}` }));
    const result = selection.add(EMPTY, items);
    expect(result.state).toEqual(items.slice(0, 2));
    expect(result.added).toEqual(items.slice(0, 2));
    expect(result.rejected).toEqual([
      { item: items[2], reason: 'over-limit' },
      { item: items[3], reason: 'over-limit' },
    ]);
  });

  it('가득 찬 state에 추가하면 전부 over-limit이고 state는 같은 참조다', () => {
    const selection = createPendingSelection({ max: 1 });
    const full = selection.add(EMPTY, [picked({ uri: 'file:///1.jpg', assetId: '1' })]).state;
    const extra = picked({ uri: 'file:///2.jpg', assetId: '2' });
    const result = selection.add(full, [extra]);
    expect(result.state).toBe(full);
    expect(result.rejected).toEqual([{ item: extra, reason: 'over-limit' }]);
  });

  it('가득 찬 state에서 같은 사진을 다시 고르면 사유는 over-limit이 아니라 duplicate다', () => {
    const selection = createPendingSelection({ max: 1 });
    const full = selection.add(EMPTY, [picked({ uri: 'file:///1.jpg', assetId: '1' })]).state;
    const again = picked({ uri: 'file:///1-copy.jpg', assetId: '1' });
    expect(selection.add(full, [again]).rejected).toEqual([{ item: again, reason: 'duplicate' }]);
  });

  it('이미 max를 넘는 state(외부에서 만든)에는 아무것도 추가하지 않는다', () => {
    const selection = createPendingSelection({ max: 1 });
    const oversized: readonly PendingMediaItem[] = [
      picked({ uri: 'file:///1.jpg', assetId: '1' }),
      picked({ uri: 'file:///2.jpg', assetId: '2' }),
    ];
    const result = selection.add(oversized, [picked({ uri: 'file:///3.jpg', assetId: '3' })]);
    expect(result.state).toBe(oversized);
    expect(result.rejected[0]?.reason).toBe('over-limit');
  });
});

describe('불변성·결정성', () => {
  const selection = createPendingSelection({ max: 3 });

  it('add는 입력 state·items를 변경하지 않고 결과 객체·배열·거절 항목을 전부 동결한다', () => {
    const a = picked({ uri: 'file:///1.jpg', assetId: '1' });
    const state: PendingMediaItem[] = [a];
    const items: PendingMediaItem[] = [
      picked({ uri: 'file:///2.jpg', assetId: '2' }),
      picked({ uri: 'file:///1-dup.jpg', assetId: '1' }),
    ];
    const result = selection.add(state, items);
    expect(state).toEqual([a]);
    expect(items).toHaveLength(2);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.added)).toBe(true);
    expect(Object.isFrozen(result.rejected)).toBe(true);
    expect(Object.isFrozen(result.releasable)).toBe(true);
    expect(result.rejected).toHaveLength(1);
    expect(Object.isFrozen(result.rejected[0])).toBe(true);
    // 런타임 동결의 직접 증거 — readonly 타입만이 아니라 대입 자체가 막힌다.
    expect(() => {
      (result.rejected[0] as { reason: string }).reason = 'tampered';
    }).toThrow(TypeError);
    expect(() => {
      (result as { added: unknown }).added = [];
    }).toThrow(TypeError);
  });

  it('같은 입력은 같은 결과를 낸다 (순서·키·사유 전부)', () => {
    const items = [
      picked({ uri: 'file:///1.jpg', assetId: '1' }),
      binary({ name: 'a.jpg', size: 10 }),
      picked({ uri: 'file:///1-dup.jpg', assetId: '1' }),
      picked({ uri: 'file:///3.jpg', assetId: '3' }),
      picked({ uri: 'file:///4.jpg', assetId: '4' }),
    ];
    const first = selection.add(EMPTY, items);
    const second = selection.add(EMPTY, items);
    expect(second.state).toEqual(first.state);
    expect(second.rejected).toEqual(first.rejected);
    expect(first.state.map(selection.keyOf)).toEqual(['asset:1', 'binary:a.jpg:10:0', 'asset:3']);
    expect(first.rejected.map((r) => r.reason)).toEqual(['duplicate', 'over-limit']);
  });

  it('remove는 키가 없으면 같은 참조, 있으면 나머지 순서를 보존한 새 배열이다', () => {
    const items = [1, 2, 3].map((n) => picked({ uri: `file:///${n}.jpg`, assetId: `${n}` }));
    const { state } = selection.add(EMPTY, items);
    expect(selection.remove(state, 'asset:nope')).toBe(state);
    const next = selection.remove(state, 'asset:2');
    expect(next).not.toBe(state);
    expect(next).toEqual([items[0], items[2]]);
    expect(state).toHaveLength(3);
    expect(Object.isFrozen(next)).toBe(true);
  });

  it('clear는 빈 state를 돌려주고, 이미 비어 있으면 같은 참조다', () => {
    const { state } = selection.add(EMPTY, [picked({ uri: 'file:///1.jpg', assetId: '1' })]);
    const cleared = selection.clear(state);
    expect(cleared).toEqual([]);
    expect(selection.clear(cleared)).toBe(cleared);
    expect(selection.clear(EMPTY)).toBe(EMPTY);
  });
});

describe('revoke — 항목 객체당 정확히 한 번', () => {
  it('remove가 바이너리의 revoke를 한 번 호출하고, 같은 항목의 clear는 다시 부르지 않는다', () => {
    const selection = createPendingSelection({ max: 5 });
    const revoke = vi.fn();
    const item = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const { state } = selection.add(EMPTY, [item]);
    const next = selection.remove(state, selection.keyOf(item));
    expect(next).toEqual([]);
    expect(revoke).toHaveBeenCalledTimes(1);
    // StrictMode처럼 오래된 state로 같은 연산을 다시 돌려도 revoke는 늘지 않는다.
    selection.remove(state, selection.keyOf(item));
    selection.clear(state);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('clear는 남아 있는 모든 바이너리를 한 번씩 해제하고 picked는 건드리지 않는다', () => {
    const selection = createPendingSelection({ max: 5 });
    const first = vi.fn();
    const second = vi.fn();
    const { state } = selection.add(EMPTY, [
      binary({ name: 'a.jpg', previewUri: 'blob:1', revoke: first }),
      picked({ uri: 'file:///1.jpg', assetId: '1' }),
      binary({ name: 'b.jpg', previewUri: 'blob:2', revoke: second }),
    ]);
    expect(selection.clear(state)).toEqual([]);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    selection.clear(state);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('다른 selection 인스턴스를 거쳐도 같은 항목 객체는 한 번만 해제된다', () => {
    const revoke = vi.fn();
    const item = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const one = createPendingSelection({ max: 5 });
    const two = createPendingSelection({ max: 5 });
    const { state } = one.add(EMPTY, [item]);
    one.clear(state);
    two.clear(state);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('다른 모듈 사본을 거쳐도 같은 항목 객체는 한 번만 해제된다 (`.`/`./core` · ESM/CJS 사본)', async () => {
    // `splitting:false`로 엔트리마다 코어가 복제된다. vi.resetModules 뒤의 동적 import가 그 사본이다 —
    // 팩토리 참조가 다른 것이 "정말 다른 모듈 인스턴스"라는 직접 증거다.
    vi.resetModules();
    const copy = await import('../../src/core/pending-selection');
    expect(copy.createPendingSelection).not.toBe(createPendingSelection);

    const revoke = vi.fn();
    const item = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const one = createPendingSelection({ max: 5 });
    const two = copy.createPendingSelection({ max: 5 });
    const { state } = one.add(EMPTY, [item]);
    one.clear(state);
    two.clear(state);
    two.remove(state, two.keyOf(item));
    expect(revoke).toHaveBeenCalledTimes(1);

    // 반대 방향 — 사본이 먼저 해제해도 원본은 다시 부르지 않는다.
    const other = binary({ name: 'b.jpg', previewUri: 'blob:2', revoke });
    two.release([other]);
    one.release([other]);
    one.clear(one.add(EMPTY, [other]).state);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('레지스트리는 globalThis의 패키지 전역 심볼에 비열거로 붙는다 (MediaError 태그와 같은 키 체계)', () => {
    const key = Symbol.for('@gj-kit/expo-media#revokedPendingItems');
    const revoke = vi.fn();
    const item = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const selection = createPendingSelection({ max: 5 });
    selection.release([item]);
    const registry = (globalThis as Record<symbol, unknown>)[key];
    expect(registry).toBeInstanceOf(WeakSet);
    expect((registry as WeakSet<object>).has(item)).toBe(true);
    expect(Object.getOwnPropertyDescriptor(globalThis, key)?.enumerable).toBe(false);
    expect(Object.keys(globalThis)).not.toContain(key);
  });

  it('add는 거절 항목을 해제하지 않는다 — 거절된 중복이 state의 항목과 같은 객체일 수 있다', () => {
    const selection = createPendingSelection({ max: 1 });
    const revoke = vi.fn();
    const item = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const { state } = selection.add(EMPTY, [item]);
    const result = selection.add(state, [item, binary({ name: 'b.jpg', previewUri: 'blob:2', revoke })]);
    expect(result.rejected.map((r) => r.reason)).toEqual(['duplicate', 'over-limit']);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('releasable은 state에 같은 객체로 남은 거절분을 뺀다 — 재add된 항목의 preview가 살아남는다', () => {
    const selection = createPendingSelection({ max: 2 });
    const revoke = vi.fn();
    const staged = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const { state } = selection.add(EMPTY, [staged]);
    // 같은 객체 재add(StrictMode 이중 effect) + 다른 객체의 키 중복(같은 파일을 두 번 드롭) + 상한 초과.
    const sameKeyOtherObject = binary({ name: 'a.jpg', previewUri: 'blob:1-again', revoke });
    const over = binary({ name: 'c.jpg', previewUri: 'blob:3', revoke });
    const result = selection.add(state, [staged, sameKeyOtherObject, binary({ name: 'b.jpg' }), over]);
    expect(result.rejected.map((r) => [r.item, r.reason])).toEqual([
      [staged, 'duplicate'],
      [sameKeyOtherObject, 'duplicate'],
      [over, 'over-limit'],
    ]);
    expect(result.releasable).toEqual([sameKeyOtherObject, over]);

    selection.release(result.releasable);
    expect(revoke).toHaveBeenCalledTimes(2);
    // 스테이징된 항목의 preview는 그대로다 — 레시피를 그대로 따라도 죽지 않는다.
    expect(selection.previewUriOf(result.state[0]!)).toBe('blob:1');
    selection.clear(result.state);
    expect(revoke).toHaveBeenCalledTimes(3);
  });

  it('releasable은 같은 배치 안에서 방금 스테이징된 객체의 재등장도 빼고, 객체당 한 번만 싣는다', () => {
    const selection = createPendingSelection({ max: 1 });
    const x = binary({ name: 'x.jpg', previewUri: 'blob:x' });
    const y = binary({ name: 'y.jpg', previewUri: 'blob:y' });
    const result = selection.add(EMPTY, [x, x, y, y]);
    expect(result.state).toEqual([x]);
    expect(result.rejected.map((r) => r.reason)).toEqual(['duplicate', 'over-limit', 'over-limit']);
    expect(result.releasable).toEqual([y]);
    // 변화 없는 add: state는 같은 참조, releasable은 비어 있다(전부 같은 객체 중복).
    const again = selection.add(result.state, [x]);
    expect(again.state).toBe(result.state);
    expect(again.rejected).toEqual([{ item: x, reason: 'duplicate' }]);
    expect(again.releasable).toEqual([]);
  });

  it('release는 releasable의 revoke를 한 번만 부르고 picked·revoke 없는 항목은 무시한다', () => {
    const selection = createPendingSelection({ max: 1 });
    const revoke = vi.fn();
    const rejectedBinary = binary({ name: 'b.jpg', previewUri: 'blob:2', revoke });
    const { state } = selection.add(EMPTY, [picked({ uri: 'file:///1.jpg', assetId: '1' })]);
    const result = selection.add(state, [
      rejectedBinary,
      picked({ uri: 'file:///2.jpg', assetId: '2' }),
      binary({ name: 'c.jpg' }),
    ]);
    expect(result.releasable).toEqual(result.rejected.map((r) => r.item));
    selection.release(result.releasable);
    selection.release(result.releasable);
    expect(revoke).toHaveBeenCalledTimes(1);
  });

  it('revoke가 throw해도 제거는 완료되고 두 번 다시 시도하지 않는다', () => {
    const selection = createPendingSelection({ max: 5 });
    const revoke = vi.fn(() => {
      throw new Error('revoke failed');
    });
    const item = binary({ name: 'a.jpg', previewUri: 'blob:1', revoke });
    const { state } = selection.add(EMPTY, [item]);
    expect(selection.remove(state, selection.keyOf(item))).toEqual([]);
    selection.clear(state);
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});

describe('previewUriOf · canPreview — HEIC/HEIF 게이팅', () => {
  const selection = createPendingSelection({ max: 5 });

  it('picked는 자기 uri로 항상 preview한다', () => {
    const item = picked({ uri: 'file:///1.heic', assetId: '1', mimeType: 'image/heic' });
    expect(selection.previewUriOf(item)).toBe('file:///1.heic');
    expect(selection.canPreview(item)).toBe(true);
  });

  it('JPEG 바이너리는 previewUri가 있을 때만 preview한다', () => {
    expect(selection.previewUriOf(binary({ name: 'a.jpg', type: 'image/jpeg', previewUri: 'blob:1' }))).toBe(
      'blob:1',
    );
    expect(selection.canPreview(binary({ name: 'a.jpg', type: 'image/jpeg' }))).toBe(false);
    expect(selection.canPreview(binary({ name: 'a.jpg', type: 'image/jpeg', previewUri: '' }))).toBe(false);
  });

  it.each([
    ['MIME image/heic', { name: 'a.bin', type: 'image/heic' }],
    ['MIME image/heif', { name: 'a.bin', type: 'image/heif' }],
    ['확장자 .heic (MIME 없음)', { name: 'IMG_0001.HEIC', type: '' }],
    ['확장자 .heif (MIME 없음)', { name: 'a.heif', type: undefined }],
  ])('%s 바이너리는 previewUri가 있어도 preview 불가다', (_label, source) => {
    const item = binary({ ...source, previewUri: 'blob:leaked' });
    expect(selection.previewUriOf(item)).toBeNull();
    expect(selection.canPreview(item)).toBe(false);
  });

  it('PNG·WebP 바이너리는 preview한다', () => {
    expect(selection.canPreview(binary({ name: 'a.png', type: 'image/png', previewUri: 'blob:1' }))).toBe(true);
    expect(selection.canPreview(binary({ name: 'a.webp', type: '', previewUri: 'blob:2' }))).toBe(true);
  });
});

describe('capturedAtOf', () => {
  const selection = createPendingSelection({ max: 5 });

  it('picked: 피커 EXIF의 DateTimeOriginal을 ISO로 준다', async () => {
    const item = picked({ uri: 'file:///1.jpg', assetId: '1', exif: EXIF_FIXTURE });
    await expect(selection.capturedAtOf(item)).resolves.toBe(exifCapturedAtIso());
  });

  it('picked: EXIF가 없거나 날짜가 없으면 null', async () => {
    await expect(selection.capturedAtOf(picked({ uri: 'file:///1.jpg' }))).resolves.toBeNull();
    await expect(
      selection.capturedAtOf(picked({ uri: 'file:///1.jpg', exif: { Make: 'Apple' } })),
    ).resolves.toBeNull();
  });

  it('binary: JPEG APP1을 바이트에서 읽는다', async () => {
    const item: PendingBinaryItem = {
      kind: 'binary',
      source: createBinarySource(jpegWithExif(), { name: 'IMG.jpg', type: 'image/jpeg' }),
    };
    await expect(selection.capturedAtOf(item)).resolves.toBe(exifCapturedAtIso());
  });

  it('binary: MIME이 비어도 확장자로 JPEG를 인식한다', async () => {
    const item: PendingBinaryItem = {
      kind: 'binary',
      source: createBinarySource(jpegWithExif(), { name: 'IMG.jpeg' }),
    };
    await expect(selection.capturedAtOf(item)).resolves.toBe(exifCapturedAtIso());
  });

  it('binary: EXIF 없는 JPEG·비JPEG·읽기 실패는 전부 null (throw하지 않는다)', async () => {
    await expect(
      selection.capturedAtOf({
        kind: 'binary',
        source: createBinarySource(jpegWithoutExif(), { name: 'a.jpg', type: 'image/jpeg' }),
      }),
    ).resolves.toBeNull();
    await expect(
      selection.capturedAtOf({
        kind: 'binary',
        source: createBinarySource(jpegWithExif(), { name: 'a.png', type: 'image/png' }),
      }),
    ).resolves.toBeNull();
    await expect(
      selection.capturedAtOf({
        kind: 'binary',
        source: {
          name: 'a.jpg',
          size: 10,
          type: 'image/jpeg',
          arrayBuffer: () => Promise.reject(new Error('read failed')),
        },
      }),
    ).resolves.toBeNull();
  });
});
