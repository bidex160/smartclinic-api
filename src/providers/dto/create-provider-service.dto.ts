import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsISO4217CurrencyCode, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
export class CreateProviderServiceDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() healthCheckPackageId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() fulfilmentModeId!: string;
  @ApiProperty({ description: 'Provider price in integer minor units; zero explicitly means free.' }) @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) priceMinor!: number;
  @ApiProperty({ required: false, description: 'Separate fulfilment fee in integer minor units. Defaults to zero.' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) fulfilmentFeeMinor?: number;
  @ApiProperty({ example: 'NGN' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{3}$/) @IsISO4217CurrencyCode() currency!: string;
}
