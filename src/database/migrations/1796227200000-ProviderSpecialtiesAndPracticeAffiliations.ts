import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderSpecialtiesAndPracticeAffiliations1796227200000 implements MigrationInterface {
  name='ProviderSpecialtiesAndPracticeAffiliations1796227200000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE TABLE "clinical_specialties" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "code" varchar(80) NOT NULL,
      "name" varchar(160) NOT NULL,
      "group_name" varchar(120),
      "is_active" boolean NOT NULL DEFAULT true,
      "sort_order" smallint NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_clinical_specialties" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_clinical_specialties_code" UNIQUE ("code")
    )`);
    await q.query(`CREATE INDEX "IDX_clinical_specialties_active_order" ON "clinical_specialties" ("is_active","sort_order")`);
    await q.query(`CREATE TABLE "provider_specialties" (
      "provider_id" uuid NOT NULL,
      "specialty_id" uuid NOT NULL,
      "is_primary" boolean NOT NULL DEFAULT false,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_specialties" PRIMARY KEY ("provider_id","specialty_id"),
      CONSTRAINT "FK_provider_specialties_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_specialties_specialty" FOREIGN KEY ("specialty_id") REFERENCES "clinical_specialties"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "IDX_provider_specialties_specialty" ON "provider_specialties" ("specialty_id","provider_id")`);

    await q.query(`CREATE TYPE "provider_practice_affiliation_type_enum" AS ENUM ('HEALTH_STATION','HOSPITAL','CLINIC')`);
    await q.query(`CREATE TABLE "provider_practice_affiliations" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "doctor_provider_id" uuid NOT NULL,
      "host_provider_id" uuid NOT NULL,
      "host_location_id" uuid NOT NULL,
      "affiliation_type" "provider_practice_affiliation_type_enum" NOT NULL,
      "is_default" boolean NOT NULL DEFAULT false,
      "is_active" boolean NOT NULL DEFAULT true,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_practice_affiliations" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_practice_affiliations_doctor_location" UNIQUE ("doctor_provider_id","host_location_id"),
      CONSTRAINT "CHK_provider_practice_affiliations_distinct" CHECK ("doctor_provider_id" <> "host_provider_id"),
      CONSTRAINT "FK_provider_practice_affiliations_doctor" FOREIGN KEY ("doctor_provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_practice_affiliations_host" FOREIGN KEY ("host_provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_practice_affiliations_location" FOREIGN KEY ("host_location_id") REFERENCES "provider_locations"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "IDX_provider_practice_affiliations_doctor_active" ON "provider_practice_affiliations" ("doctor_provider_id","is_active","is_default")`);

    await q.query(`
      INSERT INTO "clinical_specialties" ("code","name","group_name","sort_order") VALUES
      ('GENERAL_PRACTICE','General Practice / Family Medicine','Primary care',10),
      ('INTERNAL_MEDICINE','Internal Medicine','Medicine',20),
      ('CARDIOLOGY','Cardiology','Medicine',30),
      ('ENDOCRINOLOGY','Endocrinology & Diabetes','Medicine',40),
      ('GASTROENTEROLOGY','Gastroenterology','Medicine',50),
      ('NEPHROLOGY','Nephrology','Medicine',60),
      ('PULMONOLOGY','Respiratory / Pulmonology','Medicine',70),
      ('RHEUMATOLOGY','Rheumatology','Medicine',80),
      ('INFECTIOUS_DISEASE','Infectious Diseases','Medicine',90),
      ('HEMATOLOGY','Hematology','Medicine',100),
      ('ONCOLOGY','Medical Oncology','Medicine',110),
      ('NEUROLOGY','Neurology','Neurosciences',120),
      ('PSYCHIATRY','Psychiatry','Mental health',130),
      ('DERMATOLOGY','Dermatology','Skin',140),
      ('PEDIATRICS','Pediatrics','Children',150),
      ('OBSTETRICS_GYNECOLOGY','Obstetrics & Gynecology','Women''s health',160),
      ('GENERAL_SURGERY','General Surgery','Surgery',170),
      ('ORTHOPAEDICS','Orthopaedics & Trauma','Surgery',180),
      ('UROLOGY','Urology','Surgery',190),
      ('NEUROSURGERY','Neurosurgery','Surgery',200),
      ('PLASTIC_SURGERY','Plastic & Reconstructive Surgery','Surgery',210),
      ('ENT','ENT / Otorhinolaryngology','Head & neck',220),
      ('OPHTHALMOLOGY','Ophthalmology','Eye',230),
      ('DENTISTRY','Dentistry','Dental',240),
      ('ORAL_MAXILLOFACIAL','Oral & Maxillofacial Surgery','Dental',250),
      ('ANESTHESIA','Anaesthesia','Perioperative',260),
      ('PAIN_MEDICINE','Pain Medicine','Perioperative',270),
      ('RADIOLOGY','Radiology','Diagnostics',280),
      ('PATHOLOGY','Pathology','Diagnostics',290),
      ('PHYSIOTHERAPY','Physiotherapy','Rehabilitation',300),
      ('PHYSICAL_REHAB','Physical Medicine & Rehabilitation','Rehabilitation',310),
      ('DIETETICS','Nutrition & Dietetics','Allied health',320),
      ('CLINICAL_PSYCHOLOGY','Clinical Psychology','Mental health',330),
      ('EMERGENCY_MEDICINE','Emergency Medicine','Acute care',340),
      ('GERIATRICS','Geriatric Medicine','Medicine',350),
      ('OCCUPATIONAL_HEALTH','Occupational Health','Primary care',360)
      ON CONFLICT ("code") DO NOTHING
    `);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('DROP INDEX "public"."IDX_provider_practice_affiliations_doctor_active"');
    await q.query('DROP TABLE "provider_practice_affiliations"');
    await q.query('DROP TYPE "provider_practice_affiliation_type_enum"');
    await q.query('DROP INDEX "public"."IDX_provider_specialties_specialty"');
    await q.query('DROP TABLE "provider_specialties"');
    await q.query('DROP INDEX "public"."IDX_clinical_specialties_active_order"');
    await q.query('DROP TABLE "clinical_specialties"');
  }
}
