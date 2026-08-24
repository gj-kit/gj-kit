/** 기록 로거 — 어떤 필드가 로그로 나가는지를 테스트가 단언할 수 있게 한다. */
import type { NotificationLogger } from '../core/logger';

export interface LogEntry {
  readonly level: 'info' | 'warn' | 'error';
  readonly fields: Record<string, unknown>;
  readonly message: string;
}

export interface RecordingNotificationLogger extends NotificationLogger {
  readonly entries: readonly LogEntry[];
}

/**
 * Captures every call. Tests assert on it to prove a secret never reaches the
 * log: the pipeline logs a redacted `safeErrorCode`, never an exception message.
 */
export function recordingNotificationLogger(): RecordingNotificationLogger {
  const entries: LogEntry[] = [];
  const record = (level: LogEntry['level']) => (fields: Record<string, unknown>, message: string) => {
    entries.push({ level, fields, message });
  };
  return {
    entries,
    info: record('info'),
    warn: record('warn'),
    error: record('error'),
  };
}
