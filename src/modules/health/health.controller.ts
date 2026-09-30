import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { HealthService } from './health.service.js';

export interface HealthResponse {
  readonly status: 'ok';
  readonly timestamp: string;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @ApiOperation({ summary: 'Check whether the process is alive' })
  @ApiOkResponse({
    schema: {
      example: {
        status: 'ok',
        timestamp: '2026-09-29T00:00:00.000Z',
      },
    },
  })
  live(): HealthResponse {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check whether required dependencies are ready' })
  @ApiOkResponse({ schema: { example: { status: 'ok', timestamp: '2026-09-29T00:00:00.000Z' } } })
  @ApiServiceUnavailableResponse({ description: 'A required dependency is unavailable' })
  async ready(): Promise<HealthResponse> {
    await this.healthService.assertReady();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
