import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Provider } from './entities/provider.entity';
import { ProviderMember } from './entities/provider-member.entity';
import { MANAGING_ROLES, PRESCRIBING_ROLES, ProviderMemberRole, ProviderMemberStatus } from './enums/provider-member.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';

/** Who is acting for a provider: the facility's own account (owner) or a staff member with a role. */
export interface ProviderActor {
  readonly provider: Provider;
  readonly isOwner: boolean;
  /** Null for the owner, who can do everything. */
  readonly role: ProviderMemberRole | null;
  readonly memberId: string | null;
}

@Injectable()
export class CurrentProviderService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @Optional() @InjectRepository(ProviderMember) private readonly members?: Repository<ProviderMember>,
  ) {}

  async resolve(user: User): Promise<Provider> {
    return (await this.resolveActor(user)).provider;
  }

  async resolveOperational(user: User): Promise<Provider> {
    return (await this.resolveOperationalActor(user)).provider;
  }

  /** The provider this user works for, as its owner or as an active staff member. */
  async resolveActor(user: User): Promise<ProviderActor> {
    const actor = await this.findActor(user);
    if (!actor || actor.provider.status !== ProviderStatus.ACTIVE || actor.provider.deletedAt) {
      throw new ForbiddenException('Active provider access is required');
    }
    return actor;
  }

  async resolveOperationalActor(user: User): Promise<ProviderActor> {
    const actor = await this.resolveActor(user);
    if (actor.provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED) {
      throw new ForbiddenException('Active approved provider access is required');
    }
    return actor;
  }

  /** Finds the owner link or active membership without checking provider status. */
  async findActor(user: User): Promise<ProviderActor | null> {
    const owned = await this.providers.findOne({ where: { userId: user.id }, withDeleted: true });
    if (owned) return { provider: owned, isOwner: true, role: null, memberId: null };
    const member = await this.members?.findOne({
      where: { userId: user.id, status: ProviderMemberStatus.ACTIVE },
      relations: { provider: true },
      withDeleted: true,
    });
    if (!member?.provider) return null;
    return { provider: member.provider, isOwner: false, role: member.role, memberId: member.id };
  }
}

export function canPrescribe(actor: ProviderActor): boolean {
  return actor.isOwner || (!!actor.role && PRESCRIBING_ROLES.has(actor.role));
}

export function canManage(actor: ProviderActor): boolean {
  return actor.isOwner || (!!actor.role && MANAGING_ROLES.has(actor.role));
}
