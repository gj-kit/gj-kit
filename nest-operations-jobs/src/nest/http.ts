import {
  BadRequestException,
  GatewayTimeoutException,
  HttpException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { isOperationsJobsError } from '../core/errors';
import type { OperationsJobsError, OperationsJobsErrorCode } from '../core/errors';
import type { JobExecutionResult } from '../core/runner';

/**
 * 라이브러리 결과 → HTTP 매핑의 **단일 표**. 다른 어떤 파일도 상태 코드를 정하지 않는다.
 * 응답 본문에는 코드만 실린다 — 잡 예외의 원문과 호출 흔적은 실행 기록에만 남는다.
 */

const STATUS_BY_CODE: Readonly<Record<OperationsJobsErrorCode, number>> = {
  ERR_JOB_UNKNOWN: 404,
  ERR_JOB_REGISTRY_NOT_READY: 503,
  ERR_JOB_KEY_INVALID: 500,
  ERR_JOB_DUPLICATE_KEY: 500,
  ERR_JOB_INVALID: 500,
  ERR_JOB_SCHEDULE_INVALID: 500,
  ERR_JOB_INPUT_INVALID: 400,
  ERR_JOB_INPUT_UNEXPECTED: 400,
  ERR_JOB_TIMEOUT: 504,
  ERR_JOB_ABORTED: 500,
  ERR_JOB_FAILED: 500,
  ERR_JOB_STORE: 503,
  ERR_JOB_UNAUTHORIZED: 401,
  ERR_JOB_AUTH_MISCONFIGURED: 500,
};

function exceptionFor(status: number, body: Record<string, unknown>): HttpException {
  switch (status) {
    case 400:
      return new BadRequestException(body);
    case 401:
      // 고정 메시지 — 어느 검사에서 떨어졌는지 알려주지 않는다.
      return new UnauthorizedException(body);
    case 404:
      return new NotFoundException(body);
    case 503:
      return new ServiceUnavailableException(body);
    case 504:
      return new GatewayTimeoutException(body);
    default:
      return new InternalServerErrorException(body);
  }
}

/** Single mapping table from library outcomes to HTTP. Nothing else maps status codes. */
export function toHttpException(
  input: OperationsJobsError | JobExecutionResult,
): HttpException | null {
  if (isOperationsJobsError(input)) {
    const status = STATUS_BY_CODE[input.code] ?? 500;
    return exceptionFor(status, {
      ...(input.jobKey === undefined ? {} : { jobKey: input.jobKey }),
      ...(input.runId === undefined ? {} : { runId: input.runId }),
      error: { code: input.code },
    });
  }

  const result = input;
  if (result.status === 'SUCCEEDED' || result.status === 'SKIPPED') return null;
  const status = result.status === 'TIMED_OUT' ? 504 : 500;
  return exceptionFor(status, {
    runId: result.runId,
    jobKey: result.jobKey,
    status: result.status,
    recorded: result.recorded,
    error: { code: result.error.code },
  });
}
