import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';
import { UserCredential } from '../users/entities/user-credential.entity';
import { User } from '../users/entities/user.entity';
import { UserRole } from '../users/enums/user-role.enum';
import { UserStatus } from '../users/enums/user-status.enum';
import { ProviderOnboardingProfileResponseDto, RegisterProviderDto, UpdateProviderProfileDto } from './dto/provider-onboarding.dto';
import { Provider } from './entities/provider.entity';
import { ProviderOnboardingStatus } from './enums/provider-onboarding-status.enum';
import { ProviderStatus } from './enums/provider-status.enum';
import { ProviderConfigurationContextService } from './provider-configuration-context.service';
import { ProviderOnboardingReadinessService } from './provider-onboarding-readiness.service';
import { ReferralsService } from '../rewards/referrals.service';

@Injectable()
export class ProviderOnboardingService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(UserCredential) private readonly credentials: Repository<UserCredential>,
    private readonly context: ProviderConfigurationContextService,
    private readonly readiness: ProviderOnboardingReadinessService,
    private readonly referrals: ReferralsService,
  ) {}

  async register(dto: RegisterProviderDto): Promise<ProviderOnboardingProfileResponseDto> {
    const email = dto.email.trim().toLowerCase();
    if (await this.users.exists({ where: { emailNormalized: email }, withDeleted: true })) throw new ConflictException('An account already exists for this email');
    if (await this.providers.exists({ where: { email }, withDeleted: true })) throw new ConflictException('A provider already exists for this email');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    try {
      const provider = await this.providers.manager.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const providerRepository = manager.getRepository(Provider);
        const user = await userRepository.save(userRepository.create({ email, emailNormalized: email, displayName: dto.displayName.trim(), status: UserStatus.ACTIVE, roles: [UserRole.PROVIDER] }));
        await manager.getRepository(UserCredential).save(manager.getRepository(UserCredential).create({ userId: user.id, passwordHash }));
        const provider = await providerRepository.save(providerRepository.create({ userId: user.id, displayName: dto.displayName.trim(), email, phone: dto.phone.trim(), professionalReference: dto.professionalReference?.trim() || null, providerType: dto.providerType, countryCode: dto.countryCode.toUpperCase(), stateOrRegion: dto.stateOrRegion.trim(), city: dto.city.trim(), status: ProviderStatus.PENDING, onboardingStatus: ProviderOnboardingStatus.DRAFT, submittedAt: null, reviewedAt: null, reviewedByUserId: null, reviewNote: null }));
        await this.referrals.ensureReferralCode(user.id, manager);
        if (dto.referralCode) await this.referrals.captureProvider(manager, dto.referralCode, provider, dto.intendedReferralType);
        return provider;
      });
      return this.map(provider);
    } catch (error) {
      if (error instanceof QueryFailedError) throw new ConflictException('A provider account or application already exists for these details');
      throw error;
    }
  }

  async get(user: User): Promise<ProviderOnboardingProfileResponseDto> { return this.map(await this.context.resolve(user)); }

  async update(user: User, dto: UpdateProviderProfileDto): Promise<ProviderOnboardingProfileResponseDto> {
    const provider = await this.context.resolve(user, true);
    if (provider.onboardingStatus === ProviderOnboardingStatus.APPROVED) throw new ConflictException('Approved provider identity changes require operations support');
    if (dto.displayName !== undefined) provider.displayName = dto.displayName.trim();
    if (dto.phone !== undefined) provider.phone = dto.phone.trim();
    if (dto.professionalReference !== undefined) provider.professionalReference = dto.professionalReference?.trim() || null;
    if (dto.providerType !== undefined) provider.providerType = dto.providerType;
    if (dto.countryCode !== undefined) provider.countryCode = dto.countryCode.toUpperCase();
    if (dto.stateOrRegion !== undefined) provider.stateOrRegion = dto.stateOrRegion.trim();
    if (dto.city !== undefined) provider.city = dto.city.trim();
    await this.providers.save(provider);
    return this.map(provider);
  }

  async submit(user: User): Promise<ProviderOnboardingProfileResponseDto> {
    await this.context.resolve(user, true);
    await this.providers.manager.transaction(async (manager) => {
      const providerRepository = manager.getRepository(Provider);
      const provider = await providerRepository.findOne({ where: { userId: user.id }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
      if (!provider || provider.deletedAt) throw new ForbiddenException('A linked provider account is required');
      const account = await manager.getRepository(User).findOne({ where: { id: user.id }, withDeleted: true, lock: { mode: 'pessimistic_write' } });
      if (!account || account.deletedAt || account.status !== UserStatus.ACTIVE || !account.roles.includes(UserRole.PROVIDER)) throw new ForbiddenException('Provider account is not eligible for onboarding');
      const readiness = await this.readiness.evaluate(provider.id, manager);
      if (readiness.blockers.length) throw new ConflictException({ message: 'Provider onboarding configuration is incomplete', blockers: readiness.blockers, readiness });
      if (provider.onboardingStatus === ProviderOnboardingStatus.APPROVED) throw new ConflictException('Provider onboarding is already approved');
      provider.onboardingStatus = ProviderOnboardingStatus.SUBMITTED;
      provider.status = ProviderStatus.PENDING;
      provider.submittedAt = new Date();
      provider.reviewedAt = null;
      provider.reviewedByUserId = null;
      provider.reviewNote = null;
      await providerRepository.save(provider);
    });
    return this.get(user);
  }

  private async map(provider: Provider): Promise<ProviderOnboardingProfileResponseDto> {
    const readiness = await this.readiness.evaluate(provider.id);
    return { displayName: provider.displayName, email: provider.email!, phone: provider.phone, professionalReference: provider.professionalReference, providerType: provider.providerType, countryCode: provider.countryCode, stateOrRegion: provider.stateOrRegion, city: provider.city, status: provider.status, onboardingStatus: provider.onboardingStatus, submittedAt: provider.submittedAt, reviewedAt: provider.reviewedAt, reviewNote: provider.reviewNote, capabilityCount: readiness.capabilityCount, activeCapabilityCount: readiness.activeCapabilityCount, locationCount: readiness.locationCount, activeLocationCount: readiness.activeLocationCount, availabilityCount: readiness.availabilityCount, readiness };
  }
}
