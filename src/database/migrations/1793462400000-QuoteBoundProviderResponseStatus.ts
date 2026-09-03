import { MigrationInterface, QueryRunner } from 'typeorm';

export class QuoteBoundProviderResponseStatus1793462400000 implements MigrationInterface {
  name = 'QuoteBoundProviderResponseStatus1793462400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "booking_status_enum" ADD VALUE IF NOT EXISTS 'AWAITING_PROVIDER_RESPONSE' AFTER 'PENDING_PROVIDER_MATCH'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "bookings" SET "status" = 'UNFULFILLABLE' WHERE "status" = 'AWAITING_PROVIDER_RESPONSE'`);
    await queryRunner.query(`UPDATE "booking_status_history" SET "from_status" = 'UNFULFILLABLE' WHERE "from_status" = 'AWAITING_PROVIDER_RESPONSE'`);
    await queryRunner.query(`UPDATE "booking_status_history" SET "to_status" = 'UNFULFILLABLE' WHERE "to_status" = 'AWAITING_PROVIDER_RESPONSE'`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(`ALTER TYPE "booking_status_enum" RENAME TO "booking_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "booking_status_enum" AS ENUM ('DRAFT', 'AWAITING_FUNDING', 'PENDING_PROVIDER_MATCH', 'PROVIDER_ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'UNFULFILLABLE', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "status" TYPE "booking_status_enum" USING "status"::text::"booking_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_status_history" ALTER COLUMN "from_status" TYPE "booking_status_enum" USING "from_status"::text::"booking_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_status_history" ALTER COLUMN "to_status" TYPE "booking_status_enum" USING "to_status"::text::"booking_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "booking_status_enum_old"`);
    await queryRunner.query(`ALTER TABLE "bookings" ALTER COLUMN "status" SET DEFAULT 'DRAFT'`);
  }
}
