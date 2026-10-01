import { MigrationInterface, QueryRunner } from "typeorm";

export class PatientDailyCheckIns1797696000000 implements MigrationInterface {
  name = "PatientDailyCheckIns1797696000000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "patient_daily_check_ins" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "patient_id" uuid NOT NULL,
      "local_date" date NOT NULL,
      "mood" smallint NOT NULL,
      "energy" smallint,
      "sleep" smallint,
      "timezone" varchar(80) NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_patient_daily_check_ins" PRIMARY KEY ("id"),
      CONSTRAINT "FK_patient_daily_check_ins_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT,
      CONSTRAINT "CHK_patient_daily_check_ins_mood" CHECK ("mood" BETWEEN 1 AND 5),
      CONSTRAINT "CHK_patient_daily_check_ins_energy" CHECK ("energy" IS NULL OR "energy" BETWEEN 1 AND 5),
      CONSTRAINT "CHK_patient_daily_check_ins_sleep" CHECK ("sleep" IS NULL OR "sleep" BETWEEN 1 AND 5)
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_patient_daily_check_ins_patient_date" ON "patient_daily_check_ins"("patient_id","local_date")`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "UQ_patient_daily_check_ins_patient_date"`);
    await q.query(`DROP TABLE "patient_daily_check_ins"`);
  }
}
