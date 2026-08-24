import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingFundingStatus } from '../../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
import { MatchingQueueReadiness } from '../enums/matching-queue-readiness.enum';

class MatchingQueueCatalogueDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class MatchingQueueParticipantDto { @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; }

export class AdminMatchingQueueItemDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty({ type: MatchingQueueCatalogueDto }) package!: MatchingQueueCatalogueDto;
  @ApiProperty({ type: MatchingQueueCatalogueDto }) fulfilmentMode!: MatchingQueueCatalogueDto;
  @ApiProperty({ type: MatchingQueueParticipantDto }) participant!: MatchingQueueParticipantDto;
  @ApiPropertyOptional({ nullable: true }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeFrom!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimezone!: string | null;
  @ApiPropertyOptional({ nullable: true }) visitArea!: { city: string; stateOrRegion: string; countryCode: string } | null;
  @ApiPropertyOptional({ enum: BookingFundingStatus, nullable: true }) fundingStatus!: BookingFundingStatus | null;
  @ApiPropertyOptional({ nullable: true }) quotedAmount!: string | null;
  @ApiPropertyOptional({ nullable: true }) quotedCurrency!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiPropertyOptional({ enum: ProviderAssignmentStatus, nullable: true }) currentAssignmentStatus!: ProviderAssignmentStatus | null;
  @ApiPropertyOptional({ nullable: true }) currentProviderName!: string | null;
  @ApiProperty({ enum: MatchingQueueReadiness }) readiness!: MatchingQueueReadiness;
}

export class AdminMatchingQueueResponseDto {
  @ApiProperty({ type: AdminMatchingQueueItemDto, isArray: true }) items!: AdminMatchingQueueItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
