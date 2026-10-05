import { PayOS } from '@payos/node';

import { createReceiver } from './receiver.mjs';

/** @param {string} name @returns {string} */
function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

try {
  const port = Number(process.env.PROBE_PORT || '3100');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PROBE_PORT must be an integer between 1 and 65535');
  }
  const host = process.env.PROBE_HOST || '127.0.0.1';
  if (host !== '127.0.0.1' && host !== '0.0.0.0') {
    throw new Error('PROBE_HOST must be 127.0.0.1 or 0.0.0.0 (container only)');
  }
  const payos = new PayOS({
    clientId: requireEnv('PAYOS_CLIENT_ID'),
    apiKey: requireEnv('PAYOS_API_KEY'),
    checksumKey: requireEnv('PAYOS_CHECKSUM_KEY'),
  });
  const server = createReceiver({
    verify: (body) => payos.webhooks.verify(body),
    log: (entry) => console.log(JSON.stringify(entry)),
  });
  server.on('error', () => {
    console.error('Probe listener failed; check bind address and port');
    process.exitCode = 1;
  });
  server.listen(port, host, () =>
    console.log(JSON.stringify({ event: 'probe_ready', host, port })),
  );
  const shutdown = () => {
    server.close(() => process.exit(0));
    setTimeout(() => {
      server.closeAllConnections();
      process.exit(1);
    }, 5000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
} catch {
  console.error('Probe configuration invalid; check PROBE_HOST/PROBE_PORT and PAYOS env variables');
  process.exitCode = 1;
}
