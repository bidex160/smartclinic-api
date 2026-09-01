import { ConflictException, Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  GUIDED_SELF_CHECK_ANALYSIS_PORT,
  GuidedSelfCheckAnalysisPort,
  GuidedSelfCheckAnalysisProviderError,
  GuidedSelfCheckAnalysisRequest,
} from './guided-self-check-analysis.port';
import { GuidedSelfCheckAnalysis } from './entities/guided-self-check-analysis.entity';
import { GuidedSelfCheckAnswer } from './entities/guided-self-check-answer.entity';
import { GuidedSelfCheckClassificationResult } from './entities/guided-self-check-classification.entity';
import { GuidedSelfCheckHistory } from './entities/guided-self-check-history.entity';
import { GuidedSelfCheckQuestion } from './entities/guided-self-check-question.entity';
import {
  GuidedSelfCheckAnalysisFailureCode,
  GuidedSelfCheckAnalysisPriority,
  GuidedSelfCheckAnalysisStatus,
} from './enums/guided-self-check-analysis.enum';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckNextActionType } from './enums/guided-self-check-next-action.enum';
import { GuidedSelfCheckNextActionsService } from './guided-self-check-next-actions.service';
import { GuidedSelfCheckProfessionalReviewsService } from './guided-self-check-professional-reviews.service';

@Injectable()
export class GuidedSelfCheckAnalysisService {
  private readonly logger = new Logger(GuidedSelfCheckAnalysisService.name);

  constructor(
    @InjectRepository(GuidedSelfCheckAnalysis) private analyses: Repository<GuidedSelfCheckAnalysis>,
    private data: DataSource,
    private nextActions: GuidedSelfCheckNextActionsService = undefined as never,
    @Optional() @Inject(GUIDED_SELF_CHECK_ANALYSIS_PORT) private port?: GuidedSelfCheckAnalysisPort,
    private reviews: GuidedSelfCheckProfessionalReviewsService = undefined as never,
  ) {}

  async ensureForClassification(manager: EntityManager, result: GuidedSelfCheckClassificationResult) {
    if (result.classification !== GuidedSelfCheckClassification.AMBER) return null;
    const repo = manager.getRepository(GuidedSelfCheckAnalysis);
    const existing = await repo.findOne({ where: { classificationId: result.id } });
    if (existing) return existing;
    const analysis = await repo.save(repo.create({
      guidedSelfCheckId: result.guidedSelfCheckId,
      classificationId: result.id,
      status: GuidedSelfCheckAnalysisStatus.PENDING,
      output: null,
      providerKey: null,
      modelKey: null,
      promptVersion: null,
      failureCode: null,
      humanReviewRecommended: false,
      startedAt: null,
      completedAt: null,
    }));
    await manager.getRepository(GuidedSelfCheckHistory).save({
      guidedSelfCheckId: result.guidedSelfCheckId,
      event: 'ANALYSIS_REQUESTED',
      actorUserId: null,
      metadata: { analysisReference: analysis.reference },
    });
    return analysis;
  }

