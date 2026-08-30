import { ConflictException } from '@nestjs/common';
import { ClinicalOrderFulfillmentsService } from './clinical-order-fulfillments.service';
import { ClinicalOrderStatus } from './enums/clinical-order-status.enum';
import { ClinicalOrderType } from './enums/clinical-order-type.enum';
import { ProviderServiceUnitStatus } from '../provider-service-units/enums/provider-service-unit-status.enum';
import { ProviderServiceUnitType } from '../provider-service-units/enums/provider-service-unit-type.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { PharmacyFulfillmentFunding } from './entities/pharmacy-fulfillment-funding.entity';
import { PharmacyDispensing } from './entities/pharmacy-dispensing.entity';
import { PharmacyDispensingStatus, PharmacyFundingStatus } from './enums/pharmacy-quote-status.enum';

describe('ClinicalOrderFulfillmentsService eligibility',()=>{
  const subject:any=new ClinicalOrderFulfillmentsService({manager:{}} as any,{} as any,{} as any);
  const provider=(providerType:string)=>({id:'provider',providerType,status:ProviderStatus.ACTIVE,onboardingStatus:ProviderOnboardingStatus.APPROVED,deletedAt:null});
  const unit=(providerType:string,type=ProviderServiceUnitType.PHARMACY,status=ProviderServiceUnitStatus.ACTIVE)=>({id:'unit',providerId:'provider',type,status,deletedAt:null,provider:provider(providerType)});
  it('uses an active PHARMACY unit rather than Provider type as capability',()=>{
    expect(subject.assertUnit(unit('CLINIC'))).toBeDefined();
    expect(subject.assertUnit(unit('PHARMACY'))).toBeDefined();
  });
  it('rejects inactive units and non-operational Providers',()=>{
    expect(()=>subject.assertUnit(unit('CLINIC',ProviderServiceUnitType.PHARMACY,ProviderServiceUnitStatus.INACTIVE))).toThrow(ConflictException);
    const row=unit('PHARMACY');row.provider.status=ProviderStatus.INACTIVE;
    expect(()=>subject.assertUnit(row)).toThrow(ConflictException);
  });
  it('restricts routing to issued prescriptions',()=>{
    expect(()=>subject.requirePrescription({type:ClinicalOrderType.PRESCRIPTION,status:ClinicalOrderStatus.ISSUED})).not.toThrow();
    expect(()=>subject.requirePrescription({type:ClinicalOrderType.LABORATORY,status:ClinicalOrderStatus.ISSUED})).toThrow(ConflictException);
    expect(()=>subject.requirePrescription({type:ClinicalOrderType.PRESCRIPTION,status:ClinicalOrderStatus.CANCELLED})).toThrow(ConflictException);
  });
  it('returns provider-safe authoritative funding and dispensing state',async()=>{
    const fundingRepo={findOne:jest.fn().mockResolvedValue({status:PharmacyFundingStatus.PAID,grossAmountMinor:'250000',currency:'NGN'})};
    const dispensingRepo={findOne:jest.fn().mockResolvedValue({status:PharmacyDispensingStatus.READY_TO_DISPENSE,fulfillmentMethod:'PICKUP',startedAt:null,readyAt:null,completedAt:null})};
    const manager:any={getRepository:(entity:any)=>entity===PharmacyFulfillmentFunding?fundingRepo:entity===PharmacyDispensing?dispensingRepo:null};
    const state=await subject.operationalState(manager,'fulfillment-id');
    expect(state).toEqual({
      funding:{status:PharmacyFundingStatus.PAID,amountMinor:250000,currency:'NGN',satisfied:true},
      dispensing:{status:PharmacyDispensingStatus.READY_TO_DISPENSE,fulfillmentMethod:'PICKUP',startedAt:null,readyAt:null,completedAt:null},
    });
    expect(JSON.stringify(state)).not.toMatch(/commission|providerShare|payment|internal/i);
  });
});
