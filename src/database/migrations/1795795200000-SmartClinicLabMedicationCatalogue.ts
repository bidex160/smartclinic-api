import { MigrationInterface, QueryRunner } from 'typeorm';

export class SmartClinicLabMedicationCatalogue1795795200000 implements MigrationInterface {
  name='SmartClinicLabMedicationCatalogue1795795200000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE TABLE "smartclinic_service_catalogue" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "code" varchar(80) NOT NULL,
      "category" varchar(20) NOT NULL,
      "name" varchar(200) NOT NULL,
      "description" text,
      "unit_label" varchar(120),
      "average_cost_minor" bigint NOT NULL,
      "markup_bps" smallint NOT NULL DEFAULT 2000,
      "currency" char(3) NOT NULL DEFAULT 'NGN',
      "requires_prescription" boolean NOT NULL DEFAULT false,
      "patient_visible" boolean NOT NULL DEFAULT true,
      "is_active" boolean NOT NULL DEFAULT true,
      "sort_order" smallint NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_smartclinic_service_catalogue" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_smartclinic_service_catalogue_code" UNIQUE ("code"),
      CONSTRAINT "CHK_smartclinic_service_catalogue_category" CHECK ("category" IN ('LAB_TEST','MEDICATION')),
      CONSTRAINT "CHK_smartclinic_service_catalogue_cost" CHECK ("average_cost_minor">=0),
      CONSTRAINT "CHK_smartclinic_service_catalogue_markup" CHECK ("markup_bps" BETWEEN 0 AND 10000)
    )`);
    await q.query(`CREATE INDEX "IDX_smartclinic_service_catalogue_category_active" ON "smartclinic_service_catalogue" ("category","is_active")`);

    await q.query(`
      INSERT INTO "smartclinic_service_catalogue"
      ("code","category","name","description","unit_label","average_cost_minor","markup_bps","currency","requires_prescription","patient_visible","is_active","sort_order")
      VALUES
      ('LAB_MALARIA_RDT','LAB_TEST','Malaria rapid test','Rapid malaria antigen screening','per test',200000,2000,'NGN',false,true,true,10),
      ('LAB_FBC','LAB_TEST','Full blood count (FBC)','Routine full blood count','per test',500000,2000,'NGN',false,true,true,20),
      ('LAB_URINALYSIS','LAB_TEST','Urinalysis','Routine urine chemistry and microscopy where available','per test',250000,2000,'NGN',false,true,true,30),
      ('LAB_RANDOM_GLUCOSE','LAB_TEST','Random blood glucose','Random blood glucose measurement','per test',150000,2000,'NGN',false,true,true,40),
      ('LAB_FASTING_GLUCOSE','LAB_TEST','Fasting blood glucose','Fasting blood glucose measurement','per test',200000,2000,'NGN',false,true,true,50),
      ('LAB_HBA1C','LAB_TEST','HbA1c','Average blood glucose over the preceding months','per test',700000,2000,'NGN',false,true,true,60),
      ('LAB_LIPID_PROFILE','LAB_TEST','Lipid profile','Total cholesterol, HDL, LDL and triglycerides','per panel',800000,2000,'NGN',false,true,true,70),
      ('LAB_LFT','LAB_TEST','Liver function test','Routine liver function panel','per panel',700000,2000,'NGN',false,true,true,80),
      ('LAB_UEC','LAB_TEST','Urea, electrolytes & creatinine','Kidney function and electrolyte panel','per panel',700000,2000,'NGN',false,true,true,90),
      ('LAB_PREGNANCY_URINE','LAB_TEST','Pregnancy test (urine hCG)','Urine pregnancy screening','per test',200000,2000,'NGN',false,true,true,100),
      ('LAB_HBSAG','LAB_TEST','Hepatitis B surface antigen','Hepatitis B screening','per test',300000,2000,'NGN',false,true,true,110),
      ('LAB_HCV_AB','LAB_TEST','Hepatitis C antibody','Hepatitis C screening','per test',350000,2000,'NGN',false,true,true,120),
      ('LAB_HIV_SCREEN','LAB_TEST','HIV screening','HIV screening with appropriate consent and counselling pathway','per test',300000,2000,'NGN',false,true,true,130),
      ('LAB_BLOOD_GROUP','LAB_TEST','Blood group','ABO and Rhesus blood grouping','per test',250000,2000,'NGN',false,true,true,140),
      ('LAB_GENOTYPE','LAB_TEST','Haemoglobin genotype','Haemoglobin genotype screening','per test',300000,2000,'NGN',false,true,true,150),
      ('LAB_STOOL_MCS','LAB_TEST','Stool microscopy / culture as indicated','Stool laboratory assessment','per test',400000,2000,'NGN',false,true,true,160),
      ('LAB_URINE_MCS','LAB_TEST','Urine microscopy, culture & sensitivity','Urine microscopy and culture where indicated','per test',600000,2000,'NGN',false,true,true,170),
      ('LAB_TSH','LAB_TEST','TSH','Thyroid stimulating hormone','per test',700000,2000,'NGN',false,true,true,180),
      ('LAB_THYROID_PROFILE','LAB_TEST','Thyroid profile','TSH with thyroid hormones','per panel',1200000,2000,'NGN',false,true,true,190),
      ('LAB_PSA','LAB_TEST','PSA','Prostate-specific antigen','per test',800000,2000,'NGN',false,true,true,200),

      ('MED_PARACETAMOL_500','MEDICATION','Paracetamol 500 mg','Common pain and fever relief','pack/tablets as configured',150000,2000,'NGN',false,true,true,1010),
      ('MED_IBUPROFEN_400','MEDICATION','Ibuprofen 400 mg','Common anti-inflammatory pain relief; suitability should be checked','pack/tablets as configured',250000,2000,'NGN',false,true,true,1020),
      ('MED_CETIRIZINE_10','MEDICATION','Cetirizine 10 mg','Common antihistamine','pack/tablets as configured',180000,2000,'NGN',false,true,true,1030),
      ('MED_ORS','MEDICATION','Oral rehydration salts','Oral rehydration sachets','per pack',120000,2000,'NGN',false,true,true,1040),
      ('MED_ZINC_20','MEDICATION','Zinc 20 mg','Zinc tablets','pack/tablets as configured',180000,2000,'NGN',false,true,true,1050),
      ('MED_ANTACID','MEDICATION','Antacid','Common antacid preparation','pack/bottle as configured',220000,2000,'NGN',false,true,true,1060),
      ('MED_VITAMIN_C','MEDICATION','Vitamin C','Common vitamin C preparation','pack/tablets as configured',180000,2000,'NGN',false,true,true,1070),
      ('MED_LOPERAMIDE','MEDICATION','Loperamide','Anti-diarrhoeal medicine; suitability should be checked','pack/capsules as configured',220000,2000,'NGN',false,true,true,1080)
      ON CONFLICT ("code") DO NOTHING
    `);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('DROP INDEX "public"."IDX_smartclinic_service_catalogue_category_active"');
    await q.query('DROP TABLE "smartclinic_service_catalogue"');
  }
}
