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
    const referrals = { ensureReferralCode: jest.fn(), capturePatient: jest.fn() };
    return { service: new AuthService(userRepo, credentialRepo, sessionRepo, jwt as never, referrals as never), userRepo, jwt, savedUser, userTransactions, credentialTransactions, patientTransactions, referrals };
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
  it('captures an explicit referral transactionally so registration rewards remain authoritative', async () => { const context = setup(); await context.service.register({ ...dto, referralCode: 'sc-ab12cd' }); expect(context.referrals.ensureReferralCode).toHaveBeenCalledWith('a1', expect.anything()); expect(context.referrals.capturePatient).toHaveBeenCalledWith(expect.anything(), 'sc-ab12cd', 'a1', 'patient-a'); });
  it('logs in only active accounts with a valid password', async () => {
    const hash = await bcrypt.hash(dto.password, 4);
    const user = { id: 'a1', email: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null, credential: { passwordHash: hash } };
    const { service, jwt } = setup(user);
    await expect(service.login({ identifier: ' Ada@Example.COM ', password: dto.password })).resolves.toMatchObject({ accessToken: 'token', user: { email: 'ada@example.com' } });
    expect(jwt.signAsync).toHaveBeenCalledWith({ sub: 'a1' });
  });
  it.each(['08012345678', '2348012345678', '+2348012345678'])('logs in with equivalent phone identifier %s', async (identifier) => {
    const hash = await bcrypt.hash(dto.password, 4);
    const user = { id: 'a1', email: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null, credential: { passwordHash: hash } };
    const context = setup(user);
    await expect(context.service.login({ identifier, password: dto.password })).resolves.toMatchObject({ accessToken: 'token' });
    expect(context.userRepo.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { phoneNormalized: '+2348012345678' } }));
  });
  it('preserves the legacy email request field', async () => {
    const hash = await bcrypt.hash(dto.password, 4);
    const context = setup({ id: 'a1', email: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER], deletedAt: null, credential: { passwordHash: hash } });
    await expect(context.service.login({ email: 'ADA@example.com', password: dto.password })).resolves.toMatchObject({ accessToken: 'token' });
  });
  it('uses one generic error for unknown email, bad password, and inactive accounts', async () => {
    for (const user of [null, { status: UserStatus.SUSPENDED, credential: { passwordHash: 'x' } }, { status: UserStatus.ACTIVE, credential: { passwordHash: await bcrypt.hash('other', 4) } }]) {
      await expect(setup(user).service.login({ identifier: 'unknown@example.com', password: dto.password })).rejects.toThrow('Invalid email or password');
    }
  });
  it('uses the same generic error for an unknown phone and conflicting legacy fields', async () => {
    await expect(setup(null).service.login({ identifier: '+2348099999999', password: dto.password })).rejects.toThrow('Invalid email or password');
    await expect(setup(null).service.login({ identifier: 'a@example.com', email: 'b@example.com', password: dto.password })).rejects.toThrow('Invalid email or password');
  });
});
