import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareChat1790006400000 implements MigrationInterface {
  name = 'CareChat1790006400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "care_message_sender_type_enum" AS ENUM ('PATIENT', 'PROVIDER')`);
    await queryRunner.query(`CREATE TABLE "care_conversations" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "care_request_id" uuid NOT NULL, "patient_id" uuid NOT NULL, "provider_id" uuid NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_care_conversations" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_care_conversations_reference" UNIQUE ("reference"),
      CONSTRAINT "UQ_care_conversations_request" UNIQUE ("care_request_id"),
      CONSTRAINT "FK_care_conversations_request" FOREIGN KEY ("care_request_id") REFERENCES "care_requests"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_conversations_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_care_conversations_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE TABLE "care_messages" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "conversation_id" uuid NOT NULL, "sender_type" "care_message_sender_type_enum" NOT NULL,
      "sender_user_id" uuid NOT NULL, "body" varchar(4000) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(), "read_at" timestamptz,
      CONSTRAINT "PK_care_messages" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_care_messages_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_care_messages_body" CHECK (char_length("body") BETWEEN 1 AND 4000 AND "body" = btrim("body")),
      CONSTRAINT "FK_care_messages_conversation" FOREIGN KEY ("conversation_id") REFERENCES "care_conversations"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_care_messages_sender" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_care_messages_conversation_created" ON "care_messages" ("conversation_id", "created_at", "reference")`);
    await queryRunner.query(`CREATE INDEX "IDX_care_messages_unread" ON "care_messages" ("conversation_id", "sender_type") WHERE "read_at" IS NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "care_messages"`);
    await queryRunner.query(`DROP TABLE "care_conversations"`);
    await queryRunner.query(`DROP TYPE "care_message_sender_type_enum"`);
  }
}
