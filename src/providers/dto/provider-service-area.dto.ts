import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class CreateProviderServiceAreaDto {
  @IsUUID() providerServiceId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @Transform(trim) @IsString() @Length(1, 120) stateOrRegion!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) city?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) postalCode?: string | null;
  @IsOptional() @IsInt() @Min(0) travelFeeMinor?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999) priority?: number;
  @IsOptional() @IsLatitude() originLatitude?: number | null;
  @IsOptional() @IsLongitude() originLongitude?: number | null;
  @IsOptional() @IsNumber() @Min(0.1) @Max(1000) maxRadiusKm?: number | null;
}
export class UpdateProviderServiceAreaDto extends PartialType(CreateProviderServiceAreaDto) {}
