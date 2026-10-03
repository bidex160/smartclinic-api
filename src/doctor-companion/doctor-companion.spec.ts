import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';

import { ageYears, DoctorCompanionService, sameCondition } from './doctor-companion.service';

const item = (code: string, category: string, name: string, cost = 100000) => ({ code, category, name, averageCostMinor: String(cost), markupBps: 2000, currency: 'NGN', requiresPrescription: category === 'MEDICATION', isActive: true });
const CATALOGUE = [
  item('LAB_MALARIA_RDT', 'LAB_TEST', 'Malaria RDT'),
  item('LAB_FBC', 'LAB_TEST', 'Full blood count'),
  item('IMG_XRAY_CHEST', 'IMAGING_STUDY', 'Chest X-ray'),
  item('MED_COARTEM_20_120', 'MEDICATION', 'Artemether-lumefantrine'),
  item('MED_PARACETAMOL_500', 'MEDICATION', 'Paracetamol 500mg', 1000),
];

function build(env: Record<string, string>, aiOutput?: unknown) {
  const queries: unknown[][] = [];
  const dataSource = {
    query: jest.fn(async (sql: string, params: unknown[]) => { queries.push([sql, params]); return []; }),
    getRepository: () => ({ find: jest.fn(async ({ where }: any) => CATALOGUE.filter((c) => !where.code || where.code._value.includes(c.code))) }),
  };
  const current = { resolveOperationalActor: jest.fn(async () => ({ provider: { id: 'prov-1' }, isOwner: true })) };
  const appointments = { getProvider: jest.fn(async () => ({ careRequestReference: 'SC-CARE-ABCDEF123456' })) };
  const cds = { suggest: jest.fn(async () => ({ redFlags: ['confusion'], diagnoses: [{ diagnosisName: 'Malaria / febrile illness', reason: 'Matched: fever, chills', clinicalNote: 'Confirm first', labs: [{ code: 'LAB_MALARIA_RDT' }], imaging: [], medications: [{ code: 'MED_COARTEM_20_120' }] }] })) };
  const intake = { byRequestReference: jest.fn(async () => null) };
  const svc = new DoctorCompanionService(dataSource as any, current as any, appointments as any, cds as any, intake as any, { get: (k: string) => env[k] } as any);
  const responses = { create: jest.fn(async () => ({ output_text: JSON.stringify(aiOutput) })) };
  const audio = { transcriptions: { create: jest.fn(async () => ({ text: 'Patient has fever for three days with chills.' })) } };
  svc.useClient({ responses, audio } as any);
  return { svc, responses, audio, queries, cds };
}

const user = { id: 'user-1' } as any;

