import { Injectable, ServiceUnavailableException } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { DataSource } from 'typeorm';

export interface HealthReadiness {
  assertReady(): Promise<void>;
}

@Injectable()
export class HealthService implements HealthReadiness {
  constructor(private readonly dataSource: DataSource) {}

  async assertReady(): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_NOT_READY',
        message: 'The database is not ready',
      });
    }
  }
}
