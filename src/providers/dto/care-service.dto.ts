import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ProviderType } from '../enums/provider-type.enum';

export class CreateCareServiceDefinitionDto {
  @ApiProperty({ example: 'GENERAL_CONSULTATION' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) code!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(160) name!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value) @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
}

export class UpdateCareServiceDefinitionDto extends PartialType(CreateCareServiceDefinitionDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProviderCareServiceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() careServiceDefinitionId!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value) @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Integer minor units; null means price on request.' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) priceMinor?: number | null;
  @ApiPropertyOptional({ nullable: true, example: 'NGN' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string | null;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() supportsAppointmentRequests?: boolean;
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() supportsFastTrack?: boolean;
  @ApiPropertyOptional({ nullable: true, description: 'FastTrack fee in integer minor units.' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) fastTrackFeeMinor?: number | null;
  @ApiPropertyOptional({ nullable: true, example: 'NGN' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsOptional() @Matches(/^[A-Z]{3}$/) fastTrackCurrency?: string | null;
}

export class UpdateProviderCareServiceDto {
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value) @IsOptional() @IsString() @MaxLength(4000) description?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) priceMinor?: number | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsOptional() @Matches(/^[A-Z]{3}$/) currency?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() supportsAppointmentRequests?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() supportsFastTrack?: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(Number.MAX_SAFE_INTEGER) fastTrackFeeMinor?: number | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsOptional() @Matches(/^[A-Z]{3}$/) fastTrackCurrency?: string | null;
}

export class FindCareQueryDto {
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(160) q?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) serviceCode?: string;
  @ApiPropertyOptional({ enum: ProviderType }) @IsOptional() @IsEnum(ProviderType) providerType?: ProviderType;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) stateOrRegion?: string;
  @ApiPropertyOptional() @IsOptional() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 50 }) @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
}

export class PublicProviderReferenceParamsDto {
  @ApiProperty() @Matches(/^SCPR-[A-F0-9]{16,32}$/) reference!: string;
}

export class AdminProviderCareServiceParamsDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() providerId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() id!: string;
}

export class PublicCareServiceCatalogueItemDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() providerCount!: number;
}

export class PublicProviderCareServiceDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Integer minor units.' }) priceMinor!: number | null;
  @ApiPropertyOptional({ nullable: true }) currency!: string | null;
  @ApiProperty() priceOnRequest!: boolean;
  @ApiProperty() supportsAppointmentRequests!: boolean;
  @ApiProperty() supportsFastTrack!: boolean;
  @ApiPropertyOptional({ nullable: true }) fastTrackFeeMinor!: number | null;
  @ApiPropertyOptional({ nullable: true }) fastTrackCurrency!: string | null;
}

export class PublicProviderLocationDto {
  @ApiProperty() locationReference!: string;
  @ApiProperty() name!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() stateOrRegion!: string;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty() countryCode!: string;
}

export class PublicFindCareProviderDto {
  @ApiProperty() providerReference!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ enum: ProviderType }) providerType!: ProviderType;
  @ApiProperty({ type: Object }) location!: { city: string | null; stateOrRegion: string | null; countryCode: string | null };
  @ApiProperty({ type: [PublicProviderLocationDto] }) locations!: PublicProviderLocationDto[];
  @ApiProperty({ type: [PublicProviderCareServiceDto] }) services!: PublicProviderCareServiceDto[];
}

export class PublicFindCareProviderListDto {
  @ApiProperty({ type: [PublicFindCareProviderDto] }) items!: PublicFindCareProviderDto[];
  @ApiProperty() page!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
