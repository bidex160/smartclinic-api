import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { UserStatus } from '../users/enums/user-status.enum';
import { AuthorizeInternalClinicalProfessionalDto, InternalClinicalProfessionalListQueryDto } from './dto/guided-self-check-internal-clinical-professional.dto';
import { GuidedSelfCheckInternalClinicalProfessional } from './entities/guided-self-check-internal-clinical-professional.entity';
import { GuidedSelfCheckInternalClinicalProfessionalHistory } from './entities/guided-self-check-internal-clinical-professional-history.entity';
import {
  GuidedSelfCheckInternalClinicalCapability,
  GuidedSelfCheckInternalClinicalProfessionalEvent,
  GuidedSelfCheckInternalClinicalProfessionalStatus,
} from './enums/guided-self-check-internal-clinical-professional.enum';

@Injectable()
export class GuidedSelfCheckInternalClinicalProfessionalsService {
  constructor(
    @InjectRepository(GuidedSelfCheckInternalClinicalProfessional) private professionals: Repository<GuidedSelfCheckInternalClinicalProfessional>,
    private data: DataSource,
  ) {}

  async authorize(dto: AuthorizeInternalClinicalProfessionalDto, actorUserId: string) {
    return this.data.transaction(async manager => {
      const user = await manager.getRepository(User).findOne({
        where: { emailNormalized: dto.userEmail }, withDeleted: true, lock: { mode: 'pessimistic_write' },
      });
      if (!user || user.deletedAt || user.status !== UserStatus.ACTIVE) throw new ConflictException('An active existing User is required');
      const repo = manager.getRepository(GuidedSelfCheckInternalClinicalProfessional);
      const existing = await repo.findOne({ where: { userId: user.id }, lock: { mode: 'pessimistic_write' } });
      if (existing?.status === GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE) throw new ConflictException('This User is already an active internal clinical professional');
      const capabilities = [...new Set(dto.capabilities)];
      const professional = existing ?? repo.create({ userId: user.id });
      professional.displayName = dto.displayName.trim();
      professional.professionalType = dto.professionalType;
      professional.capabilities = capabilities;
      professional.status = GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE;
      professional.authorizedByUserId = actorUserId;
      professional.authorizedAt = new Date();
      professional.disabledAt = null;
      const saved = await repo.save(professional);
      await this.audit(manager, saved.id, GuidedSelfCheckInternalClinicalProfessionalEvent.INTERNAL_CLINICAL_PROFESSIONAL_AUTHORIZED, actorUserId, { capabilities });
      return this.view(saved);
    });
  }

  async disable(reference: string, actorUserId: string) {
    return this.data.transaction(async manager => {
      const professional = await this.lock(manager, reference);
      if (professional.status === GuidedSelfCheckInternalClinicalProfessionalStatus.DISABLED) return this.view(professional);
      professional.status = GuidedSelfCheckInternalClinicalProfessionalStatus.DISABLED;
      professional.disabledAt = new Date();
      await manager.save(professional);
      await this.audit(manager, professional.id, GuidedSelfCheckInternalClinicalProfessionalEvent.INTERNAL_CLINICAL_PROFESSIONAL_DISABLED, actorUserId, {});
      return this.view(professional);
    });
  }

  async changeCapability(reference: string, capability: GuidedSelfCheckInternalClinicalCapability, grant: boolean, actorUserId: string) {
    return this.data.transaction(async manager => {
      const professional = await this.lock(manager, reference);
      if (professional.status !== GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE) throw new ConflictException('The internal clinical professional is disabled');
      const capabilities = new Set(professional.capabilities);
      if (grant) capabilities.add(capability); else capabilities.delete(capability);
      professional.capabilities = [...capabilities];
      await manager.save(professional);
      await this.audit(manager, professional.id, grant ? GuidedSelfCheckInternalClinicalProfessionalEvent.CAPABILITY_GRANTED : GuidedSelfCheckInternalClinicalProfessionalEvent.CAPABILITY_REVOKED, actorUserId, { capability });
      return this.view(professional);
    });
  }

  async list(query: InternalClinicalProfessionalListQueryDto) {
    const builder = this.professionals.createQueryBuilder('professional').innerJoinAndSelect('professional.user', 'user');
    if (query.status) builder.andWhere('professional.status = :status', { status: query.status });
    if (query.capability) builder.andWhere(':capability = ANY(professional.capabilities)', { capability: query.capability });
    if (query.search) builder.andWhere('LOWER(professional.displayName) LIKE :search', { search: `%${query.search.trim().toLowerCase()}%` });
    builder.orderBy('professional.displayName', 'ASC').addOrderBy('professional.id', 'ASC').skip((query.page - 1) * query.limit).take(query.limit);
    const [rows, total] = await builder.getManyAndCount();
    return { items: rows.map(row => this.view(row)), total, page: query.page, limit: query.limit };
  }

  async eligible(reference: string, capability: GuidedSelfCheckInternalClinicalCapability, manager: EntityManager = this.data.manager) {
    const professional = await manager.getRepository(GuidedSelfCheckInternalClinicalProfessional).findOne({
      where: { reference }, relations: { user: true }, lock: manager.queryRunner ? { mode: 'pessimistic_read' } : undefined,
    });
    this.assertEligible(professional, capability);
    return professional!;
  }

  async eligibleForUser(userId: string, capability: GuidedSelfCheckInternalClinicalCapability, manager: EntityManager = this.data.manager) {
    const professional = await manager.getRepository(GuidedSelfCheckInternalClinicalProfessional).findOne({
      where: { userId }, relations: { user: true }, lock: manager.queryRunner ? { mode: 'pessimistic_read' } : undefined,
    });
    this.assertEligible(professional, capability);
    return professional!;
  }

  private assertEligible(professional: GuidedSelfCheckInternalClinicalProfessional | null, capability: GuidedSelfCheckInternalClinicalCapability) {
    if (!professional || professional.status !== GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE || professional.disabledAt || !professional.user || professional.user.deletedAt || professional.user.status !== UserStatus.ACTIVE || !professional.capabilities.includes(capability)) {
      throw new ForbiddenException('Active internal clinical professional capability is required');
    }
  }

  private async lock(manager: EntityManager, reference: string) {
    const professional = await manager.getRepository(GuidedSelfCheckInternalClinicalProfessional).findOne({ where: { reference }, relations: { user: true }, lock: { mode: 'pessimistic_write' } });
    if (!professional) throw new NotFoundException('Internal clinical professional was not found');
    return professional;
  }

  private audit(manager: EntityManager, professionalId: string, event: GuidedSelfCheckInternalClinicalProfessionalEvent, actorUserId: string, metadata: Record<string, unknown>) {
    return manager.getRepository(GuidedSelfCheckInternalClinicalProfessionalHistory).save({ professionalId, event, actorUserId, metadata });
  }

  private view(professional: GuidedSelfCheckInternalClinicalProfessional) {
    return {
      reference: professional.reference,
      displayName: professional.displayName,
      professionalType: professional.professionalType,
      status: professional.status,
      capabilities: professional.capabilities,
      authorizedAt: professional.authorizedAt,
      disabledAt: professional.disabledAt,
      createdAt: professional.createdAt,
    };
  }
}
