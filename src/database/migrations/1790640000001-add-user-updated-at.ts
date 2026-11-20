import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserUpdatedAt1790640000001 implements MigrationInterface {
  name = 'AddUserUpdatedAt1790640000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updated_at"`);
  }
}
