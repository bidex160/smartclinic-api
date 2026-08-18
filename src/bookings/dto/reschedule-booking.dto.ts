import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsMilitaryTime, IsTimeZone } from 'class-validator';

export class RescheduleBookingDto {
  @ApiProperty({ format: 'date', example: '2026-08-28' }) @IsDateString({ strict: true }) preferredDate!: string;
  @ApiProperty({ example: '09:00' }) @IsMilitaryTime() preferredTimeFrom!: string;
  @ApiProperty({ example: '11:00' }) @IsMilitaryTime() preferredTimeTo!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsTimeZone() preferredTimezone!: string;
}
