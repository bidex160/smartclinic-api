import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingFundingStatus } from '../../bookings/enums/booking-funding-status.enum';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { PaymentAttemptStatus } from '../enums/payment-attempt-status.enum';
import { CheckoutFundingOption } from '../../bookings/enums/checkout-funding-option.enum';
import { RewardBookingRedemptionStatus } from '../../rewards/enums/reward-booking-redemption-status.enum';

export class PublicPaymentStatusResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiPropertyOptional({ enum: BookingFundingStatus, nullable: true }) fundingStatus!: BookingFundingStatus | null;
  @ApiPropertyOptional({ enum: CheckoutFundingOption, nullable: true }) checkoutOption!: CheckoutFundingOption | null;
  @ApiPropertyOptional({ enum: PaymentAttemptStatus, nullable: true, description: 'Null means payment has not been started.' }) paymentStatus!: PaymentAttemptStatus | null;
  @ApiPropertyOptional({ nullable: true }) paymentAttemptReference!: string | null;
  @ApiPropertyOptional({ nullable: true }) amount!: string | null;
  @ApiPropertyOptional({ nullable: true }) currency!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true }) paidAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) bookingTotal!: string | null;
  @ApiProperty() pointsReserved!: number;
  @ApiProperty() pointsAmount!: string;
  @ApiPropertyOptional({ nullable: true }) remainingExternalAmount!: string | null;
  @ApiPropertyOptional({ enum: RewardBookingRedemptionStatus, nullable: true }) redemptionStatus!: RewardBookingRedemptionStatus | null;
}
