import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserStatus } from '../users/enums/user-status.enum';

describe('JwtAuthGuard', () => {
  const context = (authorization?: string) => {
    const request: any = { headers: { authorization } };
    return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } };
  };
  it('verifies a JWT and attaches an active user', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-id' }) };
    const users = { findOne: jest.fn().mockResolvedValue({ id: 'user-id', status: UserStatus.ACTIVE, deletedAt: null }) };
    const { context: execution, request } = context('Bearer signed-token');
    await expect(new JwtAuthGuard(jwt as never, users as never).canActivate(execution as never)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'user-id' });
  });
  it('rejects invalid tokens and inactive users', async () => {
    const invalid = context('Bearer invalid');
    await expect(new JwtAuthGuard({ verifyAsync: jest.fn().mockRejectedValue(new Error()) } as never, {} as never).canActivate(invalid.context as never)).rejects.toBeInstanceOf(UnauthorizedException);
    const suspended = context('Bearer token');
    await expect(new JwtAuthGuard({ verifyAsync: jest.fn().mockResolvedValue({ sub: 'user-id' }) } as never, { findOne: jest.fn().mockResolvedValue({ status: UserStatus.SUSPENDED }) } as never).canActivate(suspended.context as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
