import { ApiProperty } from '@nestjs/swagger';

export enum ProviderOnboardingBlocker {
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',
  NO_ACTIVE_CAPABILITY = 'NO_ACTIVE_CAPABILITY',
  PROVIDER_LOCATION_WITHOUT_LOCATION = 'PROVIDER_LOCATION_WITHOUT_LOCATION',
  NO_WEEKLY_AVAILABILITY = 'NO_WEEKLY_AVAILABILITY',
}

export class ProviderOnboardingReadinessDto {
  @ApiProperty() profileComplete!: boolean;
  @ApiProperty() hasActiveCapability!: boolean;
  @ApiProperty() providerLocationReady!: boolean;
  @ApiProperty() hasAvailability!: boolean;
  @ApiProperty({ enum: ProviderOnboardingBlocker, isArray: true }) blockers!: ProviderOnboardingBlocker[];
  @ApiProperty() capabilityCount!: number;
  @ApiProperty() activeCapabilityCount!: number;
  @ApiProperty() locationCount!: number;
  @ApiProperty() activeLocationCount!: number;
  @ApiProperty() availabilityCount!: number;
}
