import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const CODE = /^[A-Z][A-Z0-9_]{1,79}$/;
export class HealthCheckConfigurationQuoteDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(CODE) packageCode!: string;
  @IsString() @MaxLength(45) providerReference!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(CODE) fulfilmentModeCode!: string;
  @IsOptional() @IsArray() @ArrayUnique() @Transform(({ value }) => Array.isArray(value) ? value.map((x) => typeof x === 'string' ? x.trim().toUpperCase() : x) : value) @Matches(CODE, { each: true }) addonCodes: string[] = [];
}
