import { BadRequestException } from '@nestjs/common';
import { GuidedSelfChecksService } from './guided-self-checks.service';

describe('GuidedSelfChecksService commercial projection',()=>{
 const base=(overrides:Record<string,unknown>={})=>({code:'GUIDED_SELF_CHECK',name:'Guided Self-Check',currency:'NGN',standardPriceMinor:'400000',promotionalPriceMinor:'250000',promotionStartsAt:null,promotionEndsAt:null,isActive:true,createdAt:new Date(),updatedAt:new Date(),...overrides});
 const service=(product:Record<string,unknown>)=>new GuidedSelfChecksService({findOne:jest.fn().mockResolvedValue(product)} as never,{} as never,{transaction:jest.fn()} as never);
 it('returns the seeded launch promotion as the authoritative effective price',async()=>{await expect(service(base()).getProduct()).resolves.toMatchObject({standardPriceMinor:400000,effectivePriceMinor:250000,promotionActive:true,available:true});});
 it('uses standard price before a future promotion',async()=>{await expect(service(base({promotionStartsAt:new Date(Date.now()+60_000)})).getProduct()).resolves.toMatchObject({effectivePriceMinor:400000,promotionalPriceMinor:null,promotionActive:false});});
 it('uses standard price after promotion expiry',async()=>{await expect(service(base({promotionEndsAt:new Date(Date.now()-60_000)})).getProduct()).resolves.toMatchObject({effectivePriceMinor:400000,promotionActive:false});});
 it('rejects a promotional price above the standard price',async()=>{const product=base();const manager={getRepository:jest.fn().mockReturnValue({findOne:jest.fn().mockResolvedValue(product),save:jest.fn()})};const data={transaction:jest.fn((fn)=>fn(manager))};const s=new GuidedSelfChecksService({} as never,{} as never,data as never);await expect(s.updateProduct({promotionalPriceMinor:500000})).rejects.toBeInstanceOf(BadRequestException);});
});
