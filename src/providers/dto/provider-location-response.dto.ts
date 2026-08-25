import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProviderLocation } from '../entities/provider-location.entity';
export class ProviderLocationResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) providerId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() addressLine1!: string;
  @ApiPropertyOptional({ nullable: true }) addressLine2!: string | null;
  @ApiProperty() city!: string;
  @ApiProperty() state!: string;
  @ApiPropertyOptional({ nullable: true }) postalCode!: string | null;
  @ApiProperty({ example: 'NG' }) countryCode!: string;
  @ApiPropertyOptional({ nullable: true }) latitude!: number | null;
  @ApiPropertyOptional({ nullable: true }) longitude!: number | null;
  @ApiProperty() isActive!: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  static fromEntity(value: ProviderLocation): ProviderLocationResponseDto {
    return { id: value.id, providerId: value.providerId, name: value.name, addressLine1: value.addressLine1, addressLine2: value.addressLine2, city: value.city, state: value.state, postalCode: value.postalCode, countryCode: value.countryCode, latitude: value.latitude === null ? null : Number(value.latitude), longitude: value.longitude === null ? null : Number(value.longitude), isActive: value.isActive, createdAt: value.createdAt, updatedAt: value.updatedAt };
  }
}
