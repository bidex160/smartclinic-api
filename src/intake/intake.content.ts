/**
 * Before-the-visit questions. Patients pick what's wrong; each problem asks a few plain questions.
 * Two outputs:
 *  - for the patient: only how urgently to get care (never a diagnosis);
 *  - for the doctor: a short summary and "conditions to consider", with the answers behind each.
 *
 * Content is conservative and built for primary care in Nigeria, Ghana and Rwanda. The clinical
 * team owns it: every question, weight and red flag is here in one file.
 * Patient wording lives in the web app's translations (keys intake.q.<id>, intake.o.<option>).
 * The `label` here is the doctor-facing English used in summaries.
 */

export type QuestionType = 'YES_NO' | 'ONE' | 'MANY';
export type Urgency = 'EMERGENCY' | 'TODAY' | 'SOON' | 'ROUTINE';

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  options?: { id: string; label: string }[];
  /** Only ask when another answer matches (e.g. pregnancy questions for women). */
  showIf?: Match;
}

export interface Complaint {
  id: string;
  emoji: string;
  label: string;
  /** Who may pick it (e.g. pregnancy: female only). */
  showIf?: Match;
  questions: Question[];
}

/** An answer test: question id, and the value(s) that count (YES for yes/no). */
export interface Match { q: string; is: string | string[] }

export interface Condition {
  code: string;
  name: string;
  /** Each feature adds its weight when it matches. */
  features: { when: Match; weight: number }[];
  /** Score needed to be listed. */
  min: number;
  labs: string[];
  imaging: string[];
  meds: string[];
  note: string;
}

export interface RedFlag {
  id: string;
  urgency: 'EMERGENCY' | 'TODAY';
  /** Any of these matches raises the flag; `and` must all match too. */
  any: Match[];
  and?: Match[];
  label: string;
}

const yes = (q: string): Match => ({ q, is: 'YES' });
const has = (id: string): Match => ({ q: 'complaints', is: id });
const DAYS = ['TODAY', 'D2_3', 'D4_7', 'W1_2', 'OVER_2W'];

export const COMMON: Question[] = [
  { id: 'who', type: 'ONE', label: 'Answering for', options: [{ id: 'ME', label: 'self' }, { id: 'CHILD', label: 'a child' }, { id: 'ADULT', label: 'another adult' }] },
  { id: 'sex', type: 'ONE', label: 'Sex', options: [{ id: 'FEMALE', label: 'Female' }, { id: 'MALE', label: 'Male' }] },
  { id: 'age', type: 'ONE', label: 'Age', options: [{ id: 'UNDER_5', label: 'under 5' }, { id: 'A5_17', label: '5–17' }, { id: 'A18_39', label: '18–39' }, { id: 'A40_59', label: '40–59' }, { id: 'A60_PLUS', label: '60+' }] },
  { id: 'days', type: 'ONE', label: 'Unwell for', options: [{ id: 'TODAY', label: 'since today' }, { id: 'D2_3', label: '2–3 days' }, { id: 'D4_7', label: '4–7 days' }, { id: 'W1_2', label: '1–2 weeks' }, { id: 'OVER_2W', label: 'over 2 weeks' }] },
  { id: 'kid.danger', type: 'YES_NO', label: 'Child very sleepy/hard to wake, not feeding, or had a fit', showIf: { q: 'age', is: ['UNDER_5', 'A5_17'] } },
];

const FEMALE: Match = { q: 'sex', is: 'FEMALE' };

