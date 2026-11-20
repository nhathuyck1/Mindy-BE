import { HttpException, type HttpStatus } from '@nestjs/common';

export interface AppErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: readonly unknown[];
}

export class AppHttpException extends HttpException {
  constructor(status: HttpStatus, code: string, message: string, details?: readonly unknown[]) {
    const body: AppErrorBody =
      details === undefined ? { code, message } : { code, message, details };
    super(body, status);
  }
}
