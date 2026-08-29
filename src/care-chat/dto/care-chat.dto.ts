import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { CARE_MESSAGE_ATTACHMENT_REFERENCE_EXAMPLE, CARE_MESSAGE_ATTACHMENT_REFERENCE_PATTERN } from '../care-message-attachment-reference';
import { CARE_MESSAGE_REFERENCE_EXAMPLE, CARE_MESSAGE_REFERENCE_PATTERN } from '../care-chat-reference';
import { CARE_REQUEST_REFERENCE_EXAMPLE, CARE_REQUEST_REFERENCE_PATTERN } from '../../care-requests/care-request-reference';

export class SendCareMessageDto {
  @ApiPropertyOptional({ maxLength: 4000, nullable: true })
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body?: string;
  @ApiPropertyOptional({ type: [String], maxItems: 5, example: [CARE_MESSAGE_ATTACHMENT_REFERENCE_EXAMPLE] })
  @IsOptional() @IsArray() @ArrayMaxSize(5) @ArrayUnique() @Matches(CARE_MESSAGE_ATTACHMENT_REFERENCE_PATTERN, { each: true }) attachmentReferences?: string[];
}

export class CareMessageAttachmentAccessParamsDto {
  @ApiProperty({ example: CARE_REQUEST_REFERENCE_EXAMPLE }) @Matches(CARE_REQUEST_REFERENCE_PATTERN) reference!: string;
  @ApiProperty({ example: CARE_MESSAGE_REFERENCE_EXAMPLE }) @Matches(CARE_MESSAGE_REFERENCE_PATTERN) messageReference!: string;
  @ApiProperty({ example: CARE_MESSAGE_ATTACHMENT_REFERENCE_EXAMPLE }) @Matches(CARE_MESSAGE_ATTACHMENT_REFERENCE_PATTERN) attachmentReference!: string;
}

export class CareMessageListQueryDto {
  @ApiPropertyOptional({ default: 1 }) @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 50, maximum: 100 }) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
}
