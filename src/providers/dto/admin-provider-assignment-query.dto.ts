import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, Matches } from 'class-validator';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';

export class AdminProviderAssignmentQueryDto {
  @ApiPropertyOptional({ example: 'SC-2026-7F23B0C9D1E4' })
  @IsOptional() @Matches(/^SC-\d{4}-[A-F0-9]{12}$/, { message: 'bookingReference must be a valid SmartClinic booking reference' })
  bookingReference?: string;

  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID()
  providerId?: string;

  @ApiPropertyOptional({ enum: ProviderAssignmentStatus }) @IsOptional() @IsEnum(ProviderAssignmentStatus)
  status?: ProviderAssignmentStatus;
}
