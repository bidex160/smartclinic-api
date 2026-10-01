import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

import { ProviderApiKeysService } from './provider-api-keys.service';

/**
 * Authenticates a facility's system by API key, sent as
 * "Authorization: Bearer sck_…" or "X-SmartClinic-Key: sck_…".
 * The request then acts as the facility's owner account.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ProviderApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers['x-smartclinic-key'] ?? request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (typeof header !== 'string' || !header) throw new UnauthorizedException('Send your API key as "Authorization: Bearer sck_…"');
    const { provider, owner, keyId } = await this.keys.authenticate(header.trim());
    request.user = owner;
    request.integration = { providerId: provider.id, keyId };
    return true;
  }
}
