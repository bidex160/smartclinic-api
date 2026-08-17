import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderAvailability } from '../entities/provider-availability.entity';
import { DayOfWeek } from '../enums/day-of-week.enum';
export class ProviderAvailabilityResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) providerServiceId!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ApiProperty({ enum: DayOfWeek }) dayOfWeek!: DayOfWeek;
  @ApiProperty({ example: '09:00:00' }) startTime!: string;
  @ApiProperty({ example: '17:00:00' }) endTime!: string;
  @ApiProperty({ example: 'Africa/Lagos' }) timezone!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  static fromEntity(value: ProviderAvailability): ProviderAvailabilityResponseDto {
    return { id: value.id, providerId: value.providerId, providerServiceId: value.providerServiceId, providerLocationId: value.providerLocationId, dayOfWeek: value.dayOfWeek, startTime: value.startTime, endTime: value.endTime, timezone: value.timezone, isActive: value.isActive, createdAt: value.createdAt, updatedAt: value.updatedAt };
  }
}
