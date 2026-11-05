import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI token.
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PushConfig {
  readonly enabled: boolean;
  readonly workerEnabled: boolean;
  readonly cutoff: string;
  readonly ttl: number;
  readonly link: string;
  constructor(config: ConfigService) {
    this.enabled = config.get<boolean>('PUSH_ENABLED', false);
    this.workerEnabled = config.get<boolean>('PUSH_WORKER_ENABLED', false);
    this.cutoff = config.get<string>('PUSH_ACTIVATED_AT', '');
    this.ttl = config.get<number>('PUSH_TTL_SECONDS', 300);
    this.link = '';
    if (this.workerEnabled && !this.enabled) throw new Error('Push worker requires PUSH_ENABLED');
    if (!this.enabled) return;
    if (!config.get<boolean>('CHAT_ENABLED', false)) throw new Error('Push requires CHAT_ENABLED');
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(this.cutoff) ||
      !Number.isFinite(Date.parse(this.cutoff))
    )
      throw new Error('PUSH_ACTIVATED_AT must be a UTC ISO timestamp');
    if (!Number.isInteger(this.ttl) || this.ttl < 60 || this.ttl > 3600)
      throw new Error('Invalid PUSH_TTL_SECONDS');
    if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(config.get<string>('FIREBASE_PROJECT_ID', '')))
      throw new Error('Invalid FIREBASE_PROJECT_ID');
    const base = new URL(config.get<string>('FRONTEND_BASE_URL', 'http://localhost:3001'));
    const path = config.get<string>('PUSH_WEB_INBOX_PATH', '/notifications');
    if (!/^\/(?!\/)[^\\\s?#%]*$/.test(path)) throw new Error('Invalid PUSH_WEB_INBOX_PATH');
    const target = new URL(path, base);
    const allowed = config
      .get<string>('CORS_ORIGINS', '')
      .split(',')
      .map((v) => v.trim());
    if (
      target.protocol !== 'https:' ||
      target.origin !== base.origin ||
      !allowed.includes(target.origin) ||
      base.username ||
      base.password
    )
      throw new Error('Push link requires an allowlisted HTTPS frontend origin');
    this.link = target.href;
  }
}
