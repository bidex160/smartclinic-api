import { ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { CreateBookingDto } from './create-booking.dto';
import { IsOptional,IsString,IsUUID,Matches,MaxLength } from 'class-validator';

export class CreateSelfBookingDto extends OmitType(CreateBookingDto, ['bookerUserId', 'participantPatientId', 'organisationContextId','healthCheckPackageId','fulfilmentModeId','addonCodes'] as const) {
 @ApiPropertyOptional({description:'Public reference of SELF or an authorized dependant Patient. Omit for SELF.'})@IsOptional()@Matches(/^SCP-[A-Z0-9]{4}-[A-Z0-9]{4}$/)participantPatientReference?:string;
 @ApiPropertyOptional({description:'Patient-owned immutable Health Check configuration quote reference.'})@IsOptional()@IsString()@MaxLength(32)configurationReference?:string;
 @ApiPropertyOptional({format:'uuid',description:'Legacy flow only.'})@IsOptional()@IsUUID()healthCheckPackageId?:string;
 @ApiPropertyOptional({format:'uuid',description:'Legacy flow only.'})@IsOptional()@IsUUID()fulfilmentModeId?:string;
}
