import { Transform,Type } from 'class-transformer';import { IsDateString,IsInt,IsLatitude,IsLongitude,IsOptional,IsString,IsTimeZone,Matches,Max,Min } from 'class-validator';
export class HealthCheckOfferingDiscoveryDto{
 @Transform(({value})=>typeof value==='string'?value.trim().toUpperCase():value)@Matches(/^[A-Z][A-Z0-9_]{1,79}$/)packageCode!:string;
 @Transform(({value})=>typeof value==='string'?value.toUpperCase():value)@Matches(/^(PROVIDER_LOCATION|HOME_VISIT)$/)fulfilmentModeCode!:string;
 @IsDateString()preferredDate!:string;@Matches(/^([01]\d|2[0-3]):[0-5]\d$/)preferredTime!:string;@IsTimeZone()timezone!:string;
 @IsOptional()@Transform(({value})=>typeof value==='string'?value.toUpperCase():value)@Matches(/^[A-Z]{2}$/)countryCode?:string;@IsOptional()@IsString()stateOrRegion?:string;@IsOptional()@IsString()city?:string;@IsOptional()@IsString()postalCode?:string;@IsOptional()@Type(()=>Number)@IsLatitude()latitude?:number;@IsOptional()@Type(()=>Number)@IsLongitude()longitude?:number;
 @IsOptional()@Type(()=>Number)@IsInt()@Min(1)page=1;@IsOptional()@Type(()=>Number)@IsInt()@Min(1)@Max(50)limit=20;
}
