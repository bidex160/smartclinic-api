import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
import { MatchingResultResponseDto } from './provider-assignment-response.dto';

export enum StartMatchingOutcome {
  OFFER_CREATED = 'OFFER_CREATED',
  UNFULFILLABLE = 'UNFULFILLABLE',
}

export class AdminStartMatchingResponseDto {
  @ApiProperty({ example: 'SC-2026-7F23B0C9D1E4' }) bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty({ enum: StartMatchingOutcome }) outcome!: StartMatchingOutcome;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) assignmentId!: string | null;
  @ApiPropertyOptional({ enum: ProviderAssignmentStatus, nullable: true }) assignmentStatus!: ProviderAssignmentStatus | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) offerExpiresAt!: Date | null;

  static fromDomain(bookingReference: string, result: MatchingResultResponseDto): AdminStartMatchingResponseDto {
    return {
      bookingReference,
      bookingStatus: result.bookingStatus,
      outcome: result.assignment ? StartMatchingOutcome.OFFER_CREATED : StartMatchingOutcome.UNFULFILLABLE,
      assignmentId: result.assignment?.id ?? null,
      assignmentStatus: result.assignment?.status ?? null,
      offerExpiresAt: result.assignment?.expiresAt ?? null,
    };
  }
}

export class AdminExpireStaleOffersResponseDto {
  @ApiProperty() expiredCount!: number;
  @ApiProperty() continuedMatchingCount!: number;
  @ApiProperty() unfulfillableCount!: number;

  static fromDomain(result: { expiredCount: number; nextOffers: MatchingResultResponseDto[] }): AdminExpireStaleOffersResponseDto {
    return {
      expiredCount: result.expiredCount,
      continuedMatchingCount: result.nextOffers.filter((next) => next.assignment !== null).length,
      unfulfillableCount: result.nextOffers.filter((next) => next.bookingStatus === BookingStatus.UNFULFILLABLE).length,
    };
  }
}
