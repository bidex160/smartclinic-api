import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';import { AssistedMatchContact } from '../entities/assisted-match-request.entity';
export class CreateAssistedMatchDto {
 @IsString() @MaxLength(40) serviceKind!:string; @IsOptional()@IsString()@MaxLength(80)packageCode?:string;
 @IsOptional()@IsString()@MaxLength(80)fulfilmentModeCode?:string; @IsOptional()@Matches(/^\d{4}-\d{2}-\d{2}$/)preferredDate?:string;
 @IsOptional()@Matches(/^([01]\d|2[0-3]):[0-5]\d$/)preferredTime?:string; @IsOptional()@IsString()@MaxLength(80)preferredTimezone?:string;
 @IsOptional()@Matches(/^[A-Z]{2}$/)countryCode?:string; @IsOptional()@IsString()@MaxLength(120)stateOrRegion?:string;
 @IsOptional()@IsString()@MaxLength(120)city?:string; @IsOptional()@IsString()@MaxLength(30)postalCode?:string;
 @IsOptional()@IsEnum(AssistedMatchContact)contactPreference?:AssistedMatchContact;
}