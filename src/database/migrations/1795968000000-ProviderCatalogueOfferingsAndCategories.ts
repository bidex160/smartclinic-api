import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProviderCatalogueOfferingsAndCategories1795968000000 implements MigrationInterface {
  name='ProviderCatalogueOfferingsAndCategories1795968000000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" ADD "group_name" varchar(80)`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" ADD "subcategory" varchar(100)`);
    await q.query(`ALTER TABLE "clinical_prescription_items" ADD "catalogue_code" varchar(80)`);
    await q.query(`CREATE INDEX "IDX_clinical_prescription_items_catalogue_code" ON "clinical_prescription_items" ("catalogue_code")`);
    await q.query(`CREATE TABLE "provider_catalogue_offerings" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "provider_id" uuid NOT NULL,
      "provider_service_unit_id" uuid NOT NULL,
      "catalogue_item_id" uuid NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "price_override_minor" bigint,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_provider_catalogue_offerings" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_provider_catalogue_offerings_unit_item" UNIQUE ("provider_service_unit_id","catalogue_item_id"),
      CONSTRAINT "CHK_provider_catalogue_offerings_price" CHECK ("price_override_minor" IS NULL OR "price_override_minor" >= 0),
      CONSTRAINT "FK_provider_catalogue_offerings_provider" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_catalogue_offerings_unit" FOREIGN KEY ("provider_service_unit_id") REFERENCES "provider_service_units"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_provider_catalogue_offerings_item" FOREIGN KEY ("catalogue_item_id") REFERENCES "smartclinic_service_catalogue"("id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "IDX_provider_catalogue_offerings_item_active" ON "provider_catalogue_offerings" ("catalogue_item_id","is_active")`);
    await q.query(`CREATE INDEX "IDX_provider_catalogue_offerings_provider_active" ON "provider_catalogue_offerings" ("provider_id","is_active")`);

    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Blood & general screening', "subcategory"='General' WHERE "code" IN ('LAB_FBC','LAB_MALARIA_RDT','LAB_BLOOD_GROUP','LAB_GENOTYPE')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Diabetes & metabolic', "subcategory"='Glucose' WHERE "code" IN ('LAB_RANDOM_GLUCOSE','LAB_FASTING_GLUCOSE','LAB_HBA1C','LAB_LIPID_PROFILE')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Kidney, liver & urine', "subcategory"='Organ function' WHERE "code" IN ('LAB_URINALYSIS','LAB_UEC','LAB_LFT','LAB_URINE_MCS')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Infectious disease', "subcategory"='Screening' WHERE "code" IN ('LAB_HBSAG','LAB_HCV_AB','LAB_HIV_SCREEN','LAB_STOOL_MCS')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Hormones & special tests', "subcategory"='Hormones' WHERE "code" IN ('LAB_TSH','LAB_THYROID_PROFILE','LAB_PSA','LAB_PREGNANCY_URINE')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Pain, fever & allergy', "subcategory"='Common OTC' WHERE "code" IN ('MED_PARACETAMOL_500','MED_IBUPROFEN_400','MED_CETIRIZINE_10','MED_LORATADINE_10','MED_CHLORPHENIRAMINE_4')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Digestive & hydration', "subcategory"='GI' WHERE "code" IN ('MED_ORS','MED_ZINC_20','MED_ANTACID','MED_LOPERAMIDE','MED_OMEPRAZOLE_20','MED_DOMPERIDONE_10','MED_ONDANSETRON_4')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Antibiotics & anti-infectives', "subcategory"='Prescription' WHERE "code" LIKE 'MED_AMOX%' OR "code" IN ('MED_AZITHROMYCIN_500','MED_METRONIDAZOLE_400','MED_CIPROFLOXACIN_500','MED_COARTEM_20_120')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Heart, blood pressure & cholesterol', "subcategory"='Cardiometabolic' WHERE "code" IN ('MED_AMLODIPINE_5','MED_AMLODIPINE_10','MED_LOSARTAN_50','MED_LISINOPRIL_10','MED_HCTZ_25','MED_FUROSEMIDE_40','MED_ATORVASTATIN_20','MED_ASPIRIN_75')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Diabetes', "subcategory"='Prescription' WHERE "code" IN ('MED_METFORMIN_500','MED_GLIMEPIRIDE_2')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Respiratory', "subcategory"='Inhalers' WHERE "code" IN ('MED_SALBUTAMOL_INHALER','MED_BECLOMETHASONE_INHALER')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Skin & dermatology', "subcategory"='Topical' WHERE "code" IN ('MED_CLOTRIMAZOLE_CREAM','MED_HYDROCORTISONE_CREAM','MED_MICONAZOLE_CREAM','MED_POVIDONE_IODINE')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "group_name"='Vitamins & supplements', "subcategory"='Supplements' WHERE "code" IN ('MED_VITAMIN_C','MED_FERROUS_SULPHATE','MED_FOLIC_ACID_5','MED_MULTIVITAMIN')`);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query(`DROP INDEX "public"."IDX_provider_catalogue_offerings_provider_active"`);
    await q.query(`DROP INDEX "public"."IDX_provider_catalogue_offerings_item_active"`);
    await q.query(`DROP TABLE "provider_catalogue_offerings"`);
    await q.query(`DROP INDEX "public"."IDX_clinical_prescription_items_catalogue_code"`);
    await q.query(`ALTER TABLE "clinical_prescription_items" DROP COLUMN "catalogue_code"`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" DROP COLUMN "subcategory"`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" DROP COLUMN "group_name"`);
  }
}
