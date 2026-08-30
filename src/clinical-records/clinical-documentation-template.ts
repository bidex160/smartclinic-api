import { BadRequestException, ConflictException } from '@nestjs/common';
import { ClinicalRecordType } from './enums/clinical-record-type.enum';

export enum ClinicalTemplateFieldType {
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  SELECT = 'SELECT',
  MULTI_SELECT = 'MULTI_SELECT',
  BOOLEAN = 'BOOLEAN',
}

export enum ClinicalDocumentationTemplateMode {
  DEFAULT = 'DEFAULT',
  CUSTOM = 'CUSTOM',
}

export enum ClinicalDocumentationSnapshotSource {
  SYSTEM_DEFAULT = 'SYSTEM_DEFAULT',
  PROVIDER_CUSTOM = 'PROVIDER_CUSTOM',
}

export interface ClinicalTemplateField {
  key: string;
  label: string;
  type: ClinicalTemplateFieldType;
  required: boolean;
  core: boolean;
  options?: string[];
  placeholder?: string;
  sortOrder: number;
}

export interface ClinicalDocumentationSnapshot {
  schemaVersion: 1;
  source: ClinicalDocumentationSnapshotSource;
  providerTemplateVersion: number | null;
  fields: ClinicalTemplateField[];
}

const field = (key: string, label: string, type: ClinicalTemplateFieldType, required: boolean, core: boolean, sortOrder: number): ClinicalTemplateField => ({ key, label, type, required, core, sortOrder });
const text = ClinicalTemplateFieldType.TEXT;
const area = ClinicalTemplateFieldType.TEXTAREA;

export const GENERIC_CLINICAL_TEMPLATES: Readonly<Partial<Record<ClinicalRecordType, readonly ClinicalTemplateField[]>>> = {
  [ClinicalRecordType.LAB_RESULT]: [field('testName', 'Test name', text, true, true, 1), field('specimen', 'Specimen', text, false, false, 2), field('resultSummary', 'Result summary', area, true, true, 3), field('interpretation', 'Interpretation', area, false, false, 4), field('conclusion', 'Conclusion', area, false, false, 5), field('recommendations', 'Recommendations', area, false, false, 6)],
  [ClinicalRecordType.IMAGING_RESULT]: [field('study', 'Study', text, true, false, 1), field('indication', 'Indication', area, false, false, 2), field('findings', 'Findings', area, true, true, 3), field('impression', 'Impression', area, true, true, 4), field('recommendations', 'Recommendations', area, false, false, 5)],
  [ClinicalRecordType.PROCEDURE]: [field('procedureName', 'Procedure name', text, true, true, 1), field('indication', 'Indication', area, false, false, 2), field('findings', 'Findings', area, false, false, 3), field('outcome', 'Outcome', area, true, true, 4), field('complications', 'Complications', area, false, false, 5), field('aftercareInstructions', 'Aftercare instructions', area, false, false, 6)],
  [ClinicalRecordType.PHARMACY]: [field('medicationSummary', 'Medication summary', area, true, true, 1), field('counsellingNotes', 'Counselling notes', area, false, false, 2), field('instructions', 'Instructions', area, false, false, 3), field('pharmacistNotes', 'Pharmacist notes', area, false, false, 4)],
  [ClinicalRecordType.FOLLOW_UP]: [field('progress', 'Progress', area, true, true, 1), field('assessment', 'Assessment', area, false, false, 2), field('plan', 'Plan', area, true, true, 3), field('followUpInstructions', 'Follow-up instructions', area, false, false, 4)],
  [ClinicalRecordType.OTHER]: [field('title', 'Title', text, true, true, 1), field('summary', 'Summary', area, true, true, 2), field('notes', 'Notes', area, false, false, 3)],
};

export function isTemplateDrivenType(type: ClinicalRecordType | null): type is Exclude<ClinicalRecordType, ClinicalRecordType.CONSULTATION> {
  return !!type && type !== ClinicalRecordType.CONSULTATION;
}

export function genericTemplate(type: ClinicalRecordType): ClinicalTemplateField[] {
  const fields = GENERIC_CLINICAL_TEMPLATES[type];
  if (!fields) throw new ConflictException(`Clinical documentation templates are not available for ${type}`);
  return fields.map((item) => ({ ...item, options: item.options ? [...item.options] : undefined }));
}

