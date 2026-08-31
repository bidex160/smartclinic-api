import { Transform, Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import {
  GuidedSelfCheckInternalClinicalCapability,
  GuidedSelfCheckInternalClinicalProfessionalStatus,
  GuidedSelfCheckInternalClinicalProfessionalType,
} from '../enums/guided-self-check-internal-clinical-professional.enum';

export class AuthorizeInternalClinicalProfessionalDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() userEmail!: string;
  @IsString() @MinLength(1) @MaxLength(160) displayName!: string;
  @IsEnum(GuidedSelfCheckInternalClinicalProfessionalType) professionalType!: GuidedSelfCheckInternalClinicalProfessionalType;
  @IsArray() @ArrayNotEmpty() @IsEnum(GuidedSelfCheckInternalClinicalCapability, { each: true }) capabilities!: GuidedSelfCheckInternalClinicalCapability[];
}

export class ChangeInternalClinicalCapabilityDto {
  @IsEnum(GuidedSelfCheckInternalClinicalCapability) capability!: GuidedSelfCheckInternalClinicalCapability;
}

export class InternalClinicalProfessionalListQueryDto {
  @IsOptional() @IsEnum(GuidedSelfCheckInternalClinicalProfessionalStatus) status: GuidedSelfCheckInternalClinicalProfessionalStatus = GuidedSelfCheckInternalClinicalProfessionalStatus.ACTIVE;
  @IsOptional() @IsEnum(GuidedSelfCheckInternalClinicalCapability) capability?: GuidedSelfCheckInternalClinicalCapability;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
