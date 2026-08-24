import { MigrationInterface, QueryRunner } from 'typeorm';

export class CheckoutFundingOptions1788883200000 implements MigrationInterface {
  name = 'CheckoutFundingOptions1788883200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "checkout_funding_option_enum" AS ENUM ('PAY_NOW', 'PAYMENT_LINK', 'PAY_LATER')`);
    await queryRunner.query(`ALTER TABLE "booking_funding" ADD "checkout_option" "checkout_funding_option_enum"`);
    await queryRunner.query(`UPDATE "booking_funding" SET "checkout_option" = 'PAY_NOW' WHERE "source_type" = 'SELF'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "booking_funding" DROP COLUMN "checkout_option"`);
    await queryRunner.query(`DROP TYPE "checkout_funding_option_enum"`);
  }
}
