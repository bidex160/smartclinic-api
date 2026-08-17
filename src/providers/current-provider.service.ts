import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Provider } from './entities/provider.entity';
import { ProviderStatus } from './enums/provider-status.enum';

@Injectable()
export class CurrentProviderService {
  constructor(@InjectRepository(Provider) private readonly providers: Repository<Provider>) {}

  async resolve(user: User): Promise<Provider> {
    const provider = await this.providers.findOne({ where: { userId: user.id }, withDeleted: true });
    if (!provider || provider.status !== ProviderStatus.ACTIVE || provider.deletedAt) {
      throw new ForbiddenException('Active provider access is required');
    }
    return provider;
  }
}
