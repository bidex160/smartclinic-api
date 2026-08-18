import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingMatchingQueueIndex1788192000000 implements MigrationInterface {
  name = 'BookingMatchingQueueIndex1788192000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE INDEX "IDX_bookings_status_created_reference" ON "bookings" ("status", "created_at", "booking_reference")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "public"."IDX_bookings_status_created_reference"');
  }
}
