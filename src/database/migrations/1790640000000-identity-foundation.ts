import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IdentityFoundation1790640000000 implements MigrationInterface {
  name = 'IdentityFoundation1790640000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "user_role_enum" AS ENUM ('ADMIN', 'MANAGER', 'MENTOR', 'STUDENT')`,
    );
    await queryRunner.query(`CREATE TYPE "user_status_enum" AS ENUM ('ACTIVE', 'SUSPENDED')`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying(320) NOT NULL,
        "phone" character varying(32),
        "password_hash" character varying(255) NOT NULL,
        "display_name" character varying(150) NOT NULL,
        "role" "user_role_enum" NOT NULL,
        "status" "user_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "uq_users_phone" UNIQUE ("phone")
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_users_role_status" ON "users" ("role", "status")`);

    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "device_name" character varying(150),
        "user_agent" text,
        "ip_address" inet,
        "last_seen_at" TIMESTAMP WITH TIME ZONE,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_auth_sessions_id" PRIMARY KEY ("id"),
        CONSTRAINT "fk_auth_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_auth_sessions_user_revoked" ON "auth_sessions" ("user_id", "revoked_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_auth_sessions_expires_at" ON "auth_sessions" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "session_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "parent_token_id" uuid,
        "replaced_by_token_id" uuid,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "revoked_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_refresh_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_refresh_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "fk_refresh_tokens_session" FOREIGN KEY ("session_id") REFERENCES "auth_sessions" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_refresh_tokens_parent" FOREIGN KEY ("parent_token_id") REFERENCES "refresh_tokens" ("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_refresh_tokens_replaced_by" FOREIGN KEY ("replaced_by_token_id") REFERENCES "refresh_tokens" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_session_expires" ON "refresh_tokens" ("session_id", "expires_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_refresh_tokens_session_revoked" ON "refresh_tokens" ("session_id", "revoked_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE "auth_sessions"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
