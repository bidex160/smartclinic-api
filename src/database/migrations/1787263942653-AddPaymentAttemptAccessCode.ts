import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentAttemptAccessCode1787263942653
  implements MigrationInterface
{
  name = 'AddPaymentAttemptAccessCode1787263942653';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      ADD "access_code" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_attempts"
      DROP COLUMN "access_code"
    `);
  }
}