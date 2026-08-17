import { ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../users/enums/user-role.enum';

describe('RolesGuard', () => {
  const context = (roles: UserRole[]) => ({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }) });
  it('allows an assigned role', () => expect(new RolesGuard({ getAllAndOverride: () => [UserRole.ADMIN] } as never).canActivate(context([UserRole.ADMIN]) as never)).toBe(true));
  it('denies a missing role', () => expect(() => new RolesGuard({ getAllAndOverride: () => [UserRole.ADMIN] } as never).canActivate(context([UserRole.USER]) as never)).toThrow(ForbiddenException));
});
