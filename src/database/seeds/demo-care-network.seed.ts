import { DataSource } from 'typeorm';
import dataSource from '../data-source';
import { Provider } from '../../providers/entities/provider.entity';
import { ProviderStatus } from '../../providers/enums/provider-status.enum';
import { ProviderOnboardingStatus } from '../../providers/enums/provider-onboarding-status.enum';
import { ProviderType } from '../../providers/enums/provider-type.enum';
import { ProviderServiceUnit } from '../../provider-service-units/entities/provider-service-unit.entity';
import { ProviderServiceUnitStatus } from '../../provider-service-units/enums/provider-service-unit-status.enum';
import { ProviderServiceUnitType } from '../../provider-service-units/enums/provider-service-unit-type.enum';

export const DEMO_SPECIALTIES = [
  'Cardiology','Dermatology','Endocrinology','Gastroenterology','General Surgery','Geriatrics','Haematology',
  'Infectious Diseases','Nephrology','Neurology','Obstetrics and Gynaecology','Oncology','Ophthalmology',
  'Orthopaedics','Otorhinolaryngology (ENT)','Paediatrics','Psychiatry','Pulmonology','Rheumatology','Urology',
] as const;
const code=(name:string)=>'DEMO_'+name.toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,70);
async function provider(ds:DataSource,name:string,type:ProviderType){const repo=ds.getRepository(Provider);let p=await repo.findOne({where:{displayName:name}});if(!p)p=await repo.save(repo.create({displayName:name,email:null,phone:null,professionalReference:null,providerType:type,countryCode:'NG',stateOrRegion:'Lagos',city:'Lagos',status:ProviderStatus.ACTIVE,onboardingStatus:ProviderOnboardingStatus.APPROVED,submittedAt:new Date(),reviewedAt:new Date(),reviewedByUserId:null,reviewNote:'DEMO / QA ONLY',commissionOverrideBps:null,newPatientRegistrationEnabled:false,newPatientRegistrationFeeMinor:null,newPatientRegistrationCurrency:null,existingPatientLinkEnabled:false,existingPatientLinkFeeMinor:null,existingPatientLinkCurrency:null,userId:null}));return p;}
async function unit(ds:DataSource,p:Provider,name:string,type:ProviderServiceUnitType){const repo=ds.getRepository(ProviderServiceUnit);const c=code(name);if(await repo.exists({where:{providerId:p.id,code:c}}))return;await repo.save(repo.create({reference:'SC-SU-'+require('node:crypto').randomBytes(6).toString('hex').toUpperCase(),providerId:p.id,code:c,name,type,description:'Demo service unit for end-to-end QA only',status:ProviderServiceUnitStatus.ACTIVE,providerLocationId:null}));}
export async function seedDemoCareNetwork(ds:DataSource){if(process.env.NODE_ENV==='production')throw new Error('Demo care-network seed is disabled in production');const diagnostic=await provider(ds,'SmartClinic Demo Diagnostics',ProviderType.DIAGNOSTIC_CENTRE);await unit(ds,diagnostic,'Demo Laboratory',ProviderServiceUnitType.LABORATORY);await unit(ds,diagnostic,'Demo Radiology & Imaging',ProviderServiceUnitType.RADIOLOGY);const hub=await provider(ds,'SmartClinic Demo Specialist Hub',ProviderType.CLINIC);for(const specialty of DEMO_SPECIALTIES)await unit(ds,hub,specialty,ProviderServiceUnitType.SPECIALIST);await unit(ds,hub,'Procedure & Physical Follow-up',ProviderServiceUnitType.PROCEDURE);}
async function run(){await dataSource.initialize();try{await seedDemoCareNetwork(dataSource);console.log('Demo care network seeded.');}finally{await dataSource.destroy();}}
if(require.main===module)void run().catch(e=>{console.error('Demo care-network seed failed.',e);process.exitCode=1;});
