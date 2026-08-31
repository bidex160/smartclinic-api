import { MigrationInterface, QueryRunner } from 'typeorm';

export class GuidedSelfCheckAmberRoutineReviewAndContact1793030400000 implements MigrationInterface {
 name='GuidedSelfCheckAmberRoutineReviewAndContact1793030400000';
 async up(q:QueryRunner):Promise<void>{
  await q.query(`ALTER TYPE "guided_self_check_review_model_enum" ADD VALUE IF NOT EXISTS 'INTERNAL_ROUTINE'`);
  for(const value of ['AMBER_ROUTINE_REVIEW_CREATED','HUMAN_REVIEW_TRIGGERED','AMBER_ROUTINE_REVIEW_ASSIGNED'])await q.query(`ALTER TYPE "guided_self_check_review_event_enum" ADD VALUE IF NOT EXISTS '${value}'`);
  await q.query(`CREATE TYPE "gsc_contact_work_item_status_enum" AS ENUM ('PENDING','ACKNOWLEDGED','IN_PROGRESS','COMPLETED','CANCELLED')`);
  await q.query(`CREATE TYPE "gsc_contact_work_item_outcome_enum" AS ENUM ('CONTACTED','UNREACHABLE','PATIENT_DECLINED','REFERRED_TO_CLINICAL_REVIEW')`);
  await q.query(`CREATE TABLE "guided_self_check_contact_work_items" (
   "id" uuid NOT NULL DEFAULT uuid_generate_v4(), "reference" varchar(40) NOT NULL,
   "guided_self_check_id" uuid NOT NULL, "next_action_id" uuid NOT NULL, "professional_review_id" uuid,
   "status" "gsc_contact_work_item_status_enum" NOT NULL, "priority" "guided_self_check_review_priority_enum" NOT NULL,
   "acknowledged_by_user_id" uuid, "acknowledged_at" timestamptz,
   "started_by_user_id" uuid, "started_at" timestamptz,
   "completed_by_user_id" uuid, "completed_at" timestamptz,
   "outcome" "gsc_contact_work_item_outcome_enum", "operational_note" varchar(1000),
   "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
   CONSTRAINT "PK_gsc_contact_work_items" PRIMARY KEY ("id"),
   CONSTRAINT "UQ_gsc_contact_work_reference" UNIQUE ("reference"),
   CONSTRAINT "UQ_gsc_contact_work_next_action" UNIQUE ("next_action_id"),
   CONSTRAINT "FK_gsc_contact_work_check" FOREIGN KEY ("guided_self_check_id") REFERENCES "guided_self_checks"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_gsc_contact_work_action" FOREIGN KEY ("next_action_id") REFERENCES "guided_self_check_next_actions"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_gsc_contact_work_review" FOREIGN KEY ("professional_review_id") REFERENCES "guided_self_check_professional_reviews"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_gsc_contact_work_ack_actor" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_gsc_contact_work_start_actor" FOREIGN KEY ("started_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
   CONSTRAINT "FK_gsc_contact_work_complete_actor" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
   CONSTRAINT "CHK_gsc_contact_work_completion" CHECK (("status"='COMPLETED' AND "outcome" IS NOT NULL AND "completed_at" IS NOT NULL) OR "status"<>'COMPLETED')
  )`);
  await q.query(`CREATE UNIQUE INDEX "UQ_gsc_contact_work_active_check" ON "guided_self_check_contact_work_items" ("guided_self_check_id") WHERE "status" NOT IN ('COMPLETED','CANCELLED')`);
  await q.query(`CREATE INDEX "IDX_gsc_contact_work_queue" ON "guided_self_check_contact_work_items" ("status","priority","created_at","id")`);
 }
 async down(q:QueryRunner):Promise<void>{
  await q.query(`DROP INDEX "IDX_gsc_contact_work_queue"`);await q.query(`DROP INDEX "UQ_gsc_contact_work_active_check"`);
  await q.query(`DROP TABLE "guided_self_check_contact_work_items"`);
  await q.query(`DROP TYPE "gsc_contact_work_item_outcome_enum"`);await q.query(`DROP TYPE "gsc_contact_work_item_status_enum"`);
 }
}
