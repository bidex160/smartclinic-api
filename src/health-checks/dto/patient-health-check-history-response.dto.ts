import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';
import { BookingFundingStatus } from '../../bookings/enums/booking-funding-status.enum';
import { CheckoutFundingOption } from '../../bookings/enums/checkout-funding-option.enum';
import { PaymentAttemptStatus } from '../../payments/enums/payment-attempt-status.enum';

export enum PatientHealthCheckPortalCategory { AWAITING_PAYMENT = 'AWAITING_PAYMENT', UPCOMING_ACTIVE = 'UPCOMING_ACTIVE', COMPLETED_HISTORY = 'COMPLETED_HISTORY', NEEDS_ATTENTION = 'NEEDS_ATTENTION', CLOSED = 'CLOSED' }

class PatientHealthCheckCatalogueDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class PatientConfirmedScheduleDto { @ApiProperty({ format: 'date' }) date!: string; @ApiProperty() timeFrom!: string; @ApiProperty() timeTo!: string; @ApiProperty() timezone!: string; @ApiPropertyOptional({ nullable: true }) providerLocationName!: string | null; @ApiPropertyOptional({ nullable: true }) providerLocation!: { name: string; addressLine1: string; addressLine2: string | null; city: string; stateOrRegion: string; postalCode: string | null; countryCode: string } | null; }
export class PatientHealthCheckHistoryItemDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: PatientHealthCheckCatalogueDto }) healthCheckPackage!: PatientHealthCheckCatalogueDto;
  @ApiProperty({ type: PatientHealthCheckCatalogueDto }) fulfilmentMode!: PatientHealthCheckCatalogueDto;
  @ApiPropertyOptional({ format: 'date', nullable: true }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeFrom!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimezone!: string | null;
  @ApiPropertyOptional({ nullable: true }) visitAddressSummary!: { city: string; stateOrRegion: string; countryCode: string } | null;
  @ApiPropertyOptional({ type: PatientConfirmedScheduleDto, nullable: true }) confirmedSchedule!: PatientConfirmedScheduleDto | null;
  @ApiPropertyOptional({ nullable: true }) providerDisplayName!: string | null;
  @ApiPropertyOptional({ enum: HealthCheckEncounterStatus, nullable: true }) encounterStatus!: HealthCheckEncounterStatus | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) startedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) completedAt!: Date | null;
  @ApiProperty() hasCompletedResult!: boolean;
  @ApiProperty({ enum: PatientHealthCheckPortalCategory }) portalCategory!: PatientHealthCheckPortalCategory;
  @ApiPropertyOptional({ enum: BookingFundingStatus, nullable: true }) fundingStatus!: BookingFundingStatus | null;
  @ApiPropertyOptional({ enum: CheckoutFundingOption, nullable: true }) checkoutOption!: CheckoutFundingOption | null;
  @ApiPropertyOptional({ enum: PaymentAttemptStatus, nullable: true }) paymentStatus!: PaymentAttemptStatus | null;
}
export class PatientHealthCheckDetailResponseDto extends PatientHealthCheckHistoryItemDto {
  @ApiPropertyOptional({ nullable: true }) visitAddress!: { addressLine1: string; addressLine2: string | null; city: string; stateOrRegion: string; postalCode: string | null; countryCode: string } | null;
}
export class PatientHealthCheckHistoryResponseDto {
  @ApiProperty({ type: PatientHealthCheckHistoryItemDto, isArray: true }) items!: PatientHealthCheckHistoryItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
