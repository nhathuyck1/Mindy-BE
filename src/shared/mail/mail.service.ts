import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest dependency injection needs runtime constructor tokens.
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import { MailDeliveryUnavailableException } from './mail.exception.js';
import { renderPaymentConfirmationEmail, renderVerificationEmail } from './mail.templates.js';

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

  async sendPaymentConfirmation(
    email: string,
    orderCode: string,
    amount: number,
    orderId: string,
  ): Promise<void> {
    if (!this.transporter) throw new MailDeliveryUnavailableException();
    const path = this.config.getOrThrow<string>('ORDER_DETAILS_PATH');
    const orderUrl = new URL(
      path.replace(':orderId', encodeURIComponent(orderId)),
      this.config.getOrThrow<string>('FRONTEND_BASE_URL'),
    ).toString();
    const formattedAmount = `${amount.toLocaleString('vi-VN')} VND`;
    try {
      await this.transporter.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: email,
        subject: `Mindycoding | Thanh toán thành công — ${orderCode}`,
        text: [
          'Thanh toán thành công!',
          `Mã đơn hàng: ${orderCode}`,
          `Số tiền đã thanh toán: ${formattedAmount}`,
          'Quyền truy cập các lớp học đã mua đã được kích hoạt.',
          '',
          'Xem chi tiết đơn hàng:',
          orderUrl,
          '',
          'Đăng nhập bằng tài khoản đã mua hàng để xem chi tiết đơn.',
        ].join('\n'),
        html: renderPaymentConfirmationEmail(orderCode, formattedAmount, orderUrl),
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
    const expiryMinutes = Math.ceil(
      this.config.getOrThrow<number>('EMAIL_VERIFICATION_TTL_SECONDS') / 60,
    );

    try {
      await transporter.sendMail({
        from: this.config.getOrThrow<string>('MAIL_FROM'),
        to: email,
        subject: 'Mindycoding | Xác thực email của bạn',
        text: [
          'Chào mừng bạn đến với Mindycoding.',
          '',
          'Xác thực địa chỉ email bằng cách mở liên kết này:',
          verificationUrl.toString(),
          '',
          `Liên kết có hiệu lực trong ${expiryMinutes} phút.`,
          'Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.',
        ].join('\n'),
        html: renderVerificationEmail(verificationUrl.toString(), expiryMinutes),
      });
    } catch {
      throw new MailDeliveryUnavailableException();
    }
  }
}
