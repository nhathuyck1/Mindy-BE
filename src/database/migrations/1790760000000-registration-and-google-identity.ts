import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RegistrationAndGoogleIdentity1790760000000 implements MigrationInterface {
  name = 'RegistrationAndGoogleIdentity1790760000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TYPE "user_status_enum" RENAME TO "user_status_enum_old"');
    await queryRunner.query(
      "CREATE TYPE \"user_status_enum\" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED')",
    );
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT');
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "status" TYPE "user_status_enum" USING "status"::text::"user_status_enum"',
    );
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT \'ACTIVE\'');
    await queryRunner.query('DROP TYPE "user_status_enum_old"');
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL');

    await queryRunner.query(`
      CREATE TABLE "user_identities" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "provider" character varying(32) NOT NULL,
        "provider_subject" character varying(255) NOT NULL,
        "email_at_link" character varying(320) NOT NULL,
        "email_verified" boolean NOT NULL,
        "last_login_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_user_identities_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_identities_provider_subject" UNIQUE ("provider", "provider_subject"),
        CONSTRAINT "uq_user_identities_user_provider" UNIQUE ("user_id", "provider"),
        CONSTRAINT "ck_user_identities_provider" CHECK ("provider" IN ('GOOGLE')),
        CONSTRAINT "ck_user_identities_email_verified" CHECK ("email_verified" = true),
        CONSTRAINT "fk_user_identities_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_user_identities_user_id" ON "user_identities" ("user_id")',
    );

    await queryRunner.query(`
      CREATE TABLE "registration_intents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "provider" character varying(32) NOT NULL,
        "provider_subject" character varying(255) NOT NULL,
        "verified_email" character varying(320) NOT NULL,
        "display_name_hint" character varying(150),
        "avatar_url_hint" text,
        "token_hash" character(64) NOT NULL,
        "return_to" character varying(500) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "consumed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_registration_intents_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_registration_intents_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "ck_registration_intents_provider" CHECK ("provider" IN ('GOOGLE'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_registration_intents_provider_subject" ON "registration_intents" ("provider", "provider_subject")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_registration_intents_expires_at" ON "registration_intents" ("expires_at")',
    );

    await queryRunner.query(`
      CREATE TABLE "email_verification_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" character(64) NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "used_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_email_verification_tokens_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_email_verification_tokens_hash" UNIQUE ("token_hash"),
        CONSTRAINT "fk_email_verification_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_email_verification_tokens_user_id" ON "email_verification_tokens" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_email_verification_tokens_expires_at" ON "email_verification_tokens" ("expires_at")',
    );

    await queryRunner.query(
      'ALTER TABLE "auth_sessions" ADD COLUMN "authentication_method" character varying(32) NOT NULL DEFAULT \'PASSWORD\'',
    );
    await queryRunner.query('ALTER TABLE "auth_sessions" ADD COLUMN "identity_id" uuid');
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      ADD CONSTRAINT "fk_auth_sessions_identity"
      FOREIGN KEY ("identity_id") REFERENCES "user_identities" ("id") ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      ALTER TABLE "auth_sessions"
      ADD CONSTRAINT "ck_auth_sessions_authentication_method"
      CHECK (
        ("authentication_method" = 'PASSWORD' AND "identity_id" IS NULL)
        OR ("authentication_method" = 'GOOGLE' AND "identity_id" IS NOT NULL)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_auth_sessions_identity_id" ON "auth_sessions" ("identity_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_auth_sessions_identity_id"');
    await queryRunner.query(
      'ALTER TABLE "auth_sessions" DROP CONSTRAINT "ck_auth_sessions_authentication_method"',
    );
    await queryRunner.query(
      'ALTER TABLE "auth_sessions" DROP CONSTRAINT "fk_auth_sessions_identity"',
    );
    await queryRunner.query('ALTER TABLE "auth_sessions" DROP COLUMN "identity_id"');
    await queryRunner.query('ALTER TABLE "auth_sessions" DROP COLUMN "authentication_method"');
    await queryRunner.query('DROP TABLE "email_verification_tokens"');
    await queryRunner.query('DROP TABLE "registration_intents"');
    await queryRunner.query('DROP TABLE "user_identities"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM "users" WHERE "status" = 'PENDING_VERIFICATION') THEN
          RAISE EXCEPTION 'Cannot revert registration migration while pending users exist';
        END IF;
      END
      $$
    `);
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "password_hash" SET NOT NULL');
    await queryRunner.query('ALTER TYPE "user_status_enum" RENAME TO "user_status_enum_old"');
    await queryRunner.query("CREATE TYPE \"user_status_enum\" AS ENUM ('ACTIVE', 'SUSPENDED')");
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT');
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "status" TYPE "user_status_enum" USING "status"::text::"user_status_enum"',
    );
    await queryRunner.query('ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT \'ACTIVE\'');
    await queryRunner.query('DROP TYPE "user_status_enum_old"');
  }
}
