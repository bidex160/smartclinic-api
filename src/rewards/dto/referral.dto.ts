import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ReferralStatus } from '../enums/referral-status.enum';
import { ReferralTargetType } from '../enums/referral-target-type.enum';

export class ReferralTargetProgressDto {
  @ApiProperty() qualified!: number;
  @ApiProperty() required!: number;
}

export class ReferralLevelProgressDto {
  @ApiProperty({ type: ReferralTargetProgressDto }) patients!: ReferralTargetProgressDto;
  @ApiProperty({ type: ReferralTargetProgressDto }) clinics!: ReferralTargetProgressDto;
  @ApiProperty({ type: ReferralTargetProgressDto }) laboratories!: ReferralTargetProgressDto;
  @ApiProperty({ type: ReferralTargetProgressDto }) pharmacies!: ReferralTargetProgressDto;
}

export class ReferralSummaryDto {
  @ApiProperty() referralCode!: string;
  @ApiProperty({ type: Object }) links!: Record<ReferralTargetType, string>;
  @ApiProperty() availablePoints!: number;
  @ApiProperty() lifetimeEarnedPoints!: number;
  @ApiPropertyOptional({ nullable: true }) currentLevel!: { code: string; name: string } | null;
  @ApiPropertyOptional({ nullable: true }) nextLevel!: { code: string; name: string } | null;
  @ApiProperty({ type: ReferralLevelProgressDto }) progress!: ReferralLevelProgressDto;
  @ApiProperty() completed!: boolean;
  @ApiProperty() registeredDirectReferrals!: number;
  @ApiProperty() qualifiedDirectReferrals!: number;
}

export class ReferralHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @ApiPropertyOptional({ enum: ReferralTargetType }) @IsOptional() @IsEnum(ReferralTargetType) targetType?: ReferralTargetType;
  @ApiPropertyOptional({ enum: ReferralStatus }) @IsOptional() @IsEnum(ReferralStatus) status?: ReferralStatus;
}

export class AdminReferralQueryDto extends ReferralHistoryQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(254) @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) referrerEmail?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) qualifiedFrom?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) qualifiedTo?: string;
  @ApiPropertyOptional({ example: 'LEVEL_1' }) @IsOptional() @IsString() @MaxLength(40) levelAchieved?: string;
}
