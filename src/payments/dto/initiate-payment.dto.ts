import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; import { Transform } from 'class-transformer'; import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CheckoutFundingOption } from '../../bookings/enums/checkout-funding-option.enum';
const normalizeOptionalEmail = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().toLowerCase() || undefined : value;

export class PaymentContactDto {
  @ApiPropertyOptional({ description: 'Real contact email used for payment only when the account has no usable email.', maxLength: 254 })
  @Transform(normalizeOptionalEmail)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  paymentEmail?: string;
}

export class InitiatePaymentDto extends PaymentContactDto { @ApiProperty({ minLength: 8, maxLength: 100 }) @IsString() @MinLength(8) @MaxLength(100) idempotencyKey!: string; @ApiPropertyOptional({ enum: CheckoutFundingOption, default: CheckoutFundingOption.PAY_NOW }) @IsOptional() @IsEnum(CheckoutFundingOption) option?: CheckoutFundingOption; }

export class PublicCheckoutSelectionDto extends PaymentContactDto {
  @ApiPropertyOptional({ enum: CheckoutFundingOption, default: CheckoutFundingOption.PAY_NOW })
  @IsOptional()
  @IsEnum(CheckoutFundingOption)
  option: CheckoutFundingOption = CheckoutFundingOption.PAY_NOW;
}
