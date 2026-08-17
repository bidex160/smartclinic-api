import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsMilitaryTime, IsOptional, IsTimeZone, IsUUID } from 'class-validator';
import { DayOfWeek } from '../enums/day-of-week.enum';

export class CreateProviderAvailabilityDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() providerServiceId?: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() providerLocationId?: string | null;
  @ApiProperty({ enum: DayOfWeek }) @IsEnum(DayOfWeek) dayOfWeek!: DayOfWeek;
  @ApiProperty({ example: '09:00' }) @IsMilitaryTime() startTime!: string;
  @ApiProperty({ example: '17:00' }) @IsMilitaryTime() endTime!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) @IsTimeZone() timezone!: string;
}
