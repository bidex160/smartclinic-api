import { MigrationInterface, QueryRunner } from 'typeorm';

export class PaymentAttemptCustomerEmail1794067200000 implements MigrationInterface {
  name = 'PaymentAttemptCustomerEmail1794067200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_attempts" ADD "customer_email" varchar(254)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "payment_attempts" DROP COLUMN "customer_email"`);
  }
}
