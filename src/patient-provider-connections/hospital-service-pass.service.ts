import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { EntityManager,Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CurrentProviderService } from '../providers/current-provider.service';
import { HospitalServicePass, HospitalServicePassStatus } from './entities/hospital-service-pass.entity';

@Injectable()
export class HospitalServicePassService {
 constructor(@InjectRepository(HospitalServicePass) private readonly passes:Repository<HospitalServicePass>,private readonly currentProvider:CurrentProviderService){}

 async issue(input:{connectionId:string;patientId:string;providerId:string;amountMinor:number;currency:string;coveredServices:Array<{orderReference:string;fulfillmentReference:string|null;amountMinor:number|null}>;paidAt:Date}){
  if(input.amountMinor<0) throw new ConflictException('Service pass amount cannot be negative');
  const token=randomBytes(24).toString('base64url');
  const reference=`SCP-${randomBytes(6).toString('hex').toUpperCase()}`;
  const pass=await this.passes.save(this.passes.create({...input,amountMinor:String(input.amountMinor),currency:input.currency.toUpperCase(),reference,status:HospitalServicePassStatus.VALID,verificationTokenHash:this.hash(token),expiresAt:null,lastVerifiedAt:null}));
  return {...this.patientView(pass),verificationToken:token};
 }

 async issueWithManager(manager:EntityManager,input:{connectionId:string;patientId:string;providerId:string;amountMinor:number;currency:string;coveredServices:Array<{orderReference:string;fulfillmentReference:string|null;amountMinor:number|null}>;paidAt:Date}){if(input.amountMinor<0)throw new ConflictException('Service pass amount cannot be negative');const token=randomBytes(24).toString('base64url');const reference=`SCP-${randomBytes(6).toString('hex').toUpperCase()}`;const repo=manager.getRepository(HospitalServicePass);const pass=await repo.save(repo.create({...input,amountMinor:String(input.amountMinor),currency:input.currency.toUpperCase(),reference,status:HospitalServicePassStatus.VALID,verificationTokenHash:this.hash(token),expiresAt:null,lastVerifiedAt:null}));return{...this.patientView(pass),verificationToken:token};}

 async issuePatientVerificationToken(userId:string,reference:string){const pass=await this.passes.createQueryBuilder('pass').innerJoin('pass.patient','patient').where('pass.reference=:reference',{reference:reference.toUpperCase()}).andWhere('patient.userId=:userId',{userId}).getOne();if(!pass)throw new NotFoundException('Service pass not found');if(pass.status===HospitalServicePassStatus.VOID||pass.status===HospitalServicePassStatus.USED)throw new ConflictException('Service pass is no longer valid');if(pass.expiresAt&&pass.expiresAt.getTime()<=Date.now())throw new ConflictException('Service pass has expired');const token=randomBytes(24).toString('base64url');pass.verificationTokenHash=this.hash(token);await this.passes.save(pass);return{...this.patientView(pass),verificationToken:token};}

 async verifyForProvider(user:User,reference:string,token:string){
  const provider=await this.currentProvider.resolveOperational(user);
  const pass=await this.passes.findOne({where:{reference,providerId:provider.id},relations:{patient:true,provider:true}});
  if(!pass) throw new NotFoundException('Service pass was not found');
  if(pass.status===HospitalServicePassStatus.VOID) throw new ConflictException('Service pass is void');
  if(pass.expiresAt && pass.expiresAt.getTime()<Date.now()) throw new ConflictException('Service pass has expired');
  if(this.hash(token)!==pass.verificationTokenHash) throw new NotFoundException('Service pass was not found');
  pass.lastVerifiedAt=new Date(); await this.passes.save(pass);
  return {verified:true,reference:pass.reference,status:pass.status,patient:{patientReference:pass.patient.patientReference,givenName:pass.patient.givenName,familyName:pass.patient.familyName},provider:{providerReference:pass.provider.providerReference,displayName:pass.provider.displayName},amountMinor:Number(pass.amountMinor),currency:pass.currency,paidAt:pass.paidAt,coveredServices:pass.coveredServices};
 }

 patientView(pass:HospitalServicePass){return {reference:pass.reference,status:pass.status,amountMinor:Number(pass.amountMinor),currency:pass.currency,paidAt:pass.paidAt,coveredServices:pass.coveredServices};}
 private hash(value:string){return createHash('sha256').update(value).digest('hex');}
}