import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { HealthCheckPackage } from '../entities/health-check-package.entity';
import { PackagePrice } from '../entities/package-price.entity';

class HealthCheckPackagePriceResponseDto {
  @ApiProperty({ format: 'uuid' })
  fulfilmentModeId!: string;

  @ApiProperty({ example: 'HOME_VISIT' })
  fulfilmentModeCode!: string;

  @ApiProperty({ example: 'Home visit' })
  fulfilmentModeName!: string;

  @ApiProperty({ example: '12500.00', description: 'Decimal monetary amount.' })
  amount!: string;

  @ApiProperty({ example: 'NGN' })
  currency!: string;
}

export class HealthCheckPackageResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'ESSENTIAL' })
  code!: string;

  @ApiProperty({ example: 'Essential Health Check' })
  name!: string;

  @ApiPropertyOptional({ example: 'A foundational health screening package.', nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, isArray: true, example: ['Blood pressure measurement'] })
  benefits!: string[];

  @ApiPropertyOptional({ example: 30, nullable: true })
  estimatedDurationMinutes!: number | null;

  @ApiProperty({ type: HealthCheckPackagePriceResponseDto, isArray: true })
  prices!: HealthCheckPackagePriceResponseDto[];

  @ApiProperty({ example: true })
  isActive!: boolean;

  static fromEntity(
    healthCheckPackage: HealthCheckPackage,
    activePrices: PackagePrice[],
  ): HealthCheckPackageResponseDto {
    return {
      id: healthCheckPackage.id,
      code: healthCheckPackage.code,
      name: healthCheckPackage.name,
      description: healthCheckPackage.description,
      benefits: healthCheckPackage.benefits,
      estimatedDurationMinutes: healthCheckPackage.estimatedDurationMinutes,
      prices: activePrices.map((price) => ({
        fulfilmentModeId: price.fulfilmentModeId,
        fulfilmentModeCode: price.fulfilmentMode.code,
        fulfilmentModeName: price.fulfilmentMode.name,
        amount: price.amount,
        currency: price.currency,
      })),
      isActive: healthCheckPackage.isActive,
    };
  }
}
