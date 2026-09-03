import { HealthCheckClinicalResultType } from './enums/health-check-clinical-result-type.enum';
import { HealthCheckRequirementSource, projectHealthCheckEncounterRequirements } from './health-check-encounter-requirements';

describe('projectHealthCheckEncounterRequirements', () => {
  it('keeps historical fixed-six bookings compatible', () => {
    const requirements = projectHealthCheckEncounterRequirements(null);
    expect(requirements).toHaveLength(6);
    expect(requirements.every((item) => item.requiresRecordedResult)).toBe(true);
    expect(requirements.find((item) => item.code === 'BLOOD_PRESSURE')).toMatchObject({ resultType: HealthCheckClinicalResultType.BLOOD_PRESSURE, unit: 'mmHg' });
  });

  it('derives COMPLETE content and selected NONE work from the frozen snapshot', () => {
    const snapshot = { includedContents: [
      { code: 'PULSE', name: 'Pulse', category: 'MEASUREMENT', resultType: 'SINGLE_NUMERIC', unit: 'bpm' },
      { code: 'CLINICIAN_REVIEW', name: 'Clinician review', category: 'SERVICE', resultType: 'NONE', unit: null },
    ], selectedAddons: [{ code: 'FOLLOW_UP', name: 'Follow-up', category: 'SERVICE', resultType: 'NONE', unit: null }] };
    expect(projectHealthCheckEncounterRequirements(snapshot)).toEqual([
      expect.objectContaining({ code: 'PULSE', source: HealthCheckRequirementSource.INCLUDED_PACKAGE_CONTENT, requiresRecordedResult: true }),
      expect.objectContaining({ code: 'CLINICIAN_REVIEW', requiresRecordedResult: false }),
      expect.objectContaining({ code: 'FOLLOW_UP', source: HealthCheckRequirementSource.SELECTED_ADDON, requiresRecordedResult: false }),
    ]);
  });

  it('uses only captured result contracts and is unaffected by later catalogue/configuration objects', () => {
    const snapshot = { includedContents: [{ code: 'CUSTOM_BP', name: 'Custom BP', category: 'MEASUREMENT', resultType: 'BLOOD_PRESSURE', unit: 'mmHg' }], selectedAddons: [{ code: 'LAB_X', name: 'Lab X', category: 'LAB', resultType: 'SINGLE_NUMERIC', unit: 'mmol/L', amountMinor: 10 }] };
    const before = projectHealthCheckEncounterRequirements(snapshot);
    const liveCatalogue = { active: false, resultType: 'NONE', unit: null, packageContents: [], priceMinor: 999 };
    expect(liveCatalogue).toBeDefined();
    expect(projectHealthCheckEncounterRequirements(snapshot)).toEqual(before);
    expect(before).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CUSTOM_BP', resultType: HealthCheckClinicalResultType.BLOOD_PRESSURE }),
      expect.objectContaining({ code: 'LAB_X', resultType: HealthCheckClinicalResultType.SINGLE_NUMERIC }),
    ]));
  });

  it('treats unknown legacy snapshot content as non-result-bearing without consulting live catalogue', () => {
    expect(projectHealthCheckEncounterRequirements({ includedContents: [{ code: 'OLD_SERVICE', name: 'Old service', category: 'SERVICE' }] })[0]).toMatchObject({ resultType: HealthCheckClinicalResultType.NONE, requiresRecordedResult: false });
  });
});
