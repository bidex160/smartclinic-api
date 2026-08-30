import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClinicalDocumentationTemplateMode, ClinicalTemplateFieldType, genericTemplate } from '../clinical-records/clinical-documentation-template';
import { ClinicalRecordType } from '../clinical-records/enums/clinical-record-type.enum';
import { ProviderCareServiceClinicalTemplate } from './entities/provider-care-service-clinical-template.entity';
import { ProviderCareService } from './entities/provider-care-service.entity';
import { ProviderCareServicesService } from './provider-care-services.service';

describe('ProviderCareServicesService clinical documentation configuration', () => {
  const provider = { id: 'provider-id' };
  const user: any = { id: 'provider-user' };
  let offering: any;
  let services: any;
  let templates: any;
  let manager: any;
  let configurationContext: any;
  let subject: ProviderCareServicesService;

  beforeEach(() => {
    offering = { id: 'offering-id', providerId: provider.id, definition: { id: 'definition-id', clinicalRecordType: ClinicalRecordType.IMAGING_RESULT }, clinicalTemplates: [] };
    services = { findOne: jest.fn().mockResolvedValue(offering) };
    templates = { createQueryBuilder: jest.fn(() => ({ select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ version: '1' }) })), update: jest.fn(), create: jest.fn((value) => ({ id: 'internal-template', ...value })), save: jest.fn(async (value) => value) };
    const serviceRepo = { findOne: jest.fn().mockResolvedValue(offering) };
    manager = { getRepository: jest.fn((entity) => entity === ProviderCareService ? serviceRepo : entity === ProviderCareServiceClinicalTemplate ? templates : {}), transaction: jest.fn(async (work) => work(manager)) };
    services.manager = manager;
    configurationContext = { resolve: jest.fn().mockResolvedValue(provider) };
    subject = new ProviderCareServicesService({} as any, services, {} as any, configurationContext);
  });

  it('returns the effective SmartClinic default without persisting duplicate rows', async () => {
    const result = await subject.getClinicalDocumentationMine(user, offering.id);
    expect(result).toMatchObject({ clinicalRecordType: ClinicalRecordType.IMAGING_RESULT, templateMode: ClinicalDocumentationTemplateMode.DEFAULT, templateVersion: null });
    expect((result as any).fields.map((field: any) => field.key)).toEqual(['study', 'indication', 'findings', 'impression', 'recommendations']);
    expect(templates.save).not.toHaveBeenCalled();
    expect(configurationContext.resolve).toHaveBeenCalledWith(user, false);
  });

  it('creates a new immutable custom version and does not accept record type input', async () => {
    const fields = genericTemplate(ClinicalRecordType.IMAGING_RESULT);
    fields.push({ key: 'contrastUsed', label: 'Contrast used', type: ClinicalTemplateFieldType.BOOLEAN, required: false, core: false, sortOrder: 10 });
    const result = await subject.saveClinicalDocumentationMine(user, offering.id, { fields });
    expect(templates.update).toHaveBeenCalledWith({ providerCareServiceId: offering.id, isCurrent: true }, { isCurrent: false });
    expect(templates.save).toHaveBeenCalledWith(expect.objectContaining({ providerCareServiceId: offering.id, version: 2, recordType: ClinicalRecordType.IMAGING_RESULT, isCurrent: true }));
    expect(result).toMatchObject({ clinicalRecordType: ClinicalRecordType.IMAGING_RESULT, templateMode: ClinicalDocumentationTemplateMode.CUSTOM, templateVersion: 2 });
    expect(result).not.toHaveProperty('id');
    expect(configurationContext.resolve).toHaveBeenCalledWith(user, true);
  });

  it('rejects weakened core fields and null/consultation service types', async () => {
    const weakened = genericTemplate(ClinicalRecordType.IMAGING_RESULT).filter((field) => field.key !== 'findings');
    await expect(subject.saveClinicalDocumentationMine(user, offering.id, { fields: weakened })).rejects.toBeInstanceOf(BadRequestException);
    offering.definition.clinicalRecordType = ClinicalRecordType.CONSULTATION;
    await expect(subject.saveClinicalDocumentationMine(user, offering.id, { fields: [] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces offering ownership through the authenticated Provider', async () => {
    services.findOne.mockResolvedValue(null);
    await expect(subject.getClinicalDocumentationMine(user, 'other-offering')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resets only current custom state and returns the deterministic default', async () => {
    const result = await subject.resetClinicalDocumentationMine(user, offering.id);
    expect(templates.update).toHaveBeenCalledWith({ providerCareServiceId: offering.id, isCurrent: true }, { isCurrent: false });
    expect(result).toMatchObject({ templateMode: ClinicalDocumentationTemplateMode.DEFAULT, templateVersion: null });
    expect(configurationContext.resolve).toHaveBeenCalledWith(user, true);
  });

  it('allows a linked pending Provider to read, customize, and reset its own offering', async () => {
    const pendingProvider = { id: provider.id, status: 'PENDING', onboardingStatus: 'DRAFT', deletedAt: null };
    configurationContext.resolve.mockResolvedValue(pendingProvider);
    const fields = genericTemplate(ClinicalRecordType.IMAGING_RESULT);

    await expect(subject.getClinicalDocumentationMine(user, offering.id)).resolves.toMatchObject({ templateMode: ClinicalDocumentationTemplateMode.DEFAULT });
    await expect(subject.saveClinicalDocumentationMine(user, offering.id, { fields })).resolves.toMatchObject({ templateMode: ClinicalDocumentationTemplateMode.CUSTOM });
    await expect(subject.resetClinicalDocumentationMine(user, offering.id)).resolves.toMatchObject({ templateMode: ClinicalDocumentationTemplateMode.DEFAULT });
    expect(configurationContext.resolve.mock.calls).toEqual([[user, false], [user, true], [user, true]]);
  });

  it('preserves setup resolver denial for unlinked, deleted, suspended, or inactive Providers', async () => {
    configurationContext.resolve.mockRejectedValue(new ForbiddenException('Provider configuration access is required'));
    await expect(subject.getClinicalDocumentationMine(user, offering.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(subject.saveClinicalDocumentationMine(user, offering.id, { fields: genericTemplate(ClinicalRecordType.IMAGING_RESULT) })).rejects.toBeInstanceOf(ForbiddenException);
    expect(services.findOne).not.toHaveBeenCalled();
  });
});
