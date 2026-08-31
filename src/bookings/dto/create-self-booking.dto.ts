import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';
import { IsOptional,IsString,IsUUID,MaxLength } from 'class-validator';

export class CreateSelfBookingDto extends OmitType(CreateBookingDto, ['bookerUserId', 'participantPatientId', 'organisationContextId','healthCheckPackageId','fulfilmentModeId','addonCodes'] as const) {
 @ApiPropertyOptional({description:'Patient-owned immutable Health Check configuration quote reference.'})@IsOptional()@IsString()@MaxLength(32)configurationReference?:string;
 @ApiPropertyOptional({format:'uuid',description:'Legacy flow only.'})@IsOptional()@IsUUID()healthCheckPackageId?:string;
 @ApiPropertyOptional({format:'uuid',description:'Legacy flow only.'})@IsOptional()@IsUUID()fulfilmentModeId?:string;
}
