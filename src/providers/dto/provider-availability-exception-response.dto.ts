import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderAvailabilityException } from '../entities/provider-availability-exception.entity';
import { ProviderAvailabilityExceptionType } from '../enums/provider-availability-exception-type.enum';
export class ProviderAvailabilityExceptionResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) providerServiceId!: string | null;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) providerLocationId!: string | null;
  @ApiProperty({ format: 'date' }) date!: string;
  @ApiPropertyOptional({ nullable: true }) startTime!: string | null;
  @ApiPropertyOptional({ nullable: true }) endTime!: string | null;
  @ApiProperty() timezone!: string;
  @ApiProperty({ enum: ProviderAvailabilityExceptionType }) type!: ProviderAvailabilityExceptionType;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  static fromEntity(v: ProviderAvailabilityException): ProviderAvailabilityExceptionResponseDto { return { id: v.id, providerId: v.providerId, providerServiceId: v.providerServiceId, providerLocationId: v.providerLocationId, date: v.date, startTime: v.startTime, endTime: v.endTime, timezone: v.timezone, type: v.type, reason: v.reason, isActive: v.isActive, createdAt: v.createdAt, updatedAt: v.updatedAt }; }
}
