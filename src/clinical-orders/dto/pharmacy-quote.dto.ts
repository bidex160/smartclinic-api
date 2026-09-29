import { Transform, Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { PHARMACY_QUOTE_REFERENCE_PATTERN } from "../pharmacy-quote-reference";
import {
  PharmacyFulfillmentMethod,
  PharmacyQuoteItemAvailability,
} from "../enums/pharmacy-quote-status.enum";

export class PharmacyQuoteItemDto {
  @IsInt() @Min(0) sortOrder!: number;
  @IsEnum(PharmacyQuoteItemAvailability)
  availability!: PharmacyQuoteItemAvailability;
  @IsInt() @Min(0) quantitySupplied!: number;
  @IsInt() @Min(0) unitPriceMinor!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string | null;
}
export class PharmacyFulfillmentOptionDto {
  @IsEnum(PharmacyFulfillmentMethod) method!: PharmacyFulfillmentMethod;
  @IsInt() @Min(0) feeMinor!: number;
}
export class UpsertPharmacyQuoteDto {
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{3}$/)
  currency!: string;
  @IsISO8601() expiresAt!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PharmacyQuoteItemDto)
  items!: PharmacyQuoteItemDto[];
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PharmacyFulfillmentOptionDto)
  fulfillmentOptions?: PharmacyFulfillmentOptionDto[];
}
export class PharmacyQuoteReferenceParamsDto {
  @Matches(PHARMACY_QUOTE_REFERENCE_PATTERN) reference!: string;
}
export class PharmacyDeliveryAddressDto {
  @IsString() @MaxLength(160) addressLine1!: string;
  @IsOptional() @IsString() @MaxLength(160) addressLine2?: string;
  @IsString() @MaxLength(80) city!: string;
  @IsString() @MaxLength(80) stateOrRegion!: string;
  @Transform(({ value }) =>
    typeof value === "string" ? value.toUpperCase() : value,
  )
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;
  @IsString() @MaxLength(30) contactPhone!: string;
}
export class AcceptPharmacyQuoteDto {
  @IsOptional() @IsBoolean() acknowledgeUnavailableItems = false;
  @IsEnum(PharmacyFulfillmentMethod)
  fulfillmentMethod: PharmacyFulfillmentMethod =
    PharmacyFulfillmentMethod.PICKUP;
  @IsOptional()
  @ValidateNested()
  @Type(() => PharmacyDeliveryAddressDto)
  deliveryAddress?: PharmacyDeliveryAddressDto;
}
