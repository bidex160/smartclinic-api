import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';
import { HealthCheckMeasurementCode } from '../enums/health-check-measurement-code.enum';

class EncounterCatalogueItemDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class EncounterParticipantDto { @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; }
class EncounterConfirmedScheduleDto { @ApiProperty({ format: 'date' }) date!: string; @ApiProperty() timeFrom!: string; @ApiProperty() timeTo!: string; @ApiProperty() timezone!: string; @ApiPropertyOptional({ nullable: true }) providerLocationName!: string | null; }
class EncounterVisitAddressDto {
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() stateOrRegion!: string;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty() countryCode!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Supplemental visit directions supplied with the booking' }) locationNote!: string | null;
}
export class HealthCheckMeasurementResponseDto {
  @ApiProperty({ enum: HealthCheckMeasurementCode }) code!: HealthCheckMeasurementCode;
  @ApiProperty() value!: number;
  @ApiPropertyOptional({ nullable: true }) secondaryValue!: number | null;
  @ApiProperty() unit!: string;
  @ApiProperty({ format: 'date-time' }) recordedAt!: Date;
}
export class ProviderHealthCheckEncounterResponseDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: HealthCheckEncounterStatus }) status!: HealthCheckEncounterStatus;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) startedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) completedAt!: Date | null;
  @ApiProperty({ type: EncounterParticipantDto }) participant!: EncounterParticipantDto;
  @ApiProperty({ type: EncounterCatalogueItemDto }) healthCheckPackage!: EncounterCatalogueItemDto;
  @ApiProperty({ type: EncounterCatalogueItemDto }) fulfilmentMode!: EncounterCatalogueItemDto;
  @ApiPropertyOptional({ type: EncounterConfirmedScheduleDto, nullable: true }) confirmedSchedule!: EncounterConfirmedScheduleDto | null;
  @ApiPropertyOptional({ type: EncounterVisitAddressDto, nullable: true, description: 'Operational address for an owned HOME_VISIT booking only' }) visitAddress!: EncounterVisitAddressDto | null;
  @ApiProperty({ type: HealthCheckMeasurementResponseDto, isArray: true }) measurements!: HealthCheckMeasurementResponseDto[];
}
