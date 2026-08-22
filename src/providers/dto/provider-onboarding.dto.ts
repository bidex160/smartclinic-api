import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ProviderOnboardingStatus } from '../enums/provider-onboarding-status.enum';
import { ProviderStatus } from '../enums/provider-status.enum';
import { ProviderType } from '../enums/provider-type.enum';

export class ProviderProfileFieldsDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(200) displayName!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(7) @MaxLength(32) phone!: string;
  @ApiPropertyOptional({ nullable: true }) @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsOptional() @IsString() @MaxLength(200) professionalReference?: string | null;
  @ApiProperty({ enum: ProviderType }) @IsEnum(ProviderType) providerType!: ProviderType;
  @ApiProperty({ example: 'NG' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{2}$/) countryCode!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(120) stateOrRegion!: string;
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(1) @MaxLength(120) city!: string;
}

export class RegisterProviderDto extends ProviderProfileFieldsDto {
  @ApiProperty() @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(254) email!: string;
  @ApiProperty({ minLength: 12, maxLength: 128, format: 'password' }) @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class UpdateProviderProfileDto extends PartialType(ProviderProfileFieldsDto) {}

export class ProviderOnboardingProfileResponseDto {
  @ApiProperty() displayName!: string;
  @ApiProperty() email!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true }) professionalReference!: string | null;
  @ApiProperty({ enum: ProviderType }) providerType!: ProviderType;
  @ApiPropertyOptional({ nullable: true }) countryCode!: string | null;
  @ApiPropertyOptional({ nullable: true }) stateOrRegion!: string | null;
  @ApiPropertyOptional({ nullable: true }) city!: string | null;
  @ApiProperty({ enum: ProviderStatus }) status!: ProviderStatus;
  @ApiProperty({ enum: ProviderOnboardingStatus }) onboardingStatus!: ProviderOnboardingStatus;
  @ApiPropertyOptional({ nullable: true }) submittedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) reviewedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true }) reviewNote!: string | null;
}
