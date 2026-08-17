import { Transform } from 'class-transformer';
import { IsDateString, IsISO4217CurrencyCode, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bookerUserId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  participantPatientId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  organisationContextId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  healthCheckPackageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fulfilmentModeId!: string;

  @ApiPropertyOptional({ example: '12500.00', description: 'Quoted amount, represented as a decimal string.' })
  @IsOptional()
  @Matches(MONEY_PATTERN, { message: 'quotedAmount must be a non-negative decimal with at most two decimal places' })
  quotedAmount?: string;

  @ApiPropertyOptional({ example: 'NGN', minLength: 3, maxLength: 3 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(CURRENCY_PATTERN, { message: 'currency must be a three-letter uppercase ISO 4217 code' })
  @IsISO4217CurrencyCode({ message: 'currency must be a valid ISO 4217 currency code' })
  currency?: string;

  @ApiPropertyOptional({ format: 'date', example: '2026-08-20' })
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'preferredTimeWindowStart must be a valid time' })
  preferredTimeWindowStart?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'preferredTimeWindowEnd must be a valid time' })
  preferredTimeWindowEnd?: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Minimum necessary fulfilment-location preference.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  preferredLocationNote?: string;
}
