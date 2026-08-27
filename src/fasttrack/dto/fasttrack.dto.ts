import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { FastTrackSource } from '../enums/fasttrack-source.enum';
import { FastTrackStatus } from '../enums/fasttrack-status.enum';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const optionalTrim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() || null : value;

export class FastTrackReferenceParamsDto { @ApiProperty() @Matches(/^SC-FT-[A-F0-9]{16}$/) reference!: string; }
export class CareRequestReferenceParamsDto { @ApiProperty() @Matches(/^SC-CARE-[A-F0-9]{16}$/) reference!: string; }
export class CreateExternalFastTrackDto {
  @ApiProperty() @Transform(trim) @Matches(/^SCPR-[A-F0-9]{16,32}$/) providerReference!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) serviceCode!: string;
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(160) externalAppointmentReference!: string;
  @ApiProperty() @IsDateString({ strict: true }) appointmentDate!: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) appointmentTime?: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(optionalTrim) @IsOptional() @IsString() @MaxLength(160) department?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(optionalTrim) @IsOptional() @IsString() @MaxLength(160) doctorName?: string | null;
  @ApiPropertyOptional({ nullable: true }) @Transform(optionalTrim) @IsOptional() @IsString() @MaxLength(4000) notes?: string | null;
}
export class FastTrackReasonDto { @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(2000) reason!: string; }
export class FastTrackListQueryDto {
  @ApiPropertyOptional({ enum: FastTrackStatus }) @IsOptional() @IsEnum(FastTrackStatus) status?: FastTrackStatus;
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class AdminFastTrackQueryDto extends FastTrackListQueryDto {
  @ApiPropertyOptional({ enum: FastTrackSource }) @IsOptional() @IsEnum(FastTrackSource) source?: FastTrackSource;
  @ApiPropertyOptional() @IsOptional() @Matches(/^SCPR-[A-F0-9]{16,32}$/) providerReference?: string;
  @ApiPropertyOptional() @IsOptional() @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) serviceCode?: string;
}
