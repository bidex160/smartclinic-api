import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderService } from '../providers/entities/provider-service.entity';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { HealthCheckConfigurationQuoteDto } from './dto/health-check-configuration-quote.dto';
import { Patient } from '../patients/entities/patient.entity';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { User } from '../users/entities/user.entity';
import { HealthCheckConfigurationQuote } from './entities/health-check-configuration-quote.entity';
import { ProviderLocation } from '../providers/entities/provider-location.entity';
import { PatientAccessService } from '../patients/patient-access.service';
import { HealthCheckPackage } from './entities/health-check-package.entity';import { FulfilmentMode } from './entities/fulfilment-mode.entity';import { ProviderCapabilitiesService } from '../providers/provider-capabilities.service';import { deriveAppointmentEndTime } from '../providers/booking-availability-context';import { HealthCheckOfferingDiscoveryDto } from './dto/health-check-offering-discovery.dto';import { In } from 'typeorm';

@Injectable()
export class HealthCheckConfigurationService {
  constructor(@InjectRepository(ProviderService) private readonly services: Repository<ProviderService>, @InjectRepository(Patient) private readonly patients:Repository<Patient>,@InjectRepository(HealthCheckConfigurationQuote)private readonly quotes:Repository<HealthCheckConfigurationQuote>,@InjectRepository(ProviderLocation)private readonly locations:Repository<ProviderLocation>,@InjectRepository(HealthCheckPackage)private readonly packages:Repository<HealthCheckPackage>,@InjectRepository(FulfilmentMode)private readonly modes:Repository<FulfilmentMode>,private readonly capabilities:ProviderCapabilitiesService,private readonly patientAccess:PatientAccessService) {}

