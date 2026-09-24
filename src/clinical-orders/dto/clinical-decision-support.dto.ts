import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ClinicalDecisionSupportSuggestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) presentingComplaint?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) historyOfPresentingComplaint?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) observations?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) assessment?:string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) diagnosis?:string;
}
