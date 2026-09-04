import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, ILike, Repository } from 'typeorm';
import { ProviderServiceAddon } from '../providers/entities/provider-service-addon.entity';
import { AddPackageAddonDto, AddPackageContentDto, AdminClinicalContentQueryDto, CreateAdminClinicalContentDto, CreateAdminHealthCheckPackageDto, ReorderPackageContentsDto, UpdateAdminClinicalContentDto, UpdateAdminHealthCheckPackageDto } from './dto/admin-health-check-catalogue.dto';
import { HealthCheckCatalogueHistory } from './entities/health-check-catalogue-history.entity';
import { HealthCheckClinicalContent } from './entities/health-check-clinical-content.entity';
import { HealthCheckPackageAddon } from './entities/health-check-package-addon.entity';
import { HealthCheckPackageContent } from './entities/health-check-package-content.entity';
import { HealthCheckPackage } from './entities/health-check-package.entity';
import { HealthCheckClinicalResultType } from './enums/health-check-clinical-result-type.enum';

@Injectable()
export class AdminHealthCheckCatalogueService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(HealthCheckPackage) private readonly packages: Repository<HealthCheckPackage>,
    @InjectRepository(HealthCheckClinicalContent) private readonly contents: Repository<HealthCheckClinicalContent>,
    @InjectRepository(HealthCheckPackageContent) private readonly compositions: Repository<HealthCheckPackageContent>,
    @InjectRepository(HealthCheckPackageAddon) private readonly addonEligibility: Repository<HealthCheckPackageAddon>,
    @InjectRepository(ProviderServiceAddon) private readonly providerAddons: Repository<ProviderServiceAddon>,
  ) {}

  async listPackages() {
    const rows = await this.packages.find({ relations: { contents: true, addonAvailability: true }, order: { code: 'ASC' } });
    return rows.map((row) => ({ ...this.packageMetadata(row), includedContentCount: row.contents?.length ?? 0, optionalAddonCount: row.addonAvailability?.length ?? 0 }));
  }

  async createPackage(dto: CreateAdminHealthCheckPackageDto, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(HealthCheckPackage);
      const normalizedCode = this.packageCode(dto.code);
      if (await repo.exists({ where: { code: normalizedCode } })) throw new ConflictException('Health Check package code already exists');
      const row = repo.create({ code: normalizedCode, name: dto.name.trim(), description: dto.description?.trim() || null, benefits: (dto.benefits ?? []).map((value) => value.trim()).filter(Boolean), estimatedDurationMinutes: dto.estimatedDurationMinutes ?? null, isActive: false });
      try { await repo.save(row); } catch (error) { this.rethrowPackageUnique(error); }
      await this.audit(manager, actorUserId, 'PACKAGE_CREATED', row.id, null, null, this.packageMetadata(row));
      return this.packageDetailFromManager(manager, row.id);
    });
  }

  async packageDetail(code: string) {
    const row = await this.packages.findOne({ where: { code: this.packageCode(code) }, relations: { contents: { clinicalContent: true }, addonAvailability: { clinicalContent: true } } });
    if (!row) throw new NotFoundException('Health Check package not found');
    return this.mapPackageDetail(row);
  }

  async updatePackage(code: string, dto: UpdateAdminHealthCheckPackageDto, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPackage(manager, code);
      const previous = this.packageMetadata(row);
      if (dto.name !== undefined) row.name = dto.name;
      if (dto.description !== undefined) row.description = dto.description || null;
      if (dto.benefits !== undefined) row.benefits = dto.benefits.map((value) => value.trim()).filter(Boolean);
      if (dto.estimatedDurationMinutes !== undefined) row.estimatedDurationMinutes = dto.estimatedDurationMinutes;
      await manager.getRepository(HealthCheckPackage).save(row);
      await this.audit(manager, actorUserId, 'PACKAGE_METADATA_UPDATED', row.id, null, previous, this.packageMetadata(row));
      return this.packageDetailFromManager(manager, row.id);
    });
  }

  async setPackageActive(code: string, isActive: boolean, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockPackage(manager, code);
      if (row.isActive !== isActive) {
        const previous = { isActive: row.isActive };
        row.isActive = isActive;
        await manager.getRepository(HealthCheckPackage).save(row);
        await this.audit(manager, actorUserId, isActive ? 'PACKAGE_ACTIVATED' : 'PACKAGE_DEACTIVATED', row.id, null, previous, { isActive });
      }
      return this.packageDetailFromManager(manager, row.id);
    });
  }

  async listContents(query: AdminClinicalContentQueryDto) {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.category) where.category = query.category;
    if (query.resultType) where.resultType = query.resultType;
    const search = query.search?.trim();
    const [items, total] = await this.contents.findAndCount({
      where: search ? [{ ...where, code: ILike(`%${search}%`) }, { ...where, name: ILike(`%${search}%`) }] : where,
      order: { displayOrder: 'ASC', code: 'ASC' }, skip: (query.page - 1) * query.limit, take: query.limit,
    });
    return { items: items.map((row) => this.contentProjection(row)), page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) };
  }

  async contentDetail(reference: string) {
    const row = await this.contents.findOne({ where: { reference }, relations: { packageContents: { healthCheckPackage: true }, packageAddonEligibility: { healthCheckPackage: true } } });
    if (!row) throw new NotFoundException('Health Check clinical content not found');
    const activeProviderOfferingCount = await this.providerAddons.count({ where: { clinicalContentId: row.id, isActive: true } });
    return {
      ...this.contentProjection(row),
      includedInPackages: (row.packageContents ?? []).sort((a, b) => a.healthCheckPackage.code.localeCompare(b.healthCheckPackage.code)).map((link) => ({ packageCode: link.healthCheckPackage.code, packageName: link.healthCheckPackage.name, sortOrder: link.sortOrder, isActive: link.isActive })),
      optionalForPackages: (row.packageAddonEligibility ?? []).sort((a, b) => a.healthCheckPackage.code.localeCompare(b.healthCheckPackage.code)).map((link) => ({ packageCode: link.healthCheckPackage.code, packageName: link.healthCheckPackage.name, isActive: link.isActive })),
      activeProviderOfferingCount,
    };
  }

  async createContent(dto: CreateAdminClinicalContentDto, actorUserId: string) {
    const normalizedUnit = dto.unit?.trim() || null;
    if (dto.resultType === HealthCheckClinicalResultType.NONE && normalizedUnit !== null) throw new BadRequestException('unit must be omitted for non-result-bearing clinical content');
    if (dto.resultType !== HealthCheckClinicalResultType.NONE && normalizedUnit === null) throw new BadRequestException('unit is required for result-bearing clinical content');
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(HealthCheckClinicalContent);
      const normalizedCode = dto.code.trim().toUpperCase();
      if (await repo.exists({ where: { code: normalizedCode } })) throw new ConflictException('Health Check clinical content code already exists');
      const row = repo.create({ code: normalizedCode, name: dto.name.trim(), description: dto.description?.trim() || null, category: dto.category.trim(), resultType: dto.resultType, unit: normalizedUnit, displayOrder: dto.displayOrder ?? 0, isActive: dto.isActive ?? true });
      try { await repo.save(row); } catch (error) { this.rethrowUnique(error); }
      await this.audit(manager, actorUserId, 'CLINICAL_CONTENT_CREATED', null, row.id, null, this.contentProjection(row));
      return this.contentProjection(row);
    });
  }

  async updateContent(reference: string, dto: UpdateAdminClinicalContentDto, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockContent(manager, reference);
      const previous = this.contentProjection(row);
      if (dto.name !== undefined) row.name = dto.name;
      if (dto.description !== undefined) row.description = dto.description || null;
      if (dto.category !== undefined) row.category = dto.category;
      if (dto.displayOrder !== undefined) row.displayOrder = dto.displayOrder;
      await manager.getRepository(HealthCheckClinicalContent).save(row);
      await this.audit(manager, actorUserId, 'CLINICAL_CONTENT_METADATA_UPDATED', null, row.id, previous, this.contentProjection(row));
      return this.contentProjection(row);
    });
  }

  async setContentActive(reference: string, isActive: boolean, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const row = await this.lockContent(manager, reference);
      if (row.isActive !== isActive) {
        const previous = { isActive: row.isActive };
        row.isActive = isActive;
        await manager.getRepository(HealthCheckClinicalContent).save(row);
        await this.audit(manager, actorUserId, isActive ? 'CLINICAL_CONTENT_ACTIVATED' : 'CLINICAL_CONTENT_DEACTIVATED', null, row.id, previous, { isActive });
      }
      return this.contentProjection(row);
    });
  }

  async addIncludedContent(code: string, dto: AddPackageContentDto, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const pkg = await this.lockPackage(manager, code); const content = await this.requireActiveContent(manager, dto.clinicalContentReference);
      const repo = manager.getRepository(HealthCheckPackageContent); const addonRepo = manager.getRepository(HealthCheckPackageAddon);
      if (await repo.exists({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id } })) throw new ConflictException('Clinical content already belongs to this package composition');
      if (await addonRepo.exists({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id, isActive: true } })) throw new ConflictException('Clinical content is already an active optional add-on for this package');
      const existing = await repo.find({ where: { healthCheckPackageId: pkg.id }, order: { sortOrder: 'DESC' }, take: 1 });
      const sortOrder = dto.sortOrder ?? ((existing[0]?.sortOrder ?? -1) + 1);
      if (await repo.exists({ where: { healthCheckPackageId: pkg.id, sortOrder } })) throw new ConflictException('Package content sort order is already in use');
      const link = repo.create({ healthCheckPackageId: pkg.id, clinicalContentId: content.id, sortOrder, isActive: true });
      await repo.save(link); await this.audit(manager, actorUserId, 'PACKAGE_CONTENT_ADDED', pkg.id, content.id, null, { sortOrder, isActive: true });
      return this.packageDetailFromManager(manager, pkg.id);
    });
  }

  async setIncludedContentActive(code: string, reference: string, isActive: boolean, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const pkg = await this.lockPackage(manager, code); const content = await this.lockContent(manager, reference);
      const repo = manager.getRepository(HealthCheckPackageContent); const link = await repo.findOne({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id } });
      if (!link) throw new NotFoundException('Package content relationship not found');
      if (isActive && !content.isActive) throw new ConflictException('Inactive clinical content cannot be activated in a package');
      if (isActive && await manager.getRepository(HealthCheckPackageAddon).exists({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id, isActive: true } })) throw new ConflictException('Clinical content is already an active optional add-on for this package');
      if (link.isActive !== isActive) { const previous = { isActive: link.isActive, sortOrder: link.sortOrder }; link.isActive = isActive; await repo.save(link); await this.audit(manager, actorUserId, isActive ? 'PACKAGE_CONTENT_ACTIVATED' : 'PACKAGE_CONTENT_DEACTIVATED', pkg.id, content.id, previous, { isActive, sortOrder: link.sortOrder }); }
      return this.packageDetailFromManager(manager, pkg.id);
    });
  }

  async reorderIncludedContents(code: string, dto: ReorderPackageContentsDto, actorUserId: string) {
    if (!dto.items.length) throw new BadRequestException('At least one package content is required');
    const references = dto.items.map((item) => item.clinicalContentReference);
    if (new Set(references).size !== references.length || new Set(dto.items.map((item) => item.sortOrder)).size !== dto.items.length) throw new BadRequestException('Clinical content references and sort positions must be unique');
    return this.dataSource.transaction(async (manager) => {
      const pkg = await this.lockPackage(manager, code); const repo = manager.getRepository(HealthCheckPackageContent);
      const links = await repo.createQueryBuilder('composition').innerJoinAndSelect('composition.clinicalContent', 'content').where('composition.healthCheckPackageId = :packageId', { packageId: pkg.id }).setLock('pessimistic_write').getMany();
      if (links.length !== dto.items.length || links.some((link) => !references.includes(link.clinicalContent.reference))) throw new BadRequestException('Reorder must contain every package composition entry exactly once');
      const previous = links.map((link) => ({ clinicalContentReference: link.clinicalContent.reference, sortOrder: link.sortOrder }));
      await repo.createQueryBuilder().update(HealthCheckPackageContent).set({ sortOrder: () => '-"sort_order" - 1' }).where('health_check_package_id = :packageId', { packageId: pkg.id }).execute();
      const order = new Map(dto.items.map((item) => [item.clinicalContentReference, item.sortOrder]));
      for (const link of links) await repo.update({ id: link.id }, { sortOrder: order.get(link.clinicalContent.reference)! });
      await this.audit(manager, actorUserId, 'PACKAGE_CONTENT_REORDERED', pkg.id, null, { items: previous }, { items: dto.items });
      return this.packageDetailFromManager(manager, pkg.id);
    });
  }

  async addOptionalAddon(code: string, dto: AddPackageAddonDto, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const pkg = await this.lockPackage(manager, code); const content = await this.requireActiveContent(manager, dto.clinicalContentReference);
      const repo = manager.getRepository(HealthCheckPackageAddon);
      if (await repo.exists({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id } })) throw new ConflictException('Optional add-on eligibility already exists for this package');
      if (await manager.getRepository(HealthCheckPackageContent).exists({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id, isActive: true } })) throw new ConflictException('Included package content cannot also be an active optional add-on');
      const link = repo.create({ healthCheckPackageId: pkg.id, clinicalContentId: content.id, isActive: true }); await repo.save(link);
      await this.audit(manager, actorUserId, 'PACKAGE_ADDON_ELIGIBILITY_ADDED', pkg.id, content.id, null, { isActive: true });
      return this.packageDetailFromManager(manager, pkg.id);
    });
  }

  async setOptionalAddonActive(code: string, reference: string, isActive: boolean, actorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const pkg = await this.lockPackage(manager, code); const content = await this.lockContent(manager, reference);
      const repo = manager.getRepository(HealthCheckPackageAddon); const link = await repo.findOne({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id } });
      if (!link) throw new NotFoundException('Package optional add-on eligibility not found');
      if (isActive && !content.isActive) throw new ConflictException('Inactive clinical content cannot become an optional add-on');
      if (isActive && await manager.getRepository(HealthCheckPackageContent).exists({ where: { healthCheckPackageId: pkg.id, clinicalContentId: content.id, isActive: true } })) throw new ConflictException('Included package content cannot also be an active optional add-on');
      if (link.isActive !== isActive) { const previous = { isActive: link.isActive }; link.isActive = isActive; await repo.save(link); await this.audit(manager, actorUserId, isActive ? 'PACKAGE_ADDON_ELIGIBILITY_ACTIVATED' : 'PACKAGE_ADDON_ELIGIBILITY_DEACTIVATED', pkg.id, content.id, previous, { isActive }); }
      return this.packageDetailFromManager(manager, pkg.id);
    });
  }

  private async lockPackage(manager: EntityManager, code: string) { const row = await manager.getRepository(HealthCheckPackage).createQueryBuilder('package').where('package.code = :code', { code: this.packageCode(code) }).setLock('pessimistic_write').getOne(); if (!row) throw new NotFoundException('Health Check package not found'); return row; }
  private async lockContent(manager: EntityManager, reference: string) { const row = await manager.getRepository(HealthCheckClinicalContent).createQueryBuilder('content').where('content.reference = :reference', { reference }).setLock('pessimistic_write').getOne(); if (!row) throw new NotFoundException('Health Check clinical content not found'); return row; }
  private async requireActiveContent(manager: EntityManager, reference: string) { const row = await this.lockContent(manager, reference); if (!row.isActive) throw new ConflictException('Inactive clinical content cannot be newly configured'); return row; }
  private packageCode(code: string) { return code.trim().toUpperCase(); }
  private packageMetadata(row: HealthCheckPackage) { return { code: row.code, name: row.name, description: row.description, benefits: row.benefits, estimatedDurationMinutes: row.estimatedDurationMinutes, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt }; }
  private contentProjection(row: HealthCheckClinicalContent) { return { reference: row.reference, code: row.code, name: row.name, description: row.description, category: row.category, resultType: row.resultType, unit: row.unit, displayOrder: row.displayOrder, isActive: row.isActive, createdAt: row.createdAt, updatedAt: row.updatedAt }; }
  private mapPackageDetail(row: HealthCheckPackage) { return { ...this.packageMetadata(row), includedContents: (row.contents ?? []).sort((a, b) => a.sortOrder - b.sortOrder || a.clinicalContent.code.localeCompare(b.clinicalContent.code)).map((link) => ({ ...this.contentProjection(link.clinicalContent), sortOrder: link.sortOrder, compositionActive: link.isActive, canonicalContentActive: link.clinicalContent.isActive })), optionalAddons: (row.addonAvailability ?? []).sort((a, b) => a.clinicalContent.displayOrder - b.clinicalContent.displayOrder || a.clinicalContent.code.localeCompare(b.clinicalContent.code)).map((link) => ({ ...this.contentProjection(link.clinicalContent), eligibilityActive: link.isActive, canonicalContentActive: link.clinicalContent.isActive })) }; }
  private async packageDetailFromManager(manager: EntityManager, id: string) { const row = await manager.getRepository(HealthCheckPackage).findOne({ where: { id }, relations: { contents: { clinicalContent: true }, addonAvailability: { clinicalContent: true } } }); if (!row) throw new NotFoundException('Health Check package not found'); return this.mapPackageDetail(row); }
  private async audit(manager: EntityManager, actorUserId: string, operation: string, healthCheckPackageId: string | null, clinicalContentId: string | null, previousState: Record<string, unknown> | null, resultingState: Record<string, unknown>) { const repo = manager.getRepository(HealthCheckCatalogueHistory); await repo.save(repo.create({ actorUserId, operation, healthCheckPackageId, clinicalContentId, previousState, resultingState })); }
  private rethrowUnique(error: unknown): never { if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === '23505') throw new ConflictException('Health Check clinical content code already exists'); throw error; }
  private rethrowPackageUnique(error: unknown): never { if (typeof error === 'object' && error && 'code' in error && (error as { code: string }).code === '23505') throw new ConflictException('Health Check package code already exists'); throw error; }
}
