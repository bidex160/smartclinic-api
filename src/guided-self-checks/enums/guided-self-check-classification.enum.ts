import { GuidedSelfCheckAnswerState } from './guided-self-check-questionnaire.enum';
export enum GuidedSelfCheckClassification { GREEN='GREEN',AMBER='AMBER',RED='RED' }
export enum GuidedSelfCheckRulesetGovernanceStatus { DRAFT='DRAFT',READY='READY',RETIRED='RETIRED' }
export enum GuidedSelfCheckClassificationStatus { PENDING='PENDING',CONFIGURATION_REQUIRED='CONFIGURATION_REQUIRED',CLASSIFIED='CLASSIFIED',FAILED='FAILED' }
export enum GuidedSelfCheckRuleSeverity { AMBER='AMBER',RED='RED' }
export enum GuidedSelfCheckRuleOperator { STATE_EQUALS='STATE_EQUALS',EQUALS='EQUALS',INCLUDES='INCLUDES',LT='LT',LTE='LTE',GT='GT',GTE='GTE',BETWEEN='BETWEEN',UNANSWERED='UNANSWERED',AND='AND',OR='OR' }
export enum GuidedSelfCheckPatientMessageKey { GREEN_COMPLETE='SELF_CHECK_GREEN_COMPLETE',AMBER_REVIEW='SELF_CHECK_AMBER_REVIEW',RED_URGENT='SELF_CHECK_RED_URGENT' }
export const GUIDED_SELF_CHECK_RECEIVED_MESSAGE={patientMessageKey:'SELF_CHECK_RECEIVED',title:'Your Self-Check has been received.',message:'Your answers have been saved and are awaiting clinical processing.'} as const;
export interface GuidedSelfCheckRuleCondition { operator:GuidedSelfCheckRuleOperator;questionKey?:string;field?:'systolic'|'diastolic'|'value';value?:unknown;min?:number;max?:number;state?:GuidedSelfCheckAnswerState;conditions?:GuidedSelfCheckRuleCondition[]; }
export interface GuidedSelfCheckClinicalRule { code:string;severity:GuidedSelfCheckRuleSeverity;condition:GuidedSelfCheckRuleCondition; }
