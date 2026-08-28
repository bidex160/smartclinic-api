import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsISO4217CurrencyCode, IsInt, Matches, Max, Min } from 'class-validator';

export class UpdateProviderServicePriceDto {
  @ApiProperty({ description: 'Provider price in integer minor units; zero explicitly means free.' }) @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) priceMinor!: number;
  @ApiProperty({ example: 'NGN' }) @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{3}$/) @IsISO4217CurrencyCode() currency!: string;
}
