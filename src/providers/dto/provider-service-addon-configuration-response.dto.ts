import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HealthCheckClinicalResultType } from '../../health-checks/enums/health-check-clinical-result-type.enum';
import { ProviderServiceAddonConfigurationUnavailableReason } from '../enums/provider-service-addon-configuration-unavailable-reason.enum';

export class ProviderServiceAddonOfferingDto {
  @ApiProperty({ description: 'Provider-specific price in integer minor units', minimum: 0 }) priceMinor!: number;
  @ApiProperty({ example: 'NGN' }) currency!: string;
  @ApiProperty() isActive!: boolean;
}

export class ProviderServiceAddonConfigurationItemDto {
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiProperty() category!: string;
  @ApiProperty({ enum: HealthCheckClinicalResultType }) resultType!: HealthCheckClinicalResultType;
  @ApiPropertyOptional({ nullable: true }) unit!: string | null;
  @ApiProperty() canonicalActive!: boolean;
  @ApiProperty() eligibilityActive!: boolean;
  @ApiProperty({ description: 'Whether the existing POST/upsert contract currently permits configuration or reactivation.' }) canConfigure!: boolean;
  @ApiPropertyOptional({ enum: ProviderServiceAddonConfigurationUnavailableReason, nullable: true }) configurationUnavailableReason!: ProviderServiceAddonConfigurationUnavailableReason | null;
  @ApiPropertyOptional({ type: ProviderServiceAddonOfferingDto, nullable: true }) offering!: ProviderServiceAddonOfferingDto | null;
}

export class ProviderServiceAddonConfigurationResponseDto {
  @ApiProperty({ description: 'Existing ProviderService identifier from the route.' }) providerServiceId!: string;
  @ApiProperty({ example: 'NGN', description: 'Authoritative ProviderService currency.' }) currency!: string;
  @ApiProperty({ type: ProviderServiceAddonConfigurationItemDto, isArray: true }) items!: ProviderServiceAddonConfigurationItemDto[];
}
