import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PaymentProvider } from '../enums/payment-provider.enum';
import { PaymentClientPlatform } from '../enums/payment-client-platform.enum';

export class InitializeWalletTopUpDto {
  @ApiProperty({ description: 'Top-up amount in minor units.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  amountMinor!: number;

  @ApiPropertyOptional({ description: 'Connected hospital reference for an immediate Pay Bills journey.' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  connectionReference?: string;

  @ApiPropertyOptional({ description: 'Payment email used only when the account has no usable email.' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() || undefined : value)
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  paymentEmail?: string;

  @ApiPropertyOptional({ enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  paymentProvider?: PaymentProvider;

  @ApiPropertyOptional({ enum: PaymentClientPlatform, default: PaymentClientPlatform.WEB })
  @IsOptional()
  @IsEnum(PaymentClientPlatform)
  clientPlatform?: PaymentClientPlatform;
}
