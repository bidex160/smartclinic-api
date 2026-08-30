import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { CommissionRateSource } from '../../commissions/enums/commission-rate-source.enum';
import { ProviderEarningSourceType } from '../enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from '../enums/provider-earning-status.enum';

export class ProviderEarningParamsDto { @ApiProperty() @IsString() reference!: string; }

export class ProviderEarningListQueryDto {
  @ApiPropertyOptional({ enum: ProviderEarningStatus }) @IsOptional() @IsEnum(ProviderEarningStatus) status?: ProviderEarningStatus;
  @ApiPropertyOptional({ enum: ProviderEarningSourceType }) @IsOptional() @IsEnum(ProviderEarningSourceType) sourceType?: ProviderEarningSourceType;
  @ApiPropertyOptional({ description: 'Stored ISO currency code' }) @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class AdminProviderEarningListQueryDto extends ProviderEarningListQueryDto {
  @ApiPropertyOptional({ description: 'Provider public reference' }) @IsOptional() @IsString() providerReference?: string;
  /** Existing admin-only compatibility filter. Prefer providerReference. */
  @ApiPropertyOptional({ format: 'uuid', deprecated: true }) @IsOptional() @IsUUID() providerId?: string;
}

export class AdminProviderEarningBalanceQueryDto {
  @ApiPropertyOptional({ description: 'Provider public reference' }) @IsOptional() @IsString() providerReference?: string;
  /** Existing admin-only compatibility filter. Prefer providerReference. */
  @ApiPropertyOptional({ format: 'uuid', deprecated: true }) @IsOptional() @IsUUID() providerId?: string;
}

export class ProviderEarningResponseDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ProviderEarningSourceType }) sourceType!: ProviderEarningSourceType;
  @ApiProperty() sourceReference!: string;
  @ApiProperty({ description: 'Stored ISO currency code' }) currency!: string;
  @ApiProperty({ description: 'Integer minor units' }) grossAmountMinor!: number;
  @ApiProperty() commissionBasisPoints!: number;
  @ApiProperty({ enum: CommissionRateSource }) commissionSource!: CommissionRateSource;
  @ApiProperty({ description: 'Integer minor units' }) commissionAmountMinor!: number;
  @ApiProperty({ description: 'Integer minor units' }) providerShareMinor!: number;
  @ApiProperty({ enum: ProviderEarningStatus }) status!: ProviderEarningStatus;
  @ApiPropertyOptional({ nullable: true }) payableAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) settledAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class AdminProviderEarningResponseDto extends ProviderEarningResponseDto {
  @ApiProperty() provider!: { reference: string; displayName: string };
}
export class ProviderEarningListResponseDto {
  @ApiProperty({ type: ProviderEarningResponseDto, isArray: true }) items!: ProviderEarningResponseDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
export class ProviderEarningBreakdownDto {
  @ApiProperty() key!: string;
  @ApiProperty() earningCount!: number;
  @ApiProperty({ description: 'Integer minor units' }) grossAmountMinor!: number;
  @ApiProperty({ description: 'Integer minor units' }) commissionAmountMinor!: number;
  @ApiProperty({ description: 'Integer minor units' }) providerShareMinor!: number;
}
export class ProviderEarningBalanceDto {
  @ApiProperty() currency!: string;
  @ApiProperty() earningCount!: number;
  @ApiProperty({ description: 'Integer minor units' }) grossAmountMinor!: number;
  @ApiProperty({ description: 'Integer minor units' }) commissionAmountMinor!: number;
  @ApiProperty({ description: 'Integer minor units' }) providerShareMinor!: number;
  @ApiProperty({ description: 'HELD Provider share; not available for payout' }) heldAmountMinor!: number;
  @ApiProperty({ description: 'PAYABLE Provider share; not yet settled' }) payableAmountMinor!: number;
  @ApiProperty({ description: 'SETTLED Provider share' }) settledAmountMinor!: number;
  @ApiProperty({ description: 'VOIDED Provider share, excluded from active/outstanding totals' }) voidedAmountMinor!: number;
  @ApiProperty({ type: ProviderEarningBreakdownDto, isArray: true }) statusBreakdown!: ProviderEarningBreakdownDto[];
  @ApiProperty({ type: ProviderEarningBreakdownDto, isArray: true }) sourceBreakdown!: ProviderEarningBreakdownDto[];
}
