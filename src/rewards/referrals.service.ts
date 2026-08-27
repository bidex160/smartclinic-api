import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { randomBytes } from "node:crypto";
import { EntityManager, Repository } from "typeorm";
import { HealthCheckEncounter } from "../health-checks/entities/health-check-encounter.entity";
import { HealthCheckEncounterStatus } from "../health-checks/enums/health-check-encounter-status.enum";
import { Provider } from "../providers/entities/provider.entity";
import { ProviderOnboardingStatus } from "../providers/enums/provider-onboarding-status.enum";
import { ProviderStatus } from "../providers/enums/provider-status.enum";
import { ProviderType } from "../providers/enums/provider-type.enum";
import {
  AdminReferralQueryDto,
  ReferralHistoryQueryDto,
  ReferralLevelProgressDto,
  ReferralSummaryDto,
} from "./dto/referral.dto";
import { ReferralCode } from "./entities/referral-code.entity";
import { Referral } from "./entities/referral.entity";
import { RewardLevelAchievement } from "./entities/reward-level-achievement.entity";
import { RewardLevelDefinition } from "./entities/reward-level-definition.entity";
import { RewardPointsLedger } from "./entities/reward-points-ledger.entity";
import { RewardRule } from "./entities/reward-rule.entity";
import { ReferralStatus } from "./enums/referral-status.enum";
import { ReferralTargetType } from "./enums/referral-target-type.enum";
import { RewardLedgerDirection } from "./enums/reward-ledger-direction.enum";
import { User } from "../users/entities/user.entity";
import { RewardWithdrawalsService } from "./reward-withdrawals.service";

