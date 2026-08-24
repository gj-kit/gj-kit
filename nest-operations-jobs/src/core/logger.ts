/**
 * Structured logging port. The argument order is fields-first, matching pino
 * and nestjs-pino, so a `PinoLogger` instance satisfies this port as-is.
 * Nest's own message-first `LoggerService` is adapted by `fromNestLogger`
 * on the `.` subpath.
 */
export interface JobLogger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}

/** Drops everything. For tests that assert on the store rather than on logs. */
export function silentJobLogger(): JobLogger {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
}
