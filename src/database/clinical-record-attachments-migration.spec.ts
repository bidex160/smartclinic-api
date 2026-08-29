import { ClinicalRecordAttachments1790697600000 } from './migrations/1790697600000-ClinicalRecordAttachments';

describe('ClinicalRecordAttachments migration', () => {
  it('creates private attachment metadata with ownership, limits, and lookup indexes', async () => {
    const sql: string[] = [];
    await new ClinicalRecordAttachments1790697600000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    expect(sql).toContainEqual(expect.stringContaining('CREATE TYPE "clinical_attachment_resource_type_enum"'));
    expect(sql).toContainEqual(expect.stringContaining('CREATE TABLE "clinical_record_attachments"'));
    expect(sql).toContainEqual(expect.stringContaining('UQ_clinical_record_attachments_reference'));
    expect(sql).toContainEqual(expect.stringContaining('"size_bytes" <= 15728640'));
    expect(sql).toContainEqual(expect.stringContaining('FK_clinical_record_attachments_record'));
    expect(sql).toContainEqual(expect.stringContaining('IDX_clinical_record_attachments_record_created'));
  });
});
