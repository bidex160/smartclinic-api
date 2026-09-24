import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateServiceCatalogueItemDto, ServiceCatalogueQueryDto, UpdateServiceCatalogueItemDto } from './dto/service-catalogue.dto';
import { SmartClinicServiceCatalogueItem } from './entities/smartclinic-service-catalogue-item.entity';

@Injectable()
export class SmartClinicServiceCatalogueService {
  constructor(@InjectRepository(SmartClinicServiceCatalogueItem) private readonly repo: Repository<SmartClinicServiceCatalogueItem>) {}

  list(query: ServiceCatalogueQueryDto, patientOnly = false) {
    const b = this.repo.createQueryBuilder('item');
    if (query.category) b.andWhere('item.category = :category', { category: query.category });
    if (query.q?.trim()) b.andWhere(new Brackets(q => q.where('item.name ILIKE :q', { q: `%${query.q!.trim()}%` }).orWhere('item.code ILIKE :q', { q: `%${query.q!.trim()}%` })));
    if (patientOnly) b.andWhere('item.isActive = true').andWhere('item.patientVisible = true');
    return b.orderBy('item.category','ASC').addOrderBy('item.sortOrder','ASC').addOrderBy('item.name','ASC').getMany().then(rows => rows.map(x=>this.view(x)));
  }

  async create(dto: CreateServiceCatalogueItemDto) {
    const row = await this.repo.save(this.repo.create({
      ...dto,
      averageCostMinor: String(dto.averageCostMinor),
      description: dto.description?.trim() || null,
      unitLabel: dto.unitLabel?.trim() || null,
      currency: (dto.currency || 'NGN').toUpperCase(),
    }));
    return this.view(row);
  }

  async update(code: string, dto: UpdateServiceCatalogueItemDto) {
    const row = await this.repo.findOne({ where: { code: code.toUpperCase() } });
    if (!row) throw new NotFoundException('Catalogue item was not found');
    if (dto.category !== undefined) row.category = dto.category;
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) row.description = dto.description?.trim() || null;
    if (dto.unitLabel !== undefined) row.unitLabel = dto.unitLabel?.trim() || null;
    if (dto.averageCostMinor !== undefined) row.averageCostMinor = String(dto.averageCostMinor);
    if (dto.markupBps !== undefined) row.markupBps = dto.markupBps;
    if (dto.currency !== undefined) row.currency = dto.currency.toUpperCase();
    if (dto.requiresPrescription !== undefined) row.requiresPrescription = dto.requiresPrescription;
    if (dto.patientVisible !== undefined) row.patientVisible = dto.patientVisible;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    return this.view(await this.repo.save(row));
  }

  private view(row: SmartClinicServiceCatalogueItem) {
    const averageCostMinor = Number(row.averageCostMinor);
    const standardPriceMinor = Math.ceil(averageCostMinor * (10000 + row.markupBps) / 10000);
    return {
      code: row.code, category: row.category, name: row.name, description: row.description,
      unitLabel: row.unitLabel, averageCostMinor, markupBps: row.markupBps, standardPriceMinor,
      currency: row.currency, requiresPrescription: row.requiresPrescription,
      patientVisible: row.patientVisible, isActive: row.isActive, sortOrder: row.sortOrder,
    };
  }
}
