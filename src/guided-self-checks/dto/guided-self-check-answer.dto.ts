import { IsEnum,IsOptional } from 'class-validator'; import { GuidedSelfCheckAnswerState } from '../enums/guided-self-check-questionnaire.enum';
export class SaveGuidedSelfCheckAnswerDto{@IsEnum(GuidedSelfCheckAnswerState)state!:GuidedSelfCheckAnswerState;@IsOptional()value?:unknown;}

