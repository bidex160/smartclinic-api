import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignment } from '../entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';

export class ProviderAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) bookingId!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ enum: ProviderAssignmentStatus }) status!: ProviderAssignmentStatus;
  @ApiProperty({ format: 'date-time' }) offeredAt!: Date;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) respondedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) acceptedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) confirmedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) reasonCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) reasonNote!: string | null;
  static fromEntity(value: ProviderAssignment): ProviderAssignmentResponseDto {
    return { id: value.id, bookingId: value.bookingId, providerId: value.providerId, status: value.status, offeredAt: value.offeredAt, respondedAt: value.respondedAt, acceptedAt: value.acceptedAt, confirmedAt: value.confirmedAt, expiresAt: value.expiresAt, reasonCode: value.reasonCode, reasonNote: value.reasonNote };
  }
}

export class MatchingResultResponseDto {
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiPropertyOptional({ type: ProviderAssignmentResponseDto, nullable: true }) assignment!: ProviderAssignmentResponseDto | null;
}
