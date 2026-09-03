import { MigrationInterface, QueryRunner } from 'typeorm';

export class HealthCheckCatalogueHistory1793721600000 implements MigrationInterface {
  name = 'HealthCheckCatalogueHistory1793721600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "health_check_catalogue_history" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "actor_user_id" uuid NOT NULL,
      "health_check_package_id" uuid,
      "clinical_content_id" uuid,
      "operation" varchar(80) NOT NULL,
      "previous_state" jsonb,
      "resulting_state" jsonb NOT NULL,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_health_check_catalogue_history" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_health_check_catalogue_history_target" CHECK ("health_check_package_id" IS NOT NULL OR "clinical_content_id" IS NOT NULL),
      CONSTRAINT "FK_health_check_catalogue_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_health_check_catalogue_history_package" FOREIGN KEY ("health_check_package_id") REFERENCES "health_check_packages"("id") ON DELETE RESTRICT,
      CONSTRAINT "FK_health_check_catalogue_history_content" FOREIGN KEY ("clinical_content_id") REFERENCES "health_check_clinical_contents"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(`CREATE INDEX "IDX_health_check_catalogue_history_package" ON "health_check_catalogue_history" ("health_check_package_id", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_health_check_catalogue_history_content" ON "health_check_catalogue_history" ("clinical_content_id", "created_at")`);
    await queryRunner.query(`CREATE FUNCTION "prevent_health_check_catalogue_history_mutation"() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Health Check catalogue history is append-only'; END; $$ LANGUAGE plpgsql`);
    await queryRunner.query(`CREATE TRIGGER "TR_health_check_catalogue_history_append_only" BEFORE UPDATE OR DELETE ON "health_check_catalogue_history" FOR EACH ROW EXECUTE FUNCTION "prevent_health_check_catalogue_history_mutation"()`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM "health_check_catalogue_history") THEN RAISE EXCEPTION 'Cannot remove non-empty Health Check catalogue history'; END IF; END $$`);
    await queryRunner.query(`DROP TABLE "health_check_catalogue_history"`);
    await queryRunner.query(`DROP FUNCTION "prevent_health_check_catalogue_history_mutation"`);
  }
}
