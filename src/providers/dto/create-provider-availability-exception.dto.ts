import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsMilitaryTime, IsOptional, IsString, IsTimeZone, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { ProviderAvailabilityExceptionType } from '../enums/provider-availability-exception-type.enum';

export class CreateProviderAvailabilityExceptionDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() providerServiceId?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() providerLocationId?: string | null;
  @ApiProperty({ format: 'date' }) @IsDateString({ strict: true }) date!: string;
  @ApiPropertyOptional({ example: '12:00', nullable: true }) @ValidateIf((o) => o.endTime != null || o.startTime != null) @IsMilitaryTime() startTime?: string | null;
  @ApiPropertyOptional({ example: '14:00', nullable: true }) @ValidateIf((o) => o.startTime != null || o.endTime != null) @IsMilitaryTime() endTime?: string | null;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsTimeZone() timezone!: string;
  @ApiProperty({ enum: ProviderAvailabilityExceptionType }) @IsEnum(ProviderAvailabilityExceptionType) type!: ProviderAvailabilityExceptionType;
  @ApiPropertyOptional({ nullable: true, maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) reason?: string | null;
}
