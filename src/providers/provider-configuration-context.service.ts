import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Provider } from './entities/provider.entity';
import { ProviderMember } from './entities/provider-member.entity';
import { MANAGING_ROLES, ProviderMemberStatus } from './enums/provider-member.enum';
import { ProviderStatus } from './enums/provider-status.enum';

@Injectable()
export class ProviderConfigurationContextService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @Optional() @InjectRepository(ProviderMember) private readonly members?: Repository<ProviderMember>,
  ) {}

  /**
   * The provider whose setup this user can see. Every active staff member can
   * read it; only the owner and team admins can change it.
   */
  async resolve(user: User, mutation = false): Promise<Provider> {
    if (user.status !== UserStatus.ACTIVE || user.deletedAt || !user.roles.includes(UserRole.PROVIDER)) throw new ForbiddenException('Provider configuration access is required');
    let provider = await this.providers.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!provider) {
      const member = await this.members?.findOne({ where: { userId: user.id, status: ProviderMemberStatus.ACTIVE }, relations: { provider: true }, withDeleted: true });
      if (member?.provider && mutation && !MANAGING_ROLES.has(member.role)) throw new ForbiddenException('Only the facility owner or a team admin can change setup');
      provider = member?.provider ?? null;
    }
    if (!provider || provider.deletedAt) throw new ForbiddenException('Provider configuration access is required');
    if (mutation && ![ProviderStatus.PENDING, ProviderStatus.ACTIVE].includes(provider.status)) throw new ForbiddenException('Suspended or inactive providers cannot change configuration');
    return provider;
  }
}
