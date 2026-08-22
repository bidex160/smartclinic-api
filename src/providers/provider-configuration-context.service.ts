import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { Provider } from './entities/provider.entity';
import { ProviderStatus } from './enums/provider-status.enum';

@Injectable()
export class ProviderConfigurationContextService {
  constructor(@InjectRepository(Provider) private readonly providers: Repository<Provider>) {}
  async resolve(user: User, mutation = false): Promise<Provider> {
    if (user.status !== UserStatus.ACTIVE || user.deletedAt || !user.roles.includes(UserRole.PROVIDER)) throw new ForbiddenException('Provider configuration access is required');
    const provider = await this.providers.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!provider || provider.deletedAt) throw new ForbiddenException('Provider configuration access is required');
    if (mutation && ![ProviderStatus.PENDING, ProviderStatus.ACTIVE].includes(provider.status)) throw new ForbiddenException('Suspended or inactive providers cannot change configuration');
    return provider;
  }
}
