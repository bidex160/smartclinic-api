import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CLINICAL_ORDER_FULFILLMENT_REFERENCE_PATTERN } from '../clinical-order-fulfillment-reference';
import { PROVIDER_SERVICE_UNIT_REFERENCE_PATTERN } from '../../provider-service-units/provider-service-unit-reference';
export class FulfillmentUnitDto { @ApiProperty() @Matches(PROVIDER_SERVICE_UNIT_REFERENCE_PATTERN) providerServiceUnitReference!: string; }
export class FulfillmentReferenceParamsDto { @Matches(CLINICAL_ORDER_FULFILLMENT_REFERENCE_PATTERN) reference!: string; }
export class FulfillmentListQueryDto { @Type(() => Number) @IsInt() @Min(1) page = 1; @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20; }
export class FulfillmentDirectoryQueryDto extends FulfillmentListQueryDto { @IsOptional() @IsString() @MaxLength(120) q?: string; @IsOptional() @Matches(/^[A-Z]{2}$/) country?: string; @IsOptional() @IsString() @MaxLength(120) stateOrRegion?: string; @IsOptional() @IsString() @MaxLength(120) city?: string; }
