import { FamilyFastTrackParticipants1794585600000 } from './migrations/1794585600000-FamilyFastTrackParticipants';

describe('Family FastTrack participants migration', () => {
  it('only removes the legacy account-patient identity constraint', async () => {
    const sql: string[] = []; const runner = { query: jest.fn(async (statement: string) => sql.push(statement)) };
    await new FamilyFastTrackParticipants1794585600000().up(runner as never);
    expect(sql).toEqual(['ALTER TABLE "fasttrack_requests" DROP CONSTRAINT "FK_fasttrack_patient_user"']);
    expect(sql.join('\n')).not.toMatch(/DROP TABLE|ALTER TABLE "patients"|ALTER TABLE "users"/);
  });
});
