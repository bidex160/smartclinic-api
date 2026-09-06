import { FamilyDependantsFoundation1794499200000 } from './migrations/1794499200000-FamilyDependantsFoundation';

describe('Family dependants foundation migration', () => {
  it('creates only family relationship/provenance schema and an inactive unpriced reward rule', async () => {
    const sql: string[] = []; const runner = { query: jest.fn(async (statement: string) => sql.push(statement)) };
    await new FamilyDependantsFoundation1794499200000().up(runner as never); const joined = sql.join('\n');
    expect(joined).toContain('CREATE TABLE "patient_relationships"'); expect(joined).toContain('UQ_patient_relationships_active_guardian');
    expect(joined).toContain('CREATE TABLE "dependant_reward_provenance"'); expect(joined).toContain('"created_by_user_id" uuid NOT NULL');
    expect(joined).toContain(`('DEPENDANT_FIRST_CARE_ACTION', 0, false)`);
    expect(joined).not.toContain('ALTER TABLE "patients"'); expect(joined).not.toContain('INSERT INTO "referrals"'); expect(joined).not.toContain('INSERT INTO "reward_points_ledger"');
  });
});
