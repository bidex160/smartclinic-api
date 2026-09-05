import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { PatientPortalProfileService } from './patient-portal-profile.service';

describe('PatientPortalProfileService', () => {
  const user: any = { id: 'user-a', displayName: 'Ada Okafor', email: 'ada@example.test' };
  it('returns the safe SELF Patient profile with public reference', async () => {
    const patients: any = { findOne: jest.fn().mockResolvedValue({ patientReference: 'SCP-8K4M-27QD', userId: user.id, givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000', dateOfBirth: '1990-01-01', status: PatientStatus.ACTIVE, deletedAt: null }) };
    await expect(new PatientPortalProfileService(patients).get(user)).resolves.toEqual({ user: { displayName: 'Ada Okafor', email: 'ada@example.test' }, patient: { patientReference: 'SCP-8K4M-27QD', givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000', dateOfBirth: '1990-01-01' } });
    expect(patients.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, withDeleted: true });
  });
  it('returns a null account email without asserting or fabricating a value', async () => {
    const patients: any = { findOne: jest.fn().mockResolvedValue({ patientReference: 'SCP-8K4M-27QD', userId: user.id, givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000', dateOfBirth: null, status: PatientStatus.ACTIVE, deletedAt: null }) };
    await expect(new PatientPortalProfileService(patients).get({ ...user, email: null, emailNormalized: null })).resolves.toMatchObject({ user: { email: null }, patient: { phone: '+2348000000000' } });
  });
  it('does not infer a Patient from contact data', async () => { const patients: any = { findOne: jest.fn().mockResolvedValue(null) }; await expect(new PatientPortalProfileService(patients).get(user)).rejects.toBeInstanceOf(NotFoundException); });

  it('updates only the authenticated Patient and preserves omitted fields', async () => {
    const row: any = { id: 'patient-a', patientReference: 'SCP-8K4M-27QD', userId: user.id, givenName: 'Ada', familyName: 'Okafor', email: user.email, phone: null, dateOfBirth: null, status: PatientStatus.ACTIVE, deletedAt: null };
    const patientRepository: any = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn(async (value) => value) };
    const userRepository: any = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn().mockResolvedValue({ affected: 1 }) };
    const manager: any = { getRepository: jest.fn((entity) => entity.name === 'Patient' ? patientRepository : userRepository), transaction: jest.fn(async (callback) => callback(manager)) };
    const patients: any = { manager };

    const result = await new PatientPortalProfileService(patients).update(user, { givenName: 'Adanna', phone: '+2348012345678', dateOfBirth: '1990-01-01' });

    expect(patientRepository.findOne).toHaveBeenCalledWith({ where: { userId: user.id }, withDeleted: true });
    expect(patientRepository.save).toHaveBeenCalledWith(expect.objectContaining({ givenName: 'Adanna', familyName: 'Okafor', email: user.email, phone: '+2348012345678', dateOfBirth: '1990-01-01' }));
    expect(userRepository.update).toHaveBeenCalledWith(user.id, { displayName: 'Adanna Okafor', phoneNormalized: '+2348012345678' });
    expect(result).toEqual({ user: { displayName: 'Adanna Okafor', email: user.email }, patient: { patientReference: 'SCP-8K4M-27QD', givenName: 'Adanna', familyName: 'Okafor', phone: '+2348012345678', dateOfBirth: '1990-01-01' } });
    expect(result.patient).not.toHaveProperty('id');
    expect(result.patient).not.toHaveProperty('userId');
  });

  it('supports explicit clearing of nullable phone and date of birth', async () => {
    const row: any = { patientReference: 'SCP-8K4M-27QD', userId: user.id, givenName: 'Ada', familyName: 'Okafor', phone: '+2348012345678', dateOfBirth: '1990-01-01', status: PatientStatus.ACTIVE, deletedAt: null };
    const patientRepository: any = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn(async (value) => value) };
    const userRepository: any = { findOne: jest.fn(), update: jest.fn() };
    const manager: any = { getRepository: jest.fn((entity) => entity.name === 'Patient' ? patientRepository : userRepository), transaction: jest.fn(async (callback) => callback(manager)) };

    const result = await new PatientPortalProfileService({ manager } as any).update(user, { phone: null, dateOfBirth: null });

    expect(result.patient).toMatchObject({ phone: null, dateOfBirth: null });
  });

  it('does not allow phone removal to leave an account with no usable login identity', async () => {
    const phoneOnlyUser: any = { ...user, email: null, emailNormalized: null, phoneNormalized: '+2348012345678' };
    const row: any = { patientReference: 'SCP-8K4M-27QD', userId: user.id, givenName: 'Ada', familyName: 'Okafor', phone: '+2348012345678', dateOfBirth: null, status: PatientStatus.ACTIVE, deletedAt: null };
    const patientRepository: any = { findOne: jest.fn().mockResolvedValue(row), save: jest.fn() };
    const userRepository: any = { findOne: jest.fn(), update: jest.fn() };
    const manager: any = { getRepository: jest.fn((entity) => entity.name === 'Patient' ? patientRepository : userRepository), transaction: jest.fn(async (callback) => callback(manager)) };
    await expect(new PatientPortalProfileService({ manager } as any).update(phoneOnlyUser, { phone: null })).rejects.toThrow('At least one login email or phone number must remain');
    expect(patientRepository.save).not.toHaveBeenCalled();
    expect(userRepository.update).not.toHaveBeenCalled();
  });

  it('rejects a future date of birth before persistence', async () => {
    const patients: any = { manager: { transaction: jest.fn() } };
    await expect(new PatientPortalProfileService(patients).update(user, { dateOfBirth: '2999-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(patients.manager.transaction).not.toHaveBeenCalled();
  });
});
