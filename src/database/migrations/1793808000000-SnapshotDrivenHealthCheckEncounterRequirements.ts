import { MigrationInterface, QueryRunner } from 'typeorm';

export class SnapshotDrivenHealthCheckEncounterRequirements1793808000000 implements MigrationInterface {
  name = 'SnapshotDrivenHealthCheckEncounterRequirements1793808000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "health_check_measurements" DROP CONSTRAINT "CHK_health_check_measurements_shape"`);
    await queryRunner.query(`ALTER TABLE "health_check_measurements" ALTER COLUMN "code" TYPE varchar(80) USING "code"::text`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "health_check_measurements" ALTER COLUMN "code" TYPE health_check_measurement_code_enum USING "code"::health_check_measurement_code_enum`);
    await queryRunner.query(`ALTER TABLE "health_check_measurements" ADD CONSTRAINT "CHK_health_check_measurements_shape" CHECK (("code" = 'BLOOD_PRESSURE' AND "value_secondary_numeric" IS NOT NULL) OR ("code" <> 'BLOOD_PRESSURE' AND "value_secondary_numeric" IS NULL))`);
  }
}
