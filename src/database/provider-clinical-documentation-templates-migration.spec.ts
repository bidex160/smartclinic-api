import { ProviderClinicalDocumentationTemplates1791388800000 } from './migrations/1791388800000-ProviderClinicalDocumentationTemplates';

describe('ProviderClinicalDocumentationTemplates1791388800000', () => {
  it('creates versioned templates and reversible Clinical Record JSONB snapshots', async () => {
    const sql: string[] = [];
    const runner: any = { query: jest.fn(async (statement: string) => sql.push(statement)) };
    const migration = new ProviderClinicalDocumentationTemplates1791388800000();
    await migration.up(runner);
    const up = sql.join('\n');
    expect(up).toContain('provider_care_service_clinical_templates');
    expect(up).toContain('"provider_care_service_id", "version"');
    expect(up).toContain('WHERE "is_current" = true');
    expect(up).toContain('"documentation_template_snapshot" jsonb');
    expect(up).toContain('"structured_data" jsonb');
    expect(up).not.toContain('clinical_imaging_result_details');
    sql.length = 0;
    await migration.down(runner);
    expect(sql.at(-1)).toContain('DROP TABLE "provider_care_service_clinical_templates"');
  });
});
