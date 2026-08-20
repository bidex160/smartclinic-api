import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { BookingFundingStatus } from "../../bookings/enums/booking-funding-status.enum";
import { PaymentAttemptStatus } from "../enums/payment-attempt-status.enum";
export class PaymentOperationResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingFundingStatus })
  fundingStatus!: BookingFundingStatus;
  @ApiPropertyOptional({ format: "uuid", nullable: true }) attemptId!:
    | string
    | null;
  @ApiPropertyOptional({ enum: PaymentAttemptStatus, nullable: true })
  attemptStatus!: PaymentAttemptStatus | null;
  @ApiProperty() amount!: string;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true }) paymentReference!: string | null;
  @ApiPropertyOptional({ nullable: true }) checkoutUrl!: string | null;
  @ApiPropertyOptional({ nullable: true }) accessCode!: string | null;
}
