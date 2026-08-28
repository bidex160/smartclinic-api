import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { HealthCheckPackage } from '../entities/health-check-package.entity';

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

  @ApiProperty({ example: true })
  isActive!: boolean;

  static fromEntity(
    healthCheckPackage: HealthCheckPackage,
  ): HealthCheckPackageResponseDto {
    return {
      id: healthCheckPackage.id,
      code: healthCheckPackage.code,
      name: healthCheckPackage.name,
      description: healthCheckPackage.description,
      benefits: healthCheckPackage.benefits,
      estimatedDurationMinutes: healthCheckPackage.estimatedDurationMinutes,
      isActive: healthCheckPackage.isActive,
    };
  }
}
