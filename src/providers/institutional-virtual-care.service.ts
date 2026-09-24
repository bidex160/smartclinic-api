import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Provider } from './entities/provider.entity';
import { ProviderPracticeAffiliation } from './entities/provider-practice-affiliation.entity';
import { ProviderType } from './enums/provider-type.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { CareDeliveryMode } from './enums/care-delivery-mode.enum';

@Injectable()
export class InstitutionalVirtualCareService {
 constructor(@InjectRepository(Provider) private readonly providers:Repository<Provider>,@InjectRepository(ProviderPracticeAffiliation) private readonly affiliations:Repository<ProviderPracticeAffiliation>){}
 async institutions(q?:string){
  const b=this.providers.createQueryBuilder('p').leftJoinAndSelect('p.locations','location','location.isActive=true').leftJoinAndSelect('p.careServices','service','service.isActive=true').leftJoinAndSelect('service.definition','definition','definition.isActive=true').leftJoinAndSelect('service.deliveryOptions','option','option.deliveryMode=:virtual',{virtual:CareDeliveryMode.VIRTUAL}).where('p.status=:active',{active:ProviderStatus.ACTIVE}).andWhere('p.onboardingStatus=:approved',{approved:ProviderOnboardingStatus.APPROVED}).andWhere('p.deletedAt IS NULL').andWhere('p.providerType IN (:...types)',{types:[ProviderType.HOSPITAL,ProviderType.CLINIC]});
  if(q?.trim())b.andWhere('p.displayName ILIKE :q',{q:`%${q.trim()}%`});
  const rows=await b.orderBy('p.isPlatformDefault','DESC').addOrderBy('p.platformDefaultPriority','ASC','NULLS LAST').addOrderBy('p.displayName','ASC').getMany();
  return rows.map(p=>this.mapInstitution(p));
 }
 async detail(reference:string){
  const p=await this.providers.createQueryBuilder('p').leftJoinAndSelect('p.locations','location','location.isActive=true').leftJoinAndSelect('p.careServices','service','service.isActive=true').leftJoinAndSelect('service.definition','definition','definition.isActive=true').leftJoinAndSelect('service.deliveryOptions','option').where('p.providerReference=:reference',{reference}).andWhere('p.status=:active',{active:ProviderStatus.ACTIVE}).andWhere('p.onboardingStatus=:approved',{approved:ProviderOnboardingStatus.APPROVED}).andWhere('p.providerType IN (:...types)',{types:[ProviderType.HOSPITAL,ProviderType.CLINIC]}).getOne();
  if(!p)throw new NotFoundException('Hospital or clinic was not found');
  const aff=await this.affiliations.find({where:{hostProviderId:p.id,isActive:true,allowsVirtualCare:true},relations:{doctorProvider:true},order:{isDefault:'DESC',createdAt:'ASC'}});
  return{...this.mapInstitution(p),virtualDoctors:aff.filter(a=>a.doctorProvider?.status===ProviderStatus.ACTIVE&&a.doctorProvider?.onboardingStatus===ProviderOnboardingStatus.APPROVED).map(a=>({providerReference:a.doctorProvider.providerReference,displayName:a.doctorProvider.displayName,isDefault:a.isDefault,priceMinor:a.virtualCarePriceMinor==null?null:Number(a.virtualCarePriceMinor),currency:a.virtualCareCurrency}))};
 }
 private mapInstitution(p:Provider){
  const services=(p.careServices??[]).filter(s=>s.isActive&&s.definition?.isActive).map(s=>({code:s.definition.code,name:s.definition.name,description:s.descriptionOverride??s.definition.description,deliveryOptions:(s.deliveryOptions??[]).map(o=>({deliveryMode:o.deliveryMode,priceMinor:Number(o.priceMinor),currency:o.currency}))}));
  return{providerReference:p.providerReference,displayName:p.displayName,providerType:p.providerType,location:{city:p.city,stateOrRegion:p.stateOrRegion,countryCode:p.countryCode},locations:(p.locations??[]).filter(l=>l.isActive).map(l=>({locationReference:l.locationReference,name:l.name,addressLine1:l.addressLine1,addressLine2:l.addressLine2,city:l.city,stateOrRegion:l.state,postalCode:l.postalCode,countryCode:l.countryCode})),capabilities:{virtual:services.some(s=>s.deliveryOptions.some(o=>o.deliveryMode===CareDeliveryMode.VIRTUAL)),inPerson:services.some(s=>s.deliveryOptions.some(o=>o.deliveryMode===CareDeliveryMode.IN_PERSON)),homeVisit:services.some(s=>s.deliveryOptions.some(o=>o.deliveryMode===CareDeliveryMode.HOME_VISIT))},services};
 }
}