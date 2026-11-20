import 'dotenv/config';
import { PayOS } from '@payos/node';

async function confirm(): Promise<void> {
  if (process.env.PAYOS_ENABLED !== 'true') throw new Error('PAYOS_ENABLED must be true');
  const required = (key: string): string => {
    const value = process.env[key];
    if (!value) throw new Error(`${key} is required`);
    return value;
  };
  const url = new URL(required('PAYOS_WEBHOOK_URL'));
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/api/v1/payment-callbacks/payos'
  )
    throw new Error('Use the exact HTTPS callback URL without credentials');
  const client = new PayOS({
    clientId: required('PAYOS_CLIENT_ID'),
    apiKey: required('PAYOS_API_KEY'),
    checksumKey: required('PAYOS_CHECKSUM_KEY'),
    baseURL: 'https://api-merchant.payos.vn',
    logLevel: 'off',
    logger: null,
    timeout: 15000,
    maxRetries: 0,
  });
  await client.webhooks.confirm(url.toString());
  process.stdout.write('CONFIRM_OK: verify matching BE callback log and CONFIRM_SAMPLE event\n');
}
void confirm().catch(() => {
  process.stderr.write('CONFIRM_FAILED: check config/HTTPS/routing and redacted BE logs\n');
  process.exitCode = 1;
});
