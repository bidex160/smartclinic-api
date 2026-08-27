import { ApiProperty } from '@nestjs/swagger';

class ProviderDashboardOffersDto {
  @ApiProperty({ minimum: 0 }) new!: number;
}

class ProviderDashboardAppointmentsDto {
  @ApiProperty({ minimum: 0 }) today!: number;
  @ApiProperty({ minimum: 0 }) upcoming!: number;
}

class ProviderDashboardHealthChecksDto {
  @ApiProperty({ minimum: 0 }) inProgress!: number;
  @ApiProperty({ minimum: 0 }) completed!: number;
}

class ProviderDashboardReferralsDto {
  @ApiProperty() availablePoints!: number;
  @ApiProperty() reservedPoints!: number;
  @ApiProperty({ nullable: true }) currentLevel!: { code: string; name: string; ordinal: number } | null;
  @ApiProperty({ nullable: true }) nextLevel!: { code: string; name: string; ordinal: number } | null;
  @ApiProperty({ type: [Object] }) nextLevelRequirements!: { targetType: string; qualified: number; required: number; remaining: number; completed: boolean }[];
  @ApiProperty() highestConfiguredLevelReached!: boolean;
  @ApiProperty() qualifiedPatients!: number;
  @ApiProperty() qualifiedClinics!: number;
  @ApiProperty() qualifiedLaboratories!: number;
  @ApiProperty() qualifiedPharmacies!: number;
}

export class ProviderDashboardSummaryDto {
  @ApiProperty({ type: ProviderDashboardOffersDto }) offers!: ProviderDashboardOffersDto;
  @ApiProperty({ type: ProviderDashboardAppointmentsDto }) appointments!: ProviderDashboardAppointmentsDto;
  @ApiProperty({ type: ProviderDashboardHealthChecksDto }) healthChecks!: ProviderDashboardHealthChecksDto;
  @ApiProperty({ type: ProviderDashboardReferralsDto }) referrals!: ProviderDashboardReferralsDto;
}
