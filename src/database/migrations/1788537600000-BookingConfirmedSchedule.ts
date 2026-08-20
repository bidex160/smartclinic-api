import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingConfirmedSchedule1788537600000 implements MigrationInterface {
  name = 'BookingConfirmedSchedule1788537600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" ADD "scheduled_date" date`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "scheduled_time_from" time`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "scheduled_time_to" time`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "scheduled_timezone" varchar`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "provider_location_id" uuid`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "scheduled_at" timestamptz`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD "scheduled_by_user_id" uuid`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_confirmed_schedule_complete" CHECK (("scheduled_date" IS NULL AND "scheduled_time_from" IS NULL AND "scheduled_time_to" IS NULL AND "scheduled_timezone" IS NULL) OR ("scheduled_date" IS NOT NULL AND "scheduled_time_from" IS NOT NULL AND "scheduled_time_to" IS NOT NULL AND "scheduled_timezone" IS NOT NULL AND "scheduled_time_from" < "scheduled_time_to"))`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_provider_location" FOREIGN KEY ("provider_location_id") REFERENCES "provider_locations"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_scheduled_by_user" FOREIGN KEY ("scheduled_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_scheduled_by_user"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_provider_location"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_confirmed_schedule_complete"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "scheduled_by_user_id"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "scheduled_at"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "provider_location_id"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "scheduled_timezone"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "scheduled_time_to"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "scheduled_time_from"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "scheduled_date"`);
  }
}
