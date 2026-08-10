// 설계 문서 §5.6 `"./web"` · §5.4.1-3·5 · §7.1 — 브라우저 canvas 포스터.
//
// ⚠ 이 파일이 지키는 것 둘:
//   ① **이벤트 타임아웃 3000ms.** 옵션이 아니라 고정 상수인 이유가 여기 있다 — 무한 대기가
//      가능해지는 순간 "포스터 실패가 동영상 업로드를 막지 않는다"(§7.1)는 하드닝이
//      타임아웃 없는 await 하나로 무력화된다.
//   ② **seek 상한 `min(atMs/1000, duration − 0.05)`.** 목표 시각이 영상 끝을 넘으면
//      `onseeked`가 **영영 오지 않는다** — 짧은 영상이 곧 3초 지연 + 포스터 없음이 된다.
//
// jsdom에는 동영상 디코더도 canvas 2D 컨텍스트도 없다. 그래서 `document`를 주입해
// 어댑터의 **정책**(대기·상한·정리)만 검증한다 — 디코딩 자체는 라이브러리의 몫이 아니다.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BinarySource } from '../../src/core/adapters';
import { webCanvasVideoPoster } from '../../src/web/videoPoster';

type Handler = (() => void) | null;

type FakeVideo = {
  duration: number;
  videoWidth: number;
  videoHeight: number;
  readonly seeks: number[];
  readonly loads: number[];
};

/**
 * 최소 video 스텁.
 * · `onloadedmetadata`는 **핸들러가 붙는 순간** 발화한다(load()가 이미 끝난 상태의 모사).
 * · `onseeked`는 **currentTime이 대입될 때** 발화한다 — 대입 전에 발화시키면 상한 검증이
 *   무의미해지므로 순서를 이렇게 고정한다(어댑터가 리스너를 대입 전에 거는 이유이기도 하다).
 */
function createFakeVideo(options?: {
  readonly duration?: number;
  readonly fireMetadata?: boolean;
  readonly fireSeeked?: boolean;
}): FakeVideo & Record<string, unknown> {
  const handlers: Record<string, Handler> = {
    onloadedmetadata: null,
    onseeked: null,
    onerror: null,
  };
  const seeks: number[] = [];
  const loads: number[] = [];
  const video = {
    muted: false,
    playsInline: false,
    preload: '',
    src: '',
    duration: options?.duration ?? 60,
    videoWidth: 320,
    videoHeight: 240,
    seeks,
    loads,
    load: () => loads.push(1),
  } as FakeVideo & Record<string, unknown>;

  Object.defineProperty(video, 'onloadedmetadata', {
    configurable: true,
    get: () => handlers['onloadedmetadata'],
    set: (value: Handler) => {
      handlers['onloadedmetadata'] = value;
      if (value && (options?.fireMetadata ?? true)) {
        queueMicrotask(() => handlers['onloadedmetadata']?.());
      }
    },
  });
  Object.defineProperty(video, 'onseeked', {
    configurable: true,
    get: () => handlers['onseeked'],
    set: (value: Handler) => {
      handlers['onseeked'] = value;
    },
  });
  Object.defineProperty(video, 'onerror', {
    configurable: true,
    get: () => handlers['onerror'],
    set: (value: Handler) => {
      handlers['onerror'] = value;
    },
  });
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => seeks[seeks.length - 1] ?? 0,
    set: (value: number) => {
      seeks.push(value);
      if (options?.fireSeeked ?? true) queueMicrotask(() => handlers['onseeked']?.());
    },
  });

  return video;
}

function createFakeCanvas(options?: { readonly context?: boolean }) {
  const drawn: { width: number; height: number }[] = [];
  const encoded: { type: string; quality: number }[] = [];
  const canvas = {
    width: 0,
    height: 0,
    getContext: (): unknown =>
      (options?.context ?? true)
        ? {
            drawImage: (_video: unknown, _x: number, _y: number, width: number, height: number) => {
              drawn.push({ width, height });
            },
          }
        : null,
    toBlob: (callback: (blob: Blob | null) => void, type: string, quality: number) => {
      encoded.push({ type, quality });
      callback(new Blob([new Uint8Array([1, 2, 3])], { type }));
    },
  };
  return { canvas, drawn, encoded };
}

function createFakeDocument(video: unknown, canvas: unknown): Document {
  return {
    createElement: (tag: string) => (tag === 'video' ? video : canvas),
  } as unknown as Document;
}

const source = (): BinarySource => ({
  size: 3,
  type: 'video/mp4',
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(3)),
});

const revoked: string[] = [];

