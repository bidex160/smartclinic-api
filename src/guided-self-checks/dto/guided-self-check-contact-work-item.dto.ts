import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { GuidedSelfCheckContactWorkItemOutcome, GuidedSelfCheckContactWorkItemStatus } from '../enums/guided-self-check-contact-work-item.enum';
import { GuidedSelfCheckReviewPriority } from '../enums/guided-self-check-review.enum';

export class GuidedSelfCheckContactWorkItemListQueryDto {
 @Type(()=>Number)@IsInt()@Min(1) page=1;
 @Type(()=>Number)@IsInt()@Min(1)@Max(100) limit=20;
 @IsOptional()@IsEnum(GuidedSelfCheckContactWorkItemStatus) status?:GuidedSelfCheckContactWorkItemStatus;
 @IsOptional()@IsEnum(GuidedSelfCheckReviewPriority) priority?:GuidedSelfCheckReviewPriority;
}
export class CompleteGuidedSelfCheckContactWorkItemDto {
 @IsEnum(GuidedSelfCheckContactWorkItemOutcome) outcome!:GuidedSelfCheckContactWorkItemOutcome;
 @IsOptional()@IsString()@MaxLength(1000) note?:string;
}
export class CancelGuidedSelfCheckContactWorkItemDto { @IsOptional()@IsString()@MaxLength(500) reason?:string; }
