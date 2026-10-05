import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';

import type { RequestWithContext } from '../common/http/request-context.js';

type ResponseWithJson = {
  getHeader(name: string): string | number | string[] | undefined;
  status(code: number): ResponseWithJson;
  json(body: unknown): void;
};

type PostgresError = {
  code?: string;
  constraint?: string;
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<ResponseWithJson>();
    const requestId = request.requestId ?? response.getHeader('x-request-id')?.toString();
    const status = this.getStatus(exception);
    const body = this.getBody(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      ...body,
      ...(requestId === undefined ? {} : { requestId }),
    });
  }

  private getStatus(exception: unknown): number {
    if (typeof exception === 'object' && exception !== null && 'type' in exception) {
      if (exception.type === 'entity.parse.failed') return HttpStatus.BAD_REQUEST;
      if (exception.type === 'entity.too.large') return HttpStatus.PAYLOAD_TOO_LARGE;
    }
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }

    const postgresError = this.asPostgresError(exception);
    if (postgresError?.code === '23505') {
      return HttpStatus.CONFLICT;
    }

    if (postgresError?.code === '23503' || postgresError?.code === '23514') {
      return HttpStatus.UNPROCESSABLE_ENTITY;
    }

    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getBody(exception: unknown): Record<string, unknown> {
    if (
      typeof exception === 'object' &&
      exception !== null &&
      'type' in exception &&
      (exception.type === 'entity.parse.failed' || exception.type === 'entity.too.large')
    ) {
      return { code: 'INVALID_JSON_BODY', message: 'JSON body is invalid or too large' };
    }
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { code: 'HTTP_ERROR', message: response };
      }

      if (typeof response === 'object' && response !== null) {
        const responseBody = response as Record<string, unknown>;
        if ('code' in responseBody && 'message' in responseBody) {
          return responseBody;
        }

        return {
          code: 'HTTP_ERROR',
          message: responseBody.message ?? 'Request failed',
          ...(responseBody.message === undefined ? {} : { details: responseBody.message }),
        };
      }
    }

    const postgresError = this.asPostgresError(exception);
    if (postgresError?.code === '23505') {
      return { code: 'UNIQUE_CONSTRAINT_VIOLATION', message: 'A unique value is already in use' };
    }

    if (postgresError?.code === '23503') {
      return { code: 'FOREIGN_KEY_VIOLATION', message: 'The referenced resource does not exist' };
    }

    if (postgresError?.code === '23514') {
      return { code: 'CHECK_CONSTRAINT_VIOLATION', message: 'The data violates a database rule' };
    }

    return { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' };
  }

  private asPostgresError(exception: unknown): PostgresError | undefined {
    if (typeof exception !== 'object' || exception === null) {
      return undefined;
    }

    return exception as PostgresError;
  }
}
