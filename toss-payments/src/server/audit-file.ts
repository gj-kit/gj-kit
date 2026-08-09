/**
 * createFileAuditSink — JSONL append 파일 싱크 참조 구현 (설계 §3.2).
 *
 * 코어 "런타임 의존성 0·플랫폼 중립" 원칙과의 공존:
 * - `node:fs/promises`는 **최초 record 시 지연 동적 import** — 정적 `node:` import가 없어
 *   번들에 node 의존이 각인되지 않는다(tsup `external: [/^node:/]` + platform neutral 유지).
 * - Edge에서 createFileAuditSink를 호출하지 않는 한 "./server"의 Edge 호환은 불변이다.
 *
 * 운영 계약:
 * - Promise 체이닝 직렬화 큐 — record 호출 순서 = 파일 append 순서(엔트리 교차 없음).
 *   한 append의 실패는 그 record의 반환 Promise로만 전파되고 큐는 계속 살아있다.
 * - fire-and-forget(클라이언트가 await하지 않음)이라 프로세스 즉사 시 마지막 엔트리가
 *   유실될 수 있다 — `flush()`/`close()`를 graceful shutdown 훅에 연결하라.
 * - ⚠ 다중 프로세스 병행 쓰기 무방비 — 단일 인스턴스(프로세스당 파일 1개) 전제.
 */
import type { AuditEntry, AuditSink } from '../core/audit';

export function createFileAuditSink(
  filePath: string,
  options?: {
    /** 엔트리 → 1행 문자열(개행 미포함). 기본 JSONL 1행(JSON.stringify). */
    readonly formatter?: (entry: AuditEntry) => string;
  },
): AuditSink & { flush(): Promise<void>; close(): Promise<void> } {
  const formatter = options?.formatter ?? ((entry: AuditEntry) => JSON.stringify(entry));
  /** 지연 로드 1회 — 최초 record 전에는 node:fs 자체가 로드되지 않는다. */
  type FsPromises = typeof import('node:fs/promises');
  // 상수 경유 동적 import — esbuild(platform neutral)가 리터럴 specifier의 'node:' 접두사를
  // 벗기거나(실측: 'fs/promises'로 재작성) 다운스트림 번들러가 정적 해석을 시도하는 것을 차단.
  // webpackIgnore: Edge 타깃 webpack 계열이 이 지연 경로를 해석하지 않게 하는 힌트.
  const FS_SPECIFIER = 'node:fs/promises';
  let fsModule: Promise<FsPromises> | undefined;
  const loadFs = () =>
    (fsModule ??= import(/* webpackIgnore: true */ FS_SPECIFIER) as Promise<FsPromises>);

  /** 직렬화 큐의 꼬리 — 항상 fulfilled 상태를 유지한다(실패한 append가 큐를 오염시키지 않게). */
  let tail: Promise<void> = Promise.resolve();
  let closed = false;

  return {
    record(entry) {
      // close 후 record는 조용히 무시 — 기록 실패 < 결제 실패(throw 금지 계약)
      if (closed) return;
      // formatter는 동기 실행 — throw는 record의 sync throw로 전파되어
      // 클라이언트의 fire-and-forget catch(onSinkError)로 흡수된다
      const line = `${formatter(entry)}\n`;
      const task = tail.then(async () => {
        const fs = await loadFs();
        await fs.appendFile(filePath, line, 'utf8');
      });
      // 실패해도 큐는 계속 — 실패 전파는 이 record의 반환 Promise(→ onSinkError)로만
      tail = task.then(undefined, () => undefined);
      return task;
    },
    /** 지금까지 큐에 들어간 append가 전부 끝날 때까지 대기 (실패 건은 이미 개별 통지됨). */
    flush() {
      return tail;
    },
    /** flush 후 싱크를 봉인 — 이후 record는 무시된다. graceful shutdown 훅용. */
    async close() {
      closed = true;
      await tail;
    },
  };
}
