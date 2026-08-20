import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMilitaryTime, IsOptional, IsTimeZone, IsUUID, Matches } from 'class-validator';

export class ScheduleBookingDto {
  @ApiProperty({ example: '2026-08-25', format: 'date' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @ApiProperty({ example: '09:00' }) @IsMilitaryTime() timeFrom!: string;
  @ApiProperty({ example: '10:00' }) @IsMilitaryTime() timeTo!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsTimeZone() timezone!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() providerLocationId?: string;
}
