import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CurrentProviderService } from './current-provider.service';
import { ProviderOfferResponseDto } from './dto/provider-offer-response.dto';
import { ProviderAssignment } from './entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from './enums/provider-assignment-status.enum';
import { ProviderMatchingService } from './provider-matching.service';

const DEFAULT_OFFER_STATUSES = [ProviderAssignmentStatus.OFFERED, ProviderAssignmentStatus.ACCEPTED, ProviderAssignmentStatus.CONFIRMED];
const OFFER_RELATIONS = { booking: { healthCheckPackage: true, fulfilmentMode: true, participant: true, providerLocation: true, visitAddress: true } } as const;

@Injectable()
export class ProviderOffersService {
  constructor(
    @InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>,
    private readonly currentProvider: CurrentProviderService,
    private readonly matching: ProviderMatchingService,
  ) {}

  async list(user: User, status?: ProviderAssignmentStatus): Promise<ProviderOfferResponseDto[]> {
    const provider = await this.currentProvider.resolve(user);
    const where: FindOptionsWhere<ProviderAssignment> = { providerId: provider.id, status: status ?? In(DEFAULT_OFFER_STATUSES) };
    return (await this.assignments.find({ where, relations: OFFER_RELATIONS, order: { offeredAt: 'DESC' } })).map(ProviderOfferResponseDto.fromEntity);
  }

  async get(user: User, assignmentId: string): Promise<ProviderOfferResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    return ProviderOfferResponseDto.fromEntity(await this.requireOwnedOffer(provider.id, assignmentId));
  }

  async accept(user: User, assignmentId: string): Promise<ProviderOfferResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    await this.requireOwnedOffer(provider.id, assignmentId);
    await this.matching.acceptOffer(assignmentId, provider.id, undefined, user.id);
    return ProviderOfferResponseDto.fromEntity(await this.requireOwnedOffer(provider.id, assignmentId));
  }

  async decline(user: User, assignmentId: string, reason?: string): Promise<ProviderOfferResponseDto> {
    const provider = await this.currentProvider.resolve(user);
    await this.requireOwnedOffer(provider.id, assignmentId);
    await this.matching.declineOffer(assignmentId, provider.id, reason);
    return ProviderOfferResponseDto.fromEntity(await this.requireOwnedOffer(provider.id, assignmentId));
  }

  private async requireOwnedOffer(providerId: string, assignmentId: string): Promise<ProviderAssignment> {
    const assignment = await this.assignments.findOne({ where: { id: assignmentId, providerId }, relations: OFFER_RELATIONS });
    if (!assignment) throw new NotFoundException('Provider offer not found');
    return assignment;
  }
}
