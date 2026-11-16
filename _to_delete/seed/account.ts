import 'dotenv/config';

import type { DataSource } from 'typeorm';

import { PasswordService } from '../../modules/auth/services/password.service.js';
import { UserEntity } from '../../modules/users/user.entity.js';
import { UserRole } from '../../modules/users/user-role.enum.js';
import { UserStatus } from '../../modules/users/user-status.enum.js';
import { normalizeEmail } from '../../modules/users/users.service.js';
import dataSource from '../data-source.js';

/**
 * Development seed for test accounts: the mentors used by the course/class seed and a few
 * students. Every account gets the password from SEED_ACCOUNT_PASSWORD. Safe to run
 * repeatedly: accounts are matched by email; an existing seed account keeps its ID and gets
 * the current password and display name again.
 *
 *   pnpm seed:account
 *
 * The admin account is created separately by `pnpm seed:admin`.
 */

interface AccountSeed {
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly phone: string | null;
}

const ACCOUNTS: readonly AccountSeed[] = [
  // The course/class seed assigns classes to these two mentors by email.
  {
    email: 'mentor.frontend@gmail.com',
    displayName: 'Nguyễn Minh Anh',
    role: UserRole.MENTOR,
    phone: '0901000002',
  },
  {
    email: 'mentor.backend@gmail.com',
    displayName: 'Trần Quốc Bảo',
    role: UserRole.MENTOR,
    phone: '0901000003',
  },
  {
    email: 'student.an@gmail.com',
    displayName: 'Phạm Gia An',
    role: UserRole.STUDENT,
    phone: '0901000011',
  },
  {
    email: 'student.binh@gmail.com',
    displayName: 'Đỗ Thanh Bình',
    role: UserRole.STUDENT,
    phone: '0901000012',
  },
  {
    email: 'student.chi@gmail.com',
    displayName: 'Vũ Khánh Chi',
    role: UserRole.STUDENT,
    phone: '0901000013',
  },
];

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
};

async function seedAccounts(source: DataSource): Promise<void> {
  if (process.env.NODE_ENV === 'production' && process.env.SEED_DEMO_CONFIRM !== 'YES') {
    throw new Error('Demo accounts are not seeded in production unless SEED_DEMO_CONFIRM=YES');
  }

  const passwordHash = await new PasswordService().hashPassword(required('SEED_ACCOUNT_PASSWORD'));
  const created: string[] = [];
  const updated: string[] = [];
  await source.transaction(async (manager) => {
    const repository = manager.getRepository(UserEntity);
    for (const seed of ACCOUNTS) {
      const email = normalizeEmail(seed.email);
      const existing = await repository.findOne({ where: { email } });
      if (existing !== null) {
        if (existing.role !== seed.role) {
          throw new Error(`${email} already exists with role ${existing.role}`);
        }

        // Rerunning the seed applies the current SEED_ACCOUNT_PASSWORD to the seed accounts.
        await repository.update(
          { id: existing.id },
          { passwordHash, displayName: seed.displayName, status: UserStatus.ACTIVE },
        );
        updated.push(`${seed.role} ${email}`);
        continue;
      }

      // A phone already used by a real account is skipped rather than failing the seed.
      const phoneTaken =
        seed.phone !== null && (await repository.exists({ where: { phone: seed.phone } }));
      await repository.save(
        repository.create({
          email,
          phone: phoneTaken ? null : seed.phone,
          passwordHash,
          displayName: seed.displayName,
          role: seed.role,
          status: UserStatus.ACTIVE,
          lastLoginAt: null,
        }),
      );
      created.push(`${seed.role} ${email}`);
    }
  });

  console.log(
    `Account seed done: ${created.length} created, ${updated.length} updated (password reset)` +
      [...created, ...updated].map((account) => `\n  ${account}`).join(''),
  );
}

await dataSource.initialize();
try {
  await seedAccounts(dataSource);
} finally {
  await dataSource.destroy();
}
