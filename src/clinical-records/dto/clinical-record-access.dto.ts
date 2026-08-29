import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'; import { Transform, Type } from 'class-transformer'; import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CLINICAL_RECORD_REFERENCE_EXAMPLE, CLINICAL_RECORD_REFERENCE_PATTERN } from '../clinical-record-reference'; import { CLINICAL_RECORD_GRANT_REFERENCE_EXAMPLE, CLINICAL_RECORD_GRANT_REFERENCE_PATTERN } from '../clinical-record-access-reference'; import { ClinicalRecordAccessScope } from '../enums/clinical-record-access-scope.enum'; import { ClinicalRecordType } from '../enums/clinical-record-type.enum';
export class CreateClinicalRecordAccessGrantDto {
 @ApiProperty({ example: 'SCPR-74A176AB04848BE2D3977F8493D29CE5' }) @Matches(/^SCPR-[A-F0-9]{32}$/) providerReference!: string;
 @ApiProperty({ enum: ClinicalRecordAccessScope }) @IsEnum(ClinicalRecordAccessScope) scope!: ClinicalRecordAccessScope;
 @ApiPropertyOptional({ enum: ClinicalRecordType }) @IsOptional() @IsEnum(ClinicalRecordType) recordType?: ClinicalRecordType;
 @ApiPropertyOptional({ example: CLINICAL_RECORD_REFERENCE_EXAMPLE }) @IsOptional() @Matches(CLINICAL_RECORD_REFERENCE_PATTERN) clinicalRecordReference?: string;
 @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsISO8601({ strict: true }) expiresAt?: string | null;
}
export class ClinicalRecordAccessGrantParamsDto { @ApiProperty({ example: CLINICAL_RECORD_GRANT_REFERENCE_EXAMPLE }) @Matches(CLINICAL_RECORD_GRANT_REFERENCE_PATTERN) reference!: string; }
export class ClinicalAccessListQueryDto { @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1; @ApiPropertyOptional({ default: 20, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20; }
export class ClinicalRecordAccessProviderListQueryDto extends ClinicalAccessListQueryDto {
 @ApiPropertyOptional({ description: 'Provider display-name search', maxLength: 120 })
 @IsOptional()
 @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
 @IsString()
 @MaxLength(120)
 q?: string;
}
