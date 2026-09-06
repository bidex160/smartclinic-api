import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordResetTokens1794758400000 implements MigrationInterface {
  name = 'PasswordResetTokens1794758400000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" char(64) NOT NULL, "expires_at" timestamptz NOT NULL, "used_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(), CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"), CONSTRAINT "UQ_password_reset_tokens_token_hash" UNIQUE ("token_hash"), CONSTRAINT "FK_password_reset_tokens_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT)`);
    await queryRunner.query(`CREATE INDEX "IDX_password_reset_tokens_user_active" ON "password_reset_tokens" ("user_id", "used_at", "expires_at")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_password_reset_tokens_user_active"`);
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
  }
}
