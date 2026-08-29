import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicalRecordAttachments1790697600000 implements MigrationInterface {
  name = 'ClinicalRecordAttachments1790697600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "clinical_attachment_resource_type_enum" AS ENUM ('IMAGE', 'DOCUMENT')`);
    await queryRunner.query(`CREATE TYPE "clinical_attachment_storage_provider_enum" AS ENUM ('CLOUDINARY')`);
    await queryRunner.query(`
      CREATE TABLE "clinical_record_attachments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reference" character varying(32) NOT NULL,
        "clinical_record_id" uuid NOT NULL,
        "uploaded_by_user_id" uuid NOT NULL,
        "original_name" character varying(255) NOT NULL,
        "mime_type" character varying(64) NOT NULL,
        "size_bytes" integer NOT NULL,
        "resource_type" "clinical_attachment_resource_type_enum" NOT NULL,
        "storage_provider" "clinical_attachment_storage_provider_enum" NOT NULL,
        "storage_public_id" character varying(255) NOT NULL,
        "storage_resource_type" character varying(16) NOT NULL,
        "storage_version" bigint,
        "storage_format" character varying(16),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clinical_record_attachments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_clinical_record_attachments_reference" UNIQUE ("reference"),
        CONSTRAINT "CHK_clinical_record_attachments_size" CHECK ("size_bytes" > 0 AND "size_bytes" <= 15728640),
        CONSTRAINT "FK_clinical_record_attachments_record" FOREIGN KEY ("clinical_record_id") REFERENCES "clinical_records"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_clinical_record_attachments_uploader" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_clinical_record_attachments_record_created" ON "clinical_record_attachments" ("clinical_record_id", "created_at")`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_clinical_record_attachments_record_created"`);
    await queryRunner.query(`DROP TABLE "clinical_record_attachments"`);
    await queryRunner.query(`DROP TYPE "clinical_attachment_storage_provider_enum"`);
    await queryRunner.query(`DROP TYPE "clinical_attachment_resource_type_enum"`);
  }
}
