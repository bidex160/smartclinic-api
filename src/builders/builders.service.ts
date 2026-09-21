import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { appConfig } from '../config/app.config';
import { RewardLevelDefinition } from '../rewards/entities/reward-level-definition.entity';
import { ReferralTargetType } from '../rewards/enums/referral-target-type.enum';
import { ReferralsService } from '../rewards/referrals.service';
import { User } from '../users/entities/user.entity';
import { UserNetworkRole } from '../users/enums/user-network-role.enum';
import { BuilderDashboardDto } from './dto/builder-dashboard.dto';

interface RequirementProgress {
  targetType: ReferralTargetType;
  required: number;
}

const BUILDER_TARGETS = [
  ReferralTargetType.PATIENT,
  ReferralTargetType.CLINIC,
  ReferralTargetType.LABORATORY,
  ReferralTargetType.PHARMACY,
] as const;

@Injectable()
export class BuildersService {
  constructor(
    private readonly referrals: ReferralsService,
    @InjectRepository(RewardLevelDefinition)
    private readonly levels: Repository<RewardLevelDefinition>,
    @Inject(appConfig.KEY) private readonly config: ConfigType<typeof appConfig>,
  ) {}

  async dashboard(user: User): Promise<BuilderDashboardDto> {
    if (![UserNetworkRole.BUILDER, UserNetworkRole.AMBASSADOR].includes(user.networkRole as UserNetworkRole)) {
      throw new ForbiddenException('Builder access is required');
    }

    const [summary, history] = await Promise.all([
      this.referrals.summary(user.id),
      this.referrals.history(user.id, { page: 1, limit: 5 }),
    ]);
    const requirements = summary.levelProgress.requirements.length
      ? summary.levelProgress.requirements
      : await this.completedLevelRequirements(summary.levelProgress.currentLevel?.code ?? null);
    const counts = summary.levelProgress.qualifiedCounts;
    const progress = BUILDER_TARGETS.map((target) => {
      const requirement = requirements.find((value) => value.targetType === target);
      const required = requirement?.required ?? 0;
      const qualified = counts[target] ?? 0;
      return {
        category: target,
        qualified,
        required,
        remaining: Math.max(required - qualified, 0),
        completed: required > 0 ? qualified >= required : true,
      };
    });

    return {
      referralCode: summary.referralCode,
      referralUrl: this.referralUrl(summary.referralCode),
      currentLevel: summary.levelProgress.currentLevel,
      nextLevel: summary.levelProgress.nextLevel,
      progress,
      qualifiedPatients: counts.PATIENT ?? 0,
      qualifiedClinics: counts.CLINIC ?? 0,
      qualifiedLaboratories: counts.LABORATORY ?? 0,
      qualifiedPharmacies: counts.PHARMACY ?? 0,
      recentReferrals: history.items.map((item, index) => ({
        reference: this.safeReferralReference(item.targetType, item.registeredAt, index),
        name: this.safeReferralName(item.targetType),
        type: item.targetType,
        status: item.status,
        createdAt: item.registeredAt instanceof Date ? item.registeredAt.toISOString() : new Date(item.registeredAt).toISOString(),
      })),
    };
  }

  private async completedLevelRequirements(code: string | null): Promise<RequirementProgress[]> {
    if (!code) return [];
    const level = await this.levels.findOne({
      where: { code, isActive: true },
      relations: { requirements: true },
    });
    return (level?.requirements ?? []).map((requirement) => ({
      targetType: requirement.targetType,
      required: requirement.requiredCount,
    }));
  }

  private referralUrl(code: string): string {
    const base = this.config.frontendUrl.replace(/\/+$/, '');
    return `${base}/join?ref=${encodeURIComponent(code)}`;
  }

  private safeReferralReference(targetType: ReferralTargetType, createdAt: Date | string, index: number): string {
    const timestamp = new Date(createdAt).getTime().toString(36).toUpperCase();
    return `REF-${targetType}-${timestamp}-${index + 1}`;
  }

  private safeReferralName(targetType: ReferralTargetType): string {
    switch (targetType) {
      case ReferralTargetType.PATIENT:
        return 'Patient referral';
      case ReferralTargetType.CLINIC:
        return 'Clinic referral';
      case ReferralTargetType.LABORATORY:
        return 'Laboratory referral';
      case ReferralTargetType.PHARMACY:
        return 'Pharmacy referral';
      case ReferralTargetType.INDIVIDUAL:
        return 'Individual provider referral';
    }
  }
}
