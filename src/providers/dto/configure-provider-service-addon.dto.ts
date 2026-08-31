import { Transform, Type } from 'class-transformer';
import { IsISO4217CurrencyCode, IsInt, Matches, Max, Min } from 'class-validator';
export class ConfigureProviderServiceAddonDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z][A-Z0-9_]{1,79}$/) addonCode!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(Number.MAX_SAFE_INTEGER) priceMinor!: number;
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value) @Matches(/^[A-Z]{3}$/) @IsISO4217CurrencyCode() currency!: string;
}
