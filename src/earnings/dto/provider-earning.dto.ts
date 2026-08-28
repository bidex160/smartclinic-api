import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';
import { ProviderEarningSourceType } from '../enums/provider-earning-source-type.enum';
import { ProviderEarningStatus } from '../enums/provider-earning-status.enum';
import { CommissionRateSource } from '../../commissions/enums/commission-rate-source.enum';

export class ProviderEarningParamsDto { @ApiProperty() @IsString() reference!: string; }
export class ProviderEarningListQueryDto {
  @ApiPropertyOptional({ enum: ProviderEarningStatus }) @IsOptional() @IsEnum(ProviderEarningStatus) status?: ProviderEarningStatus;
  @ApiPropertyOptional({ enum: ProviderEarningSourceType }) @IsOptional() @IsEnum(ProviderEarningSourceType) sourceType?: ProviderEarningSourceType;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class AdminProviderEarningListQueryDto extends ProviderEarningListQueryDto { @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() providerId?: string; @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string; }
export class AdminProviderEarningBalanceQueryDto { @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() providerId?: string; }
export class ProviderEarningResponseDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ProviderEarningSourceType }) sourceType!: ProviderEarningSourceType;
  @ApiProperty() sourceReference!: string;
  @ApiProperty() currency!: string;
  @ApiProperty() grossAmountMinor!: number;
  @ApiProperty() commissionBasisPoints!: number;
  @ApiProperty({ enum: CommissionRateSource }) commissionSource!: CommissionRateSource;
  @ApiProperty() commissionAmountMinor!: number;
  @ApiProperty() providerShareMinor!: number;
  @ApiProperty({ enum: ProviderEarningStatus }) status!: ProviderEarningStatus;
  @ApiPropertyOptional({ nullable: true }) payableAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) settledAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}
export class AdminProviderEarningResponseDto extends ProviderEarningResponseDto { @ApiProperty() provider!: { reference: string; displayName: string }; }
export class ProviderEarningListResponseDto { @ApiProperty({ type: ProviderEarningResponseDto, isArray: true }) items!: ProviderEarningResponseDto[]; @ApiProperty() page!: number; @ApiProperty() limit!: number; @ApiProperty() total!: number; @ApiProperty() totalPages!: number; }
export class ProviderEarningBalanceDto { @ApiProperty() currency!: string; @ApiProperty() heldAmountMinor!: number; @ApiProperty() payableAmountMinor!: number; @ApiProperty() settledAmountMinor!: number; }
