import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CourseCatalog1790900000000 implements MigrationInterface {
  name = 'CourseCatalog1790900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "course_categories" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(150) NOT NULL,
        "slug" character varying(180) NOT NULL,
        "description" text,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_course_categories_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_course_categories_slug" UNIQUE ("slug")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_course_categories_active_name" ON "course_categories" ("is_active", "name")',
    );

    await queryRunner.query(`
      CREATE TABLE "courses" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "category_id" uuid NOT NULL,
        "code" character varying(50) NOT NULL,
        "title" character varying(250) NOT NULL,
        "description" text,
        "price_amount" bigint NOT NULL DEFAULT 0,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_courses_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_courses_code" UNIQUE ("code"),
        CONSTRAINT "ck_courses_price_amount" CHECK ("price_amount" >= 0),
        CONSTRAINT "fk_courses_category" FOREIGN KEY ("category_id") REFERENCES "course_categories" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_courses_category_active" ON "courses" ("category_id", "is_active")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_courses_active_title" ON "courses" ("is_active", "title")',
    );

    // The unique constraint is deferrable so one UPDATE statement can renumber units on reorder.
    // It also serves as the index for reading a course's units in order.
    await queryRunner.query(`
      CREATE TABLE "course_units" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_id" uuid NOT NULL,
        "unit_number" integer NOT NULL,
        "title" character varying(250) NOT NULL,
        "description" text,
        "required_score_percent" numeric(5,2) NOT NULL DEFAULT 80.00,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_course_units_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_course_units_course_number" UNIQUE ("course_id", "unit_number") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "ck_course_units_unit_number" CHECK ("unit_number" > 0),
        CONSTRAINT "ck_course_units_required_score" CHECK ("required_score_percent" >= 0 AND "required_score_percent" <= 100),
        CONSTRAINT "fk_course_units_course" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE RESTRICT
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "course_units"');
    await queryRunner.query('DROP TABLE "courses"');
    await queryRunner.query('DROP TABLE "course_categories"');
  }
}
