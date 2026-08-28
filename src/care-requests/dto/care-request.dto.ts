import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CareRequestContactMethod } from '../enums/care-request-contact-method.enum';
import { CareRequestStatus } from '../enums/care-request-status.enum';
import { CARE_REQUEST_REFERENCE_EXAMPLE, CARE_REQUEST_REFERENCE_PATTERN } from '../care-request-reference';
import { CareAppointmentStatus } from '../../care-appointments/enums/care-appointment-status.enum';
import { CareDeliveryMode } from '../../providers/enums/care-delivery-mode.enum';

export class CreateCareRequestDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) serviceCode!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsOptional() @Matches(/^SCPR-[A-F0-9]{16,32}$/) preferredProviderReference?: string | null;
  @ApiProperty({ example: 'NG' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(120) stateOrRegion!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(120) city!: string;
  @ApiPropertyOptional({ enum: CareDeliveryMode, default: CareDeliveryMode.IN_PERSON }) @IsOptional() @IsEnum(CareDeliveryMode) deliveryMode?: CareDeliveryMode;
  @ApiPropertyOptional({ format: 'date', nullable: true }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) preferredDate?: string | null;
  @ApiPropertyOptional({ example: '10:30', nullable: true }) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) preferredTime?: string | null;
  @ApiProperty({ enum: CareRequestContactMethod }) @IsEnum(CareRequestContactMethod) contactMethod!: CareRequestContactMethod;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value) @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
}

export class CareRequestListQueryDto {
  @ApiPropertyOptional({ enum: CareRequestStatus }) @IsOptional() @IsEnum(CareRequestStatus) status?: CareRequestStatus;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}

export class AdminCareRequestQueryDto extends CareRequestListQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) serviceCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^SCPR-[A-F0-9]{16,32}$/) providerReference?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) stateOrRegion?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) city?: string;
}

export class AssignCareRequestDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^SCPR-[A-F0-9]{16,32}$/) providerReference!: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(1000) reason?: string;
}

export class CareRequestReasonDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}

export class CareRequestReferenceParamsDto {
  @ApiProperty({ example: CARE_REQUEST_REFERENCE_EXAMPLE }) @Matches(CARE_REQUEST_REFERENCE_PATTERN) reference!: string;
}

export class CareRequestAppointmentLocationSummaryDto {
  @ApiProperty() reference!: string;
  @ApiProperty() name!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() stateOrRegion!: string;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty() countryCode!: string;
}

export class CareRequestAppointmentSummaryDto {
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: CareAppointmentStatus }) status!: CareAppointmentStatus;
  @ApiProperty({ format: 'date' }) scheduledDate!: string;
  @ApiProperty() scheduledTimeFrom!: string;
  @ApiProperty() scheduledTimeTo!: string;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: CareDeliveryMode }) deliveryMode!: CareDeliveryMode;
  @ApiProperty() hasMeetingLink!: boolean;
  @ApiPropertyOptional({ type: CareRequestAppointmentLocationSummaryDto, nullable: true }) location!: CareRequestAppointmentLocationSummaryDto | null;
}
