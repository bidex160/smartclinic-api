import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ProviderRecruitmentInvitationSource } from '../enums/provider-recruitment-invitation.enum';

const trim = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() : value;
const trimOptional = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim() || undefined : value;
const upperOptional = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().toUpperCase() || undefined : value;
const emailOptional = ({ value }: { value: unknown }): unknown => typeof value === 'string' ? value.trim().toLowerCase() || undefined : value;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,29}$/;

export class CreateProviderRecruitmentInvitationDto {
  @ApiProperty({ maxLength: 160 }) @Transform(trim) @IsString() @MinLength(1) @MaxLength(160)
  organisationName!: string;

  @ApiPropertyOptional({ maxLength: 254 }) @Transform(emailOptional) @ValidateIf((dto) => !dto.phone || dto.email !== undefined) @IsEmail() @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({ maxLength: 32 }) @Transform(trimOptional) @ValidateIf((dto) => !dto.email || dto.phone !== undefined) @IsString() @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' }) @MaxLength(32)
  phone?: string;

  @ApiProperty({ enum: ProviderRecruitmentInvitationSource }) @IsEnum(ProviderRecruitmentInvitationSource)
  source!: ProviderRecruitmentInvitationSource;

  @ApiProperty() @Transform(upperOptional) @IsString() @MinLength(1) @MaxLength(80)
  packageCode!: string;

  @ApiProperty() @Transform(upperOptional) @IsString() @MinLength(1) @MaxLength(80)
  fulfilmentModeCode!: string;

  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString({ strict: true })
  preferredDate?: string;

  @ApiPropertyOptional({ example: '21:37' }) @Transform(trimOptional) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  preferredTime?: string;

  @ApiPropertyOptional({ minLength: 2, maxLength: 2 }) @Transform(upperOptional) @IsOptional() @Matches(/^[A-Z]{2}$/)
  countryCode?: string;

  @ApiPropertyOptional({ maxLength: 120 }) @Transform(trimOptional) @IsOptional() @IsString() @MaxLength(120)
  stateOrRegion?: string;

  @ApiPropertyOptional({ maxLength: 120 }) @Transform(trimOptional) @IsOptional() @IsString() @MaxLength(120)
  city?: string;
}
