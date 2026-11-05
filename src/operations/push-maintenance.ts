import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { PushMaintenance } from '../modules/push-notifications/push-maintenance.service.js';

const command = process.argv[2] ?? 'metrics';
const limit = Number(process.argv.find((v) => v.startsWith('--limit='))?.slice(8) ?? 20);
const apply = process.argv.includes('--apply');
if (
  !['metrics', 'replay', 'retention', 'rotate'].includes(command) ||
  !Number.isInteger(limit) ||
  limit < 1 ||
  limit > 100
)
  throw new Error('Expected metrics|replay|retention|rotate and --limit=1..100');
for (const key of [
  'PUSH_WORKER_ENABLED',
  'CHAT_JOB_ENABLED',
  'ORDER_EXPIRY_JOB_ENABLED',
  'PAYMENT_MAIL_JOB_ENABLED',
  'FILE_JOB_ENABLED',
  'ASSIGNMENT_TIMEOUT_JOB_ENABLED',
])
  process.env[key] = 'false';
const { AppModule } = await import('../app.module.js');
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
try {
  const service = app.get(PushMaintenance);
  console.log(
    JSON.stringify(
      command === 'metrics'
        ? await service.metrics()
        : await service.run(command as 'replay' | 'retention' | 'rotate', limit, apply),
    ),
  );
} finally {
  await app.close();
}
