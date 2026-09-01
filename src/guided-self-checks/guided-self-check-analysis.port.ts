import { GuidedSelfCheckAnswerState } from './enums/guided-self-check-questionnaire.enum';import { GuidedSelfCheckAnalysisOutput } from './entities/guided-self-check-analysis.entity';
export interface GuidedSelfCheckAnalysisInput{questionnaireVersion:number;classification:'AMBER';matchedReasonCodes:string[];responses:Array<{questionKey:string;questionText:string;state:GuidedSelfCheckAnswerState;value:unknown}>;}
export interface GuidedSelfCheckAnalysisRequest{systemInstructions:{purpose:'AMBER_INTERNAL_DECISION_SUPPORT';prohibitedOutputs:string[]};patientProvidedData:GuidedSelfCheckAnalysisInput;timeoutMs:number;}
export interface GuidedSelfCheckAnalysisPort{readonly providerKey:string;readonly modelKey:string;readonly promptVersion:string;analyze(request:GuidedSelfCheckAnalysisRequest):Promise<GuidedSelfCheckAnalysisOutput>;}
export const GUIDED_SELF_CHECK_ANALYSIS_PORT=Symbol('GUIDED_SELF_CHECK_ANALYSIS_PORT');

export class GuidedSelfCheckAnalysisProviderError extends Error {
  constructor(readonly failureCode: 'TIMEOUT' | 'INVALID_OUTPUT' | 'PROCESSING_ERROR', message: string) {
    super(message);
    this.name = 'GuidedSelfCheckAnalysisProviderError';
  }
}
