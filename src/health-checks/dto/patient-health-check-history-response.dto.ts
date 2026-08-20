import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';

class PatientHealthCheckCatalogueDto { @ApiProperty() code!: string; @ApiProperty() name!: string; }
class PatientConfirmedScheduleDto { @ApiProperty({ format: 'date' }) date!: string; @ApiProperty() timeFrom!: string; @ApiProperty() timeTo!: string; @ApiProperty() timezone!: string; @ApiPropertyOptional({ nullable: true }) providerLocationName!: string | null; }
export class PatientHealthCheckHistoryItemDto {
  @ApiProperty() bookingReference!: string;
  @ApiProperty({ enum: BookingStatus }) bookingStatus!: BookingStatus;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
  @ApiProperty({ type: PatientHealthCheckCatalogueDto }) healthCheckPackage!: PatientHealthCheckCatalogueDto;
  @ApiProperty({ type: PatientHealthCheckCatalogueDto }) fulfilmentMode!: PatientHealthCheckCatalogueDto;
  @ApiPropertyOptional({ format: 'date', nullable: true }) preferredDate!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeFrom!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimeTo!: string | null;
  @ApiPropertyOptional({ nullable: true }) preferredTimezone!: string | null;
  @ApiPropertyOptional({ type: PatientConfirmedScheduleDto, nullable: true }) confirmedSchedule!: PatientConfirmedScheduleDto | null;
  @ApiPropertyOptional({ nullable: true }) providerDisplayName!: string | null;
  @ApiPropertyOptional({ enum: HealthCheckEncounterStatus, nullable: true }) encounterStatus!: HealthCheckEncounterStatus | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) startedAt!: Date | null;
  @ApiPropertyOptional({ format: 'date-time', nullable: true }) completedAt!: Date | null;
  @ApiProperty() hasCompletedResult!: boolean;
}
export class PatientHealthCheckHistoryResponseDto {
  @ApiProperty({ type: PatientHealthCheckHistoryItemDto, isArray: true }) items!: PatientHealthCheckHistoryItemDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
