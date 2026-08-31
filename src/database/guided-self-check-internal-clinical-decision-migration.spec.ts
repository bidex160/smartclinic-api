import { GuidedSelfCheckInternalClinicalDecision1792857600000 } from './migrations/1792857600000-GuidedSelfCheckInternalClinicalDecision';

describe('Guided Self-Check internal clinical decision migration', () => {
  it('adds internal professionals, exact assignment, guidance and semantic AI actions without Provider linkage', async () => {
    const sql: string[] = [];
    await new GuidedSelfCheckInternalClinicalDecision1792857600000().up({ query: jest.fn(async (statement: string) => sql.push(statement)) } as never);
    const all = sql.join('\n');
    expect(all).toContain('guided_self_check_internal_clinical_professionals');
    expect(all).toContain('URGENT_SELF_CHECK_REVIEW');
    expect(all).toContain('assigned_internal_clinical_professional_id');
    expect(all).toContain('patient_guidance');
    expect(all).toContain('internal_clinical_note');
    expect(all).toContain("ADD VALUE IF NOT EXISTS 'FIND_CARE'");
    expect(all).toContain("ADD VALUE IF NOT EXISTS 'AI_ANALYSIS'");
    expect(all).not.toContain('provider_id" uuid NOT NULL');
  });
});
