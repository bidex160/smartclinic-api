import { MigrationInterface, QueryRunner } from 'typeorm';

export class GeneralCareDeliveryModes1789920000000 implements MigrationInterface {
  name = 'GeneralCareDeliveryModes1789920000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "general_care_delivery_mode_enum" AS ENUM ('IN_PERSON', 'VIRTUAL', 'HOME_VISIT')`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD "delivery_modes" "general_care_delivery_mode_enum"[] NOT NULL DEFAULT ARRAY['IN_PERSON'::"general_care_delivery_mode_enum"]`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" ADD CONSTRAINT "CHK_provider_care_services_delivery_modes" CHECK (cardinality("delivery_modes") > 0)`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_care_services_delivery_modes" ON "provider_care_services" USING GIN ("delivery_modes")`);
    await queryRunner.query(`ALTER TABLE "care_requests" ADD "delivery_mode" "general_care_delivery_mode_enum" NOT NULL DEFAULT 'IN_PERSON'`);
    await queryRunner.query(`ALTER TABLE "care_appointments" ADD "delivery_mode" "general_care_delivery_mode_enum" NOT NULL DEFAULT 'IN_PERSON'`);
    await queryRunner.query(`ALTER TABLE "care_appointments" ADD "meeting_url" text`);
    await queryRunner.query(`ALTER TABLE "care_appointments" ADD CONSTRAINT "CHK_care_appointments_location_mode" CHECK ("delivery_mode" = 'IN_PERSON' OR "provider_location_id" IS NULL)`);
    await queryRunner.query(`ALTER TABLE "care_appointments" ADD CONSTRAINT "CHK_care_appointments_meeting_url_mode" CHECK ("meeting_url" IS NULL OR "delivery_mode" = 'VIRTUAL')`);
    await queryRunner.query(`ALTER TABLE "care_appointments" ADD CONSTRAINT "CHK_care_appointments_meeting_url_https" CHECK ("meeting_url" IS NULL OR "meeting_url" ~* '^https://')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "care_appointments" DROP CONSTRAINT "CHK_care_appointments_meeting_url_https"`);
    await queryRunner.query(`ALTER TABLE "care_appointments" DROP CONSTRAINT "CHK_care_appointments_meeting_url_mode"`);
    await queryRunner.query(`ALTER TABLE "care_appointments" DROP CONSTRAINT "CHK_care_appointments_location_mode"`);
    await queryRunner.query(`ALTER TABLE "care_appointments" DROP COLUMN "meeting_url"`);
    await queryRunner.query(`ALTER TABLE "care_appointments" DROP COLUMN "delivery_mode"`);
    await queryRunner.query(`ALTER TABLE "care_requests" DROP COLUMN "delivery_mode"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_provider_care_services_delivery_modes"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP CONSTRAINT "CHK_provider_care_services_delivery_modes"`);
    await queryRunner.query(`ALTER TABLE "provider_care_services" DROP COLUMN "delivery_modes"`);
    await queryRunner.query(`DROP TYPE "general_care_delivery_mode_enum"`);
  }
}
