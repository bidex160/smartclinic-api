import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReferralStatus } from '../../rewards/enums/referral-status.enum';
import { ReferralTargetType } from '../../rewards/enums/referral-target-type.enum';

export class BuilderReferralLevelDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() ordinal!: number;
}

export class BuilderProgressItemDto {
  @ApiProperty({ enum: ReferralTargetType }) category!: ReferralTargetType;
  @ApiProperty() qualified!: number;
  @ApiProperty() required!: number;
  @ApiProperty() remaining!: number;
  @ApiProperty() completed!: boolean;
}

export class BuilderRecentReferralDto {
  @ApiProperty() reference!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ReferralTargetType }) type!: ReferralTargetType;
  @ApiProperty({ enum: ReferralStatus }) status!: ReferralStatus;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
}

export class BuilderDashboardDto {
  @ApiProperty() referralCode!: string;
  @ApiProperty() referralUrl!: string;
  @ApiPropertyOptional({ nullable: true, type: BuilderReferralLevelDto }) currentLevel!: BuilderReferralLevelDto | null;
  @ApiPropertyOptional({ nullable: true, type: BuilderReferralLevelDto }) nextLevel!: BuilderReferralLevelDto | null;
  @ApiProperty({ type: [BuilderProgressItemDto] }) progress!: BuilderProgressItemDto[];
  @ApiProperty() qualifiedPatients!: number;
  @ApiProperty() qualifiedClinics!: number;
  @ApiProperty() qualifiedLaboratories!: number;
  @ApiProperty() qualifiedPharmacies!: number;
  @ApiProperty({ type: [BuilderRecentReferralDto] }) recentReferrals!: BuilderRecentReferralDto[];
}
