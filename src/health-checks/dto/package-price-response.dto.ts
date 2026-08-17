import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PackagePrice } from '../entities/package-price.entity';

export class PackagePriceResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  healthCheckPackageId!: string;

  @ApiProperty({ format: 'uuid' })
  fulfilmentModeId!: string;

  @ApiProperty({ example: '12500.00' })
  amount!: string;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ format: 'date' })
  effectiveFrom!: string;

  @ApiPropertyOptional({ format: 'date', nullable: true })
  effectiveTo!: string | null;

  @ApiProperty({ example: true })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  static fromEntity(packagePrice: PackagePrice): PackagePriceResponseDto {
    return {
      id: packagePrice.id,
      healthCheckPackageId: packagePrice.healthCheckPackageId,
      fulfilmentModeId: packagePrice.fulfilmentModeId,
      amount: packagePrice.amount,
      currency: packagePrice.currency,
      effectiveFrom: packagePrice.effectiveFrom,
      effectiveTo: packagePrice.effectiveTo,
      isActive: packagePrice.isActive,
      createdAt: packagePrice.createdAt,
      updatedAt: packagePrice.updatedAt,
    };
  }
}
