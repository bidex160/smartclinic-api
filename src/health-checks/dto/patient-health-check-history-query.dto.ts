import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { HealthCheckEncounterStatus } from '../enums/health-check-encounter-status.enum';

export class PatientHealthCheckHistoryQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus }) @IsOptional() @IsEnum(BookingStatus) bookingStatus?: BookingStatus;
  @ApiPropertyOptional({ enum: HealthCheckEncounterStatus }) @IsOptional() @IsEnum(HealthCheckEncounterStatus) encounterStatus?: HealthCheckEncounterStatus;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
