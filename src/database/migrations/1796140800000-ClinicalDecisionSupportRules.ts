import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClinicalDecisionSupportRules1796140800000 implements MigrationInterface {
  name='ClinicalDecisionSupportRules1796140800000';
  async up(q:QueryRunner):Promise<void>{
    await q.query(`CREATE TABLE "clinical_decision_support_rules" (
      "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
      "code" varchar(80) NOT NULL,
      "diagnosis_name" varchar(200) NOT NULL,
      "synonyms" text[] NOT NULL DEFAULT '{}',
      "symptom_terms" text[] NOT NULL DEFAULT '{}',
      "red_flag_terms" text[] NOT NULL DEFAULT '{}',
      "suggested_lab_codes" text[] NOT NULL DEFAULT '{}',
      "suggested_imaging_codes" text[] NOT NULL DEFAULT '{}',
      "suggested_medication_codes" text[] NOT NULL DEFAULT '{}',
      "suggested_referrals" text[] NOT NULL DEFAULT '{}',
      "clinical_note" text,
      "is_active" boolean NOT NULL DEFAULT true,
      "sort_order" smallint NOT NULL DEFAULT 0,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_clinical_decision_support_rules" PRIMARY KEY ("id"),
      CONSTRAINT "UQ_clinical_decision_support_rules_code" UNIQUE ("code")
    )`);
    await q.query(`CREATE INDEX "IDX_clinical_decision_support_rules_active" ON "clinical_decision_support_rules" ("is_active","sort_order")`);
    await q.query(`
      INSERT INTO "clinical_decision_support_rules"
      ("code","diagnosis_name","synonyms","symptom_terms","red_flag_terms","suggested_lab_codes","suggested_imaging_codes","suggested_medication_codes","suggested_referrals","clinical_note","sort_order")
      VALUES
      ('MALARIA_SUSPECTED','Malaria / febrile illness',ARRAY['malaria','febrile illness'],ARRAY['fever','chills','rigor','headache','body ache','body pain'],ARRAY['confusion','convulsion','seizure','unable to drink','severe weakness'],ARRAY['LAB_MALARIA_RDT','LAB_FBC'],ARRAY[]::text[],ARRAY['MED_PARACETAMOL_500','MED_COARTEM_20_120'],ARRAY[]::text[],'Confirm malaria where feasible and review severity before treatment.',10),
      ('URTI','Upper respiratory tract infection',ARRAY['upper respiratory infection','common cold','viral uri'],ARRAY['cough','runny nose','catarrh','sore throat','nasal congestion','sneezing'],ARRAY['shortness of breath','chest pain','cyanosis','stridor'],ARRAY['LAB_FBC'],ARRAY['IMG_XRAY_CHEST'],ARRAY['MED_PARACETAMOL_500','MED_CETIRIZINE_10'],ARRAY[]::text[],'Antibiotics are not routine for uncomplicated viral upper respiratory infections.',20),
      ('UTI','Urinary tract infection',ARRAY['uti','urinary infection','cystitis'],ARRAY['dysuria','burning urination','frequency','urgency','suprapubic pain'],ARRAY['flank pain','persistent vomiting','pregnant','fever with rigors'],ARRAY['LAB_URINALYSIS','LAB_URINE_MCS'],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'Use culture and patient-specific factors to guide antimicrobial choice where indicated.',30),
      ('HYPERTENSION','Hypertension',ARRAY['high blood pressure','hypertension'],ARRAY['high bp','elevated blood pressure','hypertension'],ARRAY['severe headache','chest pain','neurologic deficit','shortness of breath'],ARRAY['LAB_UEC','LAB_RANDOM_GLUCOSE','LAB_HBA1C','LAB_LIPID_PROFILE','LAB_URINALYSIS'],ARRAY[]::text[],ARRAY['MED_AMLODIPINE_5','MED_LOSARTAN_50','MED_LISINOPRIL_10','MED_HCTZ_25'],ARRAY[]::text[],'Confirm diagnosis and assess cardiovascular risk, comorbidities and contraindications before choosing therapy.',40),
      ('DIABETES','Diabetes mellitus',ARRAY['diabetes','type 2 diabetes','dm'],ARRAY['polyuria','polydipsia','weight loss','high glucose','hyperglycaemia','hyperglycemia'],ARRAY['altered consciousness','vomiting','dehydration','ketones'],ARRAY['LAB_FASTING_GLUCOSE','LAB_HBA1C','LAB_UEC','LAB_LIPID_PROFILE','LAB_URINALYSIS'],ARRAY[]::text[],ARRAY['MED_METFORMIN_500','MED_GLIMEPIRIDE_2'],ARRAY[]::text[],'Confirm glycaemic status and assess renal function and individual treatment factors.',50),
      ('DYSPEPSIA','Dyspepsia / acid-related symptoms',ARRAY['dyspepsia','gastritis','acid reflux','gerd'],ARRAY['epigastric pain','heartburn','acid reflux','indigestion','bloating'],ARRAY['vomiting blood','melena','black stool','weight loss','difficulty swallowing'],ARRAY['LAB_FBC'],ARRAY[]::text[],ARRAY['MED_OMEPRAZOLE_20','MED_ANTACID'],ARRAY[]::text[],'Check for alarm features and medication history before empiric treatment.',60),
      ('ASTHMA','Asthma / wheeze',ARRAY['asthma','reactive airway disease'],ARRAY['wheeze','wheezing','shortness of breath','chest tightness','night cough'],ARRAY['silent chest','cyanosis','unable to speak','exhaustion'],ARRAY[]::text[],ARRAY['IMG_XRAY_CHEST'],ARRAY['MED_SALBUTAMOL_INHALER','MED_BECLOMETHASONE_INHALER'],ARRAY['Respiratory medicine'],'Assess severity and acute risk before treatment; controller therapy depends on the clinical context.',70),
      ('TINEA','Superficial fungal skin infection',ARRAY['tinea','ringworm','fungal skin infection','dermatophytosis'],ARRAY['itchy rash','ring rash','scaly rash','itching skin','fungal rash'],ARRAY['rapidly spreading rash','fever','facial swelling','mucosal involvement'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['MED_CLOTRIMAZOLE_CREAM','MED_MICONAZOLE_CREAM'],ARRAY['Dermatology'],'Confirm morphology/site and consider differential diagnoses before treatment.',80),
      ('DERMATITIS','Dermatitis / eczema',ARRAY['eczema','dermatitis','atopic dermatitis'],ARRAY['itchy skin','dry skin','eczema','rash','skin irritation'],ARRAY['fever','blistering','mucosal involvement','facial swelling'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['MED_HYDROCORTISONE_CREAM'],ARRAY['Dermatology'],'Review site, severity, infection features and triggers before selecting topical therapy.',90)
      ON CONFLICT ("code") DO NOTHING
    `);
  }
  async down(q:QueryRunner):Promise<void>{
    await q.query('DROP INDEX "public"."IDX_clinical_decision_support_rules_active"');
    await q.query('DROP TABLE "clinical_decision_support_rules"');
  }
}
