import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsTimeZone, IsUrl, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CARE_APPOINTMENT_REFERENCE_EXAMPLE, CARE_APPOINTMENT_REFERENCE_PATTERN } from '../care-appointment-reference';
import { CareAppointmentStatus } from '../enums/care-appointment-status.enum';
import { PROVIDER_LOCATION_REFERENCE_EXAMPLE, PROVIDER_LOCATION_REFERENCE_PATTERN } from '../../providers/provider-location-reference';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value;

export class ScheduleCareAppointmentDto {
  @ApiProperty({ format: 'date', example: '2026-09-10' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) scheduledDate!: string;
  @ApiProperty({ example: '10:30' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) scheduledTimeFrom!: string;
  @ApiProperty({ example: '11:00' }) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) scheduledTimeTo!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @Transform(trim) @IsTimeZone() timezone!: string;
  @ApiPropertyOptional({ nullable: true, example: PROVIDER_LOCATION_REFERENCE_EXAMPLE }) @IsOptional() @Matches(PROVIDER_LOCATION_REFERENCE_PATTERN) providerLocationReference?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(optionalTrim) @IsOptional() @IsString() @MaxLength(2000) notes?: string | null;
}

export class CareAppointmentReferenceParamsDto { @ApiProperty({ example: CARE_APPOINTMENT_REFERENCE_EXAMPLE }) @Matches(CARE_APPOINTMENT_REFERENCE_PATTERN) reference!: string; }
export class CareAppointmentListQueryDto {
  @ApiPropertyOptional({ enum: CareAppointmentStatus }) @IsOptional() @IsEnum(CareAppointmentStatus) status?: CareAppointmentStatus;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class CareAppointmentReasonDto { @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string; }
export class UpdateCareAppointmentMeetingLinkDto {
  @ApiPropertyOptional({ nullable: true, example: 'https://meet.google.com/abc-defg-hij' })
  @Transform(optionalTrim)
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_valid_protocol: true })
  @MaxLength(2048)
  meetingUrl!: string | null;
}
