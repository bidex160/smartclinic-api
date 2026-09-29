import { ConflictException } from '@nestjs/common';
import { ProviderServiceUnitsService } from './provider-service-units.service';
describe('ProviderServiceUnitsService',()=>{
  it('lets a provisionally active Provider configure owned service units',async()=>{
    const qb:any={};
    for(const method of ['innerJoinAndSelect','leftJoinAndSelect','where','andWhere','orderBy','addOrderBy','skip','take'])qb[method]=jest.fn().mockReturnValue(qb);
    qb.getManyAndCount=jest.fn().mockResolvedValue([[],0]);
    const units={createQueryBuilder:jest.fn().mockReturnValue(qb)};
    const current={resolve:jest.fn().mockResolvedValue({id:'provider-a'}),resolveOperational:jest.fn()};
    const subject=new ProviderServiceUnitsService(units as any,current as any);
    await subject.list({id:'user-a'} as any,{page:1,limit:20} as any);
    expect(current.resolve).toHaveBeenCalledWith(expect.objectContaining({id:'user-a'}));
    expect(current.resolveOperational).not.toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith('unit.providerId=:providerId',{providerId:'provider-a'});
  });
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
