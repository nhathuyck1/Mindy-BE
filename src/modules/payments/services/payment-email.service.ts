import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: Nest DI requires runtime constructor.
import { DataSource } from 'typeorm';
// biome-ignore lint/style/useImportType: Shared mail API.
import { MailService } from '../../../shared/mail/mail.service.js';
// biome-ignore lint/style/useImportType: Exported users API.
import { UsersService } from '../../users/users.service.js';
import { PaymentConfirmationEmailEntity } from '../entities/payment-confirmation-email.entity.js';

@Injectable()
export class PaymentEmailService {
  constructor(
    private readonly db: DataSource,
    private readonly mail: MailService,
    private readonly users: UsersService,
  ) {}

  async sendBatch(): Promise<number> {
    // If mail is disabled, preserve jobs without exhausting delivery attempts.
    this.mail.assertEnabled();
    const job = await this.db.transaction(async (manager) => {
      const jobs = manager.getRepository(PaymentConfirmationEmailEntity);
      await jobs
        .createQueryBuilder()
        .update()
        .set({ status: 'FAILED', leaseToken: null, leaseUntil: null })
        .where('status = :status AND attempts >= 10 AND lease_until <= now()', {
          status: 'SENDING',
        })
        .execute();
      const row = await jobs
        .createQueryBuilder('mail')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where(
          "((mail.status = 'PENDING' AND mail.next_attempt_at <= now()) OR (mail.status = 'SENDING' AND mail.lease_until <= now())) AND mail.attempts < 10",
        )
        .orderBy('mail.nextAttemptAt', 'ASC')
        .addOrderBy('mail.id', 'ASC')
        .getOne();
      if (!row) return null;
      row.status = 'SENDING';
      row.attempts += 1;
      row.leaseToken = randomUUID();
      row.leaseUntil = new Date(Date.now() + 60_000);
      return jobs.save(row);
    });
    if (!job) return 0;
    try {
      const student = await this.users.findById(job.studentId);
      await this.mail.sendPaymentConfirmation(student.email, job.orderCode, job.amount);
      await this.db
        .getRepository(PaymentConfirmationEmailEntity)
        .update(
          { id: job.id, leaseToken: job.leaseToken ?? undefined },
          { status: 'SENT', sentAt: new Date(), leaseToken: null, leaseUntil: null },
        );
    } catch {
      await this.db.getRepository(PaymentConfirmationEmailEntity).update(
        { id: job.id, leaseToken: job.leaseToken ?? undefined },
        {
          status: job.attempts >= 10 ? 'FAILED' : 'PENDING',
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + Math.min(3600, 30 * 2 ** (job.attempts - 1)) * 1000),
        },
      );
    }
    return 1;
  }
}
