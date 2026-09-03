import { HealthCheckClinicalResultType } from './enums/health-check-clinical-result-type.enum';
import { HEALTH_CHECK_MEASUREMENT_UNITS, HealthCheckMeasurementCode } from './enums/health-check-measurement-code.enum';

export enum HealthCheckRequirementSource {
  INCLUDED_PACKAGE_CONTENT = 'INCLUDED_PACKAGE_CONTENT',
  SELECTED_ADDON = 'SELECTED_ADDON',
}

export interface HealthCheckEncounterRequirement {
  code: string;
  name: string;
  category: string;
  resultType: HealthCheckClinicalResultType;
  unit: string | null;
  source: HealthCheckRequirementSource;
  requiresRecordedResult: boolean;
}

const legacyResultTypes: Partial<Record<HealthCheckMeasurementCode, HealthCheckClinicalResultType>> = {
  [HealthCheckMeasurementCode.BLOOD_PRESSURE]: HealthCheckClinicalResultType.BLOOD_PRESSURE,
  [HealthCheckMeasurementCode.BLOOD_GLUCOSE]: HealthCheckClinicalResultType.SINGLE_NUMERIC,
  [HealthCheckMeasurementCode.BMI]: HealthCheckClinicalResultType.SINGLE_NUMERIC,
  [HealthCheckMeasurementCode.TEMPERATURE]: HealthCheckClinicalResultType.SINGLE_NUMERIC,
  [HealthCheckMeasurementCode.OXYGEN_SATURATION]: HealthCheckClinicalResultType.SINGLE_NUMERIC,
  [HealthCheckMeasurementCode.PULSE]: HealthCheckClinicalResultType.SINGLE_NUMERIC,
};

const legacyNames: Record<HealthCheckMeasurementCode, string> = {
  [HealthCheckMeasurementCode.BLOOD_PRESSURE]: 'Blood pressure',
  [HealthCheckMeasurementCode.BLOOD_GLUCOSE]: 'Blood glucose',
  [HealthCheckMeasurementCode.BMI]: 'BMI',
  [HealthCheckMeasurementCode.TEMPERATURE]: 'Temperature',
  [HealthCheckMeasurementCode.OXYGEN_SATURATION]: 'Oxygen saturation',
  [HealthCheckMeasurementCode.PULSE]: 'Pulse',
};

type SnapshotItem = { code?: unknown; name?: unknown; category?: unknown; resultType?: unknown; unit?: unknown };

export function projectHealthCheckEncounterRequirements(snapshot: Record<string, unknown> | null): HealthCheckEncounterRequirement[] {
  if (!snapshot) return legacyRequirements();
  const included = Array.isArray(snapshot.includedContents) ? snapshot.includedContents : [];
  const addons = Array.isArray(snapshot.selectedAddons) ? snapshot.selectedAddons : [];
  const projected = [
    ...included.map((item) => projectItem(item, HealthCheckRequirementSource.INCLUDED_PACKAGE_CONTENT)),
    ...addons.map((item) => projectItem(item, HealthCheckRequirementSource.SELECTED_ADDON)),
  ].filter((item): item is HealthCheckEncounterRequirement => item !== null);
  return projected.length ? [...new Map(projected.map((item) => [item.code, item])).values()] : legacyRequirements();
}

function projectItem(value: unknown, source: HealthCheckRequirementSource): HealthCheckEncounterRequirement | null {
  const item = value as SnapshotItem;
  if (!item || typeof item.code !== 'string' || !item.code) return null;
  const legacyType = legacyResultTypes[item.code as HealthCheckMeasurementCode];
  const resultType = Object.values(HealthCheckClinicalResultType).includes(item.resultType as HealthCheckClinicalResultType)
    ? item.resultType as HealthCheckClinicalResultType
    : legacyType ?? HealthCheckClinicalResultType.NONE;
  const legacyUnit = HEALTH_CHECK_MEASUREMENT_UNITS[item.code as HealthCheckMeasurementCode];
  const unit = resultType === HealthCheckClinicalResultType.NONE ? null : typeof item.unit === 'string' && item.unit ? item.unit : legacyUnit ?? null;
  return {
    code: item.code,
    name: typeof item.name === 'string' && item.name ? item.name : item.code,
    category: typeof item.category === 'string' && item.category ? item.category : 'MEASUREMENT',
    resultType,
    unit,
    source,
    requiresRecordedResult: resultType !== HealthCheckClinicalResultType.NONE,
  };
}

function legacyRequirements(): HealthCheckEncounterRequirement[] {
  return Object.values(HealthCheckMeasurementCode).map((code) => ({
    code,
    name: legacyNames[code],
    category: 'MEASUREMENT',
    resultType: legacyResultTypes[code]!,
    unit: HEALTH_CHECK_MEASUREMENT_UNITS[code],
    source: HealthCheckRequirementSource.INCLUDED_PACKAGE_CONTENT,
    requiresRecordedResult: true,
  }));
}
