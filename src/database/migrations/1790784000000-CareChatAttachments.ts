import { MigrationInterface, QueryRunner } from 'typeorm';

export class CareChatAttachments1790784000000 implements MigrationInterface {
  name = 'CareChatAttachments1790784000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "care_messages" ALTER COLUMN "body" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "care_messages" DROP CONSTRAINT "CHK_care_messages_body"`);
    await queryRunner.query(`ALTER TABLE "care_messages" ADD CONSTRAINT "CHK_care_messages_body" CHECK ("body" IS NULL OR (char_length("body") BETWEEN 1 AND 4000 AND "body" = btrim("body")))`);
    await queryRunner.query(`CREATE TABLE "care_message_attachments" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(32) NOT NULL,
      "conversation_id" uuid NOT NULL, "care_message_id" uuid, "uploaded_by_user_id" uuid NOT NULL,
      "original_name" varchar(255) NOT NULL, "mime_type" varchar(64) NOT NULL, "size_bytes" integer NOT NULL,
      "resource_type" varchar(16) NOT NULL, "storage_provider" varchar(16) NOT NULL DEFAULT 'CLOUDINARY',
      "storage_public_id" varchar(255) NOT NULL, "storage_resource_type" varchar(16) NOT NULL,
      "storage_version" bigint, "storage_format" varchar(16), "expires_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_care_message_attachments" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_care_message_attachments_reference" UNIQUE ("reference"),
      CONSTRAINT "CHK_care_message_attachments_size" CHECK ("size_bytes" > 0 AND "size_bytes" <= 15728640),
      CONSTRAINT "CHK_care_message_attachments_resource" CHECK ("resource_type" IN ('IMAGE', 'DOCUMENT')),
      CONSTRAINT "CHK_care_message_attachments_provider" CHECK ("storage_provider" = 'CLOUDINARY'),
      CONSTRAINT "CHK_care_message_attachments_binding" CHECK (("care_message_id" IS NULL AND "expires_at" IS NOT NULL) OR ("care_message_id" IS NOT NULL AND "expires_at" IS NULL)),
      CONSTRAINT "FK_care_message_attachments_conversation" FOREIGN KEY ("conversation_id") REFERENCES "care_conversations"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_care_message_attachments_message" FOREIGN KEY ("care_message_id") REFERENCES "care_messages"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_care_message_attachments_uploader" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_care_message_attachments_pending" ON "care_message_attachments" ("conversation_id", "uploaded_by_user_id", "expires_at") WHERE "care_message_id" IS NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_care_message_attachments_message" ON "care_message_attachments" ("care_message_id")`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_care_message_attachments_message"`); await queryRunner.query(`DROP INDEX "IDX_care_message_attachments_pending"`); await queryRunner.query(`DROP TABLE "care_message_attachments"`);
    await queryRunner.query(`ALTER TABLE "care_messages" DROP CONSTRAINT "CHK_care_messages_body"`);
    await queryRunner.query(`UPDATE "care_messages" SET "body" = '[attachment]' WHERE "body" IS NULL`);
    await queryRunner.query(`ALTER TABLE "care_messages" ALTER COLUMN "body" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "care_messages" ADD CONSTRAINT "CHK_care_messages_body" CHECK (char_length("body") BETWEEN 1 AND 4000 AND "body" = btrim("body"))`);
  }
}
