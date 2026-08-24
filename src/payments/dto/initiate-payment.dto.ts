import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CheckoutFundingOption } from '../../bookings/enums/checkout-funding-option.enum';
export class InitiatePaymentDto { @ApiProperty({ minLength: 8, maxLength: 100 }) @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string; @ApiPropertyOptional({ enum: CheckoutFundingOption, default: CheckoutFundingOption.PAY_NOW }) @IsOptional() @IsEnum(CheckoutFundingOption) option?: CheckoutFundingOption; }

export class PublicCheckoutSelectionDto {
  @ApiPropertyOptional({ enum: CheckoutFundingOption, default: CheckoutFundingOption.PAY_NOW })
  @IsOptional()
  @IsEnum(CheckoutFundingOption)
  option: CheckoutFundingOption = CheckoutFundingOption.PAY_NOW;
}
