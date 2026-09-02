import { ApiProperty } from '@nestjs/swagger';

export enum PatientDashboardRecommendedAction {
  COMPLETE_PROFILE = 'COMPLETE_PROFILE',
  CONNECT_PROVIDER = 'CONNECT_PROVIDER',
  VIEW_PROVIDER_CONNECTION = 'VIEW_PROVIDER_CONNECTION',
  FIND_CARE = 'FIND_CARE',
  VIEW_APPOINTMENT = 'VIEW_APPOINTMENT',
  COMPLETE_PAYMENT = 'COMPLETE_PAYMENT',
  CONTINUE_SELF_CHECK = 'CONTINUE_SELF_CHECK',
  VIEW_HEALTH_CHECK = 'VIEW_HEALTH_CHECK',
  NONE = 'NONE',
}

export enum PatientDashboardActionResourceDomain {
  GUIDED_SELF_CHECK = 'GUIDED_SELF_CHECK',
  HEALTH_CHECK = 'HEALTH_CHECK',
  CARE_REQUEST = 'CARE_REQUEST',
  CARE_APPOINTMENT = 'CARE_APPOINTMENT',
  PROVIDER_CONNECTION = 'PROVIDER_CONNECTION',
}

export enum PatientDashboardActionTargetType {
  PROFILE = 'PROFILE',
  PAYMENT = 'PAYMENT',
  GUIDED_SELF_CHECK = 'GUIDED_SELF_CHECK',
  HEALTH_CHECK = 'HEALTH_CHECK',
  FIND_CARE = 'FIND_CARE',
  CARE_APPOINTMENT = 'CARE_APPOINTMENT',
  PROVIDER_CONNECTION = 'PROVIDER_CONNECTION',
  STAY_WELL = 'STAY_WELL',
}

class PatientDashboardActionResourceDto {
  @ApiProperty({ enum: PatientDashboardActionResourceDomain })
  domain!: PatientDashboardActionResourceDomain;

  @ApiProperty() reference!: string;
}

class PatientDashboardActionTargetDto {
  @ApiProperty({ enum: PatientDashboardActionTargetType })
  type!: PatientDashboardActionTargetType;
}

export class PatientDashboardRecommendedActionDetailDto {
  @ApiProperty({ enum: PatientDashboardRecommendedAction })
  type!: PatientDashboardRecommendedAction;

  @ApiProperty({ type: PatientDashboardActionResourceDto, nullable: true })
  resource!: PatientDashboardActionResourceDto | null;

  @ApiProperty({ type: PatientDashboardActionTargetDto })
  target!: PatientDashboardActionTargetDto;
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

  @ApiProperty({ type: PatientDashboardRecommendedActionDetailDto })
  recommendedActionDetail!: PatientDashboardRecommendedActionDetailDto;

  @ApiProperty({ enum: PatientDashboardMode })
  dashboardMode!: PatientDashboardMode;
}
