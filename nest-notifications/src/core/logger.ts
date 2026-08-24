/**
 * 구조적 로거 포트 — 소스의 `PinoLogger`(nestjs-pino) 직접 의존을 대체한다(설계 §0.2-⑮).
 * 형제 `nest-operations-jobs`의 `JobLogger`와 같은 형태라 pino 인스턴스가 그대로 대입되고,
 * Nest 내장 `Logger`는 `.` 서브패스의 `fromNestLogger` 어댑터가 흡수한다.
 */

/** Fields-first structured logger. A pino instance satisfies this shape as is. */
export interface NotificationLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

/** Discards everything. The default when a host wires no logger. */
export function silentNotificationLogger(): NotificationLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}
