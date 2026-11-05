import { type ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { GlobalExceptionFilter } from '../../filters/global-exception.filter.js';

@Catch()
export class PushHttpFilter extends GlobalExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost): void {
    if (exception instanceof HttpException && exception.getStatus() === 429)
      host
        .switchToHttp()
        .getResponse<{ setHeader(name: string, value: string): void }>()
        .setHeader('Retry-After', '60');
    super.catch(exception, host);
  }
}
