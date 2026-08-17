import { Transform } from 'class-transformer';
import { IsDateString, IsISO4217CurrencyCode, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

export class CreatePackagePriceDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  healthCheckPackageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fulfilmentModeId!: string;

  @ApiProperty({ example: '12500.00', description: 'Positive decimal monetary amount.' })
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'amount must be a positive decimal with at most two decimal places' })
  amount!: string;

  @ApiProperty({ example: 'NGN', minLength: 3, maxLength: 3 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(CURRENCY_PATTERN, { message: 'currency must be a three-letter uppercase ISO 4217 code' })
  @IsISO4217CurrencyCode({ message: 'currency must be a valid ISO 4217 currency code' })
  currency!: string;

  @ApiProperty({ format: 'date', example: '2026-09-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-12-01', nullable: true })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}
