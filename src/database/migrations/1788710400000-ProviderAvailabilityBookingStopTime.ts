import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderAvailabilityBookingStopTime1788710400000 implements MigrationInterface {
  name = 'ProviderAvailabilityBookingStopTime1788710400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_availability" ADD "booking_stop_time" time`);
    await queryRunner.query(`ALTER TABLE "provider_availability" ADD CONSTRAINT "CHK_provider_availability_booking_stop_time" CHECK ("booking_stop_time" IS NULL OR ("start_time" < "booking_stop_time" AND "booking_stop_time" <= "end_time"))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "provider_availability" DROP CONSTRAINT "CHK_provider_availability_booking_stop_time"`);
    await queryRunner.query(`ALTER TABLE "provider_availability" DROP COLUMN "booking_stop_time"`);
  }
}
