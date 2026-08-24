import type { LoggerService } from '@nestjs/common';
import type { JobLogger } from '../core/logger';

function optionalParams(fields: Record<string, unknown>, context: string | undefined): unknown[] {
  return context === undefined ? [fields] : [fields, context];
}

/**
 * Adapts Nest's `LoggerService` (message-first) to the `JobLogger` port
 * (fields-first). The structured fields are passed through as an extra
 * parameter, which Nest's own console logger prints alongside the message.
 */
export function fromNestLogger(logger: LoggerService, context?: string): JobLogger {
  return {
    info: (fields, message) => {
      logger.log(message, ...optionalParams(fields, context));
    },
    warn: (fields, message) => {
      logger.warn(message, ...optionalParams(fields, context));
    },
    error: (fields, message) => {
      logger.error(message, ...optionalParams(fields, context));
    },
  };
}
