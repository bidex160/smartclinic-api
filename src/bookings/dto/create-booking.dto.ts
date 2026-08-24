import { IsDateString, IsOptional, IsString, IsTimeZone, IsUUID, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateBookingDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  bookerUserId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  participantPatientId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  organisationContextId?: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  healthCheckPackageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fulfilmentModeId!: string;

  @ApiProperty({ format: 'date', example: '2026-08-20' })
  @IsDateString()
  preferredDate!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'preferredTimeWindowStart must be a valid time' })
  preferredTimeWindowStart!: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Ignored. Appointment end is derived from package duration.' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  preferredTimeWindowEnd?: string;

  @ApiProperty({ example: 'Africa/Lagos', description: 'IANA timezone used to interpret the preferred appointment start.' })
  @IsTimeZone()
  preferredTimezone!: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Minimum necessary fulfilment-location preference.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  preferredLocationNote?: string;
}