describe('doctor companion', () => {
  it('treats differently worded names of one condition as the same', () => {
    expect(sameCondition('Malaria')).toBe(sameCondition('Malaria / febrile illness'));
    expect(sameCondition('Enteric (typhoid) fever')).toBe(sameCondition('Enteric (typhoid) fever'));
    expect(sameCondition('Eczema / dermatitis')).toBe(sameCondition('Dermatitis / eczema'));
    expect(sameCondition('Diabetes (new or review)')).toBe(sameCondition('Diabetes mellitus'));
    expect(sameCondition('Malaria')).not.toBe(sameCondition('Meningitis (suspected)'));
  });

  it('works out age from date of birth', () => {
    expect(ageYears('1990-06-15', new Date('2026-06-14T00:00:00Z'))).toBe(35);
    expect(ageYears('1990-06-15', new Date('2026-06-15T00:00:00Z'))).toBe(36);
    expect(ageYears(null)).toBeNull();
  });

  it('without AI: rules give differentials and catalogue orders with prices; no note', async () => {
    const { svc, responses } = build({});
    const r = await svc.assist(user, { transcript: 'fever and chills for 3 days' });
    expect(r.source).toBe('RULES');
    expect(r.differentials).toHaveLength(1);
    expect(r.note).toBeNull();
    expect(r.differentials[0]).toMatchObject({ name: 'Malaria / febrile illness', likelihood: 'HIGH' });
    expect(r.labs.map((x) => x.code)).toEqual(['LAB_MALARIA_RDT']);
    expect(r.medications[0]).toMatchObject({ code: 'MED_COARTEM_20_120', standardPriceMinor: 120000, why: 'For Malaria / febrile illness' });
    expect(r.redFlags).toEqual(['confusion']);
    expect(responses.create).not.toHaveBeenCalled();
  });

  it('with AI: keeps only catalogue codes in the right category, and stores nothing said', async () => {
    const { svc, responses, queries } = build({ DOCTOR_COMPANION_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' }, {
      note: { presentingComplaint: 'Fever 3 days', historyOfPresentingComplaint: 'With chills', observations: '', assessment: 'Likely malaria', diagnosis: 'Malaria (unconfirmed)', plan: 'RDT', followUpInstructions: 'Return if worse' },
      differentials: [{ name: 'Malaria', likelihood: 'HIGH', why: 'Fever with chills' }, { name: 'Typhoid', likelihood: 'WRONG', why: 'x' }],
      redFlags: [], questionsToAsk: ['Any vomiting?'],
      investigations: [{ code: 'LAB_MALARIA_RDT', why: 'Confirm' }, { code: 'LAB_INVENTED', why: 'no' }, { code: 'MED_COARTEM_20_120', why: 'wrong list' }],
      medications: [{ code: 'MED_COARTEM_20_120', why: 'If RDT positive' }, { code: 'MED_COARTEM_20_120', why: 'dup' }],
      patientAdvice: 'Drink fluids.',
    });
    const r = await svc.assist(user, { transcript: 'fever and chills for 3 days' });
    expect(r.source).toBe('AI');
    expect(r.note?.presentingComplaint).toBe('Fever 3 days');
    expect(r.labs.map((x) => x.code)).toEqual(['LAB_MALARIA_RDT']);
    expect(r.medications.map((x) => x.code)).toEqual(['MED_COARTEM_20_120']);
    expect(r.differentials[1].likelihood).toBe('LOW');
    const call = (responses.create.mock.calls[0] as any)[0];
    expect(call.store).toBe(false);
    expect(call.text.format.strict).toBe(true);
    const log = queries.find(([sql]) => String(sql).includes('doctor_companion_usage'))!;
    expect(JSON.stringify(log)).not.toContain('fever');
  });

  it('falls back to rules when the AI fails', async () => {
    const { svc, responses } = build({ DOCTOR_COMPANION_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    responses.create.mockRejectedValueOnce(new Error('boom'));
    const r = await svc.assist(user, { transcript: 'fever' });
    expect(r.source).toBe('RULES');
  });

  it('needs something to work with', async () => {
    const { svc } = build({});
    await expect(svc.assist(user, { transcript: ' ' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('transcribes only when switched on, and only audio', async () => {
    const off = build({});
    await expect(off.svc.transcribe(user, { buffer: Buffer.from([1]), mimetype: 'audio/webm', size: 1 })).rejects.toBeInstanceOf(ServiceUnavailableException);
    const on = build({ DOCTOR_COMPANION_AI_PROVIDER: 'openai', OPENAI_API_KEY: 'k' });
    await expect(on.svc.transcribe(user, { buffer: Buffer.from([1]), mimetype: 'text/plain', size: 1 })).rejects.toBeInstanceOf(BadRequestException);
    const r = await on.svc.transcribe(user, { buffer: Buffer.from([1, 2]), mimetype: 'audio/webm;codecs=opus', size: 2 }, 'en');
    expect(r.text).toContain('fever');
    expect((on.audio.transcriptions.create.mock.calls[0] as any)[0]).toMatchObject({ model: 'gpt-4o-mini-transcribe', language: 'en' });
  });
});
