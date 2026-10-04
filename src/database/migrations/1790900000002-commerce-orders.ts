import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommerceOrders1790900000002 implements MigrationInterface {
  name = 'CommerceOrders1790900000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "order_status_enum" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED')`,
    );
    await queryRunner.query(`CREATE TYPE "payment_type_enum" AS ENUM ('PAYOS', 'CASH')`);

    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_carts_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_carts_student" UNIQUE ("student_id"),
        CONSTRAINT "fk_carts_student" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);

    // Cart details are mutable display data without history, so they follow their cart.
    await queryRunner.query(`
      CREATE TABLE "cart_details" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "cart_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "price_snapshot" bigint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_cart_details_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cart_details_cart_class" UNIQUE ("cart_id", "class_id"),
        CONSTRAINT "ck_cart_details_price_snapshot" CHECK ("price_snapshot" >= 0),
        CONSTRAINT "fk_cart_details_cart" FOREIGN KEY ("cart_id") REFERENCES "carts" ("id") ON DELETE CASCADE,
        CONSTRAINT "fk_cart_details_class" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query('CREATE INDEX "idx_cart_details_class" ON "cart_details" ("class_id")');

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "student_id" uuid NOT NULL,
        "order_code" character varying(50) NOT NULL,
        "total_amount" bigint NOT NULL,
        "status" "order_status_enum" NOT NULL DEFAULT 'PENDING',
        "payment_type" "payment_type_enum" NOT NULL,
        "cash_mentor_id" uuid,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "paid_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_orders_order_code" UNIQUE ("order_code"),
        CONSTRAINT "ck_orders_total_amount" CHECK ("total_amount" >= 0),
        CONSTRAINT "ck_orders_expires_after_created" CHECK ("expires_at" > "created_at"),
        CONSTRAINT "ck_orders_cash_mentor" CHECK (
          ("payment_type" = 'CASH' AND "cash_mentor_id" IS NOT NULL)
          OR ("payment_type" = 'PAYOS' AND "cash_mentor_id" IS NULL)
        ),
        CONSTRAINT "fk_orders_student" FOREIGN KEY ("student_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_orders_cash_mentor" FOREIGN KEY ("cash_mentor_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_orders_student_created" ON "orders" ("student_id", "created_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_orders_status_expires" ON "orders" ("status", "expires_at")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_orders_cash_mentor_status" ON "orders" ("cash_mentor_id", "status") WHERE "cash_mentor_id" IS NOT NULL',
    );

    await queryRunner.query(`
      CREATE TABLE "order_details" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "order_id" uuid NOT NULL,
        "class_id" uuid NOT NULL,
        "course_title_snapshot" character varying(250) NOT NULL,
        "class_name_snapshot" character varying(250) NOT NULL,
        "price_snapshot" bigint NOT NULL,
        "quantity" integer NOT NULL DEFAULT 1,
        "total_amount" bigint NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_order_details_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_order_details_order_class" UNIQUE ("order_id", "class_id"),
        CONSTRAINT "ck_order_details_price_snapshot" CHECK ("price_snapshot" >= 0),
        CONSTRAINT "ck_order_details_quantity" CHECK ("quantity" = 1),
        CONSTRAINT "ck_order_details_total_amount" CHECK ("total_amount" = "price_snapshot" * "quantity"),
        CONSTRAINT "fk_order_details_order" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_order_details_class" FOREIGN KEY ("class_id") REFERENCES "classes" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_order_details_class" ON "order_details" ("class_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "order_details"');
    await queryRunner.query('DROP TABLE "orders"');
    await queryRunner.query('DROP TABLE "cart_details"');
    await queryRunner.query('DROP TABLE "carts"');
    await queryRunner.query('DROP TYPE "payment_type_enum"');
    await queryRunner.query('DROP TYPE "order_status_enum"');
  }
}
