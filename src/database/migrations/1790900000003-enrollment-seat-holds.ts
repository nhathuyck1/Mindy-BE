import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Checkout holds seats through PENDING_PAYMENT enrollments, so the enrollments table is created
 * here instead of waiting for the later `payments-enrollment` migration. That migration still
 * owns the payment tables and class_unit_progress.
 */
export class EnrollmentSeatHolds1790900000003 implements MigrationInterface {
  name = 'EnrollmentSeatHolds1790900000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "enrollment_status_enum" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'COMPLETED', 'CANCELLED')`,
    );

    await queryRunner.query(`
      CREATE TABLE "enrollments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "order_detail_id" uuid NOT NULL,
        "status" "enrollment_status_enum" NOT NULL DEFAULT 'PENDING_PAYMENT',
        "enrolled_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_enrollments_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_enrollments_order_detail" UNIQUE ("order_detail_id"),
        CONSTRAINT "fk_enrollments_student" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_enrollments_class" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_enrollments_order_detail" FOREIGN KEY ("order_detail_id") REFERENCES "order_details" ("id") ON DELETE RESTRICT
      )
    `);
    // CANCELLED rows are history only and must not block a new checkout of the same class.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_enrollments_student_class_effective"
      ON "enrollments" ("student_id", "class_id")
      WHERE "status" IN ('PENDING_PAYMENT', 'ACTIVE', 'COMPLETED')
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_enrollments_class_status" ON "enrollments" ("class_id", "status")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "enrollments"');
    await queryRunner.query('DROP TYPE "enrollment_status_enum"');
  }
}
