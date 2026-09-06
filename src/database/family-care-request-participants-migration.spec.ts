import { FamilyCareRequestParticipants1794672000000 } from './migrations/1794672000000-FamilyCareRequestParticipants';

describe('Family Care Request participants migration', () => {
  it('removes only the obsolete user/patient coupling', async () => {
    const sql: string[] = []; const runner = { query: jest.fn(async (statement: string) => sql.push(statement)) };
    await new FamilyCareRequestParticipants1794672000000().up(runner as never);
    expect(sql).toEqual(['ALTER TABLE "care_requests" DROP CONSTRAINT "FK_care_requests_patient_user"']);
    expect(sql.join('\n')).not.toMatch(/DROP TABLE|ALTER TABLE "patients"|ALTER TABLE "users"/);
  });
});
