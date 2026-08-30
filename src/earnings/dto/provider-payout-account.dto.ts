import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ProviderPayoutAccountStatus, ProviderPayoutAccountType } from '../enums/provider-payout-account.enum';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const upper = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;
export class ProviderPayoutAccountParamsDto { @ApiProperty() @IsString() reference!: string; }
export class CreateProviderPayoutAccountDto {
  @ApiProperty({ enum: ProviderPayoutAccountType, default: ProviderPayoutAccountType.BANK_ACCOUNT }) @IsEnum(ProviderPayoutAccountType) type!: ProviderPayoutAccountType;
  @ApiProperty() @Transform(upper) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @ApiProperty() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency!: string;
  @ApiProperty() @Transform(upper) @Matches(/^[A-Z0-9_-]{2,20}$/) bankCode!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) bankName!: string;
  @ApiProperty() @Transform(trim) @Matches(/^[A-Za-z0-9 -]{6,34}$/) accountNumber!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(2) @MaxLength(160) accountName!: string;
}
export class UpdateProviderPayoutAccountDto extends PartialType(CreateProviderPayoutAccountDto) {}
export class ProviderPayoutAccountReasonDto { @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) reason?: string; }
export class ProviderPayoutAccountListQueryDto {
  @ApiPropertyOptional({ enum: ProviderPayoutAccountStatus }) @IsOptional() @IsEnum(ProviderPayoutAccountStatus) status?: ProviderPayoutAccountStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(upper) @Matches(/^[A-Z]{3}$/) currency?: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class AdminProviderPayoutAccountListQueryDto extends ProviderPayoutAccountListQueryDto { @ApiPropertyOptional() @IsOptional() @IsString() providerReference?: string; }
