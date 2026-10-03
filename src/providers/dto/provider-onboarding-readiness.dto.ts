import { ApiProperty } from '@nestjs/swagger';

export enum ProviderOnboardingBlocker {
  PROFILE_INCOMPLETE = 'PROFILE_INCOMPLETE',
  NO_ACTIVE_CAPABILITY = 'NO_ACTIVE_CAPABILITY',
  PROVIDER_LOCATION_WITHOUT_LOCATION = 'PROVIDER_LOCATION_WITHOUT_LOCATION',
  NO_WEEKLY_AVAILABILITY = 'NO_WEEKLY_AVAILABILITY',
  HOME_VISIT_WITHOUT_SERVICE_AREA = 'HOME_VISIT_WITHOUT_SERVICE_AREA',
  /** Doctors must choose at least one specialty (GP counts). */
  SPECIALTY_MISSING = 'SPECIALTY_MISSING',
  LICENCE_MISSING = 'LICENCE_MISSING',
  /** Staff have not yet checked the licence with the regulator. */
  LICENCE_NOT_VERIFIED = 'LICENCE_NOT_VERIFIED',
}

export class ProviderOnboardingReadinessDto {
  @ApiProperty() profileComplete!: boolean;
  @ApiProperty() hasActiveCapability!: boolean;
  @ApiProperty() providerLocationReady!: boolean;
  @ApiProperty() hasAvailability!: boolean;
  @ApiProperty() homeVisitReady?: boolean;
  @ApiProperty({ enum: ProviderOnboardingBlocker, isArray: true }) blockers!: ProviderOnboardingBlocker[];
  @ApiProperty() capabilityCount!: number;
  @ApiProperty() activeCapabilityCount!: number;
  @ApiProperty() locationCount!: number;
  @ApiProperty() activeLocationCount!: number;
  @ApiProperty() availabilityCount!: number;
}
