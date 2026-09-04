import { BadRequestException, ConflictException } from '@nestjs/common';
import { AdminHealthCheckCatalogueService } from './admin-health-check-catalogue.service';
import { HealthCheckCatalogueHistory } from './entities/health-check-catalogue-history.entity';
import { HealthCheckClinicalContent } from './entities/health-check-clinical-content.entity';
import { HealthCheckPackageAddon } from './entities/health-check-package-addon.entity';
import { HealthCheckPackageContent } from './entities/health-check-package-content.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { HealthCheckClinicalResultType } from './enums/health-check-clinical-result-type.enum';
import { ProviderServiceAddon } from '../providers/entities/provider-service-addon.entity';

const actor = '10000000-0000-4000-8000-000000000001';
const pkg: any = { id: '20000000-0000-4000-8000-000000000001', code: 'ESSENTIAL', name: 'Essential', description: null, benefits: [], estimatedDurationMinutes: 30, isActive: true, createdAt: new Date(), updatedAt: new Date(), contents: [], addonAvailability: [] };
const content = (changes: any = {}) => ({ id: '30000000-0000-4000-8000-000000000001', reference: 'SC-HCC-1111111111111111', code: 'CLINICIAN_REVIEW', name: 'Clinician review', description: null, category: 'SERVICE', resultType: HealthCheckClinicalResultType.NONE, unit: null, displayOrder: 1, isActive: true, createdAt: new Date(), updatedAt: new Date(), packageContents: [], packageAddonEligibility: [], ...changes });

const repository = () => ({ find: jest.fn(), findOne: jest.fn(), findAndCount: jest.fn(), count: jest.fn(), exists: jest.fn(), create: jest.fn((value) => value), save: jest.fn(async (value) => { if (!value.id) value.id = Math.random().toString(); if (!value.reference && value.code) value.reference = 'SC-HCC-2222222222222222'; return value; }), update: jest.fn(), createQueryBuilder: jest.fn() });

