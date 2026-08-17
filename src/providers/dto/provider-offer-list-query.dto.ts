import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ProviderAssignmentStatus } from '../enums/provider-assignment-status.enum';
export class ProviderOfferListQueryDto {
  @ApiPropertyOptional({ enum: ProviderAssignmentStatus }) @IsOptional() @IsEnum(ProviderAssignmentStatus) status?: ProviderAssignmentStatus;
}