export const COMPLAINTS: Complaint[] = [
  { id: 'FEVER', emoji: '🌡️', label: 'Fever / hot body', questions: [
    { id: 'fever.chills', type: 'YES_NO', label: 'Chills or shivering' },
    { id: 'fever.headache', type: 'YES_NO', label: 'Headache with the fever' },
    { id: 'fever.pattern', type: 'ONE', label: 'Fever pattern', options: [{ id: 'COMES_GOES', label: 'comes and goes' }, { id: 'ALL_TIME', label: 'there all the time, rising' }, { id: 'NOT_SURE', label: 'not sure' }] },
    { id: 'fever.belly', type: 'YES_NO', label: 'Belly pain, constipation or diarrhoea with the fever' },
    { id: 'fever.rash', type: 'YES_NO', label: 'Rash' },
    { id: 'fever.stiffNeck', type: 'YES_NO', label: 'Stiff neck (cannot bend head forward)' },
    { id: 'fever.confused', type: 'YES_NO', label: 'Confused, very sleepy, or had a fit' },
    { id: 'fever.bleeding', type: 'YES_NO', label: 'Bleeding from gums or nose, or blood in vomit, urine or stool' },
  ] },
  { id: 'COUGH', emoji: '😷', label: 'Cough', questions: [
    { id: 'cough.phlegm', type: 'ONE', label: 'Sputum', options: [{ id: 'NONE', label: 'dry' }, { id: 'CLEAR', label: 'clear/white' }, { id: 'COLOURED', label: 'yellow/green' }, { id: 'BLOOD', label: 'blood-stained' }] },
    { id: 'cough.breathless', type: 'YES_NO', label: 'Short of breath' },
    { id: 'cough.chestPain', type: 'YES_NO', label: 'Chest pain on deep breath or cough' },
    { id: 'cough.wheeze', type: 'YES_NO', label: 'Wheeze' },
    { id: 'cough.nightSweats', type: 'YES_NO', label: 'Night sweats' },
    { id: 'cough.weightLoss', type: 'YES_NO', label: 'Weight loss' },
  ] },
  { id: 'THROAT_EAR', emoji: '🤧', label: 'Cold, sore throat or ear pain', questions: [
    { id: 'et.runnyNose', type: 'YES_NO', label: 'Runny or blocked nose, sneezing' },
    { id: 'et.soreThroat', type: 'YES_NO', label: 'Sore throat' },
    { id: 'et.swallow', type: 'YES_NO', label: 'Cannot swallow saliva / drooling' },
    { id: 'et.earPain', type: 'YES_NO', label: 'Ear pain or discharge' },
  ] },
  { id: 'HEADACHE', emoji: '🤕', label: 'Headache', questions: [
    { id: 'headache.worst', type: 'YES_NO', label: 'Sudden, worst headache ever' },
    { id: 'headache.weakness', type: 'YES_NO', label: 'Weakness on one side, face drooping or trouble speaking' },
    { id: 'headache.oneSide', type: 'YES_NO', label: 'One-sided, throbbing' },
    { id: 'headache.light', type: 'YES_NO', label: 'Light/noise sensitivity or nausea' },
    { id: 'headache.vision', type: 'YES_NO', label: 'Blurred vision' },
  ] },
  { id: 'CHEST', emoji: '💔', label: 'Chest pain', questions: [
    { id: 'chest.pressing', type: 'YES_NO', label: 'Heavy, pressing or tight' },
    { id: 'chest.spreads', type: 'YES_NO', label: 'Spreads to arm, jaw or back' },
    { id: 'chest.sweating', type: 'YES_NO', label: 'With sweating, nausea or breathlessness' },
    { id: 'chest.breathing', type: 'YES_NO', label: 'Worse on breathing in or coughing' },
  ] },
  { id: 'BREATHING', emoji: '🫁', label: 'Short of breath', questions: [
    { id: 'breath.atRest', type: 'YES_NO', label: 'Breathless at rest / cannot finish a sentence' },
    { id: 'breath.wheeze', type: 'YES_NO', label: 'Wheeze' },
    { id: 'breath.asthma', type: 'YES_NO', label: 'Known asthma' },
    { id: 'breath.swelling', type: 'YES_NO', label: 'Swollen legs or worse lying flat' },
  ] },
  { id: 'BELLY', emoji: '🤢', label: 'Stomach pain', questions: [
    { id: 'belly.where', type: 'ONE', label: 'Where', options: [{ id: 'UPPER', label: 'upper belly' }, { id: 'LOWER', label: 'lower belly' }, { id: 'RIGHT_LOWER', label: 'lower right' }, { id: 'ALL_OVER', label: 'all over' }] },
    { id: 'belly.burning', type: 'YES_NO', label: 'Burning pain / heartburn' },
    { id: 'belly.meals', type: 'ONE', label: 'Relation to meals', options: [{ id: 'WORSE', label: 'worse after eating' }, { id: 'BETTER', label: 'better after eating' }, { id: 'NONE', label: 'no link' }] },
    { id: 'belly.severe', type: 'YES_NO', label: 'Severe, constant pain; belly hard; cannot move' },
    { id: 'belly.blackStool', type: 'YES_NO', label: 'Black or bloody stool' },
  ] },
  { id: 'DIARRHOEA', emoji: '🚽', label: 'Diarrhoea or vomiting', questions: [
    { id: 'dv.watery', type: 'YES_NO', label: 'Profuse watery (rice-water) stool' },
    { id: 'dv.blood', type: 'YES_NO', label: 'Blood in stool' },
    { id: 'dv.cantDrink', type: 'YES_NO', label: 'Vomits everything / cannot keep fluids down' },
    { id: 'dv.dry', type: 'YES_NO', label: 'Very thirsty, little urine, dizzy on standing, sunken eyes' },
  ] },
  { id: 'URINE', emoji: '💧', label: 'Problem passing urine', questions: [
    { id: 'urine.burning', type: 'YES_NO', label: 'Burning/pain passing urine' },
    { id: 'urine.frequent', type: 'YES_NO', label: 'Frequency / urgency' },
    { id: 'urine.blood', type: 'YES_NO', label: 'Blood in urine' },
    { id: 'urine.backPain', type: 'YES_NO', label: 'Loin/back pain with fever' },
  ] },
  { id: 'PRIVATE', emoji: '🩲', label: 'Private parts (discharge, sores, itch)', questions: [
    { id: 'gen.discharge', type: 'YES_NO', label: 'Abnormal discharge' },
    { id: 'gen.sores', type: 'YES_NO', label: 'Genital sores or ulcers' },
    { id: 'gen.itch', type: 'YES_NO', label: 'Genital itching' },
    { id: 'gen.pelvicPain', type: 'YES_NO', label: 'Lower belly pain with fever', showIf: FEMALE },
  ] },
  { id: 'PREGNANCY', emoji: '🤰', label: 'Pregnancy', showIf: FEMALE, questions: [
    { id: 'preg.weeks', type: 'ONE', label: 'Gestation', options: [{ id: 'T1', label: 'under 12 weeks' }, { id: 'T2', label: '12–27 weeks' }, { id: 'T3', label: '28+ weeks' }, { id: 'UNKNOWN', label: 'not sure' }] },
    { id: 'preg.bleeding', type: 'YES_NO', label: 'Vaginal bleeding' },
    { id: 'preg.headacheSwelling', type: 'YES_NO', label: 'Severe headache, blurred vision, or swollen face/hands' },
    { id: 'preg.waterBroke', type: 'YES_NO', label: 'Waters broken / fluid leaking' },
    { id: 'preg.babyMoves', type: 'ONE', label: 'Fetal movements', options: [{ id: 'NORMAL', label: 'normal' }, { id: 'LESS', label: 'less than usual' }, { id: 'NOT_YET', label: 'not felt yet' }] },
  ] },
  { id: 'PAIN', emoji: '🦴', label: 'Body, joint or back pain', questions: [
    { id: 'pain.where', type: 'MANY', label: 'Site', options: [{ id: 'JOINTS', label: 'joints' }, { id: 'BACK', label: 'back' }, { id: 'BONES', label: 'bones all over' }, { id: 'MUSCLES', label: 'muscles' }] },
    { id: 'pain.sickle', type: 'YES_NO', label: 'Known sickle cell disease (SS/SC)' },
    { id: 'pain.swollenJoint', type: 'YES_NO', label: 'Hot, swollen joint' },
    { id: 'pain.legWeakness', type: 'YES_NO', label: 'Leg weakness/numbness or trouble passing urine (with back pain)' },
  ] },
  { id: 'WEAKNESS', emoji: '😮‍💨', label: 'Tired, weak or dizzy', questions: [
    { id: 'weak.pale', type: 'YES_NO', label: 'Pale palms/eyes, breathless on walking' },
    { id: 'weak.heavyPeriods', type: 'YES_NO', label: 'Heavy periods', showIf: FEMALE },
    { id: 'weak.faint', type: 'YES_NO', label: 'Fainted' },
  ] },
  { id: 'SUGAR_SIGNS', emoji: '🥤', label: 'Very thirsty, passing urine a lot, or losing weight', questions: [
    { id: 'tw.thirst', type: 'YES_NO', label: 'Excessive thirst and urination' },
    { id: 'tw.weightLoss', type: 'YES_NO', label: 'Unplanned weight loss' },
    { id: 'tw.sores', type: 'YES_NO', label: 'Slow-healing sores or blurred vision' },
  ] },
  { id: 'BP_SUGAR', emoji: '🩺', label: 'Follow-up of high BP or diabetes', questions: [
    { id: 'bs.condition', type: 'MANY', label: 'Known condition', options: [{ id: 'HIGH_BP', label: 'hypertension' }, { id: 'DIABETES', label: 'diabetes' }] },
    { id: 'bs.meds', type: 'ONE', label: 'Medicines', options: [{ id: 'DAILY', label: 'taking daily' }, { id: 'SOMETIMES', label: 'sometimes' }, { id: 'STOPPED', label: 'stopped' }, { id: 'NONE', label: 'none prescribed' }] },
    { id: 'bs.veryHigh', type: 'YES_NO', label: 'Recent very high reading (BP ≥180/120 or very high sugar)' },
  ] },
  { id: 'SKIN', emoji: '🩹', label: 'Skin rash or itch', questions: [
    { id: 'skin.itchNight', type: 'YES_NO', label: 'Itch worse at night; others at home itching' },
    { id: 'skin.ring', type: 'YES_NO', label: 'Round patches with clearer centre' },
    { id: 'skin.dry', type: 'YES_NO', label: 'Dry, itchy patches that come and go' },
    { id: 'skin.spreading', type: 'YES_NO', label: 'Red, hot, painful and spreading' },
  ] },
  { id: 'EYE', emoji: '👁️', label: 'Eye problem', questions: [
    { id: 'eye.red', type: 'YES_NO', label: 'Red eye' },
    { id: 'eye.discharge', type: 'YES_NO', label: 'Sticky discharge' },
    { id: 'eye.pain', type: 'YES_NO', label: 'Painful eye or reduced vision' },
  ] },
  { id: 'MOOD', emoji: '💭', label: 'Low mood, worry or sleep', questions: [
    { id: 'mood.low', type: 'YES_NO', label: 'Low/hopeless most days for 2+ weeks' },
    { id: 'mood.worry', type: 'YES_NO', label: 'Constant worry, cannot relax' },
    { id: 'mood.sleep', type: 'YES_NO', label: 'Sleep problems' },
    { id: 'mood.selfHarm', type: 'YES_NO', label: 'Thoughts of self-harm' },
  ] },
];

