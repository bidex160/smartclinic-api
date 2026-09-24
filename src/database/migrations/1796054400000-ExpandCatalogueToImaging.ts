import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandCatalogueToImaging1796054400000 implements MigrationInterface {
  name='ExpandCatalogueToImaging1796054400000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" DROP CONSTRAINT "CHK_smartclinic_service_catalogue_category"`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" ADD CONSTRAINT "CHK_smartclinic_service_catalogue_category" CHECK ("category" IN ('LAB_TEST','MEDICATION','IMAGING_STUDY'))`);
    await q.query(`
      INSERT INTO "smartclinic_service_catalogue"
      ("code","category","name","description","group_name","subcategory","unit_label","average_cost_minor","markup_bps","currency","requires_prescription","patient_visible","is_active","sort_order")
      VALUES
      ('IMG_XRAY_CHEST','IMAGING_STUDY','Chest X-ray','Plain chest radiograph','X-ray','Plain radiography','per study',700000,2000,'NGN',false,true,true,2010),
      ('IMG_XRAY_LIMB','IMAGING_STUDY','Limb / joint X-ray','Plain radiograph of a limb or joint','X-ray','Plain radiography','per study',700000,2000,'NGN',false,true,true,2020),
      ('IMG_XRAY_SPINE','IMAGING_STUDY','Spine X-ray','Plain radiograph of a spine region','X-ray','Plain radiography','per study',900000,2000,'NGN',false,true,true,2030),
      ('IMG_USS_ABDOMEN','IMAGING_STUDY','Abdominal ultrasound','Ultrasound examination of the abdomen','Ultrasound','General ultrasound','per study',1200000,2000,'NGN',false,true,true,2040),
      ('IMG_USS_ABD_PELVIS','IMAGING_STUDY','Abdominopelvic ultrasound','Ultrasound examination of abdomen and pelvis','Ultrasound','General ultrasound','per study',1500000,2000,'NGN',false,true,true,2050),
      ('IMG_USS_PELVIS','IMAGING_STUDY','Pelvic ultrasound','Ultrasound examination of the pelvis','Ultrasound','General ultrasound','per study',1200000,2000,'NGN',false,true,true,2060),
      ('IMG_USS_OBS','IMAGING_STUDY','Obstetric ultrasound','Pregnancy ultrasound study','Ultrasound','Obstetric','per study',1500000,2000,'NGN',false,true,true,2070),
      ('IMG_USS_BREAST','IMAGING_STUDY','Breast ultrasound','Ultrasound examination of the breast','Ultrasound','Breast imaging','per study',1500000,2000,'NGN',false,true,true,2080),
      ('IMG_USS_THYROID','IMAGING_STUDY','Thyroid ultrasound','Ultrasound examination of the thyroid','Ultrasound','Small parts','per study',1400000,2000,'NGN',false,true,true,2090),
      ('IMG_CT_HEAD','IMAGING_STUDY','CT head','Computed tomography of the head','CT','CT','per study',4500000,2000,'NGN',false,true,true,2100),
      ('IMG_CT_CHEST','IMAGING_STUDY','CT chest','Computed tomography of the chest','CT','CT','per study',5500000,2000,'NGN',false,true,true,2110),
      ('IMG_CT_ABD_PELVIS','IMAGING_STUDY','CT abdomen & pelvis','Computed tomography of abdomen and pelvis','CT','CT','per study',6500000,2000,'NGN',false,true,true,2120),
      ('IMG_MRI_BRAIN','IMAGING_STUDY','MRI brain','Magnetic resonance imaging of the brain','MRI','MRI','per study',9000000,2000,'NGN',false,true,true,2130),
      ('IMG_MRI_SPINE','IMAGING_STUDY','MRI spine','Magnetic resonance imaging of a spine region','MRI','MRI','per study',10000000,2000,'NGN',false,true,true,2140),
      ('IMG_MAMMOGRAM','IMAGING_STUDY','Mammography','Breast mammography study','Breast imaging','Mammography','per study',3000000,2000,'NGN',false,true,true,2150)
      ON CONFLICT ("code") DO NOTHING
    `);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query(`DELETE FROM "smartclinic_service_catalogue" WHERE "category"='IMAGING_STUDY'`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" DROP CONSTRAINT "CHK_smartclinic_service_catalogue_category"`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" ADD CONSTRAINT "CHK_smartclinic_service_catalogue_category" CHECK ("category" IN ('LAB_TEST','MEDICATION'))`);
  }
}
