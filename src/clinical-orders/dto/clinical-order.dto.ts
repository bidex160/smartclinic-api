import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { CLINICAL_ORDER_REFERENCE_PATTERN } from "../clinical-order-reference";
import { ClinicalOrderType } from "../enums/clinical-order-type.enum";
export class PrescriptionItemDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  medicationName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) strength?:
    | string
    | null;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) dosage!: string;
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(200) frequency!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) duration?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) quantity?:
    | string
    | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) route?:
    | string
    | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  instructions?: string | null;
}
export class UpsertPrescriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNote?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4000) notes?:
    | string
    | null;
  @ApiProperty({ type: [PrescriptionItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}
export class CreateSimpleClinicalOrderDto {
  @ApiProperty({ enum: ClinicalOrderType })
  @IsEnum(ClinicalOrderType)
  type!: ClinicalOrderType;
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  clinicalNote!: string;
}
export class ClinicalOrderReferenceParamsDto {
  @ApiProperty() @Matches(CLINICAL_ORDER_REFERENCE_PATTERN) reference!: string;
}
export class ClinicalOrderListQueryDto {
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
  @ApiPropertyOptional({ enum: ClinicalOrderType })
  @IsOptional()
  @IsEnum(ClinicalOrderType)
  type?: ClinicalOrderType;
  @ApiPropertyOptional({
    description: "Limit orders to one Care Appointment reference",
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  careAppointmentReference?: string;
}
export class CancelClinicalOrderDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) reason?:
    | string
    | null;
}

export class DiagnosticOrderItemDto {
  @ApiProperty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) code?:
    | string
    | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instructions?: string | null;
}
export class CreateDiagnosticOrderDto {
  @ApiProperty({
    enum: [ClinicalOrderType.LABORATORY, ClinicalOrderType.IMAGING],
  })
  @IsEnum(ClinicalOrderType)
  type!: ClinicalOrderType;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNote?: string | null;
  @ApiProperty({ type: [DiagnosticOrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DiagnosticOrderItemDto)
  items!: DiagnosticOrderItemDto[];
}
export class DiagnosticResultItemDto {
  @ApiProperty() @Type(() => Number) @IsInt() @Min(0) sortOrder!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  resultText?: string | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  resultValue?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) resultUnit?:
    | string
    | null;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  referenceRange?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) resultFlag?:
    | string
    | null;
}
export class SubmitDiagnosticResultsDto {
  @ApiProperty({ type: [DiagnosticResultItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => DiagnosticResultItemDto)
  items!: DiagnosticResultItemDto[];
}

/** SmartClinic patient IDs look like SCP-ABCD-1234. */
export const SMARTCLINIC_PATIENT_ID_PATTERN = /^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const normalisePatientId = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toUpperCase() : value;

export class DirectOrderPatientLookupQueryDto {
  @ApiProperty({ example: "SCP-ABCD-1234" })
  @Transform(normalisePatientId)
  @Matches(SMARTCLINIC_PATIENT_ID_PATTERN, { message: "Enter a SmartClinic ID like SCP-ABCD-1234" })
  patientReference!: string;
}

export class CreateDirectClinicalOrderDto {
  @ApiProperty({ example: "SCP-ABCD-1234" })
  @Transform(normalisePatientId)
  @Matches(SMARTCLINIC_PATIENT_ID_PATTERN, { message: "Enter a SmartClinic ID like SCP-ABCD-1234" })
  patientReference!: string;

  @ApiProperty({ enum: [ClinicalOrderType.PRESCRIPTION, ClinicalOrderType.LABORATORY, ClinicalOrderType.IMAGING] })
  @IsIn([ClinicalOrderType.PRESCRIPTION, ClinicalOrderType.LABORATORY, ClinicalOrderType.IMAGING])
  type!: ClinicalOrderType.PRESCRIPTION | ClinicalOrderType.LABORATORY | ClinicalOrderType.IMAGING;

  @ApiPropertyOptional({ description: "Clinical context for the pharmacy or lab" })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  clinicalNote?: string | null;

  @ApiPropertyOptional({ type: [PrescriptionItemDto], description: "Required for prescriptions" })
  @ValidateIf((dto: CreateDirectClinicalOrderDto) => dto.type === ClinicalOrderType.PRESCRIPTION)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  prescriptionItems?: PrescriptionItemDto[];

  @ApiPropertyOptional({ type: [DiagnosticOrderItemDto], description: "Required for laboratory and imaging requests" })
  @ValidateIf((dto: CreateDirectClinicalOrderDto) => dto.type !== ClinicalOrderType.PRESCRIPTION)
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DiagnosticOrderItemDto)
  diagnosticItems?: DiagnosticOrderItemDto[];
}

export class DirectClinicalOrderListQueryDto {
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
