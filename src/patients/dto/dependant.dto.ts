import { Transform } from 'class-transformer';
import { IsDateString, IsEnum, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PatientRelationshipRole, PatientRelationshipType } from '../enums/patient-relationship.enum';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateDependantDto {
  @ApiProperty({ example: 'Aisha' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) firstName!: string;
  @ApiProperty({ example: 'Okafor' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) lastName!: string;
  @ApiProperty({ format: 'date', example: '2015-06-12' }) @IsDateString({ strict: true }) dateOfBirth!: string;
  @ApiProperty({ enum: PatientRelationshipType }) @IsEnum(PatientRelationshipType) relationshipType!: PatientRelationshipType;
  @ApiProperty({ example: 'NG' }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @IsString() @Length(2, 2) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @ApiProperty({ example: 'Lagos' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) stateOrRegion!: string;
  @ApiProperty({ example: 'Ikeja' }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) city!: string;
}

export class DependantRelationshipDto {
  @ApiProperty({ enum: PatientRelationshipType }) type!: PatientRelationshipType;
  @ApiProperty({ enum: PatientRelationshipRole }) role!: PatientRelationshipRole;
  @ApiProperty() isPrimary!: boolean;
}

export class DependantResponseDto {
  @ApiProperty() patientReference!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ format: 'date' }) dateOfBirth!: string;
  @ApiProperty() countryCode!: string;
  @ApiProperty() stateOrRegion!: string;
  @ApiProperty() city!: string;
  @ApiProperty({ type: DependantRelationshipDto }) relationship!: DependantRelationshipDto;
}

export class DependantsListResponseDto {
  @ApiProperty({ type: DependantResponseDto, isArray: true }) items!: DependantResponseDto[];
}

export class AccessiblePatientResponseDto {
  @ApiProperty() patientReference!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty({ nullable: true, format: 'date' }) dateOfBirth!: string | null;
  @ApiProperty({ nullable: true }) countryCode!: string | null;
  @ApiProperty({ nullable: true }) stateOrRegion!: string | null;
  @ApiProperty({ nullable: true }) city!: string | null;
  @ApiProperty({ enum: ['SELF', 'DEPENDANT'] }) accessKind!: 'SELF' | 'DEPENDANT';
  @ApiProperty({ type: DependantRelationshipDto, nullable: true }) relationship!: DependantRelationshipDto | null;
}

export class PatientReferenceParamsDto {
  @ApiProperty({ example: 'SCP-AB12-CD34' }) @Matches(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/) patientReference!: string;
}
