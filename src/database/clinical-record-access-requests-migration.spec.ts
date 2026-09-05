import { ClinicalRecordAccessRequests1794153600000 } from './migrations/1794153600000-ClinicalRecordAccessRequests';

describe('ClinicalRecordAccessRequests migration', () => {
  it('creates only the focused request enum, table, indexes, and relationships', async () => {
    const statements: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => statements.push(sql)) } as any;
    await new ClinicalRecordAccessRequests1794153600000().up(runner);
    const sql = statements.join('\n');
    expect(sql).toContain('clinical_record_access_requests');
    expect(sql).toContain('clinical_record_access_request_status_enum');
    expect(sql).toContain('approved_grant_id');
    expect(sql).toContain('clinical_record_access_grants');
    expect(sql).not.toContain('patient_provider_connections');
    expect(sql).not.toMatch(/ALTER TABLE|DROP TABLE/);
  });
});
