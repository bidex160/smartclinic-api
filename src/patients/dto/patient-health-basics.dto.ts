import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsOptional, IsString, Matches, MaxLength } from "class-validator";

import { BLOOD_GROUPS, BloodGroup, GENOTYPES, Genotype } from "../entities/patient-health-basics.entity";

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,29}$/;
/** Trim strings and treat blanks as "clear this field". */
const trimToNull = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export class UpdatePatientHealthBasicsDto {
  @ApiPropertyOptional({ enum: BLOOD_GROUPS, nullable: true })
  @IsOptional()
  @IsIn(BLOOD_GROUPS)
  bloodGroup?: BloodGroup | null;

  @ApiPropertyOptional({ enum: GENOTYPES, nullable: true })
  @IsOptional()
  @IsIn(GENOTYPES)
  genotype?: Genotype | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500, example: "Penicillin; peanuts" })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  allergies?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 500, example: "Asthma" })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(500)
  conditions?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(120)
  emergencyContactName?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "+2348012345678" })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @Matches(PHONE_PATTERN, { message: "emergencyContactPhone must be a valid phone number" })
  emergencyContactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 60, example: "Sister" })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  emergencyContactRelationship?: string | null;
}

export class PatientHealthBasicsDto {
  @ApiProperty({ enum: BLOOD_GROUPS, nullable: true }) bloodGroup!: BloodGroup | null;
  @ApiProperty({ enum: GENOTYPES, nullable: true }) genotype!: Genotype | null;
  @ApiProperty({ nullable: true }) allergies!: string | null;
  @ApiProperty({ nullable: true }) conditions!: string | null;
  @ApiProperty({ nullable: true }) emergencyContactName!: string | null;
  @ApiProperty({ nullable: true }) emergencyContactPhone!: string | null;
  @ApiProperty({ nullable: true }) emergencyContactRelationship!: string | null;
  @ApiProperty({ enum: ["SELF_REPORTED"], description: "Entered by the patient; not clinically verified." })
  source!: "SELF_REPORTED";
  @ApiProperty({ nullable: true, type: String, format: "date-time" }) updatedAt!: string | null;
}
