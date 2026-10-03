import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Before-visit questions (symptom_intakes), the doctor companion usage log, more clinical rules,
 * three lab tests the new rules use, and the shop launch prices (we fulfil orders ourselves for now).
 */
export class DoctorCompanionAndIntake1799251200000 implements MigrationInterface {
  name = 'DoctorCompanionAndIntake1799251200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "symptom_intakes" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(), "user_id" uuid NOT NULL, "patient_id" uuid, "care_request_id" uuid,
      "answers" jsonb NOT NULL, "urgency" varchar(10) NOT NULL, "red_flags" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "considerations" jsonb NOT NULL DEFAULT '[]'::jsonb, "summary" text NOT NULL, "content_version" smallint NOT NULL DEFAULT 1,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_symptom_intakes" PRIMARY KEY ("id"),
      CONSTRAINT "CHK_symptom_intakes_urgency" CHECK ("urgency" IN ('EMERGENCY','TODAY','SOON','ROUTINE')),
      CONSTRAINT "FK_symptom_intakes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
      CONSTRAINT "FK_symptom_intakes_patient" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL,
      CONSTRAINT "FK_symptom_intakes_care_request" FOREIGN KEY ("care_request_id") REFERENCES "care_requests"("id") ON DELETE SET NULL)`);
    await q.query(`CREATE INDEX "IDX_symptom_intakes_user_created" ON "symptom_intakes" ("user_id", "created_at")`);
    await q.query(`CREATE UNIQUE INDEX "UQ_symptom_intakes_care_request" ON "symptom_intakes" ("care_request_id") WHERE "care_request_id" IS NOT NULL`);

    // Counts only: what was said or dictated is never stored.
    await q.query(`CREATE TABLE "doctor_companion_usage" (
      "id" bigserial NOT NULL, "provider_id" uuid NOT NULL, "user_id" uuid NOT NULL, "kind" varchar(12) NOT NULL, "source" varchar(6) NOT NULL,
      "appointment_reference" varchar(40), "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_doctor_companion_usage" PRIMARY KEY ("id"))`);
    await q.query(`CREATE INDEX "IDX_doctor_companion_usage_provider" ON "doctor_companion_usage" ("provider_id", "created_at")`);

    // Shop bonus points are added by the system, not an admin.
    await q.query(`ALTER TABLE "wellness_point_adjustments" ALTER COLUMN "admin_user_id" DROP NOT NULL`);

    await q.query(`INSERT INTO "smartclinic_service_catalogue"
      ("code","category","name","description","unit_label","average_cost_minor","markup_bps","currency","requires_prescription","patient_visible","is_active","sort_order") VALUES
      ('LAB_BLOOD_CULTURE','LAB_TEST','Blood culture & sensitivity','Preferred test for typhoid and bloodstream infection','per test',800000,2000,'NGN',false,true,true,175),
      ('LAB_SPUTUM_GENEXPERT','LAB_TEST','Sputum GeneXpert (TB)','Molecular TB test with rifampicin resistance; free at many DOTS centres','per test',500000,2000,'NGN',false,true,true,176),
      ('LAB_HVS','LAB_TEST','High vaginal swab (HVS) m/c/s','Vaginal discharge microscopy and culture','per test',500000,2000,'NGN',false,true,true,177)
      ON CONFLICT ("code") DO UPDATE SET "is_active" = true`);

    await q.query(`INSERT INTO "clinical_decision_support_rules"
      ("code","diagnosis_name","synonyms","symptom_terms","red_flag_terms","suggested_lab_codes","suggested_imaging_codes","suggested_medication_codes","suggested_referrals","clinical_note","sort_order") VALUES
      ('TYPHOID','Enteric (typhoid) fever',ARRAY['typhoid','enteric fever'],ARRAY['fever','abdominal pain','constipation','prolonged fever','step-ladder fever','loss of appetite'],ARRAY['intestinal perforation','severe abdominal pain','confusion','gi bleeding'],ARRAY['LAB_BLOOD_CULTURE','LAB_FBC','LAB_STOOL_MCS'],ARRAY[]::text[],ARRAY['MED_CIPROFLOXACIN_500','MED_AZITHROMYCIN_500'],ARRAY[]::text[],'Blood culture is preferred; Widal is unreliable. Check local resistance before choosing an antibiotic.',100),
      ('PNEUMONIA','Pneumonia / lower respiratory infection',ARRAY['pneumonia','chest infection','lrti'],ARRAY['productive cough','fever','breathlessness','pleuritic chest pain','crackles','green sputum','yellow sputum'],ARRAY['spo2','cyanosis','confusion','respiratory rate','unable to drink'],ARRAY['LAB_FBC'],ARRAY['IMG_XRAY_CHEST'],ARRAY['MED_AMOXICILLIN_500','MED_AZITHROMYCIN_500','MED_AMOXCLAV_625'],ARRAY[]::text[],'Check respiratory rate and SpO2 (CRB-65); refer if hypoxic or severe.',110),
      ('TB','Tuberculosis (suspected)',ARRAY['tuberculosis','pulmonary tb','ptb'],ARRAY['chronic cough','cough for 2 weeks','night sweats','weight loss','haemoptysis','hemoptysis'],ARRAY['massive haemoptysis','breathlessness'],ARRAY['LAB_SPUTUM_GENEXPERT','LAB_HIV_SCREEN','LAB_FBC'],ARRAY['IMG_XRAY_CHEST'],ARRAY[]::text[],ARRAY['DOTS centre'],'Cough over 2 weeks: sputum GeneXpert and HIV test; TB treatment is free at DOTS centres.',120),
      ('PHARYNGITIS','Tonsillitis / pharyngitis',ARRAY['tonsillitis','pharyngitis','sore throat'],ARRAY['sore throat','painful swallowing','tonsillar exudate','enlarged tonsils'],ARRAY['drooling','unable to swallow','trismus','stridor'],ARRAY['LAB_FBC'],ARRAY[]::text[],ARRAY['MED_PARACETAMOL_500','MED_AMOXICILLIN_500'],ARRAY['ENT'],'Use Centor/McIsaac criteria before antibiotics; refer if quinsy suspected.',130),
      ('OTITIS','Otitis media / externa',ARRAY['otitis media','otitis externa','ear infection'],ARRAY['ear pain','earache','ear discharge','otorrhoea','reduced hearing'],ARRAY['mastoid swelling','facial weakness','severe headache'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['MED_PARACETAMOL_500','MED_AMOXICILLIN_500'],ARRAY['ENT'],'Examine the drum; many cases settle with analgesia alone.',140),
      ('GASTROENTERITIS','Acute gastroenteritis',ARRAY['gastroenteritis','stomach flu'],ARRAY['diarrhoea','diarrhea','vomiting','loose stool','watery stool'],ARRAY['severe dehydration','sunken eyes','lethargy','no urine','rice water stool'],ARRAY['LAB_UEC'],ARRAY[]::text[],ARRAY['MED_ORS','MED_ZINC_20','MED_PARACETAMOL_500'],ARRAY[]::text[],'Assess dehydration; ORS and zinc for children; antibiotics rarely needed.',150),
      ('DYSENTERY','Dysentery',ARRAY['dysentery','bloody diarrhoea','amoebiasis'],ARRAY['bloody stool','blood in stool','mucoid stool','tenesmus'],ARRAY['severe dehydration','high fever','toxic'],ARRAY['LAB_STOOL_MCS','LAB_FBC'],ARRAY[]::text[],ARRAY['MED_CIPROFLOXACIN_500','MED_METRONIDAZOLE_400','MED_ORS'],ARRAY[]::text[],'Consider shigella and amoebiasis; rehydrate.',160),
      ('PYELONEPHRITIS','Pyelonephritis',ARRAY['pyelonephritis','kidney infection'],ARRAY['loin pain','flank pain','fever with dysuria','renal angle tenderness'],ARRAY['vomiting','pregnant','hypotension','sepsis'],ARRAY['LAB_URINE_MCS','LAB_FBC','LAB_UEC'],ARRAY['IMG_USS_ABDOMEN'],ARRAY['MED_CIPROFLOXACIN_500'],ARRAY[]::text[],'Consider admission if vomiting, pregnant or septic.',170),
      ('STI','Sexually transmitted infection',ARRAY['sti','std','urethritis','vaginitis','genital ulcer'],ARRAY['urethral discharge','vaginal discharge','genital ulcer','genital sore','genital itching','dyspareunia'],ARRAY['pelvic pain with fever','pregnant'],ARRAY['LAB_HVS','LAB_HIV_SCREEN','LAB_HBSAG'],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],'Syndromic management per national guidelines; offer HIV, hepatitis B and syphilis tests; treat partners.',180),
      ('PID','Pelvic inflammatory disease',ARRAY['pid','pelvic inflammatory disease','salpingitis'],ARRAY['lower abdominal pain','pelvic pain','vaginal discharge','cervical motion tenderness'],ARRAY['missed period','positive pregnancy test','peritonism'],ARRAY['LAB_PREGNANCY_URINE','LAB_HVS','LAB_FBC'],ARRAY['IMG_USS_PELVIS'],ARRAY['MED_METRONIDAZOLE_400'],ARRAY['Gynaecology'],'Exclude ectopic pregnancy first.',190),
      ('SICKLE_CRISIS','Sickle cell pain crisis',ARRAY['sickle cell crisis','vaso-occlusive crisis','scd crisis'],ARRAY['sickle cell','hbss','bone pain','joint pain','vaso-occlusive'],ARRAY['chest pain','breathlessness','priapism','stroke','severe pallor','fever'],ARRAY['LAB_FBC','LAB_MALARIA_RDT'],ARRAY[]::text[],ARRAY['MED_PARACETAMOL_500','MED_FOLIC_ACID_5'],ARRAY['Haematology'],'Analgesia and fluids promptly; look for infection and acute chest syndrome.',200),
      ('ANAEMIA','Anaemia',ARRAY['anaemia','anemia'],ARRAY['pallor','fatigue','tiredness','dizziness','heavy periods','breathless on exertion'],ARRAY['chest pain','syncope','active bleeding','heart failure'],ARRAY['LAB_FBC','LAB_GENOTYPE'],ARRAY[]::text[],ARRAY['MED_FERROUS_SULPHATE','MED_FOLIC_ACID_5'],ARRAY[]::text[],'Find the cause: blood loss, malaria, worms, nutrition, haemoglobinopathy.',210),
      ('MIGRAINE','Migraine / tension-type headache',ARRAY['migraine','tension headache'],ARRAY['headache','throbbing headache','photophobia','nausea with headache','aura'],ARRAY['thunderclap','worst headache','neck stiffness','focal weakness','papilloedema'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['MED_PARACETAMOL_500','MED_IBUPROFEN_400'],ARRAY[]::text[],'Check BP and fundi; screen for secondary headache red flags.',220),
      ('MENINGITIS','Meningitis (suspected)',ARRAY['meningitis'],ARRAY['neck stiffness','stiff neck','fever with headache','photophobia','petechial rash'],ARRAY['confusion','seizure','purpuric rash','reduced consciousness'],ARRAY['LAB_FBC','LAB_BLOOD_CULTURE'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['Emergency department'],'Emergency: give the first antibiotic dose and refer without delay.',230),
      ('PRE_ECLAMPSIA','Pre-eclampsia',ARRAY['pre-eclampsia','preeclampsia','pih'],ARRAY['pregnant with headache','facial swelling','blurred vision','high bp in pregnancy','proteinuria'],ARRAY['convulsion','epigastric pain','bp 160','reduced fetal movement'],ARRAY['LAB_URINALYSIS','LAB_FBC','LAB_UEC','LAB_LFT'],ARRAY['IMG_USS_OBS'],ARRAY[]::text[],ARRAY['Obstetrics'],'Emergency obstetric review; magnesium sulphate per protocol if severe.',240),
      ('CELLULITIS','Cellulitis / skin infection',ARRAY['cellulitis','skin infection','abscess'],ARRAY['red swollen skin','warm tender skin','spreading redness','boil','abscess'],ARRAY['crepitus','rapid spread','sepsis','pain out of proportion'],ARRAY['LAB_FBC','LAB_RANDOM_GLUCOSE'],ARRAY[]::text[],ARRAY['MED_AMOXCLAV_625'],ARRAY[]::text[],'Mark the edge and review in 48 hours; drain abscesses; check for diabetes.',250),
      ('SCABIES','Scabies',ARRAY['scabies'],ARRAY['itch worse at night','family members itching','burrows','itchy rash between fingers'],ARRAY['crusted lesions','secondary infection'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['MED_CHLORPHENIRAMINE_4'],ARRAY[]::text[],'Treat the whole household at once (permethrin or benzyl benzoate); wash bedding.',260),
      ('CONJUNCTIVITIS','Conjunctivitis',ARRAY['conjunctivitis','apollo','pink eye'],ARRAY['red eye','sticky eye','eye discharge','itchy eyes','gritty eyes'],ARRAY['eye pain','reduced vision','photophobia','contact lens'],ARRAY[]::text[],ARRAY[]::text[],ARRAY[]::text[],ARRAY['Ophthalmology'],'Refer the same day if painful eye or reduced vision.',270),
      ('BACK_PAIN','Mechanical low back pain',ARRAY['low back pain','lumbago','back strain'],ARRAY['back pain','low back pain','lower back pain','back stiffness'],ARRAY['saddle anaesthesia','urinary retention','leg weakness','weight loss','night pain'],ARRAY[]::text[],ARRAY['IMG_XRAY_SPINE'],ARRAY['MED_IBUPROFEN_400','MED_DICLOFENAC_50','MED_PARACETAMOL_500'],ARRAY['Physiotherapy'],'Imaging only with red flags or no improvement after 6 weeks.',280),
      ('ARTHRITIS','Arthritis / gout',ARRAY['osteoarthritis','gout','arthritis'],ARRAY['joint pain','joint swelling','knee pain','big toe pain','morning stiffness'],ARRAY['hot swollen joint with fever','unable to bear weight'],ARRAY['LAB_FBC','LAB_UEC'],ARRAY['IMG_XRAY_LIMB'],ARRAY['MED_IBUPROFEN_400','MED_DICLOFENAC_50'],ARRAY[]::text[],'A single hot swollen joint with fever needs same-day assessment for septic arthritis.',290),
      ('DEPRESSION','Depression',ARRAY['depression','major depressive disorder'],ARRAY['low mood','hopeless','loss of interest','poor sleep','tearful'],ARRAY['suicidal','self-harm','psychosis'],ARRAY['LAB_TSH'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['Mental health'],'Use PHQ-9; always ask about self-harm.',300),
      ('ANXIETY','Anxiety',ARRAY['anxiety','generalised anxiety disorder','panic'],ARRAY['worry','palpitations','restless','panic attack','cannot relax'],ARRAY['chest pain','suicidal'],ARRAY['LAB_TSH'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['Mental health'],'Use GAD-7; exclude thyroid and cardiac causes; talking therapies first.',310),
      ('HEART_FAILURE','Heart failure',ARRAY['heart failure','ccf','congestive cardiac failure'],ARRAY['leg swelling','orthopnoea','orthopnea','breathless lying flat','pnd','raised jvp'],ARRAY['breathless at rest','chest pain','syncope'],ARRAY['LAB_UEC','LAB_FBC'],ARRAY['IMG_XRAY_CHEST'],ARRAY['MED_FUROSEMIDE_40'],ARRAY['Cardiology'],'ECG and echocardiography; review blood pressure control.',320),
      ('ACS','Acute coronary syndrome',ARRAY['acs','myocardial infarction','heart attack','angina'],ARRAY['central chest pain','crushing chest pain','chest tightness','pain radiating to arm','pain radiating to jaw'],ARRAY['sweating','breathlessness','syncope','hypotension'],ARRAY[]::text[],ARRAY[]::text[],ARRAY['MED_ASPIRIN_75'],ARRAY['Emergency department'],'Emergency: ECG now and urgent referral; aspirin if no contraindication.',330),
      ('APPENDICITIS','Appendicitis / acute abdomen',ARRAY['appendicitis','acute abdomen'],ARRAY['right lower quadrant pain','rif pain','periumbilical pain','rebound tenderness'],ARRAY['guarding','rigid abdomen','peritonitis'],ARRAY['LAB_FBC','LAB_PREGNANCY_URINE'],ARRAY['IMG_USS_ABDOMEN'],ARRAY[]::text[],ARRAY['General surgery'],'Surgical review today; pregnancy test in women.',340)
      ON CONFLICT ("code") DO NOTHING`);

    // Shop launch: we pack and deliver ourselves. Two products, priced to beat a trip to the market.
    await q.query(`UPDATE "shop_products" SET "price_minor" = 4000000, "supply_cost_minor" = 2500000, "includes_review" = true, "active" = true, "sort_order" = 1,
      "name" = 'Home Heart Kit (blood pressure monitor)',
      "description" = 'A clinically validated upper-arm blood pressure monitor, checked genuine and delivered free to your door. A SmartClinic clinician reviews your first week of readings for free.',
      "highlights" = '["Checked genuine and clinically validated","Free delivery to your door","Free setup call: we show you how to measure","Free clinician review of your first week","Readings go straight into your check-up plan","Bonus wellness points when it arrives"]'::jsonb
      WHERE "sku" = 'HEART-KIT'`);
    await q.query(`UPDATE "shop_products" SET "price_minor" = 2900000, "supply_cost_minor" = 2000000, "includes_review" = true, "active" = true, "sort_order" = 2,
      "name" = 'Blood sugar kit (glucometer)',
      "description" = 'A glucose meter with test strips and lancets, checked genuine and delivered free. A SmartClinic clinician reviews your first week of sugar readings for free.',
      "highlights" = '["Checked genuine, in-date strips","Meter, strips and lancets","Free delivery to your door","Free setup call: we show you how to test","Free clinician review of your first week","Bonus wellness points when it arrives"]'::jsonb
      WHERE "sku" = 'GLUCO-KIT'`);
    await q.query(`UPDATE "shop_products" SET "active" = false WHERE "sku" IN ('BP-BASIC','BP-SMART','STRIPS-50')`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`UPDATE "shop_products" SET "active" = false WHERE "sku" IN ('HEART-KIT','GLUCO-KIT')`);
    await q.query(`DELETE FROM "clinical_decision_support_rules" WHERE "code" IN ('TYPHOID','PNEUMONIA','TB','PHARYNGITIS','OTITIS','GASTROENTERITIS','DYSENTERY','PYELONEPHRITIS','STI','PID','SICKLE_CRISIS','ANAEMIA','MIGRAINE','MENINGITIS','PRE_ECLAMPSIA','CELLULITIS','SCABIES','CONJUNCTIVITIS','BACK_PAIN','ARTHRITIS','DEPRESSION','ANXIETY','HEART_FAILURE','ACS','APPENDICITIS')`);
    await q.query(`UPDATE "smartclinic_service_catalogue" SET "is_active" = false WHERE "code" IN ('LAB_BLOOD_CULTURE','LAB_SPUTUM_GENEXPERT','LAB_HVS')`);
    await q.query(`DROP TABLE "doctor_companion_usage"`);
    await q.query(`DROP TABLE "symptom_intakes"`);
  }
}
