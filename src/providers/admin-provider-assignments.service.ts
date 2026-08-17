import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { AdminProviderAssignmentQueryDto } from './dto/admin-provider-assignment-query.dto';
import { AdminProviderAssignmentResponseDto } from './dto/admin-provider-assignment-response.dto';
import { ProviderAssignment } from './entities/provider-assignment.entity';

const ADMIN_ASSIGNMENT_RELATIONS = { booking: { healthCheckPackage: true, fulfilmentMode: true, participant: true }, provider: true } as const;

@Injectable()
export class AdminProviderAssignmentsService {
  constructor(@InjectRepository(ProviderAssignment) private readonly assignments: Repository<ProviderAssignment>) {}

  async list(query: AdminProviderAssignmentQueryDto): Promise<AdminProviderAssignmentResponseDto[]> {
    const where: FindOptionsWhere<ProviderAssignment> = {};
    if (query.providerId) where.providerId = query.providerId;
    if (query.status) where.status = query.status;
    if (query.bookingReference) where.booking = { bookingReference: query.bookingReference };
    return (await this.assignments.find({ where, relations: ADMIN_ASSIGNMENT_RELATIONS, order: { offeredAt: 'DESC' } })).map(AdminProviderAssignmentResponseDto.fromEntity);
  }

  async get(id: string): Promise<AdminProviderAssignmentResponseDto> {
    const assignment = await this.assignments.findOne({ where: { id }, relations: ADMIN_ASSIGNMENT_RELATIONS });
    if (!assignment) throw new NotFoundException('Provider assignment not found');
    return AdminProviderAssignmentResponseDto.fromEntity(assignment);
  }
}
