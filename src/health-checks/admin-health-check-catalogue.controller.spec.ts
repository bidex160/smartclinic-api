import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../users/enums/user-role.enum';
import { AdminHealthCheckCatalogueController } from './admin-health-check-catalogue.controller';

describe('AdminHealthCheckCatalogueController authorization', () => {
  it('declares ADMIN as the only catalogue-management role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminHealthCheckCatalogueController)).toEqual([UserRole.ADMIN]);
  });

  it.each([UserRole.OPERATIONS, UserRole.PROVIDER, UserRole.USER])('rejects %s without ADMIN', (role) => {
    const reflector = new Reflector();
    const guard = new RolesGuard(reflector);
    const context: any = {
      getHandler: () => AdminHealthCheckCatalogueController.prototype.listPackages,
      getClass: () => AdminHealthCheckCatalogueController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [role] } }) }),
    };
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows ADMIN without considering ProviderType', () => {
    const guard = new RolesGuard(new Reflector());
    const context: any = {
      getHandler: () => AdminHealthCheckCatalogueController.prototype.listPackages,
      getClass: () => AdminHealthCheckCatalogueController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles: [UserRole.ADMIN] } }) }),
    };
    expect(guard.canActivate(context)).toBe(true);
  });

  it('delegates package creation with the authenticated Admin actor', async () => {
    const catalogue = { createPackage: jest.fn().mockResolvedValue({ code: 'EXECUTIVE', isActive: false }) };
    const controller = new AdminHealthCheckCatalogueController(catalogue as never);
    await expect(controller.createPackage({ code: 'EXECUTIVE', name: 'Executive', benefits: [] }, { user: { id: 'admin-id' } } as any)).resolves.toMatchObject({ code: 'EXECUTIVE', isActive: false });
    expect(catalogue.createPackage).toHaveBeenCalledWith(expect.objectContaining({ code: 'EXECUTIVE' }), 'admin-id');
  });
});
