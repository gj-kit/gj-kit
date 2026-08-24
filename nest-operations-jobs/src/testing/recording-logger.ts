import type { JobLogger } from '../core/logger';

export interface RecordedLogEntry {
  readonly level: 'info' | 'warn' | 'error';
  readonly fields: Record<string, unknown>;
  readonly message: string;
}

export interface RecordingJobLogger extends JobLogger {
  readonly entries: readonly RecordedLogEntry[];
}

/** Collects every emitted entry so tests can assert on observability, not just outcomes. */
export function recordingJobLogger(): RecordingJobLogger {
  const entries: RecordedLogEntry[] = [];
  const push = (level: RecordedLogEntry['level']) => (fields: Record<string, unknown>, message: string) => {
    entries.push({ level, fields, message });
  };
  return {
    entries,
    info: push('info'),
    warn: push('warn'),
    error: push('error'),
  };
}
