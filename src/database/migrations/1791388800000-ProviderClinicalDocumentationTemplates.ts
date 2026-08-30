import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderClinicalDocumentationTemplates1791388800000 implements MigrationInterface {
  name = 'ProviderClinicalDocumentationTemplates1791388800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "provider_care_service_clinical_templates" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider_care_service_id" uuid NOT NULL,
      "version" integer NOT NULL,
      "record_type" "clinical_record_type_enum" NOT NULL,
      "fields" jsonb NOT NULL,
      "is_current" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_care_service_clinical_templates" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_provider_care_service_clinical_templates_version" CHECK ("version" > 0),
      CONSTRAINT "CHK_provider_care_service_clinical_templates_fields" CHECK (jsonb_typeof("fields") = 'array'),
      CONSTRAINT "FK_provider_care_service_clinical_templates_service" FOREIGN KEY ("provider_care_service_id") REFERENCES "provider_care_services"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_care_service_clinical_templates_version" ON "provider_care_service_clinical_templates" ("provider_care_service_id", "version")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_provider_care_service_clinical_templates_current" ON "provider_care_service_clinical_templates" ("provider_care_service_id") WHERE "is_current" = true`);
    await queryRunner.query(`CREATE INDEX "IDX_provider_care_service_clinical_templates_lookup" ON "provider_care_service_clinical_templates" ("provider_care_service_id", "record_type", "is_current")`);
    await queryRunner.query(`ALTER TABLE "clinical_records" ADD "documentation_template_snapshot" jsonb`);
    await queryRunner.query(`ALTER TABLE "clinical_records" ADD "structured_data" jsonb`);
    await queryRunner.query(`ALTER TABLE "clinical_records" ADD CONSTRAINT "CHK_clinical_records_documentation_snapshot" CHECK ("documentation_template_snapshot" IS NULL OR jsonb_typeof("documentation_template_snapshot") = 'object')`);
    await queryRunner.query(`ALTER TABLE "clinical_records" ADD CONSTRAINT "CHK_clinical_records_structured_data" CHECK ("structured_data" IS NULL OR jsonb_typeof("structured_data") = 'object')`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "clinical_records" DROP CONSTRAINT "CHK_clinical_records_structured_data"`);
    await queryRunner.query(`ALTER TABLE "clinical_records" DROP CONSTRAINT "CHK_clinical_records_documentation_snapshot"`);
    await queryRunner.query(`ALTER TABLE "clinical_records" DROP COLUMN "structured_data"`);
    await queryRunner.query(`ALTER TABLE "clinical_records" DROP COLUMN "documentation_template_snapshot"`);
    await queryRunner.query(`DROP TABLE "provider_care_service_clinical_templates"`);
  }
}
