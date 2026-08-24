import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsMilitaryTime, IsOptional, IsTimeZone } from 'class-validator';

export class RescheduleBookingDto {
  @ApiProperty({ format: 'date', example: '2026-08-28' }) @IsDateString({ strict: true }) preferredDate!: string;
  @ApiProperty({ example: '09:00' }) @IsMilitaryTime() preferredTimeFrom!: string;
  @ApiProperty({ required: false, deprecated: true, description: 'Ignored. Matching end is derived from package duration.' }) @IsOptional() @IsMilitaryTime() preferredTimeTo?: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsTimeZone() preferredTimezone!: string;
}
