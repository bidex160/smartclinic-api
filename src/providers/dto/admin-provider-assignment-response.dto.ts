import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignment } from '../entities/provider-assignment.entity';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';

class AdminAssignmentCatalogueItemDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class AdminAssignmentParticipantDto { @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; }
class AdminAssignmentProviderDto { @ApiProperty({ format: 'uuid' }) id!: string; @ApiProperty() displayName!: string; }

export class AdminProviderAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' }) assignmentId!: string;
  @ApiProperty({ enum: ProviderAssignmentStatus }) status!: ProviderAssignmentStatus;
  @ApiProperty({ format: 'date-time' }) offeredAt!: Date;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) expiresAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) respondedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) acceptedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) confirmedAt!: Date | null;
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty({ type: AdminAssignmentCatalogueItemDto }) healthCheckPackage!: AdminAssignmentCatalogueItemDto;
  @ApiProperty({ type: AdminAssignmentCatalogueItemDto }) fulfilmentMode!: AdminAssignmentCatalogueItemDto;
  @ApiProperty({ type: AdminAssignmentParticipantDto }) participant!: AdminAssignmentParticipantDto;
  @ApiProperty({ type: AdminAssignmentProviderDto }) provider!: AdminAssignmentProviderDto;
  @ApiPropertyOptional({ format: 'date', nullable: true }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeWindowStart!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeWindowEnd!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimezone!: string | null;
  @ApiPropertyOptional({ nullable: true }) declineReason!: string | null;

  static fromEntity(value: ProviderAssignment): AdminProviderAssignmentResponseDto {
    return {
      assignmentId: value.id, status: value.status, offeredAt: value.offeredAt, expiresAt: value.expiresAt,
      respondedAt: value.respondedAt, acceptedAt: value.acceptedAt, confirmedAt: value.confirmedAt,
      bookingReference: value.booking.bookingReference, bookingStatus: value.booking.status,
      healthCheckPackage: { code: value.booking.healthCheckPackage.code, name: value.booking.healthCheckPackage.name },
      fulfilmentMode: { code: value.booking.fulfilmentMode.code, name: value.booking.fulfilmentMode.name },
      participant: { givenName: value.booking.participant.givenName, familyName: value.booking.participant.familyName },
      provider: { id: value.providerId, displayName: value.provider.displayName },
      preferredDate: value.booking.preferredDate, preferredTimeWindowStart: value.booking.preferredTimeWindowStart,
      preferredTimeWindowEnd: value.booking.preferredTimeWindowEnd, preferredTimezone: value.booking.preferredTimezone,
      declineReason: value.status === ProviderAssignmentStatus.DECLINED ? value.reasonNote : null,
    };
  }
}
