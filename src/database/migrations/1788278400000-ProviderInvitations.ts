import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderInvitations1788278400000 implements MigrationInterface {
  name = 'ProviderInvitations1788278400000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "provider_invitation_status_enum" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')`);
    await queryRunner.query(`CREATE TABLE "provider_invitations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_id" uuid NOT NULL, "email" varchar NOT NULL, "email_normalized" varchar NOT NULL, "token_hash" char(64) NOT NULL, "status" "provider_invitation_status_enum" NOT NULL DEFAULT 'PENDING', "expires_at" timestamptz NOT NULL, "accepted_at" timestamptz, "revoked_at" timestamptz, "created_by_user_id" uuid NOT NULL, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_provider_invitations" PRIMARY KEY ("id"), CONSTRAINT "UQ_provider_invitations_token_hash" UNIQUE ("token_hash"), CONSTRAINT "FK_provider_invitations_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT, CONSTRAINT "FK_provider_invitations_creator" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_invitations_pending_provider_email" ON "provider_invitations" ("provider_id", "email_normalized") WHERE "status" = 'PENDING'`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_invitations_provider_created" ON "provider_invitations" ("provider_id", "created_at")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_provider_invitations_provider_created"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_provider_invitations_pending_provider_email"`);
    await queryRunner.query(`DROP TABLE "provider_invitations"`);
    await queryRunner.query(`DROP TYPE "provider_invitation_status_enum"`);
  }
}
