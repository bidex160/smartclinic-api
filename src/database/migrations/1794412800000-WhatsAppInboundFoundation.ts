import { MigrationInterface, QueryRunner } from 'typeorm';

export class WhatsAppInboundFoundation1794412800000 implements MigrationInterface {
  name = 'WhatsAppInboundFoundation1794412800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "whatsapp_provider_enum" AS ENUM ('META')`);
    await queryRunner.query(`CREATE TYPE "whatsapp_identity_status_enum" AS ENUM ('UNLINKED', 'LINKED', 'DISABLED')`);
    await queryRunner.query(`CREATE TYPE "whatsapp_message_direction_enum" AS ENUM ('INBOUND', 'OUTBOUND')`);
    await queryRunner.query(`CREATE TYPE "whatsapp_message_status_enum" AS ENUM ('RECEIVED', 'SENT', 'FAILED')`);
    await queryRunner.query(`CREATE TABLE "whatsapp_identities" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider" "whatsapp_provider_enum" NOT NULL,
      "provider_user_id" varchar(64),
      "phone_normalized" varchar(32) NOT NULL,
      "user_id" uuid,
      "patient_id" uuid,
      "status" "whatsapp_identity_status_enum" NOT NULL DEFAULT 'UNLINKED',
      "first_seen_at" timestamptz NOT NULL,
      "last_seen_at" timestamptz NOT NULL,
      "linked_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_whatsapp_identities" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_whatsapp_identities_linkage" CHECK (("status" = 'LINKED' AND "user_id" IS NOT NULL AND "patient_id" IS NOT NULL AND "linked_at" IS NOT NULL) OR ("status" <> 'LINKED')),
      CONSTRAINT "FK_whatsapp_identities_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_whatsapp_identities_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_whatsapp_identities_provider_phone" ON "whatsapp_identities" ("provider", "phone_normalized")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_whatsapp_identities_provider_user" ON "whatsapp_identities" ("provider", "provider_user_id") WHERE "provider_user_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_whatsapp_identities_user" ON "whatsapp_identities" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_whatsapp_identities_patient" ON "whatsapp_identities" ("patient_id")`);
    await queryRunner.query(`CREATE TABLE "whatsapp_messages" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "identity_id" uuid NOT NULL,
      "provider" "whatsapp_provider_enum" NOT NULL,
      "direction" "whatsapp_message_direction_enum" NOT NULL,
      "provider_message_id" varchar(128),
      "message_type" varchar(32) NOT NULL,
      "status" "whatsapp_message_status_enum" NOT NULL,
      "occurred_at" timestamptz NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_whatsapp_messages" PRIMARY KEY ("id"),
      CONSTRAINT "FK_whatsapp_messages_identity" FOREIGN KEY ("identity_id") REFERENCES "whatsapp_identities"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_whatsapp_messages_provider_message" ON "whatsapp_messages" ("provider", "provider_message_id") WHERE "provider_message_id" IS NOT NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_whatsapp_messages_identity_created" ON "whatsapp_messages" ("identity_id", "created_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "whatsapp_messages"`);
    await queryRunner.query(`DROP TABLE "whatsapp_identities"`);
    await queryRunner.query(`DROP TYPE "whatsapp_message_status_enum"`);
    await queryRunner.query(`DROP TYPE "whatsapp_message_direction_enum"`);
    await queryRunner.query(`DROP TYPE "whatsapp_identity_status_enum"`);
    await queryRunner.query(`DROP TYPE "whatsapp_provider_enum"`);
  }
}
