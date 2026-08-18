import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { BookingStatus } from '../../bookings/enums/booking-status.enum';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';

export class AdminMatchingQueueQueryDto {
  @ApiPropertyOptional({ enum: BookingStatus, description: 'Defaults to PENDING_PROVIDER_MATCH.' }) @IsOptional() @IsEnum(BookingStatus) bookingStatus?: BookingStatus;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() packageId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() fulfilmentModeId?: string;
  @ApiPropertyOptional({ format: 'date' }) @IsOptional() @IsDateString({ strict: true }) preferredDate?: string;
  @ApiPropertyOptional({ enum: ProviderAssignmentStatus }) @IsOptional() @IsEnum(ProviderAssignmentStatus) providerAssignmentStatus?: ProviderAssignmentStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() bookingReference?: string;
  @ApiPropertyOptional({ default: 1, minimum: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}
