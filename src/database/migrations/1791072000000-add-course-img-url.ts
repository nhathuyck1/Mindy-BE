import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCourseImgUrl1791072000000 implements MigrationInterface {
  name = 'AddCourseImgUrl1791072000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "courses" ADD COLUMN "img_url" varchar(2048)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "courses" DROP COLUMN "img_url"');
  }
}