const long = (from: number): Match => ({ q: 'days', is: DAYS.slice(from) });
const adult40 = { q: 'age', is: ['A40_59', 'A60_PLUS'] };

export const CONDITIONS: Condition[] = [
  { code: 'MALARIA', name: 'Malaria', min: 4, features: [{ when: has('FEVER'), weight: 3 }, { when: yes('fever.chills'), weight: 2 }, { when: yes('fever.headache'), weight: 1 }, { when: { q: 'fever.pattern', is: 'COMES_GOES' }, weight: 1 }, { when: { q: 'pain.where', is: ['BONES', 'MUSCLES'] }, weight: 1 }], labs: ['LAB_MALARIA_RDT', 'LAB_FBC'], imaging: [], meds: ['MED_COARTEM_20_120', 'MED_PARACETAMOL_500'], note: 'Confirm with RDT or microscopy before treating; look for danger signs of severe malaria.' },
  { code: 'TYPHOID', name: 'Enteric (typhoid) fever', min: 5, features: [{ when: has('FEVER'), weight: 2 }, { when: long(2), weight: 2 }, { when: yes('fever.belly'), weight: 2 }, { when: { q: 'fever.pattern', is: 'ALL_TIME' }, weight: 1 }, { when: yes('fever.headache'), weight: 1 }], labs: ['LAB_BLOOD_CULTURE', 'LAB_FBC', 'LAB_STOOL_MCS'], imaging: [], meds: ['MED_CIPROFLOXACIN_500', 'MED_AZITHROMYCIN_500'], note: 'Blood culture is preferred; Widal is unreliable. Check local resistance before choosing an antibiotic.' },
  { code: 'URTI', name: 'Common cold / viral URTI', min: 3, features: [{ when: yes('et.runnyNose'), weight: 2 }, { when: yes('et.soreThroat'), weight: 1 }, { when: has('COUGH'), weight: 1 }, { when: { q: 'days', is: ['TODAY', 'D2_3', 'D4_7'] }, weight: 1 }], labs: [], imaging: [], meds: ['MED_PARACETAMOL_500', 'MED_LORATADINE_10'], note: 'Usually viral and self-limiting; antibiotics not needed.' },
  { code: 'PHARYNGITIS', name: 'Tonsillitis / pharyngitis', min: 3, features: [{ when: yes('et.soreThroat'), weight: 2 }, { when: has('FEVER'), weight: 1 }, { when: { q: 'cough.phlegm', is: 'NONE' }, weight: 1 }, { when: yes('et.swallow'), weight: 2 }], labs: ['LAB_FBC'], imaging: [], meds: ['MED_PARACETAMOL_500', 'MED_AMOXICILLIN_500'], note: 'Consider Centor criteria before antibiotics; check for peritonsillar abscess if unable to swallow.' },
  { code: 'OTITIS', name: 'Otitis media / externa', min: 3, features: [{ when: yes('et.earPain'), weight: 3 }, { when: has('FEVER'), weight: 1 }, { when: { q: 'age', is: 'UNDER_5' }, weight: 1 }], labs: [], imaging: [], meds: ['MED_PARACETAMOL_500', 'MED_AMOXICILLIN_500'], note: 'Examine the drum; many cases settle with analgesia.' },
  { code: 'PNEUMONIA', name: 'Pneumonia / lower respiratory infection', min: 5, features: [{ when: has('COUGH'), weight: 2 }, { when: has('FEVER'), weight: 2 }, { when: yes('cough.breathless'), weight: 2 }, { when: yes('cough.chestPain'), weight: 2 }, { when: { q: 'cough.phlegm', is: 'COLOURED' }, weight: 1 }], labs: ['LAB_FBC'], imaging: ['IMG_XRAY_CHEST'], meds: ['MED_AMOXICILLIN_500', 'MED_AZITHROMYCIN_500', 'MED_AMOXCLAV_625'], note: 'Check respiratory rate and SpO2; refer if hypoxic or severe.' },
  { code: 'TB', name: 'Tuberculosis (suspected)', min: 5, features: [{ when: has('COUGH'), weight: 1 }, { when: long(4), weight: 3 }, { when: yes('cough.nightSweats'), weight: 2 }, { when: yes('cough.weightLoss'), weight: 2 }, { when: yes('tw.weightLoss'), weight: 1 }, { when: { q: 'cough.phlegm', is: 'BLOOD' }, weight: 2 }], labs: ['LAB_SPUTUM_GENEXPERT', 'LAB_HIV_SCREEN', 'LAB_FBC'], imaging: ['IMG_XRAY_CHEST'], meds: [], note: 'Cough over 2 weeks: test sputum (GeneXpert) and offer HIV testing; TB treatment is free at DOTS centres.' },
  { code: 'ASTHMA', name: 'Asthma / reactive airway', min: 3, features: [{ when: yes('cough.wheeze'), weight: 3 }, { when: yes('breath.wheeze'), weight: 3 }, { when: yes('breath.asthma'), weight: 2 }, { when: has('BREATHING'), weight: 1 }], labs: [], imaging: [], meds: ['MED_SALBUTAMOL_INHALER', 'MED_BECLOMETHASONE_INHALER'], note: 'Assess severity (speech, SpO2, peak flow); check inhaler technique.' },
  { code: 'HEART_FAILURE', name: 'Heart failure', min: 4, features: [{ when: yes('breath.swelling'), weight: 3 }, { when: has('BREATHING'), weight: 1 }, { when: { q: 'age', is: 'A60_PLUS' }, weight: 1 }, { when: { q: 'bs.condition', is: 'HIGH_BP' }, weight: 1 }], labs: ['LAB_UEC', 'LAB_FBC'], imaging: ['IMG_XRAY_CHEST'], meds: ['MED_FUROSEMIDE_40'], note: 'Echocardiography and ECG; review blood pressure control.' },
  { code: 'ACS', name: 'Acute coronary syndrome', min: 4, features: [{ when: yes('chest.pressing'), weight: 3 }, { when: yes('chest.spreads'), weight: 3 }, { when: yes('chest.sweating'), weight: 3 }, { when: adult40, weight: 1 }], labs: [], imaging: [], meds: ['MED_ASPIRIN_75'], note: 'Emergency: ECG now and urgent referral. Aspirin only if no contraindication.' },
  { code: 'UTI', name: 'Urinary tract infection', min: 4, features: [{ when: yes('urine.burning'), weight: 3 }, { when: yes('urine.frequent'), weight: 2 }, { when: { q: 'belly.where', is: 'LOWER' }, weight: 1 }, { when: FEMALE, weight: 1 }], labs: ['LAB_URINALYSIS', 'LAB_URINE_MCS'], imaging: [], meds: ['MED_CIPROFLOXACIN_500'], note: 'Check pregnancy status before prescribing; culture if recurrent.' },
  { code: 'PYELONEPHRITIS', name: 'Pyelonephritis', min: 4, features: [{ when: yes('urine.backPain'), weight: 3 }, { when: has('FEVER'), weight: 2 }, { when: yes('urine.burning'), weight: 1 }], labs: ['LAB_URINE_MCS', 'LAB_FBC', 'LAB_UEC'], imaging: ['IMG_USS_ABDOMEN'], meds: ['MED_CIPROFLOXACIN_500'], note: 'Consider admission if vomiting, pregnant or septic.' },
  { code: 'STI', name: 'Sexually transmitted infection', min: 3, features: [{ when: yes('gen.discharge'), weight: 3 }, { when: yes('gen.sores'), weight: 3 }, { when: yes('gen.itch'), weight: 1 }], labs: ['LAB_HVS', 'LAB_HIV_SCREEN', 'LAB_HBSAG'], imaging: [], meds: [], note: 'Syndromic management per national guidelines; offer HIV, hepatitis B and syphilis testing; treat partners.' },
  { code: 'PID', name: 'Pelvic inflammatory disease', min: 4, features: [{ when: yes('gen.pelvicPain'), weight: 3 }, { when: yes('gen.discharge'), weight: 1 }, { when: has('FEVER'), weight: 1 }], labs: ['LAB_PREGNANCY_URINE', 'LAB_HVS', 'LAB_FBC'], imaging: ['IMG_USS_PELVIS'], meds: [], note: 'Exclude ectopic pregnancy first.' },
  { code: 'GASTROENTERITIS', name: 'Acute gastroenteritis', min: 3, features: [{ when: has('DIARRHOEA'), weight: 3 }, { when: { q: 'days', is: ['TODAY', 'D2_3'] }, weight: 1 }, { when: has('FEVER'), weight: 1 }], labs: [], imaging: [], meds: ['MED_ORS', 'MED_ZINC_20', 'MED_PARACETAMOL_500'], note: 'Assess dehydration; ORS and zinc for children.' },
  { code: 'CHOLERA', name: 'Cholera (suspected)', min: 4, features: [{ when: yes('dv.watery'), weight: 3 }, { when: yes('dv.dry'), weight: 2 }, { when: yes('dv.cantDrink'), weight: 1 }], labs: ['LAB_STOOL_MCS', 'LAB_UEC'], imaging: [], meds: ['MED_ORS'], note: 'Aggressive rehydration; notify public health.' },
  { code: 'DYSENTERY', name: 'Dysentery', min: 3, features: [{ when: yes('dv.blood'), weight: 3 }, { when: has('FEVER'), weight: 1 }], labs: ['LAB_STOOL_MCS', 'LAB_FBC'], imaging: [], meds: ['MED_CIPROFLOXACIN_500', 'MED_METRONIDAZOLE_400', 'MED_ORS'], note: 'Consider amoebiasis; rehydrate.' },
  { code: 'DYSPEPSIA', name: 'Dyspepsia / peptic ulcer disease', min: 4, features: [{ when: { q: 'belly.where', is: 'UPPER' }, weight: 2 }, { when: yes('belly.burning'), weight: 2 }, { when: { q: 'belly.meals', is: ['WORSE', 'BETTER'] }, weight: 1 }], labs: ['LAB_FBC'], imaging: [], meds: ['MED_OMEPRAZOLE_20', 'MED_ANTACID'], note: 'Ask about NSAID use; refer for endoscopy if alarm features (age >55, weight loss, bleeding, anaemia).' },
  { code: 'APPENDICITIS', name: 'Appendicitis / acute abdomen', min: 4, features: [{ when: { q: 'belly.where', is: 'RIGHT_LOWER' }, weight: 3 }, { when: yes('belly.severe'), weight: 2 }, { when: has('FEVER'), weight: 1 }], labs: ['LAB_FBC', 'LAB_PREGNANCY_URINE'], imaging: ['IMG_USS_ABDOMEN'], meds: [], note: 'Surgical review today.' },
  { code: 'HYPERTENSION', name: 'Hypertension (review)', min: 3, features: [{ when: { q: 'bs.condition', is: 'HIGH_BP' }, weight: 3 }, { when: yes('bs.veryHigh'), weight: 2 }, { when: has('HEADACHE'), weight: 1 }, { when: adult40, weight: 1 }, { when: { q: 'bs.meds', is: ['SOMETIMES', 'STOPPED'] }, weight: 1 }], labs: ['LAB_UEC', 'LAB_LIPID_PROFILE', 'LAB_URINALYSIS'], imaging: [], meds: ['MED_AMLODIPINE_5', 'MED_LOSARTAN_50'], note: 'Repeat BP; check adherence and target organ damage.' },
  { code: 'DIABETES', name: 'Diabetes (new or review)', min: 3, features: [{ when: yes('tw.thirst'), weight: 3 }, { when: { q: 'bs.condition', is: 'DIABETES' }, weight: 3 }, { when: yes('tw.weightLoss'), weight: 1 }, { when: yes('tw.sores'), weight: 1 }], labs: ['LAB_RANDOM_GLUCOSE', 'LAB_HBA1C', 'LAB_UEC', 'LAB_URINALYSIS'], imaging: [], meds: ['MED_METFORMIN_500'], note: 'Check ketones if very high glucose or unwell.' },
  { code: 'SICKLE_CRISIS', name: 'Sickle cell pain crisis', min: 4, features: [{ when: yes('pain.sickle'), weight: 4 }, { when: { q: 'pain.where', is: 'BONES' }, weight: 1 }, { when: has('FEVER'), weight: 1 }], labs: ['LAB_FBC', 'LAB_MALARIA_RDT'], imaging: [], meds: ['MED_PARACETAMOL_500', 'MED_FOLIC_ACID_5'], note: 'Analgesia, fluids, look for infection and acute chest syndrome.' },
  { code: 'ANAEMIA', name: 'Anaemia', min: 3, features: [{ when: yes('weak.pale'), weight: 3 }, { when: has('WEAKNESS'), weight: 1 }, { when: yes('weak.heavyPeriods'), weight: 1 }], labs: ['LAB_FBC', 'LAB_GENOTYPE'], imaging: [], meds: ['MED_FERROUS_SULPHATE', 'MED_FOLIC_ACID_5'], note: 'Find the cause (blood loss, malaria, worms, nutrition).' },
  { code: 'MIGRAINE', name: 'Migraine / tension headache', min: 4, features: [{ when: has('HEADACHE'), weight: 2 }, { when: yes('headache.oneSide'), weight: 2 }, { when: yes('headache.light'), weight: 2 }], labs: [], imaging: [], meds: ['MED_PARACETAMOL_500', 'MED_IBUPROFEN_400'], note: 'Check BP and vision; screen for red flags.' },
  { code: 'MENINGITIS', name: 'Meningitis (suspected)', min: 4, features: [{ when: yes('fever.stiffNeck'), weight: 4 }, { when: has('FEVER'), weight: 1 }, { when: yes('fever.confused'), weight: 2 }, { when: has('HEADACHE'), weight: 1 }], labs: ['LAB_FBC', 'LAB_BLOOD_CULTURE'], imaging: [], meds: [], note: 'Emergency: do not delay antibiotics or referral.' },
  { code: 'VHF', name: 'Viral haemorrhagic fever (Lassa, dengue, yellow fever)', min: 4, features: [{ when: yes('fever.bleeding'), weight: 4 }, { when: has('FEVER'), weight: 1 }], labs: [], imaging: [], meds: [], note: 'Isolate, use PPE and notify public health (NCDC) immediately.' },
  { code: 'PRE_ECLAMPSIA', name: 'Pre-eclampsia', min: 4, features: [{ when: yes('preg.headacheSwelling'), weight: 4 }, { when: { q: 'preg.weeks', is: ['T2', 'T3'] }, weight: 1 }], labs: ['LAB_URINALYSIS', 'LAB_FBC', 'LAB_UEC', 'LAB_LFT'], imaging: [], meds: [], note: 'Emergency obstetric review; check BP and proteinuria.' },
  { code: 'PREGNANCY_BLEEDING', name: 'Bleeding in pregnancy', min: 4, features: [{ when: yes('preg.bleeding'), weight: 4 }], labs: ['LAB_FBC', 'LAB_BLOOD_GROUP'], imaging: ['IMG_USS_OBS'], meds: [], note: 'Emergency obstetric review (miscarriage, ectopic, placenta praevia/abruption).' },
  { code: 'SCABIES', name: 'Scabies', min: 3, features: [{ when: yes('skin.itchNight'), weight: 3 }, { when: has('SKIN'), weight: 1 }], labs: [], imaging: [], meds: ['MED_CHLORPHENIRAMINE_4'], note: 'Treat the whole household at the same time (permethrin/benzyl benzoate); wash bedding.' },
  { code: 'TINEA', name: 'Fungal skin infection (tinea)', min: 3, features: [{ when: yes('skin.ring'), weight: 3 }], labs: [], imaging: [], meds: ['MED_CLOTRIMAZOLE_CREAM', 'MED_MICONAZOLE_CREAM'], note: 'Topical antifungal 2–4 weeks; oral if scalp or extensive.' },
  { code: 'ECZEMA', name: 'Eczema / dermatitis', min: 3, features: [{ when: yes('skin.dry'), weight: 3 }, { when: has('SKIN'), weight: 1 }], labs: [], imaging: [], meds: ['MED_HYDROCORTISONE_CREAM', 'MED_CETIRIZINE_10'], note: 'Emollients; avoid triggers.' },
  { code: 'CELLULITIS', name: 'Cellulitis / skin infection', min: 3, features: [{ when: yes('skin.spreading'), weight: 3 }, { when: has('FEVER'), weight: 1 }], labs: ['LAB_FBC', 'LAB_RANDOM_GLUCOSE'], imaging: [], meds: ['MED_AMOXCLAV_625'], note: 'Mark the edge; review in 48 hours; check for diabetes.' },
  { code: 'CONJUNCTIVITIS', name: 'Conjunctivitis', min: 3, features: [{ when: yes('eye.red'), weight: 2 }, { when: yes('eye.discharge'), weight: 2 }], labs: [], imaging: [], meds: [], note: 'Refer the same day if painful eye or reduced vision.' },
  { code: 'BACK_PAIN', name: 'Mechanical back pain', min: 3, features: [{ when: { q: 'pain.where', is: 'BACK' }, weight: 3 }], labs: [], imaging: ['IMG_XRAY_SPINE'], meds: ['MED_IBUPROFEN_400', 'MED_DICLOFENAC_50'], note: 'Imaging only if red flags or no better after 6 weeks.' },
  { code: 'ARTHRITIS', name: 'Arthritis / gout', min: 3, features: [{ when: yes('pain.swollenJoint'), weight: 3 }, { when: { q: 'pain.where', is: 'JOINTS' }, weight: 1 }], labs: ['LAB_FBC'], imaging: ['IMG_XRAY_LIMB'], meds: ['MED_IBUPROFEN_400'], note: 'A single hot swollen joint with fever needs same-day assessment (septic arthritis).' },
  { code: 'DEPRESSION', name: 'Depression', min: 3, features: [{ when: yes('mood.low'), weight: 3 }, { when: yes('mood.sleep'), weight: 1 }], labs: ['LAB_TSH'], imaging: [], meds: [], note: 'Use PHQ-9; ask about self-harm; refer to mental health services as needed.' },
  { code: 'ANXIETY', name: 'Anxiety', min: 3, features: [{ when: yes('mood.worry'), weight: 3 }, { when: yes('mood.sleep'), weight: 1 }], labs: ['LAB_TSH'], imaging: [], meds: [], note: 'Use GAD-7; talking therapies first.' },
];

