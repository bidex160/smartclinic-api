import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandSmartClinicMedicationCatalogue1795881600000 implements MigrationInterface {
  name='ExpandSmartClinicMedicationCatalogue1795881600000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" DROP CONSTRAINT "CHK_smartclinic_service_catalogue_markup"`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" ADD CONSTRAINT "CHK_smartclinic_service_catalogue_markup" CHECK ("markup_bps" BETWEEN 0 AND 50000)`);
    await q.query(`
      INSERT INTO "smartclinic_service_catalogue"
      ("code","category","name","description","unit_label","average_cost_minor","markup_bps","currency","requires_prescription","patient_visible","is_active","sort_order")
      VALUES
      ('MED_DICLOFENAC_50','MEDICATION','Diclofenac 50 mg','NSAID pain medicine; use requires suitability review','pack/tablets as configured',250000,2000,'NGN',true,true,true,1090),
      ('MED_OMEPRAZOLE_20','MEDICATION','Omeprazole 20 mg','Acid suppression medicine','pack/capsules as configured',250000,2000,'NGN',true,true,true,1100),
      ('MED_AMOXICILLIN_500','MEDICATION','Amoxicillin 500 mg','Antibiotic; prescription required','course/pack as configured',350000,2000,'NGN',true,true,true,1110),
      ('MED_AMOXCLAV_625','MEDICATION','Amoxicillin/clavulanate 625 mg','Antibiotic; prescription required','course/pack as configured',900000,2000,'NGN',true,true,true,1120),
      ('MED_AZITHROMYCIN_500','MEDICATION','Azithromycin 500 mg','Antibiotic; prescription required','course/pack as configured',650000,2000,'NGN',true,true,true,1130),
      ('MED_METRONIDAZOLE_400','MEDICATION','Metronidazole 400 mg','Antimicrobial medicine; prescription required','course/pack as configured',250000,2000,'NGN',true,true,true,1140),
      ('MED_CIPROFLOXACIN_500','MEDICATION','Ciprofloxacin 500 mg','Antibiotic; prescription required','course/pack as configured',450000,2000,'NGN',true,true,true,1150),
      ('MED_COARTEM_20_120','MEDICATION','Artemether/lumefantrine 20/120 mg','Antimalarial; use should follow confirmed diagnosis and clinical guidance','course/pack as configured',450000,2000,'NGN',true,true,true,1160),
      ('MED_AMLODIPINE_5','MEDICATION','Amlodipine 5 mg','Blood pressure medicine; prescription required','pack/tablets as configured',250000,2000,'NGN',true,true,true,1170),
      ('MED_AMLODIPINE_10','MEDICATION','Amlodipine 10 mg','Blood pressure medicine; prescription required','pack/tablets as configured',300000,2000,'NGN',true,true,true,1180),
      ('MED_LOSARTAN_50','MEDICATION','Losartan 50 mg','Blood pressure medicine; prescription required','pack/tablets as configured',400000,2000,'NGN',true,true,true,1190),
      ('MED_LISINOPRIL_10','MEDICATION','Lisinopril 10 mg','Blood pressure medicine; prescription required','pack/tablets as configured',300000,2000,'NGN',true,true,true,1200),
      ('MED_HCTZ_25','MEDICATION','Hydrochlorothiazide 25 mg','Diuretic/blood pressure medicine; prescription required','pack/tablets as configured',200000,2000,'NGN',true,true,true,1210),
      ('MED_METFORMIN_500','MEDICATION','Metformin 500 mg','Diabetes medicine; prescription required','pack/tablets as configured',300000,2000,'NGN',true,true,true,1220),
      ('MED_GLIMEPIRIDE_2','MEDICATION','Glimepiride 2 mg','Diabetes medicine; prescription required','pack/tablets as configured',300000,2000,'NGN',true,true,true,1230),
      ('MED_SALBUTAMOL_INHALER','MEDICATION','Salbutamol inhaler','Reliever inhaler; clinical suitability should be confirmed','per inhaler',450000,2000,'NGN',true,true,true,1240),
      ('MED_BECLOMETHASONE_INHALER','MEDICATION','Beclometasone inhaler','Controller inhaler; prescription required','per inhaler',800000,2000,'NGN',true,true,true,1250),
      ('MED_LORATADINE_10','MEDICATION','Loratadine 10 mg','Common antihistamine','pack/tablets as configured',200000,2000,'NGN',false,true,true,1260),
      ('MED_CHLORPHENIRAMINE_4','MEDICATION','Chlorpheniramine 4 mg','Sedating antihistamine; suitability should be checked','pack/tablets as configured',150000,2000,'NGN',false,true,true,1270),
      ('MED_FERROUS_SULPHATE','MEDICATION','Ferrous sulphate','Iron supplement','pack/tablets as configured',250000,2000,'NGN',false,true,true,1280),
      ('MED_FOLIC_ACID_5','MEDICATION','Folic acid 5 mg','Folate supplement','pack/tablets as configured',150000,2000,'NGN',false,true,true,1290),
      ('MED_MULTIVITAMIN','MEDICATION','Multivitamin','Common multivitamin preparation','pack as configured',300000,2000,'NGN',false,true,true,1300),
      ('MED_CLOTRIMAZOLE_CREAM','MEDICATION','Clotrimazole cream','Topical antifungal','per tube',300000,2000,'NGN',false,true,true,1310),
      ('MED_HYDROCORTISONE_CREAM','MEDICATION','Hydrocortisone 1% cream','Mild topical corticosteroid; suitability should be checked','per tube',300000,2000,'NGN',false,true,true,1320),
      ('MED_MICONAZOLE_CREAM','MEDICATION','Miconazole cream','Topical antifungal','per tube',350000,2000,'NGN',false,true,true,1330),
      ('MED_POVIDONE_IODINE','MEDICATION','Povidone iodine','Topical antiseptic','per bottle',350000,2000,'NGN',false,true,true,1340),
      ('MED_ORAL_PARACETAMOL_SYRUP','MEDICATION','Paracetamol syrup','Pain and fever relief; dose depends on age/weight','per bottle',200000,2000,'NGN',false,true,true,1350),
      ('MED_ORAL_IBUPROFEN_SYRUP','MEDICATION','Ibuprofen syrup','Pain/fever relief; suitability and dose should be checked','per bottle',300000,2000,'NGN',false,true,true,1360),
      ('MED_DOMPERIDONE_10','MEDICATION','Domperidone 10 mg','Prescription medicine for selected nausea/motility indications','pack/tablets as configured',300000,2000,'NGN',true,true,true,1370),
      ('MED_ONDANSETRON_4','MEDICATION','Ondansetron 4 mg','Antiemetic; prescription required','pack/tablets as configured',500000,2000,'NGN',true,true,true,1380),
      ('MED_FUROSEMIDE_40','MEDICATION','Furosemide 40 mg','Diuretic; prescription required','pack/tablets as configured',250000,2000,'NGN',true,true,true,1390),
      ('MED_ATORVASTATIN_20','MEDICATION','Atorvastatin 20 mg','Cholesterol-lowering medicine; prescription required','pack/tablets as configured',500000,2000,'NGN',true,true,true,1400),
      ('MED_ASPIRIN_75','MEDICATION','Aspirin 75 mg','Antiplatelet medicine; prescription/clinical indication required','pack/tablets as configured',200000,2000,'NGN',true,true,true,1410)
      ON CONFLICT ("code") DO NOTHING
    `);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query(`DELETE FROM "smartclinic_service_catalogue" WHERE "code" IN (
      'MED_DICLOFENAC_50','MED_OMEPRAZOLE_20','MED_AMOXICILLIN_500','MED_AMOXCLAV_625','MED_AZITHROMYCIN_500','MED_METRONIDAZOLE_400','MED_CIPROFLOXACIN_500','MED_COARTEM_20_120','MED_AMLODIPINE_5','MED_AMLODIPINE_10','MED_LOSARTAN_50','MED_LISINOPRIL_10','MED_HCTZ_25','MED_METFORMIN_500','MED_GLIMEPIRIDE_2','MED_SALBUTAMOL_INHALER','MED_BECLOMETHASONE_INHALER','MED_LORATADINE_10','MED_CHLORPHENIRAMINE_4','MED_FERROUS_SULPHATE','MED_FOLIC_ACID_5','MED_MULTIVITAMIN','MED_CLOTRIMAZOLE_CREAM','MED_HYDROCORTISONE_CREAM','MED_MICONAZOLE_CREAM','MED_POVIDONE_IODINE','MED_ORAL_PARACETAMOL_SYRUP','MED_ORAL_IBUPROFEN_SYRUP','MED_DOMPERIDONE_10','MED_ONDANSETRON_4','MED_FUROSEMIDE_40','MED_ATORVASTATIN_20','MED_ASPIRIN_75')`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" DROP CONSTRAINT "CHK_smartclinic_service_catalogue_markup"`);
    await q.query(`ALTER TABLE "smartclinic_service_catalogue" ADD CONSTRAINT "CHK_smartclinic_service_catalogue_markup" CHECK ("markup_bps" BETWEEN 0 AND 10000)`);
  }
}