describe('AdminHealthCheckCatalogueService', () => {
  let packages: any, contents: any, compositions: any, addons: any, providerAddons: any, history: any, manager: any, subject: AdminHealthCheckCatalogueService;
  const lockBuilder = (row: any) => { const builder: any = { where: jest.fn().mockReturnThis(), setLock: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(row), innerJoinAndSelect: jest.fn().mockReturnThis(), getMany: jest.fn() }; return builder; };
  beforeEach(() => {
    Object.assign(pkg, { code: 'ESSENTIAL', name: 'Essential', description: null, benefits: [], estimatedDurationMinutes: 30, isActive: true, contents: [], addonAvailability: [] });
    packages = repository(); contents = repository(); compositions = repository(); addons = repository(); providerAddons = repository(); history = repository();
    packages.createQueryBuilder.mockImplementation(() => lockBuilder(pkg)); contents.createQueryBuilder.mockImplementation(() => lockBuilder(content()));
    packages.findOne.mockImplementation(async () => pkg); contents.findOne.mockImplementation(async () => content()); providerAddons.count.mockResolvedValue(0);
    compositions.find.mockResolvedValue([]); compositions.exists.mockResolvedValue(false); addons.exists.mockResolvedValue(false); contents.exists.mockResolvedValue(false);
    manager = { getRepository: jest.fn((entity) => entity === HealthCheckPackage ? packages : entity === HealthCheckClinicalContent ? contents : entity === HealthCheckPackageContent ? compositions : entity === HealthCheckPackageAddon ? addons : entity === ProviderServiceAddon ? providerAddons : entity === HealthCheckCatalogueHistory ? history : null) };
    subject = new AdminHealthCheckCatalogueService({ transaction: jest.fn((work) => work(manager)) } as any, packages, contents, compositions, addons, providerAddons);
  });

  it('lists every package with management counts, including inactive packages', async () => {
    packages.find.mockResolvedValue([{ ...pkg, isActive: false, contents: [{}, {}], addonAvailability: [{}] }]);
    await expect(subject.listPackages()).resolves.toMatchObject([{ code: 'ESSENTIAL', isActive: false, includedContentCount: 2, optionalAddonCount: 1 }]);
    expect(packages.find).toHaveBeenCalledWith(expect.not.objectContaining({ where: expect.anything() }));
  });

  it('creates a normalized inactive package, persists metadata, and writes catalogue history', async () => {
    const created = { ...pkg, id: 'executive-id', code: 'EXECUTIVE', name: 'Executive Health', description: 'Expanded screening', benefits: ['Priority review'], estimatedDurationMinutes: 45, isActive: false, contents: [], addonAvailability: [] };
    packages.findOne.mockResolvedValue(created);
    await expect(subject.createPackage({ code: ' executive ', name: ' Executive Health ', description: ' Expanded screening ', benefits: [' Priority review ', '  '], estimatedDurationMinutes: 45 }, actor)).resolves.toMatchObject({ code: 'EXECUTIVE', name: 'Executive Health', isActive: false, includedContents: [], optionalAddons: [] });
    expect(packages.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXECUTIVE', name: 'Executive Health', description: 'Expanded screening', benefits: ['Priority review'], estimatedDurationMinutes: 45, isActive: false }));
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ operation: 'PACKAGE_CREATED', actorUserId: actor, healthCheckPackageId: expect.any(String), previousState: null, resultingState: expect.objectContaining({ code: 'EXECUTIVE', isActive: false }) }));
  });

  it('rejects duplicate package codes before persistence', async () => {
    packages.exists.mockResolvedValue(true);
    await expect(subject.createPackage({ code: 'EXECUTIVE', name: 'Executive', benefits: [] }, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(packages.save).not.toHaveBeenCalled();
  });

  it('lists, activates, and composes a newly-created package through existing operations', async () => {
    Object.assign(pkg, { code: 'EXECUTIVE', isActive: false }); packages.find.mockResolvedValue([pkg]);
    await expect(subject.listPackages()).resolves.toEqual([expect.objectContaining({ code: 'EXECUTIVE', isActive: false })]);
    await subject.setPackageActive('executive', true, actor); expect(packages.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXECUTIVE', isActive: true }));
    await subject.addIncludedContent('executive', { clinicalContentReference: content().reference }, actor); expect(compositions.save).toHaveBeenCalledWith(expect.objectContaining({ healthCheckPackageId: pkg.id, isActive: true }));
  });

  it('returns deterministic package composition and canonical/add-on states', async () => {
    const first = content({ code: 'A', reference: 'SC-HCC-AAAAAAAAAAAAAAAA' }); const second = content({ id: '4', code: 'B', reference: 'SC-HCC-BBBBBBBBBBBBBBBB', isActive: false });
    packages.findOne.mockResolvedValue({ ...pkg, contents: [{ sortOrder: 2, isActive: true, clinicalContent: second }, { sortOrder: 1, isActive: true, clinicalContent: first }], addonAvailability: [{ isActive: false, clinicalContent: second }] });
    const result: any = await subject.packageDetail('essential');
    expect(result.includedContents.map((x: any) => x.code)).toEqual(['A', 'B']);
    expect(result.optionalAddons[0]).toMatchObject({ code: 'B', eligibilityActive: false, canonicalContentActive: false });
  });

  it('updates safe package metadata without exposing code mutation and audits it', async () => {
    await subject.updatePackage('ESSENTIAL', { name: 'New name', benefits: ['One'] }, actor);
    expect(packages.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'ESSENTIAL', name: 'New name' }));
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ operation: 'PACKAGE_METADATA_UPDATED', actorUserId: actor }));
  });

  it('activates and deactivates without deleting package history', async () => {
    await subject.setPackageActive('ESSENTIAL', false, actor);
    expect(packages.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ operation: 'PACKAGE_DEACTIVATED' }));
  });

  it('lists content with bounded pagination and filters', async () => {
    contents.findAndCount.mockResolvedValue([[content()], 1]);
    await expect(subject.listContents({ page: 1, limit: 25, isActive: true, category: 'SERVICE', resultType: HealthCheckClinicalResultType.NONE, search: 'review' })).resolves.toMatchObject({ total: 1, items: [{ code: 'CLINICIAN_REVIEW' }] });
  });

  it('returns content package usage and only an aggregate provider offering count', async () => {
    contents.findOne.mockResolvedValue(content({ packageContents: [{ sortOrder: 1, isActive: true, healthCheckPackage: pkg }], packageAddonEligibility: [], })); providerAddons.count.mockResolvedValue(4);
    await expect(subject.contentDetail(content().reference)).resolves.toMatchObject({ includedInPackages: [{ packageCode: 'ESSENTIAL' }], activeProviderOfferingCount: 4 });
  });

  const createDto = (resultType: HealthCheckClinicalResultType, unit?: string | null): any => ({ code: 'NEW_SERVICE', name: 'New service', category: 'SERVICE', resultType, unit, displayOrder: 0, isActive: true });

  it('creates NONE result content without a unit and persists null', async () => {
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.NONE), actor)).resolves.toMatchObject({ code: 'NEW_SERVICE', resultType: HealthCheckClinicalResultType.NONE, unit: null });
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ operation: 'CLINICAL_CONTENT_CREATED' }));
  });


  it('rejects NONE result content with a non-empty unit', async () => {
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.NONE, 'mg/dL'), actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates SINGLE_NUMERIC content with its supplied unit', async () => {
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.SINGLE_NUMERIC, 'mg/dL'), actor)).resolves.toMatchObject({ resultType: HealthCheckClinicalResultType.SINGLE_NUMERIC, unit: 'mg/dL' });
  });

  it('trims a SINGLE_NUMERIC unit before persistence', async () => {
    await subject.createContent(createDto(HealthCheckClinicalResultType.SINGLE_NUMERIC, '  mmol/L  '), actor);
    expect(contents.save).toHaveBeenCalledWith(expect.objectContaining({ unit: 'mmol/L' }));
  });

  it.each([undefined, null, '', '   '])('rejects SINGLE_NUMERIC with missing or blank unit: %p', async (unit) => {
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.SINGLE_NUMERIC, unit), actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates BLOOD_PRESSURE content with its supplied unit', async () => {
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.BLOOD_PRESSURE, 'mmHg'), actor)).resolves.toMatchObject({ resultType: HealthCheckClinicalResultType.BLOOD_PRESSURE, unit: 'mmHg' });
  });

  it.each([undefined, null, '', '   '])('rejects BLOOD_PRESSURE with missing or blank unit: %p', async (unit) => {
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.BLOOD_PRESSURE, unit), actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects duplicate canonical content codes', async () => {
    contents.exists.mockResolvedValue(true);
    await expect(subject.createContent(createDto(HealthCheckClinicalResultType.NONE), actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates safe content metadata and keeps resultType, unit, and code immutable', async () => {
    await subject.updateContent(content().reference, { name: 'Updated', category: 'SERVICE', displayOrder: 9 }, actor);
    expect(contents.save).toHaveBeenCalledWith(expect.objectContaining({ code: 'CLINICIAN_REVIEW', resultType: HealthCheckClinicalResultType.NONE, unit: null, name: 'Updated' }));
  });

  it('deactivates canonical content without deleting provider configuration', async () => {
    await subject.setContentActive(content().reference, false, actor);
    expect(contents.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }));
    expect(providerAddons.save).not.toHaveBeenCalled(); expect(providerAddons.update).not.toHaveBeenCalled();
  });

  it('adds included content but rejects duplicate and active optional eligibility conflicts', async () => {
    await subject.addIncludedContent('ESSENTIAL', { clinicalContentReference: content().reference, sortOrder: 7 }, actor);
    expect(compositions.save).toHaveBeenCalledWith(expect.objectContaining({ sortOrder: 7, isActive: true }));
    compositions.exists.mockResolvedValue(true); await expect(subject.addIncludedContent('ESSENTIAL', { clinicalContentReference: content().reference }, actor)).rejects.toBeInstanceOf(ConflictException);
    compositions.exists.mockResolvedValue(false); addons.exists.mockResolvedValue(true); await expect(subject.addIncludedContent('ESSENTIAL', { clinicalContentReference: content().reference }, actor)).rejects.toBeInstanceOf(ConflictException);
  });

  it('deactivates and safely reactivates composition relationships', async () => {
    const link: any = { healthCheckPackageId: pkg.id, clinicalContentId: content().id, sortOrder: 1, isActive: true }; compositions.findOne.mockResolvedValue(link);
    await subject.setIncludedContentActive('ESSENTIAL', content().reference, false, actor); expect(link.isActive).toBe(false);
    await subject.setIncludedContentActive('ESSENTIAL', content().reference, true, actor); expect(link.isActive).toBe(true);
  });

  it('requires complete, unique, deterministic reorder input and locks composition rows', async () => {
    const a = content({ reference: 'SC-HCC-AAAAAAAAAAAAAAAA', code: 'A' }); const b = content({ id: '4', reference: 'SC-HCC-BBBBBBBBBBBBBBBB', code: 'B' });
    const links: any[] = [{ id: 'a', sortOrder: 0, clinicalContent: a }, { id: 'b', sortOrder: 1, clinicalContent: b }]; const builder = lockBuilder(null); builder.getMany.mockResolvedValue(links); builder.update = jest.fn().mockReturnThis(); builder.set = jest.fn().mockReturnThis(); builder.execute = jest.fn().mockResolvedValue({}); compositions.createQueryBuilder.mockReturnValue(builder);
    await subject.reorderIncludedContents('ESSENTIAL', { items: [{ clinicalContentReference: b.reference, sortOrder: 0 }, { clinicalContentReference: a.reference, sortOrder: 1 }] }, actor);
    expect(builder.setLock).toHaveBeenCalledWith('pessimistic_write'); expect(compositions.update).toHaveBeenCalledTimes(2);
    await expect(subject.reorderIncludedContents('ESSENTIAL', { items: [{ clinicalContentReference: a.reference, sortOrder: 0 }, { clinicalContentReference: a.reference, sortOrder: 1 }] }, actor)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds optional eligibility, rejects included conflicts, and preserves provider prices when disabled', async () => {
    await subject.addOptionalAddon('ESSENTIAL', { clinicalContentReference: content().reference }, actor); expect(addons.save).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
    const link: any = { healthCheckPackageId: pkg.id, clinicalContentId: content().id, isActive: true }; addons.findOne.mockResolvedValue(link);
    await subject.setOptionalAddonActive('ESSENTIAL', content().reference, false, actor); expect(link.isActive).toBe(false); expect(providerAddons.save).not.toHaveBeenCalled();
    compositions.exists.mockResolvedValue(true); await expect(subject.setOptionalAddonActive('ESSENTIAL', content().reference, true, actor)).rejects.toBeInstanceOf(ConflictException);
  });
});
