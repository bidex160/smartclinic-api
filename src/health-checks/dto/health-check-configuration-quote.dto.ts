import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
export class HealthCheckConfigurationQuoteDto {
  @IsOptional() @Matches(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/) participantPatientReference?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(CODE) packageCode!: string;
  @IsString() @MaxLength(45) providerReference!: string;
  @IsOptional() @IsString() @MaxLength(21) providerLocationReference?: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(CODE) fulfilmentModeCode!: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(120) stateOrRegion?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(24) postalCode?: string;
  @IsOptional() @IsLatitude() latitude?: string;
  @IsOptional() @IsLongitude() longitude?: string;
  @IsOptional() @IsArray() @ArrayUnique() @Transform(({ value }) => Array.isArray(value) ? value.map((x) => typeof x === 'string' ? x.trim().toUpperCase() : x) : value) @Matches(CODE, { each: true }) addonCodes: string[] = [];
}
