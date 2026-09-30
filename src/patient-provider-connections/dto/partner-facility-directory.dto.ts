import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PartnerFacilityType } from '../entities/partner-facility-listing.entity';

export class PartnerFacilityDirectoryQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsEnum(PartnerFacilityType) facilityType?: PartnerFacilityType;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) stateOrRegion?: string;
  @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) city?: string;
}

export class RequestFacilityContactDto {
  @IsBoolean() consentAcknowledged!: boolean;
}
