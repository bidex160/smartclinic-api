import { GuidedSelfCheckAnswerState } from './guided-self-check-questionnaire.enum';
export enum GuidedSelfCheckClassification { GREEN='GREEN',AMBER='AMBER',RED='RED' }
export enum GuidedSelfCheckRuleSeverity { AMBER='AMBER',RED='RED' }
export enum GuidedSelfCheckRuleOperator { STATE_EQUALS='STATE_EQUALS',EQUALS='EQUALS',INCLUDES='INCLUDES',LT='LT',LTE='LTE',GT='GT',GTE='GTE',BETWEEN='BETWEEN',UNANSWERED='UNANSWERED',AND='AND',OR='OR' }
export enum GuidedSelfCheckPatientMessageKey { GREEN_COMPLETE='SELF_CHECK_GREEN_COMPLETE',AMBER_REVIEW='SELF_CHECK_AMBER_REVIEW',RED_URGENT='SELF_CHECK_RED_URGENT' }
export interface GuidedSelfCheckRuleCondition { operator:GuidedSelfCheckRuleOperator;questionKey?:string;field?:'systolic'|'diastolic'|'value';value?:unknown;min?:number;max?:number;state?:GuidedSelfCheckAnswerState;conditions?:GuidedSelfCheckRuleCondition[]; }
export interface GuidedSelfCheckClinicalRule { code:string;severity:GuidedSelfCheckRuleSeverity;condition:GuidedSelfCheckRuleCondition; }

