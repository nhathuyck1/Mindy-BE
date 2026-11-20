import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

describe('HealthController', () => {
  it('returns an ok liveness response', () => {
    const controller = new HealthController({
      assertReady: async () => undefined,
    } as unknown as HealthService);

    const result = controller.live();

    expect(result.status).toBe('ok');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
