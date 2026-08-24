import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length, Matches, MaxLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class CreateProviderServiceAreaDto {
  @IsUUID() providerServiceId!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @Transform(trim) @IsString() @Length(1, 120) stateOrRegion!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) city?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(30) postalCode?: string | null;
}
export class UpdateProviderServiceAreaDto extends PartialType(CreateProviderServiceAreaDto) {}
