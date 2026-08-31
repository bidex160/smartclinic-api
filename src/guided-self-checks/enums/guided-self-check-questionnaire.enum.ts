export enum GuidedSelfCheckQuestionType { SINGLE_CHOICE='SINGLE_CHOICE',MULTI_CHOICE='MULTI_CHOICE',BOOLEAN='BOOLEAN',SHORT_TEXT='SHORT_TEXT',LONG_TEXT='LONG_TEXT',NUMBER='NUMBER',BLOOD_PRESSURE='BLOOD_PRESSURE',BLOOD_GLUCOSE='BLOOD_GLUCOSE' }
export enum GuidedSelfCheckAnswerState { KNOWN='KNOWN',DONT_KNOW='DONT_KNOW' }
export enum GuidedSelfCheckAnswerProvenance { PATIENT_REPORTED='PATIENT_REPORTED' }
export enum GuidedSelfCheckConditionOperator { EQUALS='EQUALS',INCLUDES='INCLUDES' }
export interface GuidedSelfCheckCondition { questionKey:string;operator:GuidedSelfCheckConditionOperator;expected:unknown; }

