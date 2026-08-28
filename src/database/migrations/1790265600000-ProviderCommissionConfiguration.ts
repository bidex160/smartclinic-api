import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderCommissionConfiguration1790265600000 implements MigrationInterface {
  name = 'ProviderCommissionConfiguration1790265600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "commission_config_target_enum" AS ENUM ('PLATFORM_DEFAULT', 'PROVIDER_OVERRIDE')`);
    await queryRunner.query(`ALTER TABLE "providers" ADD "commission_override_bps" smallint`);
    await queryRunner.query(`ALTER TABLE "providers" ADD CONSTRAINT "CHK_providers_commission_override_bps" CHECK ("commission_override_bps" IS NULL OR ("commission_override_bps" >= 0 AND "commission_override_bps" <= 10000))`);
    await queryRunner.query(`CREATE TABLE "platform_commission_settings" ("id" smallint NOT NULL DEFAULT 1, "default_provider_commission_bps" smallint, "updated_by_user_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_platform_commission_settings_singleton" CHECK ("id" = 1), CONSTRAINT "CHK_platform_commission_settings_rate" CHECK ("default_provider_commission_bps" IS NULL OR ("default_provider_commission_bps" >= 0 AND "default_provider_commission_bps" <= 10000)), CONSTRAINT "PK_platform_commission_settings" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "platform_commission_settings" ADD CONSTRAINT "FK_platform_commission_settings_actor" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE TABLE "commission_config_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "target" "commission_config_target_enum" NOT NULL, "provider_id" uuid, "old_rate_bps" smallint, "new_rate_bps" smallint, "actor_user_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "CHK_commission_config_history_rates" CHECK (("old_rate_bps" IS NULL OR ("old_rate_bps" >= 0 AND "old_rate_bps" <= 10000)) AND ("new_rate_bps" IS NULL OR ("new_rate_bps" >= 0 AND "new_rate_bps" <= 10000))), CONSTRAINT "CHK_commission_config_history_target_provider" CHECK (("target" = 'PLATFORM_DEFAULT' AND "provider_id" IS NULL) OR ("target" = 'PROVIDER_OVERRIDE' AND "provider_id" IS NOT NULL)), CONSTRAINT "PK_commission_config_history" PRIMARY KEY ("id"))`);
    await queryRunner.query(`ALTER TABLE "commission_config_history" ADD CONSTRAINT "FK_commission_config_history_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE "commission_config_history" ADD CONSTRAINT "FK_commission_config_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT`);
    await queryRunner.query(`CREATE INDEX "IDX_commission_config_history_target_created" ON "commission_config_history" ("target", "created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_commission_config_history_provider_created" ON "commission_config_history" ("provider_id", "created_at")`);
    await queryRunner.query(`INSERT INTO "platform_commission_settings" ("id", "default_provider_commission_bps", "updated_by_user_id") VALUES (1, NULL, NULL)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_commission_config_history_provider_created"`);
    await queryRunner.query(`DROP INDEX "IDX_commission_config_history_target_created"`);
    await queryRunner.query(`ALTER TABLE "commission_config_history" DROP CONSTRAINT "FK_commission_config_history_actor"`);
    await queryRunner.query(`ALTER TABLE "commission_config_history" DROP CONSTRAINT "FK_commission_config_history_provider"`);
    await queryRunner.query(`DROP TABLE "commission_config_history"`);
    await queryRunner.query(`ALTER TABLE "platform_commission_settings" DROP CONSTRAINT "FK_platform_commission_settings_actor"`);
    await queryRunner.query(`DROP TABLE "platform_commission_settings"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP CONSTRAINT "CHK_providers_commission_override_bps"`);
    await queryRunner.query(`ALTER TABLE "providers" DROP COLUMN "commission_override_bps"`);
    await queryRunner.query(`DROP TYPE "commission_config_target_enum"`);
  }
}
