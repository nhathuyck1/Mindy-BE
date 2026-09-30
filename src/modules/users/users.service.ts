import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { CreateUserDto } from './dtos/create-user.dto.js';
import type { UserPageOptionsDto } from './dtos/user-page-options.dto.js';
import {
  UserEmailAlreadyExistsException,
  UserNotFoundException,
  UserPhoneAlreadyExistsException,
} from './exceptions/user.exceptions.js';
import { UserEntity } from './user.entity.js';
import { UserStatus } from './user-status.enum.js';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeOptionalPhone(phone: string | undefined): string | null {
  const normalized = phone?.trim();
  return normalized === undefined || normalized.length === 0 ? null : normalized;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async findAuthenticationIdentity(email: string): Promise<UserEntity | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.users.findOne({ where: { id } });
    if (user === null) {
      throw new UserNotFoundException();
    }

    return user;
  }

  async createUser(input: CreateUserDto, passwordHash: string): Promise<UserEntity> {
    const email = normalizeEmail(input.email);
    const phone = normalizeOptionalPhone(input.phone);

    if (await this.users.exists({ where: { email } })) {
      throw new UserEmailAlreadyExistsException();
    }

    if (phone !== null && (await this.users.exists({ where: { phone } }))) {
      throw new UserPhoneAlreadyExistsException();
    }

    const user = this.users.create({
      email,
      phone,
      passwordHash,
      displayName: input.displayName.trim(),
      role: input.role,
      status: UserStatus.ACTIVE,
      lastLoginAt: null,
    });

    try {
      return await this.users.save(user);
    } catch (error: unknown) {
      if (isUniqueViolation(error, 'uq_users_email')) {
        throw new UserEmailAlreadyExistsException();
      }

      if (isUniqueViolation(error, 'uq_users_phone')) {
        throw new UserPhoneAlreadyExistsException();
      }

      throw error;
    }
  }

  async listUsers(options: UserPageOptionsDto): Promise<{ items: UserEntity[]; total: number }> {
    const query = this.users.createQueryBuilder('user').orderBy('user.createdAt', 'DESC');

    if (options.role !== undefined) {
      query.andWhere('user.role = :role', { role: options.role });
    }

    if (options.status !== undefined) {
      query.andWhere('user.status = :status', { status: options.status });
    }

    const [items, total] = await query
      .skip((options.page - 1) * options.pageSize)
      .take(options.pageSize)
      .getManyAndCount();

    return { items, total };
  }

  async updateStatus(id: string, status: UserStatus): Promise<UserEntity> {
    const user = await this.findById(id);
    user.status = status;
    return this.users.save(user);
  }

  async markLastLogin(userId: string, now: Date): Promise<void> {
    await this.users.update({ id: userId }, { lastLoginAt: now });
  }

  async assertActive(userId: string): Promise<UserEntity> {
    const user = await this.findById(userId);
    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotFoundException();
    }

    return user;
  }
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const postgresError = error as { code?: string; constraint?: string };
  return postgresError.code === '23505' && postgresError.constraint === constraint;
}