  async discover(dto:HealthCheckOfferingDiscoveryDto){
    const [pkg,mode]=await Promise.all([this.packages.findOne({where:{code:dto.packageCode,isActive:true}}),this.modes.findOne({where:{code:dto.fulfilmentModeCode,isActive:true}})]);
    if(!pkg||!mode)throw new NotFoundException('Health Check package or fulfilment mode not found');
    const end=deriveAppointmentEndTime(dto.preferredTime,pkg.estimatedDurationMinutes??0);if(!end)throw new BadRequestException('Health Check package duration is invalid');
    // Provider-location care is destination-based: the patient travels to the provider.
    // Do not incorrectly filter provider locations by the patient's current/home geography.
    // Home visits remain geography-bound because the provider must cover the patient's address.
    const visitAddress = mode.code === 'HOME_VISIT'
      ? {countryCode:dto.countryCode,stateOrRegion:dto.stateOrRegion,city:dto.city,postalCode:dto.postalCode??null,latitude:dto.latitude??null,longitude:dto.longitude??null}
      : null;
    const eligible=await this.capabilities.findEligibleProviders(pkg.id,mode.id,{requestedDate:dto.preferredDate,requestedStartTime:dto.preferredTime,requestedEndTime:end,requestedTimezone:dto.timezone,visitAddress});
    const ids=eligible.map(x=>x.id);if(!ids.length)return{items:[],page:dto.page,limit:dto.limit,total:0,totalPages:0};
    const rows=await this.services.find({where:{id:In(ids)},relations:{provider:true,healthCheckPackage:{contents:{clinicalContent:true},addonAvailability:{clinicalContent:true}},fulfilmentMode:true,locationLinks:{providerLocation:true},addons:{clinicalContent:true}}});
    const rank=new Map(ids.map((id,i)=>[id,i]));
    const projected=await Promise.all(rows.map(async s=>{
      let travelFeeMinor=0,travelDistanceKm:number|null=null;
      if(s.fulfilmentMode.code==='HOME_VISIT'){
        const areas=await this.services.manager.query(`SELECT travel_fee_minor,priority,origin_latitude,origin_longitude,max_radius_km FROM provider_service_areas WHERE provider_service_id=$1 AND is_active=true AND country_code=$2 AND LOWER(TRIM(state_or_region))=LOWER(TRIM($3)) AND (city IS NULL OR LOWER(TRIM(city))=LOWER(TRIM($4))) AND (postal_code IS NULL OR LOWER(TRIM(postal_code))=LOWER(TRIM($5))) ORDER BY priority ASC,travel_fee_minor ASC`,[s.id,dto.countryCode,dto.stateOrRegion,dto.city,dto.postalCode??'']);
        const matched=areas.map((a:any)=>{let distance:null|number=null;if(dto.latitude!=null&&dto.longitude!=null&&a.origin_latitude!=null&&a.origin_longitude!=null){const toRad=(v:number)=>v*Math.PI/180;const dLat=toRad(dto.latitude-Number(a.origin_latitude)),dLon=toRad(dto.longitude-Number(a.origin_longitude));const x=Math.sin(dLat/2)**2+Math.cos(toRad(Number(a.origin_latitude)))*Math.cos(toRad(dto.latitude))*Math.sin(dLon/2)**2;distance=6371*2*Math.asin(Math.sqrt(x));}return{...a,distance};}).find((a:any)=>a.max_radius_km==null||(a.distance!=null&&a.distance<=Number(a.max_radius_km)));
        if(matched){travelFeeMinor=Number(matched.travel_fee_minor??0);travelDistanceKm=matched.distance==null?null:Math.round(matched.distance*10)/10;}
      }
      return{providerReference:s.provider.providerReference,providerName:s.provider.displayName,packageCode:s.healthCheckPackage.code,basePackagePriceMinor:Number(s.priceMinor),currency:s.currency,travelFeeMinor,travelDistanceKm,fulfilmentMode:{code:s.fulfilmentMode.code,name:s.fulfilmentMode.name,fulfilmentFeeMinor:Number(s.fulfilmentFeeMinor??0)+travelFeeMinor},locations:s.fulfilmentMode.code==='PROVIDER_LOCATION'?(s.locationLinks??[]).filter(x=>x.providerLocation.isActive).map(x=>({reference:x.providerLocation.locationReference,name:x.providerLocation.name,addressLine1:x.providerLocation.addressLine1,addressLine2:x.providerLocation.addressLine2,city:x.providerLocation.city,stateOrRegion:x.providerLocation.state,postalCode:x.providerLocation.postalCode,countryCode:x.providerLocation.countryCode})):[],addons:(s.addons??[]).filter(x=>x.isActive&&x.clinicalContent.isActive&&x.currency===s.currency&&(s.healthCheckPackage.addonAvailability??[]).some(a=>a.isActive&&a.clinicalContentId===x.clinicalContentId)&&!(s.healthCheckPackage.contents??[]).some(c=>c.isActive&&c.clinicalContent.code===x.clinicalContent.code)).map(x=>({code:x.clinicalContent.code,name:x.clinicalContent.name,category:x.clinicalContent.category,priceMinor:Number(x.priceMinor),currency:x.currency}))};
    }));
    projected.sort((a,b)=>(rank.get(rows.find(s=>s.provider.providerReference===a.providerReference&&s.healthCheckPackage.code===a.packageCode)?.id??'')??9999)-(rank.get(rows.find(s=>s.provider.providerReference===b.providerReference&&s.healthCheckPackage.code===b.packageCode)?.id??'')??9999)||a.travelFeeMinor-b.travelFeeMinor);
    const start=(dto.page-1)*dto.limit;return{items:projected.slice(start,start+dto.limit),page:dto.page,limit:dto.limit,total:projected.length,totalPages:Math.ceil(projected.length/dto.limit)};
  }

