import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBasicHealthCheckTier1792512000000 implements MigrationInterface {
  name = 'AddBasicHealthCheckTier1792512000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "health_check_packages"
        ("code","name","description","benefits","estimated_duration_minutes","is_active")
      VALUES (
        'BASIC',
        'Basic Health Check',
        'Vitals plus point-of-care screening and clinician interpretation.',
        ARRAY['Blood pressure','Blood glucose','BMI','Temperature','Oxygen saturation','Pulse','Malaria rapid test','Urine health screening','Clinician consultation and interpretation']::text[],
        30,
        true
      )
      ON CONFLICT ("code") DO UPDATE SET
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "benefits" = EXCLUDED."benefits",
        "estimated_duration_minutes" = EXCLUDED."estimated_duration_minutes",
        "is_active" = true,
        "updated_at" = now()
    `);

    await queryRunner.query(`
      INSERT INTO "health_check_package_contents"
        ("health_check_package_id","code","name","category","sort_order")
      SELECT p.id, v.code, v.name, v.category, v.ord
      FROM "health_check_packages" p
      JOIN (VALUES
        ('BLOOD_PRESSURE','Blood pressure','MEASUREMENT',1),
        ('BLOOD_GLUCOSE','Blood glucose','MEASUREMENT',2),
        ('BMI','BMI','MEASUREMENT',3),
        ('TEMPERATURE','Temperature','MEASUREMENT',4),
        ('OXYGEN_SATURATION','Oxygen saturation','MEASUREMENT',5),
        ('PULSE','Pulse','MEASUREMENT',6),
        ('MALARIA_RDT','Malaria rapid test','SCREENING',7),
        ('URINE_SCREEN','Urine health screening','SCREENING',8),
        ('CLINICIAN_REVIEW','Clinician consultation and interpretation','REVIEW',9)
      ) AS v(code,name,category,ord) ON true
      WHERE p.code = 'BASIC'
      ON CONFLICT ("health_check_package_id","code") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "health_check_packages"
      SET
        "description" = 'Our most comprehensive portable SmartClinic health screening.',
        "benefits" = ARRAY['Blood pressure','Blood glucose','BMI','Temperature','Oxygen saturation','Pulse','Malaria rapid test','Urine health screening','Clinician consultation and interpretation','Hemoglobin/PCV check','Full lipid profile','Hepatitis B rapid test']::text[],
        "estimated_duration_minutes" = 60,
        "updated_at" = now()
      WHERE "code" = 'COMPLETE'
    `);

    await queryRunner.query(`
      INSERT INTO "health_check_package_contents"
        ("health_check_package_id","code","name","category","sort_order")
      SELECT p.id, v.code, v.name, v.category, v.ord
      FROM "health_check_packages" p
      JOIN (VALUES
        ('MALARIA_RDT','Malaria rapid test','SCREENING',7),
        ('URINE_SCREEN','Urine health screening','SCREENING',8),
        ('HEMOGLOBIN_PCV','Hemoglobin/PCV check','SCREENING',10),
        ('LIPID_PROFILE','Full lipid profile','SCREENING',11),
        ('HEPATITIS_B_RDT','Hepatitis B rapid test','SCREENING',12)
      ) AS v(code,name,category,ord) ON true
      WHERE p.code = 'COMPLETE'
      ON CONFLICT ("health_check_package_id","code") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE "health_check_package_contents"
      SET "sort_order" = CASE "code"
        WHEN 'CLINICIAN_REVIEW' THEN 9
        WHEN 'EXPANDED_INTERPRETATION' THEN 13
        ELSE "sort_order"
      END
      WHERE "health_check_package_id" = (SELECT "id" FROM "health_check_packages" WHERE "code" = 'COMPLETE')
        AND "code" IN ('CLINICIAN_REVIEW','EXPANDED_INTERPRETATION')
    `);
    // Seed editable starting prices at the midpoint of the approved planning ranges.
    // Managers/admins can modify these through the existing provider-service pricing flow.
    await queryRunner.query(`
      UPDATE "provider_services" service
      SET
        "price_minor" = CASE package."code"
          WHEN 'ESSENTIAL' THEN CASE mode."code" WHEN 'HOME_VISIT' THEN '550000' ELSE '350000' END
          WHEN 'BASIC' THEN CASE mode."code" WHEN 'HOME_VISIT' THEN '1000000' ELSE '700000' END
          WHEN 'COMPLETE' THEN CASE mode."code" WHEN 'HOME_VISIT' THEN '1750000' ELSE '1350000' END
          ELSE service."price_minor"
        END,
        "fulfilment_fee_minor" = '0',
        "currency" = 'NGN',
        "updated_at" = now()
      FROM "health_check_packages" package, "fulfilment_modes" mode
      WHERE service."health_check_package_id" = package."id"
        AND service."fulfilment_mode_id" = mode."id"
        AND package."code" IN ('ESSENTIAL','BASIC','COMPLETE')
        AND mode."code" IN ('PROVIDER_LOCATION','HOME_VISIT')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM "health_check_package_contents"
      WHERE "health_check_package_id" = (SELECT "id" FROM "health_check_packages" WHERE "code" = 'BASIC')
    `);
    await queryRunner.query(`DELETE FROM "health_check_packages" WHERE "code" = 'BASIC'`);
    await queryRunner.query(`
      DELETE FROM "health_check_package_contents"
      WHERE "health_check_package_id" = (SELECT "id" FROM "health_check_packages" WHERE "code" = 'COMPLETE')
        AND "code" IN ('MALARIA_RDT','URINE_SCREEN','HEMOGLOBIN_PCV','LIPID_PROFILE','HEPATITIS_B_RDT')
    `);
  }
}
