import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { CareAppointmentReferenceParamsDto } from "../../care-appointments/dto/care-appointment.dto";
import {
  CLINICAL_RECORD_REFERENCE_EXAMPLE,
  CLINICAL_RECORD_REFERENCE_PATTERN,
} from "../clinical-record-reference";
import { ClinicalRecordType } from "../enums/clinical-record-type.enum";

const optionalText = () =>
  Transform(({ value }) =>
    typeof value === "string" ? value.trim() || null : value,
  );

export class ClinicalConsultationDetailDto {
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  presentingComplaint?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  historyOfPresentingComplaint?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  observations?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  assessment?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  diagnosis?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  plan?: string | null;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  followUpInstructions?: string | null;
}

export class CreateClinicalRecordDto {
  @ApiProperty({ enum: ClinicalRecordType })
  @IsEnum(ClinicalRecordType)
  recordType!: ClinicalRecordType;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string | null;
  @ApiPropertyOptional({ type: ClinicalConsultationDetailDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalConsultationDetailDto)
  consultation?: ClinicalConsultationDetailDto;
  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  structuredData?: Record<string, unknown> | null;
}

export class UpdateClinicalRecordDto {
  @ApiPropertyOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;
  @ApiPropertyOptional({ nullable: true })
  @optionalText()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  summary?: string | null;
  @ApiPropertyOptional({ type: ClinicalConsultationDetailDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClinicalConsultationDetailDto)
  consultation?: ClinicalConsultationDetailDto;
  @ApiPropertyOptional({ type: Object, nullable: true })
  @IsOptional()
  @IsObject()
  structuredData?: Record<string, unknown> | null;
}

export class ClinicalRecordReferenceParamsDto {
  @ApiProperty({ example: CLINICAL_RECORD_REFERENCE_EXAMPLE })
  @Matches(CLINICAL_RECORD_REFERENCE_PATTERN)
  reference!: string;
}

export class ClinicalRecordAppointmentParamsDto extends CareAppointmentReferenceParamsDto {}

export class ClinicalRecordListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
