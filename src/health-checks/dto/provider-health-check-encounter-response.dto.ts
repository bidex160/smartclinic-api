import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';
import { HealthCheckMeasurementCode } from '../enums/health-check-measurement-code.enum';

class EncounterCatalogueItemDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class EncounterParticipantDto { @ApiProperty() givenName!: string; @ApiProperty() familyName!: string; }
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
  @ApiProperty({ type: HealthCheckMeasurementResponseDto, isArray: true }) measurements!: HealthCheckMeasurementResponseDto[];
}
