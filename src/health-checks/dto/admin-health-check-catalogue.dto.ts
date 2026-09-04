import { Transform, Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { HealthCheckClinicalResultType } from '../enums/health-check-clinical-result-type.enum';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const code = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateAdminHealthCheckPackageDto {
  @Transform(code) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) code!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(240, { each: true }) benefits: string[] = [];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) estimatedDurationMinutes?: number | null;
}

export class UpdateAdminHealthCheckPackageDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(240, { each: true }) benefits?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1440) estimatedDurationMinutes?: number | null;
}

export class AdminClinicalContentQueryDto {
  @IsOptional() @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() isActive?: boolean;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) category?: string;
  @IsOptional() @IsEnum(HealthCheckClinicalResultType) resultType?: HealthCheckClinicalResultType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(160) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class CreateAdminClinicalContentDto {
  @Transform(code) @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) code!: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) description?: string | null;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40) category!: string;
  @IsEnum(HealthCheckClinicalResultType) resultType!: HealthCheckClinicalResultType;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(16) unit?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(32767) displayOrder = 0;
  @IsOptional() @IsBoolean() isActive = true;
}

export class UpdateAdminClinicalContentDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(160) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(4000) description?: string | null;
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(40) category?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(32767) displayOrder?: number;
}

export class AddPackageContentDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(23) clinicalContentReference!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(30000) sortOrder?: number;
}

export class AddPackageAddonDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(23) clinicalContentReference!: string;
}

export class PackageContentOrderItemDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(23) clinicalContentReference!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(30000) sortOrder!: number;
}

export class ReorderPackageContentsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PackageContentOrderItemDto)
  items!: PackageContentOrderItemDto[];
}
