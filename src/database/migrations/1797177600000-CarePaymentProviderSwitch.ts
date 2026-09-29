import { MigrationInterface, QueryRunner } from "typeorm";

export class CarePaymentProviderSwitch1797177600000
  implements MigrationInterface
{
  name = "CarePaymentProviderSwitch1797177600000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "care_request_funding_status_enum" ADD VALUE IF NOT EXISTS 'REQUIRES_REFUND_REVIEW'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL cannot safely remove a used enum value in place. This forward-only
    // accounting state is intentionally retained on rollback.
  }
}