export function validateCustomTemplate(type: ClinicalRecordType, input: ClinicalTemplateField[]): ClinicalTemplateField[] {
  if (!isTemplateDrivenType(type)) throw new ConflictException('A custom template requires a template-driven Clinical Record type');
  if (!input.length || input.length > 50) throw new BadRequestException('A clinical documentation template requires between 1 and 50 fields');
  const fields = input.map((item) => normalizeField(item));
  if (new Set(fields.map((item) => item.key)).size !== fields.length) throw new BadRequestException('Clinical documentation field keys must be unique');
  if (new Set(fields.map((item) => item.sortOrder)).size !== fields.length) throw new BadRequestException('Clinical documentation field sortOrder values must be unique');
  for (const core of genericTemplate(type).filter((item) => item.core)) {
    const configured = fields.find((item) => item.key === core.key);
    if (!configured) throw new BadRequestException(`Core clinical documentation field ${core.key} is required`);
    if (!configured.required || !configured.core) throw new BadRequestException(`Core clinical documentation field ${core.key} must remain required and core`);
    if (configured.type !== core.type) throw new BadRequestException(`Core clinical documentation field ${core.key} must retain type ${core.type}`);
  }
  return fields.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

function normalizeField(input: ClinicalTemplateField): ClinicalTemplateField {
  const key = input.key?.trim();
  const label = input.label?.trim();
  const placeholder = input.placeholder?.trim() || undefined;
  if (!key || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || key.length > 80) throw new BadRequestException('Clinical documentation field key is invalid');
  if (!label || label.length > 160) throw new BadRequestException(`Clinical documentation field ${key} requires a valid label`);
  if (!Object.values(ClinicalTemplateFieldType).includes(input.type)) throw new BadRequestException(`Clinical documentation field ${key} has an unsupported type`);
  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 1000) throw new BadRequestException(`Clinical documentation field ${key} has an invalid sortOrder`);
  if (placeholder && placeholder.length > 500) throw new BadRequestException(`Clinical documentation field ${key} placeholder is too long`);
  const needsOptions = input.type === ClinicalTemplateFieldType.SELECT || input.type === ClinicalTemplateFieldType.MULTI_SELECT;
  let options: string[] | undefined;
  if (needsOptions) {
    options = (input.options ?? []).map((option) => option.trim());
    if (!options.length || options.length > 50 || options.some((option) => !option || option.length > 160) || new Set(options).size !== options.length) throw new BadRequestException(`Clinical documentation field ${key} requires unique nonblank options`);
  } else if (input.options?.length) throw new BadRequestException(`Clinical documentation field ${key} does not support options`);
  return { key, label, type: input.type, required: input.required === true, core: input.core === true, ...(options ? { options } : {}), ...(placeholder ? { placeholder } : {}), sortOrder: input.sortOrder };
}

export function validateStructuredData(snapshot: ClinicalDocumentationSnapshot, input: Record<string, unknown>, requireComplete: boolean): Record<string, unknown> {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new BadRequestException('structuredData must be an object');
  const fields = new Map(snapshot.fields.map((item) => [item.key, item]));
  const output: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    const definition = fields.get(key);
    if (!definition) throw new BadRequestException(`Unknown clinical documentation field: ${key}`);
    output[key] = validateValue(definition, raw);
  }
  if (requireComplete) {
    const missing = snapshot.fields.filter((item) => item.required && !meaningful(output[item.key], item.type)).map((item) => item.key);
    if (missing.length) throw new ConflictException(`Required clinical documentation is incomplete: ${missing.join(', ')}`);
  }
  return output;
}

function validateValue(field: ClinicalTemplateField, value: unknown): unknown {
  if (value === null) return null;
  switch (field.type) {
    case ClinicalTemplateFieldType.TEXT:
    case ClinicalTemplateFieldType.TEXTAREA:
      if (typeof value !== 'string') throw new BadRequestException(`${field.key} must be text`);
      if (value.length > 20000) throw new BadRequestException(`${field.key} is too long`);
      return value.trim();
    case ClinicalTemplateFieldType.NUMBER:
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException(`${field.key} must be a finite number`);
      return value;
    case ClinicalTemplateFieldType.DATE:
      if (typeof value !== 'string' || !validDate(value)) throw new BadRequestException(`${field.key} must be a valid date`);
      return value;
    case ClinicalTemplateFieldType.BOOLEAN:
      if (typeof value !== 'boolean') throw new BadRequestException(`${field.key} must be boolean`);
      return value;
    case ClinicalTemplateFieldType.SELECT:
      if (typeof value !== 'string' || !field.options?.includes(value)) throw new BadRequestException(`${field.key} must be one configured option`);
      return value;
    case ClinicalTemplateFieldType.MULTI_SELECT:
      if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !field.options?.includes(item)) || new Set(value).size !== value.length) throw new BadRequestException(`${field.key} must contain unique configured options`);
      return value;
  }
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function meaningful(value: unknown, type: ClinicalTemplateFieldType): boolean {
  if (value === null || value === undefined) return false;
  if (type === ClinicalTemplateFieldType.TEXT || type === ClinicalTemplateFieldType.TEXTAREA || type === ClinicalTemplateFieldType.SELECT || type === ClinicalTemplateFieldType.DATE) return typeof value === 'string' && value.trim().length > 0;
  if (type === ClinicalTemplateFieldType.MULTI_SELECT) return Array.isArray(value) && value.length > 0;
  return true;
}
