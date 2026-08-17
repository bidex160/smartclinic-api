import { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingPreferredTimezone1787500800000 implements MigrationInterface {
  name = 'BookingPreferredTimezone1787500800000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookings" ADD "preferred_timezone" varchar');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookings" DROP COLUMN "preferred_timezone"');
  }
}