export const RED_FLAGS: RedFlag[] = [
  { id: 'CHEST_CARDIAC', urgency: 'EMERGENCY', any: [yes('chest.pressing'), yes('chest.spreads'), yes('chest.sweating')], label: 'Possible cardiac chest pain' },
  { id: 'BREATHLESS_REST', urgency: 'EMERGENCY', any: [yes('breath.atRest')], label: 'Breathless at rest' },
  { id: 'STROKE', urgency: 'EMERGENCY', any: [yes('headache.weakness')], label: 'Stroke signs' },
  { id: 'THUNDERCLAP', urgency: 'EMERGENCY', any: [yes('headache.worst')], label: 'Sudden worst headache' },
  { id: 'MENINGISM', urgency: 'EMERGENCY', any: [yes('fever.stiffNeck')], label: 'Fever with stiff neck' },
  { id: 'ALTERED', urgency: 'EMERGENCY', any: [yes('fever.confused'), yes('kid.danger')], label: 'Confusion, drowsiness or fits' },
  { id: 'BLEEDING_FEVER', urgency: 'EMERGENCY', any: [yes('fever.bleeding')], label: 'Fever with bleeding' },
  { id: 'PREG_BLEEDING', urgency: 'EMERGENCY', any: [yes('preg.bleeding')], label: 'Bleeding in pregnancy' },
  { id: 'PRE_ECLAMPSIA', urgency: 'EMERGENCY', any: [yes('preg.headacheSwelling')], label: 'Pre-eclampsia symptoms' },
  { id: 'CAUDA_EQUINA', urgency: 'EMERGENCY', any: [yes('pain.legWeakness')], label: 'Back pain with leg weakness or urinary problems' },
  { id: 'SELF_HARM', urgency: 'EMERGENCY', any: [yes('mood.selfHarm')], label: 'Thoughts of self-harm' },
  { id: 'CHILD_DEHYDRATION', urgency: 'EMERGENCY', any: [yes('dv.cantDrink'), yes('dv.dry')], and: [{ q: 'age', is: 'UNDER_5' }], label: 'Young child, possibly dehydrated' },
  { id: 'DEHYDRATION', urgency: 'TODAY', any: [yes('dv.cantDrink'), yes('dv.dry'), yes('dv.watery')], label: 'Possible dehydration' },
  { id: 'WATERS', urgency: 'TODAY', any: [yes('preg.waterBroke'), { q: 'preg.babyMoves', is: 'LESS' }], label: 'Waters broken or reduced fetal movement' },
  { id: 'HAEMOPTYSIS', urgency: 'TODAY', any: [{ q: 'cough.phlegm', is: 'BLOOD' }], label: 'Coughing blood' },
  { id: 'GI_BLEED', urgency: 'TODAY', any: [yes('belly.blackStool'), yes('dv.blood')], label: 'Blood in or black stool' },
  { id: 'ACUTE_ABDOMEN', urgency: 'TODAY', any: [yes('belly.severe')], label: 'Severe abdominal pain' },
  { id: 'SICKLE_CRISIS', urgency: 'TODAY', any: [yes('pain.sickle')], label: 'Sickle cell disease with pain' },
  { id: 'EYE', urgency: 'TODAY', any: [yes('eye.pain')], label: 'Painful eye or reduced vision' },
  { id: 'AIRWAY', urgency: 'TODAY', any: [yes('et.swallow')], label: 'Cannot swallow' },
  { id: 'KIDNEY', urgency: 'TODAY', any: [yes('urine.backPain')], label: 'Loin pain with fever' },
  { id: 'VERY_HIGH_READING', urgency: 'TODAY', any: [yes('bs.veryHigh')], label: 'Very high BP or sugar' },
  { id: 'CHILD_FEVER', urgency: 'TODAY', any: [has('FEVER')], and: [{ q: 'age', is: 'UNDER_5' }], label: 'Fever in a child under 5' },
  { id: 'HOT_JOINT', urgency: 'TODAY', any: [yes('pain.swollenJoint')], and: [has('FEVER')], label: 'Hot swollen joint with fever' },
];

/** Every question id → its definition, for validation and summaries. */
export function allQuestions(): Map<string, Question> {
  const map = new Map<string, Question>();
  for (const q of COMMON) map.set(q.id, q);
  for (const c of COMPLAINTS) for (const q of c.questions) map.set(q.id, q);
  return map;
}
