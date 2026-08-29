import { ClinicalRecordsFoundation1790611200000 } from './migrations/1790611200000-ClinicalRecordsFoundation';

describe('ClinicalRecordsFoundation migration', () => {
  it('creates longitudinal records, consultation detail, expected type, and appointment uniqueness', async () => {
    const sql: string[] = [];
    await new ClinicalRecordsFoundation1790611200000().up({ query: jest.fn(async (statement: string) => { sql.push(statement); }) } as never);
    expect(sql).toContainEqual(expect.stringContaining('CREATE TYPE "clinical_record_type_enum"'));
    expect(sql).toContainEqual(expect.stringContaining('ALTER TABLE "care_service_definitions" ADD "clinical_record_type"'));
    expect(sql).toContainEqual(expect.stringContaining('CREATE TABLE "clinical_records"'));
    expect(sql).toContainEqual(expect.stringContaining('UQ_clinical_records_care_appointment'));
    expect(sql).toContainEqual(expect.stringContaining('CREATE TABLE "clinical_consultation_details"'));
    expect(sql).toContainEqual(expect.stringContaining('ON DELETE CASCADE'));
  });
});
