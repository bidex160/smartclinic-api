import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { Provider } from '../providers/entities/provider.entity';
import { ProviderOnboardingStatus } from '../providers/enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../providers/enums/provider-status.enum';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { apiKeyPrefix, generateApiKey, hashApiKey, sameHash } from './integration-crypto';
import { ProviderApiKey } from './provider-api-key.entity';

const MAX_ACTIVE_KEYS = 10;

@Injectable()
export class ProviderApiKeysService {
  constructor(@InjectRepository(ProviderApiKey) private readonly keys: Repository<ProviderApiKey>) {}

  async list(providerId: string) {
    const rows = await this.keys.find({ where: { providerId }, order: { createdAt: 'DESC' } });
    return { items: rows.map((row) => this.view(row)) };
  }

  /** The full key is returned once, here, and never again. */
  async create(providerId: string, userId: string, name: string) {
    const active = await this.keys.count({ where: { providerId, revokedAt: IsNull() } });
    if (active >= MAX_ACTIVE_KEYS) throw new ForbiddenException(`Revoke an old key first (at most ${MAX_ACTIVE_KEYS} active keys)`);
    const generated = generateApiKey();
    const row = await this.keys.save(this.keys.create({ providerId, name: name.trim(), keyPrefix: generated.prefix, keyHash: generated.hash, createdByUserId: userId, lastUsedAt: null, revokedAt: null }));
    return { ...this.view(row), key: generated.key };
  }

  async revoke(providerId: string, id: string) {
    const row = await this.keys.findOne({ where: { id, providerId } });
    if (!row) throw new NotFoundException('API key was not found');
    if (!row.revokedAt) {
      row.revokedAt = new Date();
      await this.keys.save(row);
    }
    return this.view(row);
  }

  /**
   * The facility a key belongs to, acting as its owner account. Requests are
   * refused for revoked keys and for facilities that aren't active and approved.
   */
  async authenticate(raw: string): Promise<{ provider: Provider; owner: User; keyId: string }> {
    const prefix = apiKeyPrefix(raw);
    if (!prefix) throw new UnauthorizedException('Invalid API key');
    const row = await this.keys.findOne({ where: { keyPrefix: prefix }, relations: { provider: true } });
    if (!row || row.revokedAt || !sameHash(row.keyHash, hashApiKey(raw))) throw new UnauthorizedException('Invalid API key');
    const provider = row.provider;
    if (!provider || provider.deletedAt || provider.status !== ProviderStatus.ACTIVE || provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED || !provider.userId)
      throw new ForbiddenException('This facility is not active on SmartClinic');
    const owner = await this.keys.manager.getRepository(User).findOne({ where: { id: provider.userId } });
    if (!owner || owner.deletedAt || owner.status !== UserStatus.ACTIVE) throw new ForbiddenException('This facility is not active on SmartClinic');
    // Throttled so busy integrations don't write on every call.
    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
      await this.keys.update({ id: row.id }, { lastUsedAt: new Date() });
    }
    return { provider, owner, keyId: row.id };
  }

  private view(row: ProviderApiKey) {
    return { id: row.id, name: row.name, keyPrefix: row.keyPrefix, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt, revokedAt: row.revokedAt };
  }
}
