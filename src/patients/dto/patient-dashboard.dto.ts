import { ApiProperty } from '@nestjs/swagger';

export enum PatientDashboardRecommendedAction {
  COMPLETE_PROFILE = 'COMPLETE_PROFILE',
  CONNECT_PROVIDER = 'CONNECT_PROVIDER',
  VIEW_PROVIDER_CONNECTION = 'VIEW_PROVIDER_CONNECTION',
  FIND_CARE = 'FIND_CARE',
  NONE = 'NONE',
}

export enum PatientDashboardMode {
  GETTING_STARTED = 'GETTING_STARTED',
  ESTABLISHED = 'ESTABLISHED',
}

class PatientDashboardIdentityDto {
  @ApiProperty({ example: 'SCP-1234-5678' })
  patientReference!: string;

  @ApiProperty({ example: 'Tunde' })
  firstName!: string;

  @ApiProperty({ example: 'Tunde Adebayo' })
  displayName!: string;
}

class PatientDashboardSetupDto {
  @ApiProperty() accountCreated!: boolean;
  @ApiProperty() profileComplete!: boolean;
  @ApiProperty({ type: [String], example: ['familyName'] })
  missingProfileFields!: string[];
  @ApiProperty() hasProviderConnection!: boolean;
  @ApiProperty() hasConnectedProvider!: boolean;
  @ApiProperty() hasCareRequest!: boolean;
  @ApiProperty() hasHealthCheckBooking!: boolean;
  @ApiProperty() hasStartedCareJourney!: boolean;
}

export class PatientDashboardDto {
  @ApiProperty({ type: PatientDashboardIdentityDto })
  patient!: PatientDashboardIdentityDto;

  @ApiProperty({ type: PatientDashboardSetupDto })
  setup!: PatientDashboardSetupDto;

  @ApiProperty({ enum: PatientDashboardRecommendedAction })
  recommendedAction!: PatientDashboardRecommendedAction;

  @ApiProperty({ enum: PatientDashboardMode })
  dashboardMode!: PatientDashboardMode;
}
