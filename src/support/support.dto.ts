import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

import { SupportCallbackStatus, SupportCallbackTime, SupportCallbackTopic } from './support-callback-request.entity';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateSupportCallbackDto {
  @ApiProperty() @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @ApiProperty({ example: '+234 803 000 0000' })
  @Transform(trim)
  @Matches(/^\+?[0-9][0-9 ()-]{6,22}$/, { message: 'Enter a phone number we can call, like +234 803 000 0000' })
  phone!: string;
  @ApiPropertyOptional({ example: 'NG' }) @IsOptional() @Matches(/^[A-Z]{2}$/) countryCode?: string;
  @ApiProperty({ enum: SupportCallbackTopic }) @IsEnum(SupportCallbackTopic) topic!: SupportCallbackTopic;
  @ApiPropertyOptional({ enum: SupportCallbackTime }) @IsOptional() @IsEnum(SupportCallbackTime) preferredTime?: SupportCallbackTime;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(300) message?: string;
}

export class SupportCallbackListQueryDto {
  @ApiPropertyOptional({ enum: SupportCallbackStatus }) @IsOptional() @IsEnum(SupportCallbackStatus) status?: SupportCallbackStatus;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 30;
}

export class UpdateSupportCallbackDto {
  @ApiProperty({ enum: SupportCallbackStatus }) @IsEnum(SupportCallbackStatus) status!: SupportCallbackStatus;
  @ApiPropertyOptional() @IsOptional() @Transform(trim) @IsString() @MaxLength(500) staffNote?: string;
}
