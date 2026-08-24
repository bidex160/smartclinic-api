import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PaymentAttemptStatus } from "../enums/payment-attempt-status.enum";
import { PaymentOperationResponseDto } from "./payment-operation-response.dto";
import { BookingFundingStatus } from '../../bookings/enums/booking-funding-status.enum';
import { CheckoutFundingOption } from '../../bookings/enums/checkout-funding-option.enum';
export class PublicPaymentInitiationResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingFundingStatus }) fundingStatus!: BookingFundingStatus;
  @ApiProperty({ enum: CheckoutFundingOption }) checkoutOption!: CheckoutFundingOption;
  @ApiPropertyOptional({ nullable: true }) paymentAttemptReference!: string | null;
  @ApiPropertyOptional({ enum: PaymentAttemptStatus, nullable: true }) status!: PaymentAttemptStatus | null;
  @ApiProperty() amount!: string;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true }) checkoutUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) accessCode!: string | null;
  static fromOperation(
    value: PaymentOperationResponseDto,
    option: CheckoutFundingOption,
  ): PublicPaymentInitiationResponseDto {
    return {
      bookingReference: value.bookingReference,
      fundingStatus: value.fundingStatus,
      checkoutOption: option,
      paymentAttemptReference: value.paymentReference,
      status: value.attemptStatus,
      amount: value.amount,
      currency: value.currency,
      checkoutUrl: option === CheckoutFundingOption.PAY_LATER ? null : value.checkoutUrl,
      accessCode: option === CheckoutFundingOption.PAY_NOW ? value.accessCode : null,
    };
  }
}
