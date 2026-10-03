import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PartnerFacilityType } from '../entities/partner-facility-listing.entity';

export class PartnerFacilityDirectoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(PartnerFacilityType) facilityType?: PartnerFacilityType;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) stateOrRegion?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) city?: string;
  /** Near me: sort by distance from this point (never stored). */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) lng?: number;
  /** Only facilities whose licence is current in the national registry, or that are verified on SmartClinic. */
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() verifiedOnly?: boolean;
}

export class RequestFacilityContactDto {
  @IsBoolean() consentAcknowledged!: boolean;
}

export enum PartnerFacilityRequestType {
  APPOINTMENT = 'APPOINTMENT',
  REGISTRATION = 'REGISTRATION',
  CONTACT = 'CONTACT',
}

export class CreatePartnerFacilityRequestDto {
  @IsEnum(PartnerFacilityRequestType) requestType!: PartnerFacilityRequestType;
  @IsBoolean() consentAcknowledged!: boolean;
  @IsOptional() @IsDateString() preferredAt?: string;
}

export enum PartnerFacilityFollowUpStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  BOOKED = 'BOOKED',
  UNAVAILABLE = 'UNAVAILABLE',
  CLOSED = 'CLOSED',
}

export class UpdatePartnerFacilityRequestStatusDto {
  @IsEnum(PartnerFacilityFollowUpStatus) status!: PartnerFacilityFollowUpStatus;
}
