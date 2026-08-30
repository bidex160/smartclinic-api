import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClinicalDocumentationSnapshotSource, ClinicalTemplateFieldType, GENERIC_CLINICAL_TEMPLATES, genericTemplate, validateCustomTemplate, validateStructuredData } from './clinical-documentation-template';
import { ClinicalRecordType } from './enums/clinical-record-type.enum';

describe('clinical documentation templates', () => {
  it.each([
    [ClinicalRecordType.LAB_RESULT, ['testName', 'resultSummary']],
    [ClinicalRecordType.IMAGING_RESULT, ['findings', 'impression']],
    [ClinicalRecordType.PROCEDURE, ['procedureName', 'outcome']],
    [ClinicalRecordType.PHARMACY, ['medicationSummary']],
    [ClinicalRecordType.FOLLOW_UP, ['progress', 'plan']],
    [ClinicalRecordType.OTHER, ['title', 'summary']],
  ] as const)('provides a deterministic %s generic template with core semantics', (type, core) => {
    const fields = genericTemplate(type);
    expect(fields.map((item) => item.key)).toEqual((GENERIC_CLINICAL_TEMPLATES[type] ?? []).map((item) => item.key));
    expect(fields.filter((item) => item.core).map((item) => item.key)).toEqual(core);
  });

  it('allows custom fields while preserving required core imaging fields', () => {
    const fields = genericTemplate(ClinicalRecordType.IMAGING_RESULT);
    fields.push({ key: 'contrastUsed', label: 'Contrast used', type: ClinicalTemplateFieldType.BOOLEAN, required: false, core: false, sortOrder: 20 });
    expect(validateCustomTemplate(ClinicalRecordType.IMAGING_RESULT, fields).at(-1)).toMatchObject({ key: 'contrastUsed' });
  });

  it.each([
    [genericTemplate(ClinicalRecordType.IMAGING_RESULT).filter((item) => item.key !== 'findings')],
    [genericTemplate(ClinicalRecordType.IMAGING_RESULT).map((item) => item.key === 'impression' ? { ...item, required: false } : item)],
    [[...genericTemplate(ClinicalRecordType.IMAGING_RESULT), { ...genericTemplate(ClinicalRecordType.IMAGING_RESULT)[0] }]],
  ])('rejects missing, weakened, or duplicate core/schema fields', (fields) => {
    expect(() => validateCustomTemplate(ClinicalRecordType.IMAGING_RESULT, fields)).toThrow(BadRequestException);
  });

  it.each([
    { type: ClinicalTemplateFieldType.SELECT, options: [] },
    { type: ClinicalTemplateFieldType.MULTI_SELECT, options: ['Yes', 'Yes'] },
    { type: ClinicalTemplateFieldType.TEXT, options: ['invalid'] },
  ])('rejects invalid option configuration %#', (change) => {
    const fields = genericTemplate(ClinicalRecordType.OTHER);
    fields.push({ key: 'custom', label: 'Custom', required: false, core: false, sortOrder: 10, ...change } as any);
    expect(() => validateCustomTemplate(ClinicalRecordType.OTHER, fields)).toThrow(BadRequestException);
  });

  it('validates draft values by field type and final required completeness', () => {
    const fields = genericTemplate(ClinicalRecordType.IMAGING_RESULT);
    fields.push({ key: 'contrastUsed', label: 'Contrast used', type: ClinicalTemplateFieldType.BOOLEAN, required: false, core: false, sortOrder: 20 });
    fields.push({ key: 'modality', label: 'Modality', type: ClinicalTemplateFieldType.SELECT, required: false, core: false, options: ['X-Ray', 'CT'], sortOrder: 21 });
    fields.push({ key: 'views', label: 'Views', type: ClinicalTemplateFieldType.MULTI_SELECT, required: false, core: false, options: ['AP', 'Lateral'], sortOrder: 22 });
    const snapshot = { schemaVersion: 1 as const, source: ClinicalDocumentationSnapshotSource.SYSTEM_DEFAULT, providerTemplateVersion: null, fields };
    expect(validateStructuredData(snapshot, { study: ' Chest X-Ray ', findings: 'Clear', contrastUsed: false, modality: 'X-Ray', views: ['AP'] }, false)).toMatchObject({ study: 'Chest X-Ray', contrastUsed: false });
    expect(() => validateStructuredData(snapshot, { unknown: 'value' }, false)).toThrow(BadRequestException);
    expect(() => validateStructuredData(snapshot, { contrastUsed: 'yes' }, false)).toThrow(BadRequestException);
    expect(() => validateStructuredData(snapshot, { modality: 'MRI' }, false)).toThrow(BadRequestException);
    expect(() => validateStructuredData(snapshot, { views: ['AP', 'MRI'] }, false)).toThrow(BadRequestException);
    expect(() => validateStructuredData(snapshot, { study: 'X-Ray', findings: ' ', impression: null }, true)).toThrow(ConflictException);
    expect(validateStructuredData(snapshot, { study: 'X-Ray', findings: 'Clear', impression: 'Normal' }, true)).toMatchObject({ impression: 'Normal' });
  });
});
