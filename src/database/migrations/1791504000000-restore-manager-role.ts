import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Restores the separate material management role without changing existing users. */
export class RestoreManagerRole1791504000000 implements MigrationInterface {
  name = 'RestoreManagerRole1791504000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'MANAGER' BEFORE 'MENTOR'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Rollback must not silently demote managers or race a concurrent account creation.
    await queryRunner.query('LOCK TABLE "users" IN ACCESS EXCLUSIVE MODE');
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "users" WHERE "role"::text = 'MANAGER') THEN
          RAISE EXCEPTION 'Cannot remove the MANAGER role while users still have it; reassign accounts before rollback';
        END IF;
      END
      $$
    `);
    await queryRunner.query('ALTER TYPE "user_role_enum" RENAME TO "user_role_enum_with_manager"');
    await queryRunner.query(`CREATE TYPE "user_role_enum" AS ENUM ('ADMIN', 'MENTOR', 'STUDENT')`);
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "role" TYPE "user_role_enum" USING "role"::text::"user_role_enum"',
    );
    await queryRunner.query('DROP TYPE "user_role_enum_with_manager"');
  }
}
