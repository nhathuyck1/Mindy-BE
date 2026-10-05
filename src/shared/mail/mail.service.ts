import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { MailDeliveryUnavailableException } from './mail.exception.js';

@Injectable()
export class MailService {
  private readonly transporter: Transporter | null;

  constructor(private readonly config: ConfigService) {
    if (!this.config.getOrThrow<boolean>('MAIL_ENABLED')) {
      this.transporter = null;
      return;
    }

    const user = this.config.getOrThrow<string>('SMTP_USER');
    const password = this.config.getOrThrow<string>('SMTP_PASSWORD');
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.getOrThrow<number>('SMTP_PORT'),
      secure: this.config.getOrThrow<boolean>('SMTP_SECURE'),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
      ...(user.length === 0 ? {} : { auth: { user, pass: password } }),
    });
  }

  assertEnabled(): void {
    if (this.transporter === null) {
      throw new MailDeliveryUnavailableException();
    }
  }

  async sendPaymentConfirmation(email: string, orderCode: string, amount: number): Promise<void> {
    if (!this.transporter) throw new MailDeliveryUnavailableException();
    try {
      await this.transporter.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: email,
        subject: `Mindy payment confirmed: ${orderCode}`,
        text: `Payment received for order ${orderCode}: ${amount.toLocaleString('en-US')} VND.\nYour purchased class access is now active.\nOpen Mindy to view your class and timetable.`,
      });
    } catch {
      throw new MailDeliveryUnavailableException();
    }
  }

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    const transporter = this.transporter;
    if (transporter === null) {
      throw new MailDeliveryUnavailableException();
    }
    const frontendBaseUrl = this.config.getOrThrow<string>('FRONTEND_BASE_URL');
    const path = this.config.getOrThrow<string>('EMAIL_VERIFICATION_PATH');
    const verificationUrl = new URL(path, frontendBaseUrl);
    verificationUrl.searchParams.set('token', rawToken);

    try {
      await transporter.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: email,
        subject: 'Verify your Mindy Center account',
        text: [
          'Welcome to Mindy Center.',
          '',
          'Verify your email address by opening this link:',
          verificationUrl.toString(),
          '',
          'If you did not request this account, you can ignore this email.',
        ].join('\n'),
      });
    } catch {
      throw new MailDeliveryUnavailableException();
    }
  }
}
