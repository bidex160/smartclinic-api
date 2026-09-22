import { ConflictException } from '@nestjs/common';
import { ClinicalOrderFulfillmentsService } from '../src/clinical-orders/clinical-order-fulfillments.service';
import { ClinicalOrderType } from '../src/clinical-orders/enums/clinical-order-type.enum';
import { ClinicalOrderStatus } from '../src/clinical-orders/enums/clinical-order-status.enum';
import { ProviderServiceUnitType } from '../src/provider-service-units/enums/provider-service-unit-type.enum';
import { ProviderServiceUnitStatus } from '../src/provider-service-units/enums/provider-service-unit-status.enum';
import { ProviderStatus } from '../src/providers/enums/provider-status.enum';
import { ProviderOnboardingStatus } from '../src/providers/enums/provider-onboarding-status.enum';

describe('Care handoff acceptance matrix',()=>{
 const subject:any=new ClinicalOrderFulfillmentsService({manager:{}} as any,{} as any,{} as any);
 const provider={id:'p',status:ProviderStatus.ACTIVE,onboardingStatus:ProviderOnboardingStatus.APPROVED,deletedAt:null};
 const unit=(type:ProviderServiceUnitType)=>({id:'u',providerId:'p',type,status:ProviderServiceUnitStatus.ACTIVE,deletedAt:null,provider});
 const cases=[
  [ClinicalOrderType.LABORATORY,ProviderServiceUnitType.LABORATORY,'laboratory'],
  [ClinicalOrderType.IMAGING,ProviderServiceUnitType.RADIOLOGY,'radiology'],
  [ClinicalOrderType.REFERRAL,ProviderServiceUnitType.SPECIALIST,'specialist'],
  [ClinicalOrderType.PROCEDURE,ProviderServiceUnitType.PROCEDURE,'physical/procedure follow-up'],
 ] as const;
 it.each(cases)('%s routes only to %s (%s)',(orderType,expected)=>{
   expect(subject.unitType(orderType)).toBe(expected);
   expect(subject.assertUnit(unit(expected))).toBeDefined();
   const wrong=cases.find(x=>x[1]!==expected)![1];
   expect(()=>subject.assertUnit(unit(wrong),expected)).toThrow(ConflictException);
 });
 it.each(cases)('%s requires an issued clinical order',(type)=>{
   expect(()=>subject.requireFulfillable({type,status:ClinicalOrderStatus.ISSUED})).not.toThrow();
   expect(()=>subject.requireFulfillable({type,status:ClinicalOrderStatus.CANCELLED})).toThrow(ConflictException);
 });
});
