// ═══════════════════════════════════════════════════════════════════════════
// 타입 픽스처 — staged selection. 판별 유니언 좁히기, readonly state, 닫힌 거절 사유.
//
// 지키는 것:
//   · `kind`로 좁히면 picked에는 `asset`만, binary에는 `source`·`previewUri`·`revoke`만 보인다 —
//     `photo.file`처럼 잘못된 분기 접근이 컴파일 에러다.
//   · state는 `readonly` 배열이다. `push`·인덱스 대입이 컴파일 에러라서 React state를 직접 변경하는
//     실수가 불가능하다.
//   · 거절 사유는 닫힌 유니언이라 오타·새 사유 추가가 소비자 switch에서 표면화된다.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, expectTypeOf, it } from 'vitest';

import type {
  NamedBinarySource,
  PendingAddResult,
  PendingBinaryItem,
  PendingMediaItem,
  PendingPickedItem,
  PendingRejection,
  PendingRejectionReason,
  PendingSelection,
  PendingSelectionOptions,
  PendingSelectionState,
  PickedAsset,
} from '../../src/core';
import { createPendingSelection } from '../../src/core';
import { pendingItemFromFile } from '../../src/web';

declare const item: PendingMediaItem;
declare const state: PendingSelectionState;
declare const asset: PickedAsset;
declare const source: NamedBinarySource;

describe('PendingMediaItem — 판별 유니언', () => {
  it('`kind`로 좁히면 각 분기의 필드만 보인다', () => {
    if (item.kind === 'picked') {
      expectTypeOf(item).toEqualTypeOf<PendingPickedItem>();
      expectTypeOf(item.asset).toEqualTypeOf<PickedAsset>();
      // @ts-expect-error picked에는 source가 없다
      void item.source;
      // @ts-expect-error picked에는 previewUri가 없다 — 자기 uri로 preview한다
      void item.previewUri;
    } else {
      expectTypeOf(item).toEqualTypeOf<PendingBinaryItem>();
      expectTypeOf(item.source).toEqualTypeOf<NamedBinarySource>();
      expectTypeOf(item.previewUri).toEqualTypeOf<string | undefined>();
      expectTypeOf(item.revoke).toEqualTypeOf<(() => void) | undefined>();
      expectTypeOf(item.lastModified).toEqualTypeOf<number | undefined>();
      // @ts-expect-error binary에는 asset이 없다
      void item.asset;
    }
  });

  it('kind는 두 리터럴뿐이다 — 전신의 `web-file`/`picker-asset` 이름은 없다', () => {
    expectTypeOf<PendingMediaItem['kind']>().toEqualTypeOf<'picked' | 'binary'>();
    // @ts-expect-error 전신 이름은 유니언에 없다
    const legacy: PendingMediaItem = { kind: 'web-file', source };
    void legacy;
  });

  it('항목은 최소 형태로 만들 수 있고 옵셔널은 `| undefined`를 받는다 (EOP)', () => {
    const picked: PendingMediaItem = { kind: 'picked', asset };
    const binary: PendingMediaItem = { kind: 'binary', source };
    const full: PendingBinaryItem = {
      kind: 'binary',
      source,
      previewUri: undefined,
      revoke: undefined,
      lastModified: undefined,
    };
    void picked;
    void binary;
    void full;
    // @ts-expect-error picked에는 asset이 필수다
    const missingAsset: PendingMediaItem = { kind: 'picked' };
    void missingAsset;
    // @ts-expect-error revoke는 인자 없는 함수다
    const badRevoke: PendingBinaryItem = { kind: 'binary', source, revoke: (uri: string) => uri };
    void badRevoke;
  });

  it('항목 필드는 readonly다', () => {
    const binary: PendingBinaryItem = { kind: 'binary', source };
    // @ts-expect-error readonly
    binary.previewUri = 'blob:x';
  });
});

describe('PendingSelectionState — readonly 순서 목록', () => {
  it('push·인덱스 대입이 컴파일 에러다', () => {
    expectTypeOf<PendingSelectionState>().toEqualTypeOf<readonly PendingMediaItem[]>();
    // @ts-expect-error readonly 배열에는 push가 없다
    state.push(item);
    // @ts-expect-error readonly 배열에는 인덱스 대입이 없다
    state[0] = item;
  });

  it('가변 배열도 state로 넘길 수 있다 (readonly는 넓은 쪽이다)', () => {
    const selection = createPendingSelection({ max: 3 });
    const mutable: PendingMediaItem[] = [];
    expectTypeOf(selection.add(mutable, mutable).state).toEqualTypeOf<PendingSelectionState>();
  });
});

