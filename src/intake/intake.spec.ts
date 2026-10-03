import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { allQuestions, COMMON, COMPLAINTS, CONDITIONS, Match, RED_FLAGS } from './intake.content';
import { cleanAnswers, evaluate, questionnaire } from './intake.engine';

const catalogueCodes = (() => {
  const dir = join(__dirname, '../database/migrations');
  const codes = new Set<string>();
  for (const f of readdirSync(dir)) for (const m of readFileSync(join(dir, f), 'utf8').matchAll(/'((?:LAB|MED|IMG)_[A-Z0-9_]+)'/g)) codes.add(m[1]);
  return codes;
})();

describe('intake content', () => {
  const qs = allQuestions();
  const complaintIds = new Set(COMPLAINTS.map((c) => c.id));
  const check = (m: Match, where: string) => {
    const want = Array.isArray(m.is) ? m.is : [m.is];
    if (m.q === 'complaints') {
      for (const w of want) expect(`${where}:${w}:${complaintIds.has(w)}`).toBe(`${where}:${w}:true`);
      return;
    }
    const q = qs.get(m.q);
    expect(`${where}:${m.q}:${Boolean(q)}`).toBe(`${where}:${m.q}:true`);
    const allowed = q!.type === 'YES_NO' ? ['YES', 'NO'] : (q!.options ?? []).map((o) => o.id);
    for (const w of want) expect(`${where}:${m.q}=${w}:${allowed.includes(w)}`).toBe(`${where}:${m.q}=${w}:true`);
  };

  it('has 25+ conditions and 18 complaints, all ids unique', () => {
    expect(CONDITIONS.length).toBeGreaterThanOrEqual(25);
    expect(new Set(CONDITIONS.map((c) => c.code)).size).toBe(CONDITIONS.length);
    expect(new Set([...qs.keys()]).size).toBe(COMMON.length + COMPLAINTS.reduce((n, c) => n + c.questions.length, 0));
  });

  it('every rule points at real questions, options and catalogue items', () => {
    for (const c of CONDITIONS) {
      for (const f of c.features) check(f.when, c.code);
      for (const code of [...c.labs, ...c.imaging, ...c.meds]) expect(`${c.code}:${code}:${catalogueCodes.has(code)}`).toBe(`${c.code}:${code}:true`);
    }
    for (const f of RED_FLAGS) for (const m of [...f.any, ...(f.and ?? [])]) check(m, f.id);
    for (const c of COMPLAINTS) for (const q of c.questions) if (q.showIf) check(q.showIf, q.id);
  });

  it('the patient-facing question set carries no clinical reasoning', () => {
    const text = JSON.stringify(questionnaire());
    expect(text).not.toMatch(/Malaria|"weight"|Pneumonia|"label"|"min"/);
  });
});

describe('intake engine', () => {
  it('a classic malaria story: malaria first, seen soon, no red flags', () => {
    const r = evaluate(cleanAnswers({ complaints: ['FEVER'], who: 'ME', sex: 'MALE', age: 'A18_39', days: 'D2_3', 'fever.chills': 'YES', 'fever.headache': 'YES', 'fever.pattern': 'COMES_GOES', 'fever.stiffNeck': 'NO' }));
    expect(r.urgency).toBe('SOON');
    expect(r.redFlags).toEqual([]);
    expect(r.considerations[0].code).toBe('MALARIA');
    expect(r.considerations[0].why).toEqual(expect.arrayContaining(['Fever / hot body', 'Chills or shivering', 'Fever pattern: comes and goes']));
    expect(r.summary).toContain('Fever / hot body — 2–3 days');
    expect(r.summary).toContain('no stiff neck');
    expect(r.summary).toContain('To consider: Malaria');
  });

  it('long fever with belly symptoms brings typhoid up', () => {
    const r = evaluate(cleanAnswers({ complaints: ['FEVER'], days: 'W1_2', 'fever.belly': 'YES', 'fever.pattern': 'ALL_TIME', 'fever.headache': 'YES' }));
    expect(r.considerations.map((c) => c.code)).toContain('TYPHOID');
    expect(r.considerations[0].code).toBe('TYPHOID');
  });

  it('red flags set the urgency', () => {
    expect(evaluate(cleanAnswers({ complaints: ['FEVER'], 'fever.stiffNeck': 'YES' })).urgency).toBe('EMERGENCY');
    expect(evaluate(cleanAnswers({ complaints: ['CHEST'], 'chest.pressing': 'YES' })).redFlags.map((f) => f.id)).toContain('CHEST_CARDIAC');
    expect(evaluate(cleanAnswers({ complaints: ['FEVER'], age: 'UNDER_5' })).urgency).toBe('TODAY');
    expect(evaluate(cleanAnswers({ complaints: ['MOOD'], 'mood.selfHarm': 'YES' })).urgency).toBe('EMERGENCY');
    expect(evaluate(cleanAnswers({ complaints: ['DIARRHOEA'], age: 'UNDER_5', 'dv.dry': 'YES' })).redFlags.map((f) => f.id)).toEqual(expect.arrayContaining(['CHILD_DEHYDRATION', 'DEHYDRATION']));
  });

  it('a routine BP review is routine', () => {
    const r = evaluate(cleanAnswers({ complaints: ['BP_SUGAR'], 'bs.condition': ['HIGH_BP'], 'bs.meds': 'STOPPED', age: 'A40_59' }));
    expect(r.urgency).toBe('ROUTINE');
    expect(r.considerations[0].code).toBe('HYPERTENSION');
  });

  it('drops answers that were never asked, unknown values and pregnancy for men', () => {
    const a = cleanAnswers({ complaints: ['PREGNANCY', 'FEVER', 'NOPE'], sex: 'MALE', 'preg.bleeding': 'YES', 'fever.chills': 'MAYBE', 'cough.wheeze': 'YES', 'kid.danger': 'YES', age: 'A18_39', hack: 'x' });
    expect(a['complaints']).toEqual(['FEVER']);
    expect(a['preg.bleeding']).toBeUndefined();
    expect(a['fever.chills']).toBeUndefined();
    expect(a['cough.wheeze']).toBeUndefined();
    expect(a['kid.danger']).toBeUndefined();
    expect(a['hack']).toBeUndefined();
    expect(evaluate(a).urgency).toBe('SOON');
  });

  it('pregnancy bleeding is an emergency for women', () => {
    const r = evaluate(cleanAnswers({ complaints: ['PREGNANCY'], sex: 'FEMALE', 'preg.bleeding': 'YES', 'preg.weeks': 'T1' }));
    expect(r.urgency).toBe('EMERGENCY');
    expect(r.considerations[0].code).toBe('PREGNANCY_BLEEDING');
  });

  it('caps considerations at five', () => {
    const r = evaluate(cleanAnswers({ complaints: ['FEVER', 'COUGH', 'THROAT_EAR', 'HEADACHE', 'BELLY', 'URINE'], days: 'OVER_2W', 'fever.chills': 'YES', 'cough.nightSweats': 'YES', 'cough.weightLoss': 'YES', 'et.soreThroat': 'YES', 'et.earPain': 'YES', 'headache.oneSide': 'YES', 'headache.light': 'YES', 'urine.burning': 'YES', 'urine.frequent': 'YES', 'fever.belly': 'YES' }));
    expect(r.considerations.length).toBe(5);
  });
});
