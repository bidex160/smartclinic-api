import { ConflictException } from '@nestjs/common';
import { ClinicalOrderFulfillmentsService } from './clinical-order-fulfillments.service';
import { ClinicalOrderStatus } from './enums/clinical-order-status.enum';
import { ClinicalOrderType } from './enums/clinical-order-type.enum';
import { ProviderServiceUnitStatus } from '../provider-service-units/enums/provider-service-unit-status.enum';
import { ProviderServiceUnitType } from '../provider-service-units/enums/provider-service-unit-type.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';

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
});
