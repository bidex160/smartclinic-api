import { GuidedSelfCheckInternalProfessionalWorklist1792944000000 } from './migrations/1792944000000-GuidedSelfCheckInternalProfessionalWorklist';

describe('Guided Self-Check internal professional worklist migration', () => {
  it('adds and reverts the assignment/status/priority/time worklist index', async () => {
    const up: string[] = [];
    const down: string[] = [];
    const migration = new GuidedSelfCheckInternalProfessionalWorklist1792944000000();
    await migration.up({ query: jest.fn(async (sql: string) => up.push(sql)) } as never);
    await migration.down({ query: jest.fn(async (sql: string) => down.push(sql)) } as never);
    expect(up.join('\n')).toContain('IDX_gsc_review_internal_worklist');
    expect(up.join('\n')).toContain('assigned_internal_clinical_professional_id');
    expect(up.join('\n')).toContain('assigned_at');
    expect(down.join('\n')).toContain('DROP INDEX "IDX_gsc_review_internal_worklist"');
  });
});
