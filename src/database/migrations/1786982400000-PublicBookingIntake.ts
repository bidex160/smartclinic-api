import { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicBookingIntake1786982400000 implements MigrationInterface {
  name = 'PublicBookingIntake1786982400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "bookings" ALTER COLUMN "booker_user_id" DROP NOT NULL');
    await queryRunner.query(`
      CREATE TABLE "booking_contacts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "booking_id" uuid NOT NULL,
        "given_name" varchar NOT NULL,
        "family_name" varchar NOT NULL,
        "email" varchar,
        "phone" varchar NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_booking_contacts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_booking_contacts_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_booking_contacts_booking_id" ON "booking_contacts" ("booking_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "booking_contacts"');
    await queryRunner.query('ALTER TABLE "bookings" ALTER COLUMN "booker_user_id" SET NOT NULL');
  }
}