  async quote(user:User,dto: HealthCheckConfigurationQuoteDto) {
    const patient=dto.participantPatientReference?await this.patientAccess.resolveAccessiblePatient(user.id,dto.participantPatientReference):await this.patients.findOne({where:{userId:user.id,status:PatientStatus.ACTIVE}});if(!patient||patient.deletedAt)throw new NotFoundException('Patient profile not found');
    if (dto.addonCodes.includes('HOME_VISIT')) throw new BadRequestException('HOME_VISIT is a fulfilment mode, not a clinical add-on');
    const service = await this.services.createQueryBuilder('service')
      .innerJoinAndSelect('service.provider', 'provider')
      .innerJoinAndSelect('service.healthCheckPackage', 'package')
      .innerJoinAndSelect('service.fulfilmentMode', 'mode')
      .leftJoinAndSelect('package.contents', 'content', 'content.isActive=true')
      .innerJoinAndSelect('content.clinicalContent', 'includedContent', 'includedContent.isActive=true')
      .leftJoinAndSelect('package.addonAvailability', 'availability', 'availability.isActive=true')
      .leftJoinAndSelect('availability.clinicalContent', 'availableAddon', 'availableAddon.isActive=true')
      .leftJoinAndSelect('service.addons', 'capability', 'capability.isActive=true')
      .leftJoinAndSelect('capability.clinicalContent', 'addon', 'addon.isActive=true')
      .where('package.code=:packageCode', { packageCode: dto.packageCode }).andWhere('package.isActive=true')
      .andWhere('provider.providerReference=:providerReference', { providerReference: dto.providerReference })
      .andWhere('provider.status=:providerStatus', { providerStatus: ProviderStatus.ACTIVE })
      .andWhere('provider.onboardingStatus=:approved', { approved: ProviderOnboardingStatus.APPROVED })
      .andWhere('provider.deletedAt IS NULL').andWhere('mode.code=:modeCode', { modeCode: dto.fulfilmentModeCode })
      .andWhere('mode.isActive=true').andWhere('service.isActive=true').getOne();
    if (!service) throw new NotFoundException('Eligible Provider Health Check configuration not found');
    const location=dto.providerLocationReference?await this.locations.createQueryBuilder('location').innerJoin('location.serviceLinks','link').where('location.locationReference=:reference',{reference:dto.providerLocationReference}).andWhere('location.providerId=:providerId',{providerId:service.providerId}).andWhere('location.isActive=true').andWhere('link.providerServiceId=:serviceId',{serviceId:service.id}).getOne():null;
    if(dto.providerLocationReference&&!location)throw new ConflictException('Selected Provider location is unavailable for this offering');
    if(service.fulfilmentMode.code==='PROVIDER_LOCATION'&&!location)throw new BadRequestException('providerLocationReference is required for Provider-location fulfilment');
    if(service.fulfilmentMode.code==='HOME_VISIT'&&location)throw new BadRequestException('Provider location must not be selected for Home Visit');
    const duplicates = dto.addonCodes.filter((code) => service.healthCheckPackage.contents.some((content) => content.clinicalContent.code === code));
    if (duplicates.length) throw new ConflictException(`Clinical add-on is already included in the package: ${duplicates.join(', ')}`);
    const allowed = new Set(service.healthCheckPackage.addonAvailability.map((link) => link.clinicalContent.code));
    const selected = dto.addonCodes.map((code) => {
      if (!allowed.has(code)) throw new BadRequestException(`Clinical add-on is unavailable for this package: ${code}`);
      const capability = service.addons.find((row) => row.clinicalContent.code === code);
      if (!capability) throw new ConflictException(`Provider does not offer clinical add-on: ${code}`);
      if (capability.currency !== service.currency) throw new ConflictException('Clinical add-on currency does not match the package currency');
      return capability;
    });
    const base = BigInt(service.priceMinor), fee = BigInt(service.fulfilmentFeeMinor ?? '0');
    const addons = selected.reduce((sum, row) => sum + BigInt(row.priceMinor), 0n);
    const snapshot={ package: { code: service.healthCheckPackage.code, name: service.healthCheckPackage.name }, provider: { reference: service.provider.providerReference, name: service.provider.displayName }, providerLocation:location?{reference:location.locationReference,name:location.name,addressLine1:location.addressLine1,addressLine2:location.addressLine2,city:location.city,stateOrRegion:location.state,postalCode:location.postalCode,countryCode:location.countryCode}:null, fulfilmentMode: { code: service.fulfilmentMode.code, name: service.fulfilmentMode.name }, includedContents: service.healthCheckPackage.contents.sort((a, b) => a.sortOrder - b.sortOrder).map((x) => ({ code: x.clinicalContent.code, name: x.clinicalContent.name, category: x.clinicalContent.category, resultType: x.clinicalContent.resultType, unit: x.clinicalContent.unit })), selectedAddons: selected.map((x) => ({ code: x.clinicalContent.code, name: x.clinicalContent.name, category: x.clinicalContent.category, resultType: x.clinicalContent.resultType, unit: x.clinicalContent.unit, amountMinor: Number(x.priceMinor) })), pricing: { currency: service.currency, basePackagePriceMinor: Number(base), clinicalAddonsTotalMinor: Number(addons), fulfilmentFeeMinor: Number(fee), totalMinor: Number(base + addons + fee) } };
    const expiresAt=new Date(Date.now()+15*60*1000);const quote=await this.quotes.save(this.quotes.create({userId:user.id,patientId:patient.id,providerServiceId:service.id,providerLocationId:location?.id??null,currency:service.currency,basePackagePriceMinor:base.toString(),clinicalAddonsTotalMinor:addons.toString(),fulfilmentFeeMinor:fee.toString(),totalMinor:(base+addons+fee).toString(),configurationSnapshot:snapshot,expiresAt,consumedAt:null,bookingId:null}));
    return{configurationReference:quote.reference,expiresAt,...snapshot};
  }
}