  async list(status?: GuidedSelfCheckAnalysisStatus, page = 1, limit = 25) {
    const [rows, total] = await this.analyses.findAndCount({
      where: status ? { status } : {},
      relations: { classification: { selfCheck: true } },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: rows.map(row => this.internalView(row)), total, page, limit };
  }

  async get(reference: string) {
    const analysis = await this.analyses.findOne({
      where: { reference },
      relations: { classification: { selfCheck: true } },
    });
    if (!analysis) throw new NotFoundException('Guided Self-Check analysis was not found');
    return this.internalView(analysis);
  }

  async process(reference: string) {
    let claimed: GuidedSelfCheckAnalysis | ReturnType<GuidedSelfCheckAnalysisService['internalView']>;
    try {
      claimed = await this.data.transaction(async manager => {
      const repo = manager.getRepository(GuidedSelfCheckAnalysis);
      const locked = await repo.findOne({
        where: { reference },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Guided Self-Check analysis was not found');
      const analysis = await repo.findOne({
        where: { id: locked.id },
        relations: { classification: { questionnaireVersion: true, selfCheck: true } },
      });
      if (!analysis) throw new NotFoundException('Guided Self-Check analysis was not found');
      if (analysis.status === GuidedSelfCheckAnalysisStatus.COMPLETED || analysis.status === GuidedSelfCheckAnalysisStatus.PROCESSING) {
        return this.internalView(analysis);
      }
      analysis.status = GuidedSelfCheckAnalysisStatus.PROCESSING;
      analysis.startedAt = new Date();
      analysis.completedAt = null;
      analysis.failureCode = null;
      analysis.providerKey = this.port?.providerKey ?? null;
      analysis.modelKey = this.port?.modelKey ?? null;
      analysis.promptVersion = this.port?.promptVersion ?? null;
      await repo.save(analysis);
      await this.audit(manager, analysis, 'ANALYSIS_STARTED');
      return analysis;
      });
    } catch (error) {
      this.logInternalFailure(reference, 'claim', error);
      throw error;
    }

    if (!('id' in claimed)) return claimed;
    if (!this.port) {
      return this.persistFailureAfterRollback(reference, GuidedSelfCheckAnalysisFailureCode.PROVIDER_UNAVAILABLE);
    }

    let output: NonNullable<GuidedSelfCheckAnalysis['output']>;
    try {
      const request = await this.input(this.data.manager, claimed);
      output = await this.port.analyze(request);
      this.validateOutput(output);
    } catch (error) {
      const failureCode = error instanceof GuidedSelfCheckAnalysisProviderError
        ? GuidedSelfCheckAnalysisFailureCode[error.failureCode]
        : error instanceof ConflictException
          ? GuidedSelfCheckAnalysisFailureCode.INVALID_OUTPUT
          : GuidedSelfCheckAnalysisFailureCode.PROCESSING_ERROR;
      if (!(error instanceof GuidedSelfCheckAnalysisProviderError) && !(error instanceof ConflictException)) {
        this.logInternalFailure(reference, 'provider-input', error);
      }
      return this.persistFailureAfterRollback(reference, failureCode);
    }

    try {
      return await this.data.transaction(async manager => {
        const repo = manager.getRepository(GuidedSelfCheckAnalysis);
        const locked = await repo.findOne({ where: { reference }, lock: { mode: 'pessimistic_write' } });
        if (!locked) throw new NotFoundException('Guided Self-Check analysis was not found');
        const analysis = await repo.findOne({ where: { id: locked.id }, relations: { classification: { questionnaireVersion: true, selfCheck: true } } });
        if (!analysis) throw new NotFoundException('Guided Self-Check analysis was not found');
        if (analysis.status === GuidedSelfCheckAnalysisStatus.COMPLETED) return this.internalView(analysis);
        if (analysis.status !== GuidedSelfCheckAnalysisStatus.PROCESSING) return this.internalView(analysis);
        analysis.output = output;
        analysis.humanReviewRecommended = output.humanReviewSuggested;
        analysis.status = GuidedSelfCheckAnalysisStatus.COMPLETED;
        analysis.failureCode = null;
        analysis.completedAt = new Date();
        await repo.save(analysis);
        await this.audit(manager, analysis, 'AI_ACTION_SUGGESTED', { suggestedAction: output.recommendedAction });
        if (output.humanReviewSuggested) await this.audit(manager, analysis, 'HUMAN_REVIEW_RECOMMENDED');
        if (output.humanReviewSuggested && this.reviews) await this.reviews.ensureRoutineForAnalysis(manager, analysis);
        await this.nextActions.acceptAmberAnalysisSuggestion(manager, analysis, output.recommendedAction);
        await this.audit(manager, analysis, 'ANALYSIS_COMPLETED');
        return this.internalView(analysis);
      });
    } catch (error) {
      this.logInternalFailure(reference, 'completion', error);
      return this.persistFailureAfterRollback(reference, GuidedSelfCheckAnalysisFailureCode.PROCESSING_ERROR, error);
    }
  }

  private async persistFailureAfterRollback(reference: string, failureCode: GuidedSelfCheckAnalysisFailureCode, originalError?: unknown) {
    try {
      return await this.data.transaction(async manager => {
        const repo = manager.getRepository(GuidedSelfCheckAnalysis);
        const locked = await repo.findOne({ where: { reference }, lock: { mode: 'pessimistic_write' } });
        if (!locked) throw new NotFoundException('Guided Self-Check analysis was not found');
        const analysis = await repo.findOne({ where: { id: locked.id }, relations: { classification: { questionnaireVersion: true, selfCheck: true } } });
        if (!analysis) throw new NotFoundException('Guided Self-Check analysis was not found');
        if (analysis.status === GuidedSelfCheckAnalysisStatus.COMPLETED) return this.internalView(analysis);
        analysis.status = GuidedSelfCheckAnalysisStatus.FAILED;
        analysis.failureCode = failureCode;
        analysis.completedAt = new Date();
        await repo.save(analysis);
        await this.audit(manager, analysis, 'AI_ACTION_REJECTED', { reason: failureCode });
        await this.audit(manager, analysis, 'ANALYSIS_FAILED');
        return this.internalView(analysis);
      });
    } catch (failurePersistenceError) {
      this.logInternalFailure(reference, 'failure-persistence', failurePersistenceError);
      if (originalError) throw originalError;
      throw failurePersistenceError;
    }
  }

  private logInternalFailure(reference: string, phase: string, error: unknown) {
    const diagnostic = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    this.logger.error('Guided Self-Check analysis processing failed', {
      analysisReference: reference,
      phase,
      errorName: error instanceof Error ? error.name : typeof error,
      databaseCode: typeof diagnostic.code === 'string' ? diagnostic.code : undefined,
      constraint: typeof diagnostic.constraint === 'string' ? diagnostic.constraint : undefined,
      table: typeof diagnostic.table === 'string' ? diagnostic.table : undefined,
    });
  }

  private async input(manager: EntityManager, analysis: GuidedSelfCheckAnalysis): Promise<GuidedSelfCheckAnalysisRequest> {
    const questions = await manager.getRepository(GuidedSelfCheckQuestion).find({
      where: { questionnaireVersionId: analysis.classification.questionnaireVersionId },
    });
    const answers = await manager.getRepository(GuidedSelfCheckAnswer).find({
      where: { guidedSelfCheckId: analysis.guidedSelfCheckId },
    });
    const byId = new Map(questions.map(question => [question.id, question]));
    return {
      systemInstructions: {
        purpose: 'AMBER_INTERNAL_DECISION_SUPPORT',
        prohibitedOutputs: ['diagnosis', 'prescription', 'medication_change', 'treatment_plan', 'classification_override'],
      },
      patientProvidedData: {
        questionnaireVersion: analysis.classification.questionnaireVersion.version,
        classification: GuidedSelfCheckClassification.AMBER,
        matchedReasonCodes: analysis.classification.matchedReasonCodes,
        responses: answers.flatMap(answer => {
          const question = byId.get(answer.questionId);
          return question ? [{ questionKey: question.key, questionText: question.text, state: answer.state, value: answer.value }] : [];
        }),
      },
      timeoutMs: 15_000,
    };
  }

  private validateOutput(output: unknown): asserts output is NonNullable<GuidedSelfCheckAnalysis['output']> {
    if (!output || Array.isArray(output) || typeof output !== 'object') throw new ConflictException('AI analysis output failed schema validation');
    const value = output as Record<string, unknown>;
    const allowed = new Set(['conciseSummary', 'notableResponses', 'inconsistencies', 'informationGaps', 'suggestedOperationalPriority', 'humanReviewSuggested', 'safeReasonCodes', 'recommendedAction', 'escalationSuggested']);
    const stringArrays = ['notableResponses', 'inconsistencies', 'informationGaps', 'safeReasonCodes'];
    const invalidArray = stringArrays.some(key => !Array.isArray(value[key]) || (value[key] as unknown[]).length > 50 || (value[key] as unknown[]).some(item => typeof item !== 'string' || item.length > 500));
    const allowedActions: unknown[] = [null, GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, GuidedSelfCheckNextActionType.FIND_CARE, GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT];
    if (Object.keys(value).some(key => !allowed.has(key)) || typeof value.conciseSummary !== 'string' || value.conciseSummary.length > 1_000 || invalidArray || !Object.values(GuidedSelfCheckAnalysisPriority).includes(value.suggestedOperationalPriority as GuidedSelfCheckAnalysisPriority) || typeof value.humanReviewSuggested !== 'boolean' || !allowedActions.includes(value.recommendedAction) || typeof value.escalationSuggested !== 'boolean') {
      throw new ConflictException('AI analysis output failed schema validation');
    }
  }

  private audit(manager: EntityManager, analysis: GuidedSelfCheckAnalysis, event: string, extra: Record<string, unknown> = {}) {
    return manager.getRepository(GuidedSelfCheckHistory).save({
      guidedSelfCheckId: analysis.guidedSelfCheckId,
      event,
      actorUserId: null,
      metadata: {
        analysisReference: analysis.reference,
        status: analysis.status,
        providerKey: analysis.providerKey,
        modelKey: analysis.modelKey,
        promptVersion: analysis.promptVersion,
        failureCode: analysis.failureCode,
        ...extra,
      },
    });
  }

  private internalView(analysis: GuidedSelfCheckAnalysis) {
    return {
      reference: analysis.reference,
      selfCheckReference: analysis.classification?.selfCheck?.reference,
      classification: analysis.classification?.classification,
      status: analysis.status,
      output: analysis.output,
      humanReviewRecommended: analysis.humanReviewRecommended,
      providerKey: analysis.providerKey,
      modelKey: analysis.modelKey,
      promptVersion: analysis.promptVersion,
      failureCode: analysis.failureCode,
      requestedAt: analysis.createdAt,
      createdAt: analysis.createdAt,
      startedAt: analysis.startedAt,
      completedAt: analysis.completedAt,
    };
  }
}
