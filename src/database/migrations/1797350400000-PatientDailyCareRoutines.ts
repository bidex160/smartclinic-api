import { MigrationInterface, QueryRunner } from "typeorm";

export class PatientDailyCareRoutines1797350400000 implements MigrationInterface {
  name = "PatientDailyCareRoutines1797350400000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TYPE "patient_daily_routine_type_enum" AS ENUM ('HYDRATION','MOVEMENT','BREAK','SLEEP','VITAMIN','MEDICATION')`,
    );
    await q.query(
      `CREATE TYPE "patient_daily_routine_source_enum" AS ENUM ('PATIENT','PRESCRIPTION')`,
    );
    await q.query(`CREATE TABLE "patient_daily_routines" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "reference" varchar(24) NOT NULL,
      "patient_id" uuid NOT NULL,
      "type" "patient_daily_routine_type_enum" NOT NULL,
      "label" varchar(120) NOT NULL,
      "instructions" varchar(300),
      "scheduled_local_time" time NOT NULL,
      "timezone" varchar(80) NOT NULL,
      "days_of_week" smallint[] NOT NULL,
      "enabled" boolean NOT NULL DEFAULT true,
      "source" "patient_daily_routine_source_enum" NOT NULL DEFAULT 'PATIENT',
      "source_reference" varchar(40),
      "safety_acknowledged_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_patient_daily_routines" PRIMARY KEY ("id"),
      CONSTRAINT "FK_patient_daily_routines_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_patient_daily_routines_days" CHECK (cardinality("days_of_week") BETWEEN 1 AND 7 AND "days_of_week" <@ ARRAY[0,1,2,3,4,5,6]::smallint[]),
      CONSTRAINT "CHK_patient_daily_routines_label" CHECK (length(trim("label")) > 0),
      CONSTRAINT "CHK_patient_daily_routines_source" CHECK (("source"='PATIENT' AND "source_reference" IS NULL) OR ("source"='PRESCRIPTION' AND "source_reference" IS NOT NULL)),
      CONSTRAINT "CHK_patient_daily_routines_medication_ack" CHECK ("type" <> 'MEDICATION' OR "source"='PRESCRIPTION' OR "safety_acknowledged_at" IS NOT NULL)
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_patient_daily_routines_reference" ON "patient_daily_routines"("reference")`,
    );
    await q.query(
      `CREATE INDEX "IDX_patient_daily_routines_patient_enabled" ON "patient_daily_routines"("patient_id","enabled")`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_patient_daily_routines_patient_enabled"`);
    await q.query(`DROP INDEX "UQ_patient_daily_routines_reference"`);
    await q.query(`DROP TABLE "patient_daily_routines"`);
    await q.query(`DROP TYPE "patient_daily_routine_source_enum"`);
    await q.query(`DROP TYPE "patient_daily_routine_type_enum"`);
  }
}
