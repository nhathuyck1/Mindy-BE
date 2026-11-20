import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { environmentSchema } from '../../config/environment.schema.js';
import { MailDeliveryUnavailableException } from './mail.exception.js';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  const sendMail = vi.fn<(message: SendMailOptions) => Promise<void>>();
  const orderId = '776d533b-f3d4-441c-9e7e-0740d0468da2';
  const values = {
    MAIL_ENABLED: true,
    SMTP_HOST: 'localhost',
    SMTP_PORT: 1025,
    SMTP_SECURE: false,
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    MAIL_FROM: 'Mindy Center <no-reply@mindy.local>',
    FRONTEND_BASE_URL: 'https://app.mindy.example',
    EMAIL_VERIFICATION_PATH: '/verify-email?source=registration',
    EMAIL_VERIFICATION_TTL_SECONDS: 1800,
    ORDER_DETAILS_PATH: '/orders/:orderId',
  };

  beforeEach(() => {
    sendMail.mockReset().mockResolvedValue(undefined);
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail,
    } as unknown as Transporter);
  });

  function lastMessage(): SendMailOptions {
    const message = sendMail.mock.calls.at(-1)?.[0];
    if (!message) throw new Error('Expected a delivered email');
    return message;
  }

  it('sends registration HTML and text with the same encoded verification token and expiry', async () => {
    const mail = new MailService(new ConfigService(values));
    const token = 'verify+token/&?=<value>';
    await mail.sendVerificationEmail('student@example.com', token);

    const message = lastMessage();
    expect(message.to).toBe('student@example.com');
    expect(message.from).toBe(values.MAIL_FROM);
    const text = String(message.text);
    const urlLine = text.split('\n').find((line) => line.startsWith('https://'));
    const url = new URL(urlLine ?? '');
    expect(url.origin).toBe(values.FRONTEND_BASE_URL);
    expect(url.pathname).toBe('/verify-email');
    expect(url.searchParams.get('source')).toBe('registration');
    expect(url.searchParams.get('token')).toBe(token);
    expect(text).toContain('30 phút');
    expect(message.html).toContain('Xác thực email');
    expect(message.html).toContain(`href="${url.toString().replaceAll('&', '&amp;')}"`);
    expect(message.html).toContain('30 phút');
    expect(message.html).not.toContain('<value>');
  });

  it('links payment HTML and text to the order UUID, escapes content and formats VND', async () => {
    const mail = new MailService(new ConfigService(values));
    await mail.sendPaymentConfirmation('student@example.com', 'MD<&"\'>', 1250000, orderId);

    const message = lastMessage();
    const orderUrl = `${values.FRONTEND_BASE_URL}/orders/${orderId}`;
    expect(message.html).toContain(`href="${orderUrl}"`);
    expect(message.text).toContain(orderUrl);
    expect(message.html).toContain('Xem chi tiết đơn hàng');
    expect(message.html).toContain('1.250.000 VND');
    expect(message.text).toContain('1.250.000 VND');
    expect(message.html).toContain('MD&lt;&amp;&quot;&#39;&gt;');
    expect(message.html).not.toContain('MD<&');
  });

  it('supports a configured order route with an encoded ID in a query parameter', async () => {
    const mail = new MailService(
      new ConfigService({
        ...values,
        ORDER_DETAILS_PATH: '/orderDetails?id=:orderId&source=email',
      }),
    );
    await mail.sendPaymentConfirmation(
      'student@example.com',
      'MD123',
      100000,
      'id/with?characters',
    );

    expect(lastMessage().text).toContain('/orderDetails?id=id%2Fwith%3Fcharacters&source=email');
    expect(lastMessage().html).toContain(
      '/orderDetails?id=id%2Fwith%3Fcharacters&amp;source=email',
    );
  });

  it('preserves the delivery-unavailable error on SMTP failure for both messages', async () => {
    const mail = new MailService(new ConfigService(values));
    sendMail.mockRejectedValue(new Error('SMTP unavailable'));
    await expect(mail.sendVerificationEmail('student@example.com', 'token')).rejects.toBeInstanceOf(
      MailDeliveryUnavailableException,
    );
    await expect(
      mail.sendPaymentConfirmation('student@example.com', 'MD123', 100000, orderId),
    ).rejects.toBeInstanceOf(MailDeliveryUnavailableException);
  });

  it('does not create a transport or send either message when mail is disabled', async () => {
    vi.mocked(nodemailer.createTransport).mockClear();
    const mail = new MailService(new ConfigService({ ...values, MAIL_ENABLED: false }));
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(() => mail.assertEnabled()).toThrow(MailDeliveryUnavailableException);
    await expect(mail.sendVerificationEmail('student@example.com', 'token')).rejects.toBeInstanceOf(
      MailDeliveryUnavailableException,
    );
    await expect(
      mail.sendPaymentConfirmation('student@example.com', 'MD123', 100000, orderId),
    ).rejects.toBeInstanceOf(MailDeliveryUnavailableException);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('defaults the order route and rejects external URLs, missing IDs and backslashes', () => {
    const required = {
      CORS_ORIGINS: 'http://localhost:3001',
      DATABASE_URL: 'postgresql://localhost/mindy_test',
    };
    expect(environmentSchema.validate(required).value.ORDER_DETAILS_PATH).toBe('/orders/:orderId');
    for (const path of [
      'https://other.example/orders/:orderId',
      '//other.example/orders/:orderId',
      '/orders',
      '/orders/:orderIdentifier',
      '/\\other.example/:orderId',
      '/orders/:orderId\n',
    ]) {
      expect(
        environmentSchema.validate({ ...required, ORDER_DETAILS_PATH: path }).error,
      ).toBeDefined();
    }
  });
});
