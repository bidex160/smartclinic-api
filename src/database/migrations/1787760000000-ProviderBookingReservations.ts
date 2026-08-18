import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderBookingReservations1787760000000 implements MigrationInterface {
  name = 'ProviderBookingReservations1787760000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TYPE "provider_booking_reservation_status_enum" AS ENUM ('HELD', 'CONFIRMED', 'RELEASED', 'CANCELLED')`);
    await q.query(`ALTER TABLE "provider_assignments" ADD CONSTRAINT "UQ_provider_assignments_id_provider_booking" UNIQUE ("id", "provider_id", "booking_id")`);
    await q.query(`CREATE TABLE "provider_booking_reservations" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "provider_id" uuid NOT NULL,
      "booking_id" uuid NOT NULL, "provider_assignment_id" uuid NOT NULL,
      "provider_location_id" uuid, "scheduled_date" date NOT NULL,
      "start_time" time NOT NULL, "end_time" time NOT NULL, "timezone" varchar NOT NULL,
      "status" "provider_booking_reservation_status_enum" NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      "released_at" timestamptz,
      CONSTRAINT "PK_provider_booking_reservations" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_booking_reservations_assignment" UNIQUE ("provider_assignment_id"),
      CONSTRAINT "CHK_provider_booking_reservations_time_range" CHECK ("start_time" < "end_time"),
      CONSTRAINT "FK_provider_booking_reservations_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_booking_reservations_booking" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_booking_reservations_assignment_scope" FOREIGN KEY ("provider_assignment_id", "provider_id", "booking_id") REFERENCES "provider_assignments"("id", "provider_id", "booking_id") ON DELETE RESTRICT,
      CONSTRAINT "FK_provider_booking_reservations_location_provider" FOREIGN KEY ("provider_location_id", "provider_id") REFERENCES "provider_locations"("id", "provider_id") ON DELETE RESTRICT,
      CONSTRAINT "EX_provider_booking_reservations_active_overlap" EXCLUDE USING gist (
        "provider_id" WITH =, "scheduled_date" WITH =,
        int8range(EXTRACT(EPOCH FROM "start_time")::bigint, EXTRACT(EPOCH FROM "end_time")::bigint, '[)') WITH &&
      ) WHERE ("status" IN ('HELD', 'CONFIRMED'))
    )`);
    await q.query(`CREATE INDEX "IDX_provider_booking_reservations_provider_schedule" ON "provider_booking_reservations" ("provider_id", "scheduled_date", "status", "start_time", "end_time")`);
    await q.query(`CREATE INDEX "IDX_provider_booking_reservations_booking" ON "provider_booking_reservations" ("booking_id")`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_provider_booking_reservations_booking"`);
    await q.query(`DROP INDEX "IDX_provider_booking_reservations_provider_schedule"`);
    await q.query(`DROP TABLE "provider_booking_reservations"`);
    await q.query(`ALTER TABLE "provider_assignments" DROP CONSTRAINT "UQ_provider_assignments_id_provider_booking"`);
    await q.query(`DROP TYPE "provider_booking_reservation_status_enum"`);
  }
}
