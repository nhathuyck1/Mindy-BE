import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The center has no separate manager: ADMIN covers every management permission. PostgreSQL
 * cannot drop an enum value in place, so the type is recreated without MANAGER.
 */
export class RemoveManagerRole1790900000004 implements MigrationInterface {
  name = 'RemoveManagerRole1790900000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing managers are not silently promoted or deleted; reassign them first.
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "users" WHERE "role" = 'MANAGER') THEN
          RAISE EXCEPTION 'Cannot remove the MANAGER role while users still have it; change their role first';
        END IF;
      END
      $$
    `);
    await queryRunner.query('ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_old"');
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('ADMIN', 'MENTOR', 'STUDENT')`);
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_enum" USING "role"::text::"user_role_enum"',
    );
    await queryRunner.query('DROP TYPE "user_role_enum_old"');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_old"');
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('ADMIN', 'MANAGER', 'MENTOR', 'STUDENT')`,
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_enum" USING "role"::text::"user_role_enum"',
    );
    await queryRunner.query('DROP TYPE "user_role_enum_old"');
  }
}
