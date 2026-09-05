import { ShareableHealthPassportScope1794240000000 } from './migrations/1794240000000-ShareableHealthPassportScope';

describe('ShareableHealthPassportScope migration', () => {
  it('preserves existing scope rows while extending grants, requests, and truthful access audit', async () => {
    const statements: string[] = [];
    const runner = { query: jest.fn(async (sql: string) => statements.push(sql)) } as any;
    await new ShareableHealthPassportScope1794240000000().up(runner);
    const sql = statements.join('\n');
    expect(sql).toContain("'HEALTH_PASSPORT','ALL_RECORDS','RECORD_TYPE','SINGLE_RECORD'");
    expect(sql).toContain('CHK_clinical_record_access_grants_scope');
    expect(sql).toContain('CHK_clinical_record_access_requests_scope');
    expect(sql).toContain('source_domain'); expect(sql).toContain('source_reference');
    expect(sql).toContain('DISABLE TRIGGER "TRG_clinical_record_access_audit_append_only"');
    expect(sql).not.toContain('DROP TABLE');
  });
});
