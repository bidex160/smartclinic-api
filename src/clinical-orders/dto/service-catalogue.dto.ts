import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SmartClinicCatalogueCategory } from '../entities/smartclinic-service-catalogue-item.entity';

export class ServiceCatalogueQueryDto {
  @ApiPropertyOptional({ enum: SmartClinicCatalogueCategory })
  @IsOptional() @IsEnum(SmartClinicCatalogueCategory)
  category?: SmartClinicCatalogueCategory;
  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(120)
  q?: string;
}

export class CreateServiceCatalogueItemDto {
  @ApiProperty() @Transform(({value})=>typeof value==='string'?value.trim().toUpperCase():value) @IsString() @MinLength(2) @MaxLength(80) @Matches(/^[A-Z0-9_\-]+$/) code!: string;
  @ApiProperty({ enum: SmartClinicCatalogueCategory }) @IsEnum(SmartClinicCatalogueCategory) category!: SmartClinicCatalogueCategory;
  @ApiProperty() @Transform(({value})=>typeof value==='string'?value.trim():value) @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) unitLabel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) groupName?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) subcategory?: string | null;
  @ApiProperty({ description: 'Reference average cost in minor currency units.' }) @Type(()=>Number) @IsInt() @Min(0) averageCostMinor!: number;
  @ApiPropertyOptional({ default: 2000, description: 'Markup in basis points. 2000 = 20%.' }) @IsOptional() @Type(()=>Number) @IsInt() @Min(0) @Max(50000) markupBps = 2000;
  @ApiPropertyOptional({ default: 'NGN' }) @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency = 'NGN';
  @ApiPropertyOptional({ default: false }) @IsOptional() @IsBoolean() requiresPrescription = false;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() patientVisible = true;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() isActive = true;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(()=>Number) @IsInt() @Min(0) @Max(32767) sortOrder = 0;
}
export class UpdateServiceCatalogueItemDto extends PartialType(CreateServiceCatalogueItemDto) {}
