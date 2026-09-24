import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CreateServiceCatalogueItemDto, ServiceCatalogueQueryDto, UpdateServiceCatalogueItemDto } from './dto/service-catalogue.dto';
import { SmartClinicServiceCatalogueItem, SmartClinicCatalogueCategory } from './entities/smartclinic-service-catalogue-item.entity';
import { ProviderCatalogueOffering } from './entities/provider-catalogue-offering.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { ProviderServiceUnit } from '../provider-service-units/entities/provider-service-unit.entity';
import { ProviderServiceUnitType } from '../provider-service-units/enums/provider-service-unit-type.enum';
import { ProviderServiceUnitStatus } from '../provider-service-units/enums/provider-service-unit-status.enum';
import { User } from '../users/entities/user.entity';
import { ConflictException } from '@nestjs/common';

@Injectable()
export class SmartClinicServiceCatalogueService {
  constructor(@InjectRepository(SmartClinicServiceCatalogueItem) private readonly repo: Repository<SmartClinicServiceCatalogueItem>, private readonly currentProvider: CurrentProviderService) {}

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
      groupName: dto.groupName?.trim() || null,
      subcategory: dto.subcategory?.trim() || null,
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
    if (dto.groupName !== undefined) row.groupName = dto.groupName?.trim() || null;
    if (dto.subcategory !== undefined) row.subcategory = dto.subcategory?.trim() || null;
    if (dto.averageCostMinor !== undefined) row.averageCostMinor = String(dto.averageCostMinor);
    if (dto.markupBps !== undefined) row.markupBps = dto.markupBps;
    if (dto.currency !== undefined) row.currency = dto.currency.toUpperCase();
    if (dto.requiresPrescription !== undefined) row.requiresPrescription = dto.requiresPrescription;
    if (dto.patientVisible !== undefined) row.patientVisible = dto.patientVisible;
    if (dto.isActive !== undefined) row.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) row.sortOrder = dto.sortOrder;
    return this.view(await this.repo.save(row));
  }

  async providerOfferings(user: User, category?: SmartClinicCatalogueCategory) {
    const provider=await this.currentProvider.resolveOperational(user);
    const b=this.repo.createQueryBuilder('item')
      .leftJoinAndMapOne('item.providerOffering',ProviderCatalogueOffering,'offering','offering.catalogueItemId=item.id AND offering.providerId=:providerId',{providerId:provider.id})
      .leftJoinAndMapOne('offering.providerServiceUnit',ProviderServiceUnit,'unit','unit.id=offering.providerServiceUnitId')
      .where('item.isActive=true');
    if(category)b.andWhere('item.category=:category',{category});
    const rows:any[]=await b.orderBy('item.groupName','ASC','NULLS LAST').addOrderBy('item.sortOrder','ASC').getMany();
    return rows.map((row:any)=>({...this.view(row),selected:Boolean(row.providerOffering?.isActive),providerPriceMinor:row.providerOffering?.priceOverrideMinor===null||row.providerOffering?.priceOverrideMinor===undefined?null:Number(row.providerOffering.priceOverrideMinor),providerServiceUnitReference:row.providerOffering?.providerServiceUnit?.reference??null}));
  }

  async setProviderOffering(user:User,code:string,body:{selected:boolean;providerServiceUnitReference?:string;priceOverrideMinor?:number|null}) {
    const provider=await this.currentProvider.resolveOperational(user);
    const item=await this.repo.findOne({where:{code:code.toUpperCase(),isActive:true}});
    if(!item)throw new NotFoundException('Catalogue item was not found');
    const expected=item.category===SmartClinicCatalogueCategory.LAB_TEST?ProviderServiceUnitType.LABORATORY:ProviderServiceUnitType.PHARMACY;
    let unit:ProviderServiceUnit|null=null;
    if(body.providerServiceUnitReference) unit=await this.repo.manager.getRepository(ProviderServiceUnit).findOne({where:{reference:body.providerServiceUnitReference,providerId:provider.id,type:expected,status:ProviderServiceUnitStatus.ACTIVE}});
    else unit=await this.repo.manager.getRepository(ProviderServiceUnit).findOne({where:{providerId:provider.id,type:expected,status:ProviderServiceUnitStatus.ACTIVE},order:{createdAt:'ASC'}});
    if(body.selected&&!unit)throw new ConflictException(`Create an active ${expected.toLowerCase()} service unit before selecting catalogue items`);
    const offerings=this.repo.manager.getRepository(ProviderCatalogueOffering);
    let row=await offerings.findOne({where:{providerId:provider.id,catalogueItemId:item.id}});
    if(!row){if(!unit)return {...this.view(item),selected:false};row=offerings.create({providerId:provider.id,providerServiceUnitId:unit.id,catalogueItemId:item.id,isActive:body.selected,priceOverrideMinor:body.priceOverrideMinor==null?null:String(body.priceOverrideMinor)});}
    else {if(unit)row.providerServiceUnitId=unit.id;row.isActive=body.selected;if(body.priceOverrideMinor!==undefined)row.priceOverrideMinor=body.priceOverrideMinor==null?null:String(body.priceOverrideMinor);}
    await offerings.save(row);return {...this.view(item),selected:row.isActive,providerPriceMinor:row.priceOverrideMinor==null?null:Number(row.priceOverrideMinor),providerServiceUnitReference:unit?.reference??body.providerServiceUnitReference??null};
  }

  async patientProviders(code:string) {
    const item=await this.repo.findOne({where:{code:code.toUpperCase(),isActive:true,patientVisible:true}});
    if(!item)throw new NotFoundException('Catalogue item was not found');
    const standard=this.view(item).standardPriceMinor;
    const rows=await this.repo.manager.getRepository(ProviderCatalogueOffering).createQueryBuilder('offering')
      .innerJoinAndSelect('offering.provider','provider')
      .innerJoinAndSelect('offering.providerServiceUnit','unit')
      .leftJoinAndSelect('unit.providerLocation','location')
      .where('offering.catalogueItemId=:itemId AND offering.isActive=true',{itemId:item.id})
      .andWhere('unit.status=:active',{active:ProviderServiceUnitStatus.ACTIVE})
      .andWhere("provider.status='ACTIVE' AND provider.onboardingStatus='APPROVED' AND provider.deletedAt IS NULL")
      .orderBy('provider.isPlatformDefault','DESC').addOrderBy('provider.platformDefaultPriority','ASC','NULLS LAST').addOrderBy('provider.displayName','ASC').getMany();
    return rows.map(r=>({providerReference:r.provider.providerReference,displayName:r.provider.displayName,providerServiceUnitReference:r.providerServiceUnit.reference,serviceUnitName:r.providerServiceUnit.name,priceMinor:r.priceOverrideMinor==null?standard:Number(r.priceOverrideMinor),usesStandardPrice:r.priceOverrideMinor==null,currency:item.currency,location:r.providerServiceUnit.providerLocation?{city:r.providerServiceUnit.providerLocation.city,stateOrRegion:r.providerServiceUnit.providerLocation.state,countryCode:r.providerServiceUnit.providerLocation.countryCode}:null}));
  }

  private view(row: SmartClinicServiceCatalogueItem) {
    const averageCostMinor = Number(row.averageCostMinor);
    const standardPriceMinor = Math.ceil(averageCostMinor * (10000 + row.markupBps) / 10000);
    return {
      code: row.code, category: row.category, name: row.name, description: row.description, groupName: row.groupName, subcategory: row.subcategory,
      unitLabel: row.unitLabel, averageCostMinor, markupBps: row.markupBps, standardPriceMinor,
      currency: row.currency, requiresPrescription: row.requiresPrescription,
      patientVisible: row.patientVisible, isActive: row.isActive, sortOrder: row.sortOrder,
    };
  }
}
