import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI runtime token.
import { ConfigService } from '@nestjs/config';
import { AppHttpException } from '../../../common/http/app-http.exception.js';

@Injectable()
export class MaterialOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; headers: { origin?: string } }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return true;
    const origin = request.headers.origin;
    if (
      origin === undefined ||
      !this.config
        .getOrThrow<string>('CORS_ORIGINS')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .includes(origin)
    )
      throw new AppHttpException(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed');
    return true;
  }
}
