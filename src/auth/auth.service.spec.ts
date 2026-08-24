import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { User } from '../users/entities/user.entity';
import { UserCredential } from '../users/entities/user-credential.entity';
import { Patient } from '../patients/entities/patient.entity';

describe('AuthService', () => {
  const dto = { email: ' Ada@Example.COM ', password: 'a-secure-password', givenName: 'Ada', familyName: 'Okafor', phone: '+2348000000000' };
  function setup(user: any = null) {
    const savedUser = { id: 'a1', email: 'ada@example.com', emailNormalized: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER] };
    const userTransactions = { create: jest.fn((value: any) => value), save: jest.fn().mockResolvedValue(savedUser) };
    const credentialTransactions = { create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => value) };
    const patientTransactions = { create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => ({ id: 'patient-a', ...value })) };
    const userRepo: any = {
      exists: jest.fn().mockResolvedValue(false),
      findOne: jest.fn().mockResolvedValue(user),
      manager: { transaction: jest.fn((work: any) => work({ getRepository: (entity: any) => entity === User ? userTransactions : entity === UserCredential ? credentialTransactions : entity === Patient ? patientTransactions : {} })) },
    };
    const credentialRepo: any = {};
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
    const sessionRepo: any = { create: jest.fn((value: any) => value), save: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    return { service: new AuthService(userRepo, credentialRepo, sessionRepo, jwt as never), userRepo, jwt, savedUser, userTransactions, credentialTransactions, patientTransactions };
  }
  it('registers a normalized USER with a bcrypt credential and safe response', async () => {
    const { service, savedUser, patientTransactions, credentialTransactions } = setup();
    const result = await service.register(dto);
    expect(result).toEqual({ id: 'a1', email: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER] });
    expect(savedUser).not.toHaveProperty('passwordHash');
    expect(patientTransactions.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'a1', givenName: 'Ada', familyName: 'Okafor', patientReference: expect.stringMatching(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/) }));
    expect(credentialTransactions.create.mock.calls[0][0].passwordHash).not.toBe(dto.password);
  });
  it('rejects duplicate normalized email', async () => { const { service, userRepo } = setup(); userRepo.exists.mockResolvedValue(true); await expect(service.register(dto)).rejects.toBeInstanceOf(ConflictException); });
  it('logs in only active accounts with a valid password', async () => {
    const hash = await bcrypt.hash(dto.password, 4);
    const user = { id: 'a1', email: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null, credential: { passwordHash: hash } };
    const { service, jwt } = setup(user);
    await expect(service.login(dto)).resolves.toMatchObject({ accessToken: 'token', user: { email: 'ada@example.com' } });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'a1' });
  });
  it('uses one generic error for unknown email, bad password, and inactive accounts', async () => {
    for (const user of [null, { status: UserStatus.SUSPENDED, credential: { passwordHash: 'x' } }, { status: UserStatus.ACTIVE, credential: { passwordHash: await bcrypt.hash('other', 4) } }]) {
      await expect(setup(user).service.login(dto)).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
});
