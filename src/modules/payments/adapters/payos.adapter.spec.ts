import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { APIError, PayOS } from '@payos/node';
import { describe, expect, it, vi } from 'vitest';
import { environmentSchema } from '../../../config/environment.schema.js';
import { PayosAdapter } from './payos.adapter.js';

const values = {
  PAYOS_ENABLED: true,
  PAYOS_CLIENT_ID: 'test-client',
  PAYOS_API_KEY: 'test-key',
  PAYOS_CHECKSUM_KEY: 'test-checksum',
  PAYOS_RETURN_URL: 'https://example.test/paid',
  PAYOS_CANCEL_URL: 'https://example.test/cancel',
  PAYOS_WEBHOOK_URL: 'https://example.test/webhook',
};
const data = {
  orderCode: 123,
  amount: 3000,
  description: 'VQRIO123',
  accountNumber: '12345678',
  reference: 'TF230204212323',
  transactionDateTime: '2023-02-04 18:25:00',
  currency: 'VND',
  paymentLinkId: '124c33293c43417ab7879e14c8d9eb18',
  code: '00',
  desc: 'Thành công',
};
const sdk = new PayOS({
  clientId: 'test',
  apiKey: 'test',
  checksumKey: values.PAYOS_CHECKSUM_KEY,
  logLevel: 'off',
  logger: null,
});
async function signed(d: typeof data & Record<string, unknown> = data) {
  return {
    code: '00',
    desc: 'success',
    success: true,
    data: d,
    signature: await sdk.crypto.createSignatureFromObj(d, values.PAYOS_CHECKSUM_KEY),
  };
}

describe('payOS adapter signature and configuration', () => {
  it.each([
    { code: '101', desc: 'Mã thanh toán không tồn tại' },
    { code: '231', desc: 'Payment link not found' },
  ])('treats explicit missing-link response $code as absent', async (response) => {
    vi.spyOn(PayOS.prototype, 'request').mockRejectedValue(
      new APIError(200, response, undefined, new Headers()),
    );
    await expect(new PayosAdapter(new ConfigService(values)).get(1000000000)).resolves.toBeNull();
  });

  it.each([
    { status: 200, code: '101', desc: 'Unspecified error' },
    { status: 503, code: '101', desc: 'Mã thanh toán không tồn tại' },
    { status: 401, code: '401', desc: 'Credentials rejected' },
    { status: 429, code: '429', desc: 'Rate limited' },
  ])(
    'keeps ambiguous/provider errors unavailable ($status/$code)',
    async ({ status, ...response }) => {
      vi.spyOn(PayOS.prototype, 'request').mockRejectedValue(
        new APIError(status, response, undefined, new Headers()),
      );
      await expect(new PayosAdapter(new ConfigService(values)).get(1000000000)).rejects.toThrow(
        'Payment is temporarily unavailable',
      );
    },
  );
  it('verifies with official SDK and recognizes the complete signed confirm sample', async () => {
    const adapter = new PayosAdapter(new ConfigService(values));
    expect((await adapter.verify(await signed())).isConfirmSample).toBe(true);
    expect(
      (await adapter.verify(await signed({ ...data, reference: 'real-reference' })))
        .isConfirmSample,
    ).toBe(false);
  });
  it('keeps extra signed fields and ignores unsigned outer success for settlement', async () => {
    const adapter = new PayosAdapter(new ConfigService(values));
    const body = await signed({ ...data, futureSignedField: 'preserve me' });
    expect((await adapter.verify({ ...body, success: false, code: 'WRONG' })).code).toBe('00');
    await expect(
      adapter.verify({ ...body, data: { ...body.data, futureSignedField: 'changed' } }),
    ).rejects.toThrow();
  });
  it('rejects missing/invalid signatures, tampered amounts and malformed signed types', async () => {
    const adapter = new PayosAdapter(new ConfigService(values));
    const body = await signed();
    for (const invalid of [
      {},
      { ...body, signature: '' },
      { ...body, signature: '0'.repeat(64) },
      { ...body, data: { ...data, amount: 9000 } },
      { ...body, data: { ...data, orderCode: '123' } },
    ])
      await expect(adapter.verify(invalid)).rejects.toThrow();
  });
  it('does not call network while disabled and never leaks provider exception messages', async () => {
    const adapter = new PayosAdapter(new ConfigService({ ...values, PAYOS_ENABLED: false }));
    await expect(adapter.verify(await signed())).rejects.toThrow(
      'Payment is temporarily unavailable',
    );
    const spy = vi.spyOn(PayOS.prototype, 'request').mockRejectedValue(new Error('secret-body'));
    try {
      await expect(new PayosAdapter(new ConfigService(values)).get(55)).rejects.toThrow(
        'Payment is temporarily unavailable',
      );
    } finally {
      spy.mockRestore();
    }
  });
  it('requires credentials/URLs only when enabled and HTTPS URLs for production', () => {
    const base = {
      CORS_ORIGINS: 'https://example.test',
      DATABASE_URL: 'postgresql://mindy:unused@localhost/mindy_test',
    };
    expect(environmentSchema.validate(base).error).toBeUndefined();
    expect(environmentSchema.validate({ ...base, PAYOS_ENABLED: true }).error).toBeDefined();
    expect(environmentSchema.validate({ ...base, ...values }).error).toBeUndefined();
    expect(
      environmentSchema.validate({
        ...base,
        ...values,
        NODE_ENV: 'production',
        JWT_PRIVATE_KEY_BASE64: 'dummy',
        JWT_PUBLIC_KEY_BASE64: 'dummy',
        PAYOS_RETURN_URL: 'http://example.test',
      }).error,
    ).toBeDefined();
  });
});
