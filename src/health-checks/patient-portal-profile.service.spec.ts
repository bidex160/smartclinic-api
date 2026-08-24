import { NotFoundException } from '@nestjs/common';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { PatientPortalProfileService } from './patient-portal-profile.service';

describe('PatientPortalProfileService', () => {
  const user: any = { id: 'user-a', displayName: 'Ada Okafor', email: 'ada@example.test' };
  it('returns the safe SELF Patient profile with public reference', async () => {
    const patients: any = { findOne: jest.fn().mockResolvedValue({ patientReference: 'SCP-8K4M-27QD', userId: user.id, givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000', status: PatientStatus.ACTIVE, deletedAt: null }) };
    await expect(new PatientPortalProfileService(patients).get(user)).resolves.toEqual({ user: { displayName: 'Ada Okafor', email: 'ada@example.test' }, patient: { patientReference: 'SCP-8K4M-27QD', givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000' } });
    expect(patients.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, withDeleted: true });
  });
  it('does not infer a Patient from contact data', async () => { const patients: any = { findOne: jest.fn().mockResolvedValue(null) }; await expect(new PatientPortalProfileService(patients).get(user)).rejects.toBeInstanceOf(NotFoundException); });
});
