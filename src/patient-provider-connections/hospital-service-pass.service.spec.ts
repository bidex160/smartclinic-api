import { ConflictException, NotFoundException } from '@nestjs/common';
import { HospitalServicePassService } from './hospital-service-pass.service';
import { HospitalServicePassStatus } from './entities/hospital-service-pass.entity';

describe('HospitalServicePassService', () => {
  it('requires patient ownership before rotating a verification token', async () => {
    const qb:any = { innerJoin: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(), getOne: jest.fn().mockResolvedValue(null) };
    const passes:any = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const service = new HospitalServicePassService(passes, {} as any);
    await expect(service.issuePatientVerificationToken('user-1', 'SCP-ONE')).rejects.toBeInstanceOf(NotFoundException);
    expect(qb.andWhere).toHaveBeenCalledWith('patient.userId=:userId', { userId: 'user-1' });
  });

  it('rejects verification by a different provider', async () => {
    const passes:any = { findOne: jest.fn().mockResolvedValue(null) };
    const current:any = { resolveOperational: jest.fn().mockResolvedValue({ id: 'provider-1' }) };
    const service = new HospitalServicePassService(passes, current);
    await expect(service.verifyForProvider({} as any, 'SCP-ONE', 'token')).rejects.toBeInstanceOf(NotFoundException);
    expect(passes.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { reference: 'SCP-ONE', providerId: 'provider-1' } }));
  });

  it('rejects a void pass even when provider and token are otherwise valid', async () => {
    const passes:any = { findOne: jest.fn().mockResolvedValue({ reference: 'SCP-ONE', providerId: 'provider-1', status: HospitalServicePassStatus.VOID }) };
    const current:any = { resolveOperational: jest.fn().mockResolvedValue({ id: 'provider-1' }) };
    const service = new HospitalServicePassService(passes, current);
    await expect(service.verifyForProvider({} as any, 'SCP-ONE', 'token')).rejects.toBeInstanceOf(ConflictException);
  });
});
