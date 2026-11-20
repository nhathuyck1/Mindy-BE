import 'dotenv/config';

import type { DataSource } from 'typeorm';
import { PasswordService } from '../modules/auth/services/password.service.js';
import { UserEntity } from '../modules/users/user.entity.js';
import { UserRole } from '../modules/users/user-role.enum.js';
import { UserStatus } from '../modules/users/user-status.enum.js';
import { normalizeEmail } from '../modules/users/users.service.js';
import dataSource from './data-source.js';

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
};

async function seedAdmin(source: DataSource): Promise<void> {
  const email = normalizeEmail(required('SEED_ADMIN_EMAIL'));
  const password = required('SEED_ADMIN_PASSWORD');
  const displayName = required('SEED_ADMIN_DISPLAY_NAME');
  if (process.env.NODE_ENV === 'production' && process.env.SEED_ADMIN_CONFIRM !== 'YES') {
    throw new Error('Set SEED_ADMIN_CONFIRM=YES explicitly before seeding production');
  }

  const repository = source.getRepository(UserEntity);
  const existing = await repository.findOne({ where: { email } });
  if (existing !== null) {
    console.log(`Admin seed skipped; ${email} already exists`);
    return;
  }

  const passwordService = new PasswordService();
  const user = repository.create({
    email,
    phone: null,
    passwordHash: await passwordService.hashPassword(password),
    displayName,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    lastLoginAt: null,
  });
  await repository.save(user);
  console.log(`Admin seed created for ${email}`);
}

await dataSource.initialize();
try {
  await seedAdmin(dataSource);
} finally {
  await dataSource.destroy();
}
