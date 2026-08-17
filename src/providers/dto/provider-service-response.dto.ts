import { ApiProperty } from '@nestjs/swagger';
import { ProviderService } from '../entities/provider-service.entity';
export class ProviderServiceResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty({ format: 'uuid' }) healthCheckPackageId!: string;
  @ApiProperty({ format: 'uuid' }) fulfilmentModeId!: string;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'uuid', isArray: true }) providerLocationIds!: string[];
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  static fromEntity(value: ProviderService): ProviderServiceResponseDto {
    return { id: value.id, providerId: value.providerId, healthCheckPackageId: value.healthCheckPackageId, fulfilmentModeId: value.fulfilmentModeId, isActive: value.isActive, providerLocationIds: value.locationLinks?.map((link) => link.providerLocationId) ?? [], createdAt: value.createdAt, updatedAt: value.updatedAt };
  }
}
