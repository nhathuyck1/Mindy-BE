import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

const PASSWORD_KEY_LENGTH = 32;
const PASSWORD_COST = 16_384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;
const PASSWORD_MAX_MEMORY = 64 * 1024 * 1024;

@Injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = await this.derive(password, salt);
    return [
      'scrypt',
      PASSWORD_COST,
      PASSWORD_BLOCK_SIZE,
      PASSWORD_PARALLELIZATION,
      salt.toString('base64url'),
      derivedKey.toString('base64url'),
    ].join('$');
  }

  async verifyPassword(password: string, encodedHash: string): Promise<boolean> {
    const parts = encodedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') {
      return false;
    }

    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    const salt = Buffer.from(parts[4] ?? '', 'base64url');
    const expected = Buffer.from(parts[5] ?? '', 'base64url');

    if (
      !Number.isSafeInteger(cost) ||
      !Number.isSafeInteger(blockSize) ||
      !Number.isSafeInteger(parallelization) ||
      salt.length === 0 ||
      expected.length !== PASSWORD_KEY_LENGTH
    ) {
      return false;
    }

    const actual = await this.derive(password, salt, cost, blockSize, parallelization);
    return timingSafeEqual(actual, expected);
  }

  hashRefreshToken(token: string): string {
    return requireHash(token);
  }

  private async derive(
    password: string,
    salt: Buffer,
    cost = PASSWORD_COST,
    blockSize = PASSWORD_BLOCK_SIZE,
    parallelization = PASSWORD_PARALLELIZATION,
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      scryptCallback(
        password,
        salt,
        PASSWORD_KEY_LENGTH,
        {
          N: cost,
          r: blockSize,
          p: parallelization,
          maxmem: PASSWORD_MAX_MEMORY,
        },
        (error, derivedKey) => {
          if (error !== null) {
            reject(error);
            return;
          }

          resolve(Buffer.from(derivedKey));
        },
      );
    });
  }
}

function requireHash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
