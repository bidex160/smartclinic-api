import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PATIENT_PROVIDER_CONNECTION_REFERENCE_PATTERN } from '../patient-provider-connection-reference';

export class ConnectionListQueryDto {
 @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
 @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
 @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) q?: string;
}
export class ConnectionReferenceParamsDto { @ApiProperty() @Matches(PATIENT_PROVIDER_CONNECTION_REFERENCE_PATTERN) reference!: string; }
export class UpdateProviderConnectionConfigDto {
 @ApiProperty() @IsBoolean() newPatientRegistrationEnabled!: boolean;
 @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) newPatientRegistrationFeeMinor?: number | null;
 @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) newPatientRegistrationCurrency?: string | null;
 @ApiProperty() @IsBoolean() existingPatientLinkEnabled!: boolean;
 @ApiPropertyOptional({ minimum: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) existingPatientLinkFeeMinor?: number | null;
 @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z]{3}$/) existingPatientLinkCurrency?: string | null;
}
export class StartNewPatientRegistrationDto {
 @ApiProperty() @Matches(/^SCPR-[A-F0-9]{32}$/) providerReference!: string;
 @ApiProperty({ description: 'Explicit registration consent acknowledgement' }) @IsBoolean() consentAcknowledged!: boolean;
}
export class StartExistingPatientLinkDto extends StartNewPatientRegistrationDto {
 @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(160) externalPatientReference!: string;
}
export class ResubmitExistingPatientLinkDto {
 @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(160) externalPatientReference!: string;
}
export class ConvertConnectionDto { @ApiProperty() @IsBoolean() consentAcknowledged!: boolean; }
export class ProviderConnectionDecisionDto {
 @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(160) externalPatientReference?: string;
 @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(1000) reason?: string;
}
