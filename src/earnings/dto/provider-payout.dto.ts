import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ProviderPayoutSettlementMethod } from '../enums/provider-payout-settlement-method.enum';
import { ProviderPayoutStatus } from '../enums/provider-payout-status.enum';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class ProviderPayoutParamsDto { @ApiProperty() @IsString() reference!: string; }
export class ProviderPayoutListQueryDto {
  @ApiPropertyOptional({ enum: ProviderPayoutStatus }) @IsOptional() @IsEnum(ProviderPayoutStatus) status?: ProviderPayoutStatus;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Za-z]{3}$/) currency?: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class AdminProviderPayoutListQueryDto extends ProviderPayoutListQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() providerReference?: string;
}
export class EligibleProviderEarningQueryDto {
  @ApiProperty() @IsString() providerReference!: string;
  @ApiProperty() @Matches(/^[A-Za-z]{3}$/) currency!: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
export class CreateProviderPayoutDto {
  @ApiProperty() @IsString() providerReference!: string;
  @ApiProperty() @Matches(/^[A-Za-z]{3}$/) currency!: string;
  @ApiProperty({ type: String, isArray: true }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ArrayUnique() @IsString({ each: true }) earningReferences!: string[];
  @ApiProperty({ enum: ProviderPayoutSettlementMethod }) @IsEnum(ProviderPayoutSettlementMethod) settlementMethod!: ProviderPayoutSettlementMethod;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
export class ProviderPayoutReasonDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
export class CompleteProviderPayoutDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) externalReference!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) note?: string;
}