const QUALIFIED_RULE: Record<ReferralTargetType, string> = {
  [ReferralTargetType.PATIENT]: "PATIENT_QUALIFIED",
  [ReferralTargetType.CLINIC]: "CLINIC_QUALIFIED",
  [ReferralTargetType.LABORATORY]: "LABORATORY_QUALIFIED",
  [ReferralTargetType.PHARMACY]: "PHARMACY_QUALIFIED",
};

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  constructor(
    @InjectRepository(ReferralCode)
    private readonly codes: Repository<ReferralCode>,
    @InjectRepository(Referral)
    private readonly referrals: Repository<Referral>,
    @InjectRepository(RewardPointsLedger)
    private readonly ledger: Repository<RewardPointsLedger>,
    @InjectRepository(RewardLevelDefinition)
    private readonly levels: Repository<RewardLevelDefinition>,
    private readonly withdrawals: RewardWithdrawalsService,
  ) {}

  async ensureReferralCode(
    userId: string,
    manager: EntityManager = this.codes.manager,
  ): Promise<ReferralCode> {
    const repository = manager.getRepository(ReferralCode);
    const existing = await repository.findOne({ where: { userId } });
    if (existing) return existing;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const codeNormalized = `SC-${randomBytes(3).toString("hex").toUpperCase()}`;
      if (await repository.exists({ where: { codeNormalized } })) continue;
      return repository.save(
        repository.create({ userId, codeNormalized, isActive: true }),
      );
    }
    throw new ConflictException("Unable to issue a unique referral code");
  }

  async capturePatient(
    manager: EntityManager,
    rawCode: string,
    referredUserId: string,
    referredPatientId: string,
  ): Promise<Referral> {
    return this.capture(
      manager,
      rawCode,
      ReferralTargetType.PATIENT,
      referredUserId,
      referredPatientId,
      null,
    );
  }

  async captureProvider(
    manager: EntityManager,
    rawCode: string,
    provider: Provider,
    intended?: ReferralTargetType,
  ): Promise<Referral> {
    const targetType = this.providerTarget(provider.providerType);
    if (!targetType)
      throw new BadRequestException(
        "This provider classification is not eligible for the supplied referral code",
      );
    if (intended && intended !== targetType)
      throw new BadRequestException(
        "Referral target does not match the authoritative provider classification",
      );
    return this.capture(
      manager,
      rawCode,
      targetType,
      provider.userId!,
      null,
      provider.id,
    );
  }

  async qualifyPatient(patientId: string): Promise<void> {
    await this.referrals.manager.transaction(async (manager) => {
      const referral = await manager
        .getRepository(Referral)
        .findOne({
          where: {
            referredPatientId: patientId,
            targetType: ReferralTargetType.PATIENT,
          },
          lock: { mode: "pessimistic_write" },
        });
      if (!referral || referral.status === ReferralStatus.QUALIFIED) return;
      const completed = await manager
        .getRepository(HealthCheckEncounter)
        .createQueryBuilder("encounter")
        .innerJoin("encounter.booking", "booking")
        .where("booking.participantPatientId = :patientId", { patientId })
        .andWhere("encounter.status = :status", {
          status: HealthCheckEncounterStatus.COMPLETED,
        })
        .getCount();
      if (completed < 1) return;
      await this.qualify(manager, referral);
    });
  }

  async qualifyProvider(
    providerId: string,
    externalManager?: EntityManager,
  ): Promise<void> {
    const qualify = async (manager: EntityManager) => {
      const referral = await manager
        .getRepository(Referral)
        .findOne({
          where: { referredProviderId: providerId },
          lock: { mode: "pessimistic_write" },
        });
      if (!referral || referral.status === ReferralStatus.QUALIFIED) return;
      const provider = await manager
        .getRepository(Provider)
        .findOne({ where: { id: providerId }, withDeleted: true });
      if (
        !provider ||
        provider.deletedAt ||
        provider.status !== ProviderStatus.ACTIVE ||
        provider.onboardingStatus !== ProviderOnboardingStatus.APPROVED
      )
        return;
      if (this.providerTarget(provider.providerType) !== referral.targetType)
        return;
      await this.qualify(manager, referral);
    };
    if (externalManager) return qualify(externalManager);
    await this.referrals.manager.transaction(qualify);
  }

  async summary(userId: string): Promise<ReferralSummaryDto> {
    const code = await this.ensureReferralCode(userId);
    const [counts, balance, levels, achievements, totals] = await Promise.all([
      this.qualifiedCounts(userId),
      this.withdrawals.balance(userId),
      this.levels.find({
        where: { isActive: true },
        relations: { requirements: true },
        order: { ordinal: "ASC" },
      }),
      this.levels.manager
        .getRepository(RewardLevelAchievement)
        .find({
          where: { userId },
          relations: { level: true },
        }),
      this.referrals
        .createQueryBuilder("referral")
        .select("COUNT(*)", "registered")
        .addSelect(
          `COUNT(*) FILTER (WHERE referral.status = :qualified)`,
          "qualified",
        )
        .where("referral.referrerUserId = :userId", { userId })
        .setParameter("qualified", ReferralStatus.QUALIFIED)
        .getRawOne<{ registered: string; qualified: string }>(),
    ]);
    const levelProgress = this.levelProgress(levels, achievements, counts);
    const nextDefinition = levels.find((level) => level.code === levelProgress.nextLevel?.code) ?? null;
    const legacyProgress = this.progress(nextDefinition, counts);
    return {
      referralCode: code.codeNormalized,
      links: {
        PATIENT: `/register?ref=${code.codeNormalized}`,
        CLINIC: `/provider/register?ref=${code.codeNormalized}&type=CLINIC`,
        LABORATORY: `/provider/register?ref=${code.codeNormalized}&type=LABORATORY`,
        PHARMACY: `/provider/register?ref=${code.codeNormalized}&type=PHARMACY`,
      },
      ...balance,
      levelProgress,
      currentLevel: levelProgress.currentLevel ? { code: levelProgress.currentLevel.code, name: levelProgress.currentLevel.name } : null,
      nextLevel: levelProgress.nextLevel ? { code: levelProgress.nextLevel.code, name: levelProgress.nextLevel.name } : null,
      progress: legacyProgress,
      completed: levelProgress.highestLevelAchieved > 0,
      registeredDirectReferrals: Number(totals?.registered ?? 0),
      qualifiedDirectReferrals: Number(totals?.qualified ?? 0),
    };
  }

  async history(userId: string, query: ReferralHistoryQueryDto) {
    const builder = this.referrals
      .createQueryBuilder("referral")
      .where("referral.referrerUserId = :userId", { userId });
    if (query.targetType)
      builder.andWhere("referral.targetType = :targetType", {
        targetType: query.targetType,
      });
    if (query.status)
      builder.andWhere("referral.status = :status", { status: query.status });
    builder
      .orderBy("referral.createdAt", "DESC")
      .addOrderBy("referral.id", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    const points = rows.length
      ? await this.ledger
          .createQueryBuilder("entry")
          .select("entry.referralId", "referralId")
          .addSelect(
            `COALESCE(SUM(CASE WHEN entry.direction = :credit THEN entry.points ELSE -entry.points END), 0)`,
            "points",
          )
          .where("entry.referralId IN (:...ids)", {
            ids: rows.map((row) => row.id),
            credit: RewardLedgerDirection.CREDIT,
          })
          .groupBy("entry.referralId")
          .getRawMany<{ referralId: string; points: string }>()
      : [];
    const byReferral = new Map(
      points.map((value) => [value.referralId, Number(value.points)]),
    );
    return {
      items: rows.map((row) => ({
        targetType: row.targetType,
        status: row.status,
        registeredAt: row.createdAt,
        qualifiedAt: row.qualifiedAt,
        pointsEarned: byReferral.get(row.id) ?? 0,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total ? Math.ceil(total / query.limit) : 0,
    };
  }

  async adminHistory(query: AdminReferralQueryDto) {
    const builder = this.referrals
      .createQueryBuilder("referral")
      .innerJoin("referral.referrerUser", "referrer");
    if (query.targetType)
      builder.andWhere("referral.targetType = :targetType", {
        targetType: query.targetType,
      });
    if (query.status)
      builder.andWhere("referral.status = :status", { status: query.status });
    if (query.referrerEmail)
      builder.andWhere("referrer.emailNormalized = :email", {
        email: query.referrerEmail,
      });
    if (query.qualifiedFrom)
      builder.andWhere("referral.qualifiedAt >= :from", {
        from: `${query.qualifiedFrom}T00:00:00.000Z`,
      });
    if (query.qualifiedTo)
      builder.andWhere(
        "referral.qualifiedAt < (:to::date + INTERVAL '1 day')",
        { to: query.qualifiedTo },
      );
    if (query.levelAchieved)
      builder.andWhere(
        `EXISTS (SELECT 1 FROM reward_level_achievements achievement INNER JOIN reward_level_definitions level ON level.id = achievement.level_id WHERE achievement.user_id = referral.referrer_user_id AND level.code = :levelCode)`,
        { levelCode: query.levelAchieved.trim().toUpperCase() },
      );
    builder
      .orderBy("referral.createdAt", "DESC")
      .addOrderBy("referral.id", "DESC")
      .skip((query.page - 1) * query.limit)
      .take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    return {
      items: rows.map((row) => ({
        targetType: row.targetType,
        status: row.status,
        registeredAt: row.createdAt,
        qualifiedAt: row.qualifiedAt,
      })),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total ? Math.ceil(total / query.limit) : 0,
    };
  }

  async adminMetrics(): Promise<{
    registered: number;
    qualified: number;
    level1Achieved: number;
    levels: { code: string; name: string; ordinal: number; achieved: number }[];
    pointsIssued: number;
  }> {
    const [referrals, levelRows, points] = await Promise.all([
      this.referrals
        .createQueryBuilder("referral")
        .select("COUNT(*)", "registered")
        .addSelect(
          `COUNT(*) FILTER (WHERE referral.status = :qualified)`,
          "qualified",
        )
        .setParameter("qualified", ReferralStatus.QUALIFIED)
        .getRawOne<{ registered: string; qualified: string }>(),
      this.levels
        .createQueryBuilder("level")
        .leftJoin("reward_level_achievements", "achievement", "achievement.level_id = level.id")
        .select("level.code", "code")
        .addSelect("level.name", "name")
        .addSelect("level.ordinal", "ordinal")
        .addSelect("COUNT(achievement.id)", "achieved")
        .where("level.isActive = true")
        .groupBy("level.id")
        .addGroupBy("level.code")
        .addGroupBy("level.name")
        .addGroupBy("level.ordinal")
        .orderBy("level.ordinal", "ASC")
        .getRawMany<{ code: string; name: string; ordinal: string; achieved: string }>(),
      this.ledger
        .createQueryBuilder("entry")
        .select(
          `COALESCE(SUM(CASE WHEN entry.direction = :credit THEN entry.points ELSE 0 END), 0)`,
          "points",
        )
        .setParameter("credit", RewardLedgerDirection.CREDIT)
        .getRawOne<{ points: string }>(),
    ]);
    const levelMetrics = levelRows.map((row) => ({ code: row.code, name: row.name, ordinal: Number(row.ordinal), achieved: Number(row.achieved) }));
    return {
      registered: Number(referrals?.registered ?? 0),
      qualified: Number(referrals?.qualified ?? 0),
      level1Achieved: levelMetrics.find((level) => level.code === "LEVEL_1")?.achieved ?? 0,
      levels: levelMetrics,
      pointsIssued: Number(points?.points ?? 0),
    };
  }

  adminWithdrawalMetrics() {
    return this.withdrawals.metrics();
  }

  private async capture(
    manager: EntityManager,
    rawCode: string,
    targetType: ReferralTargetType,
    referredUserId: string,
    patientId: string | null,
    providerId: string | null,
  ): Promise<Referral> {
    const normalized = rawCode.trim().toUpperCase();
    if (!/^SC-[A-F0-9]{6}$/.test(normalized))
      throw new BadRequestException("Referral code is invalid");
    const code = await manager
      .getRepository(ReferralCode)
      .findOne({ where: { codeNormalized: normalized, isActive: true } });
    if (!code) throw new BadRequestException("Referral code is invalid");
    if (code.userId === referredUserId)
      throw new BadRequestException("Self-referral is not allowed");
    if (
      await manager
        .getRepository(Referral)
        .exists({ where: { referredUserId } })
    )
      throw new ConflictException(
        "This account already has a referral relationship",
      );
    return manager
      .getRepository(Referral)
      .save(
        manager
          .getRepository(Referral)
          .create({
            referrerUserId: code.userId,
            referralCodeId: code.id,
            targetType,
            status: ReferralStatus.REGISTERED,
            referredUserId,
            referredPatientId: patientId,
            referredProviderId: providerId,
            qualifiedAt: null,
          }),
      );
  }

  private async qualify(
    manager: EntityManager,
    referral: Referral,
  ): Promise<void> {
    await manager
      .getRepository(User)
      .findOne({
        where: { id: referral.referrerUserId },
        lock: { mode: "pessimistic_write" },
      });
    const ruleCode = QUALIFIED_RULE[referral.targetType];
    const rule = await manager
      .getRepository(RewardRule)
      .findOne({ where: { code: ruleCode, isActive: true } });
    if (!rule || rule.points <= 0)
      throw new ConflictException(
        `Active reward rule ${ruleCode} is not configured`,
      );
    referral.status = ReferralStatus.QUALIFIED;
    referral.qualifiedAt = new Date();
    await manager.getRepository(Referral).save(referral);
    await this.credit(
      manager,
      referral.referrerUserId,
      referral.id,
      `REFERRAL_QUALIFIED:${referral.id}`,
      ruleCode,
      rule.points,
    );
    await this.evaluateAchievements(manager, referral.referrerUserId);
  }

  async recalculateReferralAchievements(userId: string): Promise<void> {
    await this.referrals.manager.transaction(async (manager) => {
      const user = await manager.getRepository(User).findOne({ where: { id: userId }, lock: { mode: "pessimistic_write" } });
      if (!user) throw new BadRequestException("User does not exist");
      await this.evaluateAchievements(manager, userId);
    });
  }

  private async evaluateAchievements(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const levels = await manager
      .getRepository(RewardLevelDefinition)
      .find({
        where: { isActive: true },
        relations: { requirements: true },
        order: { ordinal: "ASC" },
      });
    if (!levels.length) return;
    const existing = await manager
      .getRepository(RewardLevelAchievement)
      .find({ where: { userId } });
    const achieved = new Set(existing.map((value) => value.levelId));
    const counts = await this.qualifiedCounts(userId, manager);
    for (const level of levels) {
      const satisfied = level.requirements.length > 0 && level.requirements.every(
        (requirement) =>
          (counts.get(requirement.targetType) ?? 0) >=
          requirement.requiredCount,
      );
      if (!satisfied) break;
      if (achieved.has(level.id)) continue;
      await manager.getRepository(RewardLevelAchievement).save(manager.getRepository(RewardLevelAchievement).create({ userId, levelId: level.id }));
      achieved.add(level.id);
      const bonusCode = `${level.code}_COMPLETED`;
      const bonus = await manager.getRepository(RewardRule).findOne({ where: { code: bonusCode, isActive: true } });
      if (bonus?.points && bonus.points > 0) await this.credit(manager, userId, null, `LEVEL_ACHIEVED:${userId}:${level.code}`, bonusCode, bonus.points);
    }
  }

  private async credit(
    manager: EntityManager,
    userId: string,
    referralId: string | null,
    eventKey: string,
    eventType: string,
    points: number,
  ): Promise<void> {
    const repository = manager.getRepository(RewardPointsLedger);
    if (await repository.exists({ where: { eventKey } })) return;
    await repository.save(
      repository.create({
        userId,
        referralId,
        eventKey,
        eventType,
        direction: RewardLedgerDirection.CREDIT,
        points,
        reasonCode: eventType,
      }),
    );
  }

  private async qualifiedCounts(
    userId: string,
    manager: EntityManager = this.referrals.manager,
  ): Promise<Map<ReferralTargetType, number>> {
    const rows = await manager
      .getRepository(Referral)
      .createQueryBuilder("referral")
      .select("referral.targetType", "targetType")
      .addSelect("COUNT(*)", "count")
      .where("referral.referrerUserId = :userId", { userId })
      .andWhere("referral.status = :status", {
        status: ReferralStatus.QUALIFIED,
      })
      .groupBy("referral.targetType")
      .getRawMany<{ targetType: ReferralTargetType; count: string }>();
    return new Map(rows.map((row) => [row.targetType, Number(row.count)]));
  }

  private progress(
    level: RewardLevelDefinition | null,
    counts: Map<ReferralTargetType, number>,
  ): ReferralLevelProgressDto {
    const required = (target: ReferralTargetType) =>
      level?.requirements.find((value) => value.targetType === target)
        ?.requiredCount ?? 0;
    const value = (target: ReferralTargetType) => ({
      qualified: counts.get(target) ?? 0,
      required: required(target),
    });
    return {
      patients: value(ReferralTargetType.PATIENT),
      clinics: value(ReferralTargetType.CLINIC),
      laboratories: value(ReferralTargetType.LABORATORY),
      pharmacies: value(ReferralTargetType.PHARMACY),
    };
  }

  private levelProgress(levels: RewardLevelDefinition[], achievements: RewardLevelAchievement[], counts: Map<ReferralTargetType, number>) {
    const ordered = [...levels].sort((a, b) => a.ordinal - b.ordinal);
    const achievedIds = new Set(achievements.map((achievement) => achievement.levelId));
    const historical = ordered.filter((level) => achievedIds.has(level.id));
    const current = historical.length ? historical[historical.length - 1] : null;
    const next = ordered.find((level) => !current || level.ordinal > current.ordinal) ?? null;
    const summary = (level: RewardLevelDefinition | null) => level ? { code: level.code, name: level.name, ordinal: level.ordinal } : null;
    return {
      currentLevel: summary(current),
      nextLevel: summary(next),
      highestLevelAchieved: current?.ordinal ?? 0,
      requirements: next ? [...next.requirements].sort((a, b) => a.targetType.localeCompare(b.targetType)).map((requirement) => {
        const qualified = counts.get(requirement.targetType) ?? 0;
        return { targetType: requirement.targetType, qualified, required: requirement.requiredCount, remaining: Math.max(requirement.requiredCount - qualified, 0), completed: qualified >= requirement.requiredCount };
      }) : [],
      highestConfiguredLevelReached: Boolean(current && !next),
      qualifiedCounts: Object.fromEntries(Object.values(ReferralTargetType).map((target) => [target, counts.get(target) ?? 0])) as Record<ReferralTargetType, number>,
    };
  }

  private providerTarget(type: ProviderType): ReferralTargetType | null {
    if (type === ProviderType.CLINIC) return ReferralTargetType.CLINIC;
    if (type === ProviderType.DIAGNOSTIC_CENTRE)
      return ReferralTargetType.LABORATORY;
    if (type === ProviderType.PHARMACY) return ReferralTargetType.PHARMACY;
    return null;
  }

  logQualificationFailure(kind: string, id: string): void {
    this.logger.error(`Referral qualification failed after ${kind} ${id}`);
  }
}
