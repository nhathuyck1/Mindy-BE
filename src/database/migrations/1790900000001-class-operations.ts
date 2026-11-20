import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ClassOperations1790900000001 implements MigrationInterface {
  name = 'ClassOperations1790900000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "delivery_mode_enum" AS ENUM ('ONLINE', 'OFFLINE')`);
    await queryRunner.query(
      `CREATE TYPE "class_status_enum" AS ENUM ('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "class_unit_status_enum" AS ENUM ('LOCKED', 'OPEN', 'COMPLETED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "session_status_enum" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "classes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "course_id" uuid NOT NULL,
        "mentor_id" uuid NOT NULL,
        "code" character varying(50) NOT NULL,
        "name" character varying(250) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "max_students" integer NOT NULL,
        "delivery_mode" "delivery_mode_enum" NOT NULL,
        "meeting_url" text,
        "status" "class_status_enum" NOT NULL DEFAULT 'DRAFT',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_classes_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_classes_code" UNIQUE ("code"),
        CONSTRAINT "ck_classes_date_range" CHECK ("start_date" <= "end_date"),
        CONSTRAINT "ck_classes_max_students" CHECK ("max_students" > 0),
        CONSTRAINT "fk_classes_course" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_classes_mentor" FOREIGN KEY ("mentor_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_classes_course_status" ON "classes" ("course_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_classes_mentor_dates" ON "classes" ("mentor_id", "start_date", "end_date")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_classes_status_start_date" ON "classes" ("status", "start_date")',
    );

    await queryRunner.query(`
      CREATE TABLE "class_units" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_id" uuid NOT NULL,
        "course_unit_id" uuid NOT NULL,
        "position" integer NOT NULL,
        "unlock_at" TIMESTAMP WITH TIME ZONE,
        "status" "class_unit_status_enum" NOT NULL DEFAULT 'LOCKED',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_class_units_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_class_units_class_course_unit" UNIQUE ("class_id", "course_unit_id"),
        CONSTRAINT "uq_class_units_class_position" UNIQUE ("class_id", "position"),
        CONSTRAINT "ck_class_units_position" CHECK ("position" > 0),
        CONSTRAINT "fk_class_units_class" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_class_units_course_unit" FOREIGN KEY ("course_unit_id") REFERENCES "course_units" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_class_units_course_unit" ON "class_units" ("course_unit_id")',
    );

    await queryRunner.query(`
      CREATE TABLE "class_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "class_unit_id" uuid NOT NULL,
        "session_number" integer NOT NULL,
        "title" character varying(250) NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "room_name" character varying(150),
        "meeting_url" text,
        "status" "session_status_enum" NOT NULL DEFAULT 'SCHEDULED',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_class_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_class_sessions_unit_number" UNIQUE ("class_unit_id", "session_number"),
        CONSTRAINT "ck_class_sessions_session_number" CHECK ("session_number" > 0),
        CONSTRAINT "ck_class_sessions_time_range" CHECK ("starts_at" < "ends_at"),
        CONSTRAINT "fk_class_sessions_class_unit" FOREIGN KEY ("class_unit_id") REFERENCES "class_units" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_class_sessions_time_range" ON "class_sessions" ("starts_at", "ends_at")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "class_sessions"');
    await queryRunner.query('DROP TABLE "class_units"');
    await queryRunner.query('DROP TABLE "classes"');
    await queryRunner.query('DROP TYPE "session_status_enum"');
    await queryRunner.query('DROP TYPE "class_unit_status_enum"');
    await queryRunner.query('DROP TYPE "class_status_enum"');
    await queryRunner.query('DROP TYPE "delivery_mode_enum"');
  }
}
