import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';

describe('AuthService', () => {
  const dto = { email: ' Ada@Example.COM ', password: 'a-secure-password', displayName: 'Ada' };
  function setup(user: any = null) {
    const savedUser = { id: 'a1', email: 'ada@example.com', emailNormalized: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER] };
    const transactionalRepository = { create: jest.fn((value: any) => value), save: jest.fn().mockResolvedValue(savedUser) };
    const userRepo: any = {
      exists: jest.fn().mockResolvedValue(false),
      findOne: jest.fn().mockResolvedValue(user),
      manager: { transaction: jest.fn((work: any) => work({ getRepository: () => transactionalRepository })) },
    };
    const credentialRepo: any = {};
    const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
    const sessionRepo: any = { create: jest.fn((value: any) => value), save: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() };
    return { service: new AuthService(userRepo, credentialRepo, sessionRepo, jwt as never), userRepo, jwt, savedUser };
  }
  it('registers a normalized USER with a bcrypt credential and safe response', async () => {
    const { service, savedUser } = setup();
    const result = await service.register(dto);
    expect(result).toEqual({ id: 'a1', email: 'ada@example.com', displayName: 'Ada', status: UserStatus.ACTIVE, roles: [UserRole.USER] });
    expect(savedUser).not.toHaveProperty('passwordHash');
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
