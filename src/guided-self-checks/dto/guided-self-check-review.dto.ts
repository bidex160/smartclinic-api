import { Type } from 'class-transformer';
import { IsBoolean,IsEnum,IsInt,IsOptional,IsString,Matches,Max,MaxLength,Min } from 'class-validator';
import { GuidedSelfCheckClassification } from '../enums/guided-self-check-classification.enum';
import { GuidedSelfCheckReviewDecision,GuidedSelfCheckReviewPriority,GuidedSelfCheckReviewStatus } from '../enums/guided-self-check-review.enum';
import { GuidedSelfCheckNextActionType } from '../enums/guided-self-check-next-action.enum';
export class GuidedSelfCheckReviewListQueryDto{
 @Type(()=>Number)@IsInt()@Min(1)page=1; @Type(()=>Number)@IsInt()@Min(1)@Max(100)limit=20;
 @IsOptional()@IsEnum(GuidedSelfCheckReviewStatus)status?:GuidedSelfCheckReviewStatus;
 @IsOptional()@IsEnum(GuidedSelfCheckReviewPriority)priority?:GuidedSelfCheckReviewPriority;
 @IsOptional()@IsEnum(GuidedSelfCheckClassification)classification?:GuidedSelfCheckClassification;
 @IsOptional()@Type(()=>Boolean)@IsBoolean()assigned?:boolean;
}
export enum GuidedSelfCheckMyReviewStatus {
 ASSIGNED='ASSIGNED', IN_REVIEW='IN_REVIEW', COMPLETED='COMPLETED', CANCELLED='CANCELLED'
}
export class GuidedSelfCheckMyReviewListQueryDto{
 @Type(()=>Number)@IsInt()@Min(1)page=1;
 @Type(()=>Number)@IsInt()@Min(1)@Max(100)limit=20;
 @IsOptional()@IsEnum(GuidedSelfCheckMyReviewStatus)status?:GuidedSelfCheckMyReviewStatus;
 @IsOptional()@IsEnum(GuidedSelfCheckReviewPriority)priority?:GuidedSelfCheckReviewPriority;
}
export class AssignInternalClinicalProfessionalDto{@IsString()@MaxLength(40)professionalReference!:string;}
const PATIENT_SAFE_GUIDANCE=/^(?![\s\S]*(?:<[^>]*>|https?:\/\/|javascript:))[\s\S]*$/i;
export class CompleteGuidedSelfCheckReviewDto{@IsEnum(GuidedSelfCheckReviewDecision)decision!:GuidedSelfCheckReviewDecision;@IsEnum(GuidedSelfCheckNextActionType)nextActionType!:GuidedSelfCheckNextActionType;@IsOptional()@IsString()@MaxLength(1000)@Matches(PATIENT_SAFE_GUIDANCE,{message:'patientGuidance must be plain text without HTML or executable links'})patientGuidance?:string;@IsOptional()@IsString()@MaxLength(3000)internalClinicalNote?:string;@IsOptional()@IsBoolean()contactRequired?:boolean;}
export class CancelGuidedSelfCheckReviewDto{@IsOptional()@IsString()@MaxLength(500)reason?:string;}
export class TriageGuidedSelfCheckReviewDto{@IsOptional()@IsString()@MaxLength(1000)note?:string;}
