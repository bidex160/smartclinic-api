import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingVisitAddressDto } from './booking-visit-address.dto';

const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{6,29}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export enum PublicBookingRelationship {
  SELF = 'SELF',
  FAMILY = 'FAMILY',
  OTHER = 'OTHER',
}

class PublicBookerDto {
  @ApiProperty({ example: 'Ada', maxLength: 100 })
  @IsString()
  @Matches(/\S/, { message: 'givenName must not be blank' })
  @MaxLength(100)
  givenName!: string;

  @ApiProperty({ example: 'Okafor', maxLength: 100 })
  @IsString()
  @Matches(/\S/, { message: 'familyName must not be blank' })
  @MaxLength(100)
  familyName!: string;

  @ApiPropertyOptional({ example: 'ada@example.test', nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ example: '+2348012345678', maxLength: 30 })
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  @MaxLength(30)
  phone!: string;
}

class PublicParticipantDto {
  @ApiProperty({ enum: PublicBookingRelationship, example: PublicBookingRelationship.SELF })
  @IsEnum(PublicBookingRelationship)
  relationship!: PublicBookingRelationship;

  @ApiProperty({ example: 'Ada', maxLength: 100 })
  @IsString()
  @Matches(/\S/, { message: 'givenName must not be blank' })
  @MaxLength(100)
  givenName!: string;

  @ApiProperty({ example: 'Okafor', maxLength: 100 })
  @IsString()
  @Matches(/\S/, { message: 'familyName must not be blank' })
  @MaxLength(100)
  familyName!: string;

  @ApiPropertyOptional({ format: 'date', example: '1990-01-01', nullable: true })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: '+2348012345678', nullable: true, maxLength: 30 })
  @IsOptional()
  @IsString()
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ example: 'participant@example.test', nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

class PublicBookingDetailsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  healthCheckPackageId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  fulfilmentModeId!: string;

  @ApiProperty({ format: 'date' })
  @IsDateString()
  preferredDate!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME_PATTERN, { message: 'preferredTimeFrom must be a valid time' })
  preferredTimeFrom!: string;

  @ApiPropertyOptional({ deprecated: true, description: 'Ignored. Appointment end is derived from package duration.' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  preferredTimeTo?: string;

  @ApiProperty({ example: 'Africa/Lagos', description: 'IANA timezone used to interpret the preferred appointment start.' })
  @IsTimeZone()
  preferredTimezone!: string;

  @ApiPropertyOptional({ type: BookingVisitAddressDto }) @IsOptional() @ValidateNested() @Type(() => BookingVisitAddressDto) visitAddress?: BookingVisitAddressDto;

  @ApiPropertyOptional({ maxLength: 1000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  locationNote?: string;
}

export class CreatePublicBookingDto {
  @ApiProperty({ type: PublicBookerDto })
  @ValidateNested()
  @Type(() => PublicBookerDto)
  booker!: PublicBookerDto;

  @ApiProperty({ type: PublicParticipantDto })
  @ValidateNested()
  @Type(() => PublicParticipantDto)
  participant!: PublicParticipantDto;

  @ApiProperty({ type: PublicBookingDetailsDto })
  @ValidateNested()
  @Type(() => PublicBookingDetailsDto)
  booking!: PublicBookingDetailsDto;
}
