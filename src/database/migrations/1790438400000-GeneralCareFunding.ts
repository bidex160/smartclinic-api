import { MigrationInterface, QueryRunner } from 'typeorm';
export class GeneralCareFunding1790438400000 implements MigrationInterface {
  name = 'GeneralCareFunding1790438400000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "care_request_funding_status_enum" AS ENUM ('PENDING', 'PAID', 'SATISFIED_FREE')`);
    await queryRunner.query(`CREATE TABLE "care_request_funding" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "care_request_id" uuid NOT NULL, "amount_minor" bigint NOT NULL, "currency" char(3) NOT NULL, "status" "care_request_funding_status_enum" NOT NULL, "paid_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_care_request_funding_amount" CHECK ("amount_minor" >= 0), CONSTRAINT "CHK_care_request_funding_currency" CHECK ("currency" ~ '^[A-Z]{3}$'), CONSTRAINT "CHK_care_request_funding_free" CHECK (("status" = 'SATISFIED_FREE' AND "amount_minor" = 0) OR ("status" <> 'SATISFIED_FREE' AND "amount_minor" > 0)), CONSTRAINT "PK_care_request_funding" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "care_request_funding" ADD CONSTRAINT "FK_care_request_funding_request" FOREIGN KEY ("care_request_id") REFERENCES "care_requests"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_care_request_funding_request" ON "care_request_funding" ("care_request_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_request_funding_status" ON "care_request_funding" ("status")`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "CHK_payment_attempts_obligation"`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD "care_request_funding_id" uuid`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "FK_payment_attempts_care_request_funding" FOREIGN KEY ("care_request_funding_id") REFERENCES "care_request_funding"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "CHK_payment_attempts_obligation" CHECK ((CASE WHEN "booking_funding_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "fasttrack_request_id" IS NULL THEN 0 ELSE 1 END + CASE WHEN "care_request_funding_id" IS NULL THEN 0 ELSE 1 END) = 1)`);
    await queryRunner.query(`CREATE INDEX "IDX_payment_attempts_care_request_funding_status" ON "payment_attempts" ("care_request_funding_id", "status")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_payment_attempts_care_request_funding_status"`); await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "CHK_payment_attempts_obligation"`); await queryRunner.query(`ALTER TABLE "payment_attempts" DROP CONSTRAINT "FK_payment_attempts_care_request_funding"`); await queryRunner.query(`ALTER TABLE "payment_attempts" DROP COLUMN "care_request_funding_id"`); await queryRunner.query(`ALTER TABLE "payment_attempts" ADD CONSTRAINT "CHK_payment_attempts_obligation" CHECK (("booking_funding_id" IS NOT NULL AND "fasttrack_request_id" IS NULL) OR ("booking_funding_id" IS NULL AND "fasttrack_request_id" IS NOT NULL))`); await queryRunner.query(`DROP INDEX "IDX_care_request_funding_status"`); await queryRunner.query(`DROP INDEX "UQ_care_request_funding_request"`); await queryRunner.query(`ALTER TABLE "care_request_funding" DROP CONSTRAINT "FK_care_request_funding_request"`); await queryRunner.query(`DROP TABLE "care_request_funding"`); await queryRunner.query(`DROP TYPE "care_request_funding_status_enum"`);
  }
}
