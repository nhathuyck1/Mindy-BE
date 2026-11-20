import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import { AppHttpException } from './app-http.exception.js';

@Injectable()
export class TrustedOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; headers: { origin?: string } }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const allowed = this.config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((value) => value.trim());
    if (!request.headers.origin || !allowed.includes(request.headers.origin)) {
      throw new AppHttpException(403, 'ORIGIN_NOT_ALLOWED', 'A trusted Origin header is required');
    }
    return true;
  }
}