describe('createPendingSelection — 옵션과 반환 계약', () => {
  it('max는 필수 number다', () => {
    expectTypeOf<PendingSelectionOptions>().toEqualTypeOf<{ readonly max: number }>();
    // @ts-expect-error max 누락 — 무제한 선택은 표현 불가다
    createPendingSelection({});
    // @ts-expect-error max는 number다
    createPendingSelection({ max: '12' });
    expectTypeOf(createPendingSelection({ max: 12 })).toEqualTypeOf<PendingSelection>();
  });

  it('add는 state·added·rejected·releasable을 전부 readonly로 돌려준다', () => {
    const selection = createPendingSelection({ max: 3 });
    const result = selection.add(state, [item]);
    expectTypeOf(result).toEqualTypeOf<PendingAddResult>();
    expectTypeOf<PendingAddResult>().toEqualTypeOf<{
      readonly state: PendingSelectionState;
      readonly added: readonly PendingMediaItem[];
      readonly rejected: readonly PendingRejection[];
      readonly releasable: readonly PendingMediaItem[];
    }>();
    expectTypeOf(result.state).toEqualTypeOf<PendingSelectionState>();
    expectTypeOf(result.added).toEqualTypeOf<readonly PendingMediaItem[]>();
    expectTypeOf(result.rejected).toEqualTypeOf<readonly PendingRejection[]>();
    expectTypeOf(result.rejected[0]).toEqualTypeOf<PendingRejection | undefined>();
    // `releasable`은 거절 **항목**이지 사유 쌍이 아니다 — 그대로 `release`에 넣는다.
    expectTypeOf(result.releasable).toEqualTypeOf<readonly PendingMediaItem[]>();
    expectTypeOf(selection.release).parameter(0).toEqualTypeOf<readonly PendingMediaItem[]>();
    selection.release(result.releasable);
    // @ts-expect-error rejected는 `{ item, reason }` 쌍이라 release에 바로 넣을 수 없다 — releasable을 쓴다
    selection.release(result.rejected);
    // @ts-expect-error 결과 배열도 readonly다
    result.added.push(item);
    // @ts-expect-error 결과 객체의 필드도 readonly다
    result.releasable = [];
  });

  it('거절 사유는 닫힌 유니언이다', () => {
    expectTypeOf<PendingRejectionReason>().toEqualTypeOf<'duplicate' | 'over-limit'>();
    expectTypeOf<PendingRejection>().toEqualTypeOf<{
      readonly item: PendingMediaItem;
      readonly reason: PendingRejectionReason;
    }>();
    const classify = (reason: PendingRejectionReason): number => {
      switch (reason) {
        case 'duplicate':
          return 1;
        case 'over-limit':
          return 2;
        default: {
          const never: never = reason;
          return never;
        }
      }
    };
    void classify;
    // @ts-expect-error 'unsupported'는 사유가 아니다 — 형식 검증은 업로드 경계(`uploadDropped`)의 일이다
    const bad: PendingRejection = { item, reason: 'unsupported' };
    void bad;
  });

  it('나머지 메서드의 시그니처', () => {
    const selection = createPendingSelection({ max: 3 });
    expectTypeOf(selection.max).toEqualTypeOf<number>();
    expectTypeOf(selection.keyOf).parameter(0).toEqualTypeOf<PendingMediaItem>();
    expectTypeOf(selection.keyOf).returns.toEqualTypeOf<string>();
    expectTypeOf(selection.remove).returns.toEqualTypeOf<PendingSelectionState>();
    expectTypeOf(selection.clear).returns.toEqualTypeOf<PendingSelectionState>();
    expectTypeOf(selection.release).returns.toEqualTypeOf<void>();
    expectTypeOf(selection.toPickedAssets(state)).toEqualTypeOf<readonly PickedAsset[]>();
    expectTypeOf(selection.toBinarySources(state)).toEqualTypeOf<readonly NamedBinarySource[]>();
    expectTypeOf(selection.previewUriOf(item)).toEqualTypeOf<string | null>();
    expectTypeOf(selection.canPreview(item)).toEqualTypeOf<boolean>();
    expectTypeOf(selection.capturedAtOf(item)).toEqualTypeOf<Promise<string | null>>();
    // @ts-expect-error remove는 키 문자열을 받는다 — 항목 객체가 아니다
    selection.remove(state, item);
    // @ts-expect-error PickedAsset 자체는 항목이 아니다 — `{ kind: 'picked', asset }`으로 감싼다
    selection.add(state, [asset]);
  });
});

describe('`./web` — pendingItemFromFile', () => {
  it('DOM File을 받아 binary 항목을 돌려준다', () => {
    expectTypeOf(pendingItemFromFile).parameter(0).toEqualTypeOf<File>();
    expectTypeOf(pendingItemFromFile).returns.toEqualTypeOf<PendingBinaryItem>();
    // @ts-expect-error Blob에는 name·lastModified가 없다 — File만 받는다
    pendingItemFromFile(new Blob());
  });
});
