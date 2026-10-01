import { MigrationInterface, QueryRunner } from "typeorm";

export class PatientDailyRoutineCompletions1797609600000 implements MigrationInterface {
  name = "PatientDailyRoutineCompletions1797609600000";
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "patient_daily_routine_completions" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "routine_id" uuid NOT NULL,
      "patient_id" uuid NOT NULL,
      "local_date" date NOT NULL,
      "completed_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_patient_daily_routine_completions" PRIMARY KEY ("id"),
      CONSTRAINT "FK_patient_daily_routine_completions_routine" FOREIGN KEY ("routine_id") REFERENCES "patient_daily_routines"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_patient_daily_routine_completions_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT
    )`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_patient_daily_routine_completions_routine_date" ON "patient_daily_routine_completions"("routine_id","local_date")`,
    );
    await q.query(
      `CREATE INDEX "IDX_patient_daily_routine_completions_patient_date" ON "patient_daily_routine_completions"("patient_id","local_date")`,
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "IDX_patient_daily_routine_completions_patient_date"`);
    await q.query(`DROP INDEX "UQ_patient_daily_routine_completions_routine_date"`);
    await q.query(`DROP TABLE "patient_daily_routine_completions"`);
  }
}
