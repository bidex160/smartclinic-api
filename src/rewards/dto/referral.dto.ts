import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
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

export class ReferralLevelRequirementProgressDto {
  @ApiProperty({ enum: ReferralTargetType }) targetType!: ReferralTargetType;
  @ApiProperty() qualified!: number;
  @ApiProperty() required!: number;
  @ApiProperty() remaining!: number;
  @ApiProperty() completed!: boolean;
}

export class ReferralLevelSummaryDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() ordinal!: number;
}

export class MultiLevelReferralProgressDto {
  @ApiPropertyOptional({ nullable: true, type: ReferralLevelSummaryDto }) currentLevel!: ReferralLevelSummaryDto | null;
  @ApiPropertyOptional({ nullable: true, type: ReferralLevelSummaryDto }) nextLevel!: ReferralLevelSummaryDto | null;
  @ApiProperty() highestLevelAchieved!: number;
  @ApiProperty({ type: [ReferralLevelRequirementProgressDto] }) requirements!: ReferralLevelRequirementProgressDto[];
  @ApiProperty() highestConfiguredLevelReached!: boolean;
  @ApiProperty({ type: Object }) qualifiedCounts!: Record<ReferralTargetType, number>;
}

export class ReferralSummaryDto {
  @ApiProperty() referralCode!: string;
  @ApiProperty({ type: Object }) links!: Record<ReferralTargetType, string>;
  @ApiProperty() availablePoints!: number;
  @ApiProperty() reservedPoints!: number;
  @ApiProperty() withdrawalReservedPoints!: number;
  @ApiProperty() healthCheckReservedPoints!: number;
  @ApiProperty() lifetimeEarnedPoints!: number;
  @ApiProperty() lifetimeRedeemedPoints!: number;
  @ApiProperty({ type: MultiLevelReferralProgressDto }) levelProgress!: MultiLevelReferralProgressDto;
  /** @deprecated Use levelProgress.currentLevel. */
  @ApiPropertyOptional({ nullable: true }) currentLevel!: { code: string; name: string } | null;
  /** @deprecated Use levelProgress.nextLevel. */
  @ApiPropertyOptional({ nullable: true }) nextLevel!: { code: string; name: string } | null;
  /** @deprecated Use levelProgress.requirements. */
  @ApiProperty({ type: ReferralLevelProgressDto }) progress!: ReferralLevelProgressDto;
  @ApiProperty() completed!: boolean;
  @ApiProperty() registeredDirectReferrals!: number;
  @ApiProperty() qualifiedDirectReferrals!: number;
  @ApiProperty() pendingDirectReferrals!: number;
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

export class UpdateReferralPreferencesDto {
  @ApiProperty({ description: 'Whether the authenticated patient participates in the privacy-masked public leaderboard.' })
  @IsBoolean()
  publicLeaderboard!: boolean;
}

export class PublicReferralLeaderboardPersonDto {
  @ApiProperty() name!: string;
  @ApiProperty() points!: number;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Stored normalized country code.' }) country!: string | null;
  @ApiPropertyOptional({ nullable: true }) level!: string | null;
  @ApiProperty() referrals!: number;
}

export class PublicReferralLeaderboardPlaceDto {
  @ApiProperty() name!: string;
  @ApiProperty() points!: number;
}

export class PublicReferralLeaderboardDto {
  @ApiProperty({ type: [PublicReferralLeaderboardPersonDto] }) people!: PublicReferralLeaderboardPersonDto[];
  @ApiProperty({ type: [PublicReferralLeaderboardPlaceDto] }) cities!: PublicReferralLeaderboardPlaceDto[];
  @ApiProperty({ type: [PublicReferralLeaderboardPlaceDto] }) countries!: PublicReferralLeaderboardPlaceDto[];
}

export class ReferralImpactDto {
  @ApiProperty() referralCode!: string;
  @ApiProperty({ type: Object }) balances!: Record<string, number>;
  @ApiProperty({ type: MultiLevelReferralProgressDto }) levelProgress!: MultiLevelReferralProgressDto;
  @ApiProperty({ type: Object }) qualifiedCounts!: Record<ReferralTargetType, number>;
  @ApiProperty({ type: Object }) summary!: { registeredReferrals: number; qualifiedReferrals: number; pendingReferrals: number };
  @ApiProperty({ type: Object }) inviteLinks!: Record<ReferralTargetType, string>;
  @ApiProperty({ type: Object }) leaderboard!: { optedIn: boolean; position: number | null };
}
