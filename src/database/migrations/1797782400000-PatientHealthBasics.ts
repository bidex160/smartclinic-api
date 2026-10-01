import { MigrationInterface, QueryRunner } from "typeorm";

export class PatientHealthBasics1797782400000 implements MigrationInterface {
  name = "PatientHealthBasics1797782400000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "patient_health_basics" (
      "patient_id" uuid NOT NULL,
      "blood_group" varchar(3),
      "genotype" varchar(2),
      "allergies" varchar(500),
      "conditions" varchar(500),
      "emergency_contact_name" varchar(120),
      "emergency_contact_phone" varchar(30),
      "emergency_contact_relationship" varchar(60),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_patient_health_basics" PRIMARY KEY ("patient_id"),
      CONSTRAINT "FK_patient_health_basics_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_patient_health_basics_blood_group" CHECK ("blood_group" IS NULL OR "blood_group" IN ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
      CONSTRAINT "CHK_patient_health_basics_genotype" CHECK ("genotype" IS NULL OR "genotype" IN ('AA','AS','AC','SS','SC','CC'))
    )`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "patient_health_basics"`);
  }
}
