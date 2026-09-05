import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { CLINICAL_RECORD_ACCESS_REQUEST_REFERENCE_EXAMPLE, CLINICAL_RECORD_ACCESS_REQUEST_REFERENCE_PATTERN } from '../clinical-record-access-request-reference';
import { CLINICAL_RECORD_REFERENCE_PATTERN } from '../clinical-record-reference';
import { ClinicalRecordAccessScope } from '../enums/clinical-record-access-scope.enum';
import { ClinicalRecordType } from '../enums/clinical-record-type.enum';

export class CreateClinicalRecordAccessRequestDto {
  @ApiProperty({ example: 'SCP-AB12-CD34' }) @Matches(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/) patientReference!: string;
  @ApiProperty({ enum: ClinicalRecordAccessScope }) @IsEnum(ClinicalRecordAccessScope) scope!: ClinicalRecordAccessScope;
  @ApiPropertyOptional({ enum: ClinicalRecordType }) @IsOptional() @IsEnum(ClinicalRecordType) recordType?: ClinicalRecordType;
  @ApiPropertyOptional() @IsOptional() @Matches(CLINICAL_RECORD_REFERENCE_PATTERN) clinicalRecordReference?: string;
  @ApiProperty({ maxLength: 1000 }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
  @ApiPropertyOptional({ description: 'Requested expiry of the eventual sharing grant', nullable: true }) @IsOptional() @IsISO8601({ strict: true }) requestedExpiresAt?: string | null;
}

export class ClinicalRecordAccessRequestParamsDto {
  @ApiProperty({ example: CLINICAL_RECORD_ACCESS_REQUEST_REFERENCE_EXAMPLE })
  @Matches(CLINICAL_RECORD_ACCESS_REQUEST_REFERENCE_PATTERN)
  reference!: string;
}
