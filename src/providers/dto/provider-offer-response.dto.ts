import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderAssignment } from '../entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';

class ProviderOfferCatalogueItemDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class ProviderOfferParticipantDto { @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; }

export class ProviderOfferResponseDto {
  @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @ApiProperty({ enum: ProviderAssignmentStatus }) status!: ProviderAssignmentStatus;
  @ApiProperty({ format: 'date-time' }) offeredAt!: Date;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) respondedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) acceptedAt!: Date | null;
  @ApiProperty({ example: 'SC-2026-7F23B0C9D1E4' }) bookingReference!: string;
  @ApiProperty({ type: ProviderOfferCatalogueItemDto }) healthCheckPackage!: ProviderOfferCatalogueItemDto;
  @ApiProperty({ type: ProviderOfferCatalogueItemDto }) fulfilmentMode!: ProviderOfferCatalogueItemDto;
  @ApiProperty({ type: ProviderOfferParticipantDto }) participant!: ProviderOfferParticipantDto;
  @ApiPropertyOptional({ format: 'date', nullable: true }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeWindowStart!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeWindowEnd!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimezone!: string | null;
  @ApiPropertyOptional({ nullable: true }) responseReason!: string | null;

  static fromEntity(value: ProviderAssignment): ProviderOfferResponseDto {
    return {
      assignmentId: value.id, status: value.status, offeredAt: value.offeredAt, expiresAt: value.expiresAt,
      respondedAt: value.respondedAt, acceptedAt: value.acceptedAt, bookingReference: value.booking.bookingReference,
      healthCheckPackage: { code: value.booking.healthCheckPackage.code, name: value.booking.healthCheckPackage.name },
      fulfilmentMode: { code: value.booking.fulfilmentMode.code, name: value.booking.fulfilmentMode.name },
      participant: { givenName: value.booking.participant.givenName, familyName: value.booking.participant.familyName },
      preferredDate: value.booking.preferredDate, preferredTimeWindowStart: value.booking.preferredTimeWindowStart,
      preferredTimeWindowEnd: value.booking.preferredTimeWindowEnd, preferredTimezone: value.booking.preferredTimezone,
      responseReason: value.reasonNote,
    };
  }
}
