import { Transform,Type } from 'class-transformer';import { IsDateString,IsInt,IsOptional,IsString,IsTimeZone,Matches,Max,Min } from 'class-validator';
export class HealthCheckOfferingDiscoveryDto{
 @Transform(({value})=>typeof value==='string'?value.toUpperCase():value)@Matches(/^(ESSENTIAL|COMPLETE)$/)packageCode!:string;
 @Transform(({value})=>typeof value==='string'?value.toUpperCase():value)@Matches(/^(PROVIDER_LOCATION|HOME_VISIT)$/)fulfilmentModeCode!:string;
 @IsDateString()preferredDate!:string;@Matches(/^([01]\d|2[0-3]):[0-5]\d$/)preferredTime!:string;@IsTimeZone()timezone!:string;
 @Transform(({value})=>typeof value==='string'?value.toUpperCase():value)@Matches(/^[A-Z]{2}$/)countryCode!:string;@IsString()stateOrRegion!:string;@IsString()city!:string;@IsOptional()@IsString()postalCode?:string;
 @IsOptional()@Type(()=>Number)@IsInt()@Min(1)page=1;@IsOptional()@Type(()=>Number)@IsInt()@Min(1)@Max(50)limit=20;
}
