import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentVerificationTimestamp1788105600000 implements MigrationInterface {
  name = 'PaymentVerificationTimestamp1788105600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "payment_attempts" ADD "last_verified_at" timestamptz');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "payment_attempts" DROP COLUMN "last_verified_at"');
  }
}
