import { Type } from 'class-transformer';
import { IsEnum,IsInt,IsOptional,IsString,Max,MaxLength,Min } from 'class-validator';
import { GuidedSelfCheckReviewerAuthorizationStatus } from '../enums/guided-self-check-reviewer-authorization.enum';
export class AuthorizeGuidedSelfCheckReviewerDto{@IsString()@MaxLength(45)providerReference!:string;@IsOptional()@IsString()@MaxLength(500)reason?:string;}
export class DisableGuidedSelfCheckReviewerDto{@IsString()@MaxLength(500)reason!:string;}
export class GuidedSelfCheckReviewerDirectoryQueryDto{@Type(()=>Number)@IsInt()@Min(1)page=1;@Type(()=>Number)@IsInt()@Min(1)@Max(100)limit=20;@IsOptional()@IsString()@MaxLength(45)providerReference?:string;@IsOptional()@IsEnum(GuidedSelfCheckReviewerAuthorizationStatus)status?:GuidedSelfCheckReviewerAuthorizationStatus;@IsOptional()@IsString()@MaxLength(120)q?:string;}
