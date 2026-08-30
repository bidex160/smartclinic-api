import { ConflictException } from '@nestjs/common';
import { ProviderServiceUnitsService } from './provider-service-units.service';
describe('ProviderServiceUnitsService',()=>{
  it('rejects locations that are not active locations of the owning Provider',async()=>{
    const repo={findOne:jest.fn().mockResolvedValue(null)};
    const subject:any=new ProviderServiceUnitsService({} as any,{} as any);
    await expect(subject.location(repo,'provider-a','SC-LOC-ABCDEF123456')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.findOne).toHaveBeenCalledWith({where:{locationReference:'SC-LOC-ABCDEF123456',providerId:'provider-a',isActive:true}});
  });
  it('allows a unit without a location binding',async()=>{
    const subject:any=new ProviderServiceUnitsService({} as any,{} as any);
    await expect(subject.location({},'provider-a',null)).resolves.toBeNull();
  });
});
