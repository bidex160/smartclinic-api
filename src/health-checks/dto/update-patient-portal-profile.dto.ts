import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,29}$/;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class UpdatePatientPortalProfileDto {
  @ApiPropertyOptional({ example: 'Ada', maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Matches(/\S/, { message: 'givenName must not be blank' })
  @MaxLength(100)
  givenName?: string;

  @ApiPropertyOptional({ example: 'Okafor', maxLength: 100 })
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Matches(/\S/, { message: 'familyName must not be blank' })
  @MaxLength(100)
  familyName?: string;

  @ApiPropertyOptional({ example: '+2348012345678', nullable: true, maxLength: 30 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ format: 'date', example: '1990-01-01', nullable: true })
  @IsOptional()
  @IsDateString({ strict: true })
  dateOfBirth?: string | null;
}
