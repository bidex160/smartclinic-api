import { IsDateString, IsDefined, IsOptional, IsString, IsTimeZone, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';
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

  @ApiPropertyOptional({ format: 'date', example: '2026-08-20' })
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @ValidateIf((value: CreateBookingDto) => value.preferredTimeWindowStart != null || value.preferredTimeWindowEnd != null)
  @IsDefined({ message: 'preferredTimeWindowStart is required when preferredTimeWindowEnd is supplied' })
  @Matches(TIME_PATTERN, { message: 'preferredTimeWindowStart must be a valid time' })
  preferredTimeWindowStart?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @ValidateIf((value: CreateBookingDto) => value.preferredTimeWindowStart != null || value.preferredTimeWindowEnd != null)
  @IsDefined({ message: 'preferredTimeWindowEnd is required when preferredTimeWindowStart is supplied' })
  @Matches(TIME_PATTERN, { message: 'preferredTimeWindowEnd must be a valid time' })
  preferredTimeWindowEnd?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos', nullable: true, description: 'IANA timezone used to interpret the preferred date and time window.' })
  @ValidateIf((value: CreateBookingDto) => value.preferredDate != null || value.preferredTimeWindowStart != null || value.preferredTimeWindowEnd != null || value.preferredTimezone != null)
  @IsDefined({ message: 'preferredTimezone is required when a scheduling preference is supplied' })
  @IsTimeZone()
  preferredTimezone?: string;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Minimum necessary fulfilment-location preference.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  preferredLocationNote?: string;
}
