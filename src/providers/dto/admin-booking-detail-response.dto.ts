import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingFundingSourceType } from '../../bookings/enums/booking-funding-source-type.enum';
import { BookingFundingStatus } from '../../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { PaymentAttemptStatus } from '../../payments/enums/payment-attempt-status.enum';
import { MatchingQueueReadiness } from '../enums/matching-queue-readiness.enum';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
import { CheckoutFundingOption } from '../../bookings/enums/checkout-funding-option.enum';

class AdminBookingCatalogueDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class AdminBookingParticipantDto { @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; }
class AdminBookingContactDto { @ApiPropertyOptional({ nullable: true }) givenName!: string | null; @ApiPropertyOptional({ nullable: true }) familyName!: string | null; @ApiPropertyOptional({ nullable: true }) email!: string | null; @ApiPropertyOptional({ nullable: true }) phone!: string | null; }
class AdminBookingFundingSummaryDto { @ApiPropertyOptional({ enum: BookingFundingStatus, nullable: true }) fundingStatus!: BookingFundingStatus | null; @ApiPropertyOptional({ enum: BookingFundingSourceType, nullable: true }) fundingType!: BookingFundingSourceType | null; @ApiPropertyOptional({ enum: CheckoutFundingOption, nullable: true }) checkoutOption!: CheckoutFundingOption | null; @ApiPropertyOptional({ nullable: true }) amount!: string | null; @ApiPropertyOptional({ nullable: true }) currency!: string | null; }
class AdminBookingPaymentSummaryDto { @ApiPropertyOptional({ enum: PaymentAttemptStatus, nullable: true }) status!: PaymentAttemptStatus | null; @ApiPropertyOptional({ nullable: true }) paymentReference!: string | null; @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) paidAt!: Date | null; }
class AdminBookingAssignmentSummaryDto { @ApiPropertyOptional({ format: 'uuid', nullable: true }) assignmentId!: string | null; @ApiPropertyOptional({ enum: ProviderAssignmentStatus, nullable: true }) assignmentStatus!: ProviderAssignmentStatus | null; @ApiPropertyOptional({ format: 'uuid', nullable: true }) providerId!: string | null; @ApiPropertyOptional({ nullable: true }) providerName!: string | null; @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) offeredAt!: Date | null; @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) acceptedAt!: Date | null; @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) confirmedAt!: Date | null; @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) expiresAt!: Date | null; }
class AdminBookingConfirmedLocationDto { @ApiProperty({ format: 'uuid' }) id!: string; @ApiProperty() name!: string; @ApiProperty() addressLine1!: string; @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null; @ApiProperty() city!: string; @ApiProperty() state!: string; @ApiProperty() countryCode!: string; }
class AdminBookingConfirmedScheduleDto { @ApiProperty({ format: 'date' }) date!: string; @ApiProperty() timeFrom!: string; @ApiProperty() timeTo!: string; @ApiProperty() timezone!: string; @ApiProperty({ format: 'date-time' }) scheduledAt!: Date; @ApiPropertyOptional({ type: AdminBookingConfirmedLocationDto, nullable: true }) providerLocation!: AdminBookingConfirmedLocationDto | null; }

export class AdminBookingDetailResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) status!: BookingStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: AdminBookingCatalogueDto }) package!: AdminBookingCatalogueDto;
  @ApiProperty({ type: AdminBookingCatalogueDto }) fulfilmentMode!: AdminBookingCatalogueDto;
  @ApiProperty({ type: AdminBookingParticipantDto }) participant!: AdminBookingParticipantDto;
  @ApiProperty({ type: AdminBookingContactDto }) bookerContact!: AdminBookingContactDto;
  @ApiPropertyOptional({ nullable: true }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeFrom!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimezone!: string | null;
  @ApiPropertyOptional({ nullable: true }) locationNote!: string | null;
  @ApiPropertyOptional({ nullable: true }) visitAddress!: { addressLine1: string; addressLine2: string | null; city: string; stateOrRegion: string; postalCode: string | null; countryCode: string } | null;
  @ApiPropertyOptional({ type: AdminBookingConfirmedScheduleDto, nullable: true }) confirmedSchedule!: AdminBookingConfirmedScheduleDto | null;
  @ApiPropertyOptional({ nullable: true }) quotedAmount!: string | null;
  @ApiPropertyOptional({ nullable: true }) quotedCurrency!: string | null;
  @ApiProperty({ type: AdminBookingFundingSummaryDto }) funding!: AdminBookingFundingSummaryDto;
  @ApiProperty({ type: AdminBookingPaymentSummaryDto }) payment!: AdminBookingPaymentSummaryDto;
  @ApiProperty({ type: AdminBookingAssignmentSummaryDto }) assignment!: AdminBookingAssignmentSummaryDto;
  @ApiProperty({ enum: MatchingQueueReadiness }) readiness!: MatchingQueueReadiness;
}