beforeEach(() => {
  revoked.length = 0;
  // jsdom에는 objectURL이 없다 — 어댑터의 3중 가드가 그것을 이유로 조용히 포기하므로
  // 정책을 검증하려면 여기서 채워 준다.
  URL.createObjectURL = vi.fn(() => 'blob:https://test.local/poster');
  URL.revokeObjectURL = vi.fn((url: string) => {
    revoked.push(url);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('webCanvasVideoPoster — 정상 경로', () => {
  it('프레임을 그려 JPEG blob으로 돌려주고 objectURL을 회수한다', async () => {
    const video = createFakeVideo({ duration: 60 });
    const { canvas, drawn, encoded } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    const frame = await poster.posterFromBinary({ source: source(), atMs: 1000 });

    expect(frame).not.toBeNull();
    expect(frame?.type).toBe('image/jpeg');
    expect(video.seeks).toEqual([1]); // atMs 1000 = 1초
    expect(canvas.width).toBe(320);
    expect(canvas.height).toBe(240);
    expect(drawn).toEqual([{ width: 320, height: 240 }]);
    expect(encoded).toEqual([{ type: 'image/jpeg', quality: 0.84 }]);
    // 누수는 탭 수명 내내 남는다.
    expect(revoked).toEqual(['blob:https://test.local/poster']);
  });

  it('videoWidth/Height가 0이면 640×360으로 그린다', async () => {
    const video = createFakeVideo();
    video['videoWidth'] = 0;
    video['videoHeight'] = 0;
    const { canvas } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    await poster.posterFromBinary({ source: source(), atMs: 1000 });

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(360);
  });
});

describe('seek 상한 — min(atMs/1000, duration − 0.05)', () => {
  it('0.5초 영상은 0.45초에서 멈춘다 — 끝을 넘기면 onseeked가 영영 오지 않는다', async () => {
    const video = createFakeVideo({ duration: 0.5 });
    const { canvas } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    await poster.posterFromBinary({ source: source(), atMs: 1000 });

    expect(video.seeks).toHaveLength(1);
    expect(video.seeks[0]).toBeLessThanOrEqual(0.45);
    expect(video.seeks[0]).toBe(0.45);
  });

  it('duration이 0(미상)이면 목표 시각을 그대로 쓴다', async () => {
    const video = createFakeVideo({ duration: 0 });
    const { canvas } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    await poster.posterFromBinary({ source: source(), atMs: 2000 });

    expect(video.seeks).toEqual([2]);
  });

  it('duration이 Infinity(라이브 스트림)여도 목표 시각을 쓴다', async () => {
    const video = createFakeVideo({ duration: Number.POSITIVE_INFINITY });
    const { canvas } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    await poster.posterFromBinary({ source: source(), atMs: 1000 });

    expect(video.seeks).toEqual([1]);
  });
});

describe('실패는 전부 null — 포스터가 업로드를 막지 않는다', () => {
  it('메타데이터 이벤트가 오지 않으면 3초 뒤 null', async () => {
    vi.useFakeTimers();
    const video = createFakeVideo({ fireMetadata: false });
    const { canvas } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    const pending = poster.posterFromBinary({ source: source(), atMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toBeNull();
    expect(video.seeks).toEqual([]);
    expect(revoked).toEqual(['blob:https://test.local/poster']);
  });

  it('seeked 이벤트가 오지 않아도 3초 뒤 null', async () => {
    vi.useFakeTimers();
    const video = createFakeVideo({ fireSeeked: false });
    const { canvas } = createFakeCanvas();
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    const pending = poster.posterFromBinary({ source: source(), atMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toBeNull();
    expect(video.seeks).toEqual([1]);
  });

  it('2D 컨텍스트가 없으면 null', async () => {
    const video = createFakeVideo();
    const { canvas } = createFakeCanvas({ context: false });
    const poster = webCanvasVideoPoster({ document: createFakeDocument(video, canvas) });

    await expect(poster.posterFromBinary({ source: source(), atMs: 1000 })).resolves.toBeNull();
    expect(revoked).toEqual(['blob:https://test.local/poster']);
  });

  it('createObjectURL이 없는 환경(SSR·RN 웹뷰)에서는 조용히 포기한다', async () => {
    const original = URL.createObjectURL;
    // @ts-expect-error — 없는 환경을 만드는 것이 이 테스트의 요점이다.
    delete URL.createObjectURL;
    try {
      const poster = webCanvasVideoPoster({
        document: createFakeDocument(createFakeVideo(), createFakeCanvas().canvas),
      });
      await expect(poster.posterFromBinary({ source: source(), atMs: 1000 })).resolves.toBeNull();
    } finally {
      URL.createObjectURL = original;
    }
  });

  it('document를 주입하지 않으면 globalThis.document를 쓰고, 디코더가 없으면 null로 끝난다', async () => {
    vi.useFakeTimers();
    // jsdom은 `load()`를 구현하지 않아 호출 시 not-implemented를 콘솔로 뱉는다 — 검증 대상이
    // 아니므로 no-op으로 덮는다(그래야 실패 신호와 잡음이 섞이지 않는다).
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const poster = webCanvasVideoPoster();

    const pending = poster.posterFromBinary({ source: source(), atMs: 1000 });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(pending).resolves.toBeNull();
  });
});
