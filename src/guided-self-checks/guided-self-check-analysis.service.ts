import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  GUIDED_SELF_CHECK_ANALYSIS_PORT,
  GuidedSelfCheckAnalysisPort,
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

@Injectable()
export class GuidedSelfCheckAnalysisService {
  constructor(
    @InjectRepository(GuidedSelfCheckAnalysis) private analyses: Repository<GuidedSelfCheckAnalysis>,
    private data: DataSource,
    @Optional() @Inject(GUIDED_SELF_CHECK_ANALYSIS_PORT) private port?: GuidedSelfCheckAnalysisPort,
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
      failureCode: null,
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
    return this.data.transaction(async manager => {
      const repo = manager.getRepository(GuidedSelfCheckAnalysis);
      const analysis = await repo.findOne({
        where: { reference },
        relations: { classification: { questionnaireVersion: true, selfCheck: true } },
        lock: { mode: 'pessimistic_write' },
      });
      if (!analysis) throw new NotFoundException('Guided Self-Check analysis was not found');
      if (analysis.status === GuidedSelfCheckAnalysisStatus.COMPLETED || analysis.status === GuidedSelfCheckAnalysisStatus.PROCESSING) {
        return this.internalView(analysis);
      }
      if (!this.port) {
        analysis.status = GuidedSelfCheckAnalysisStatus.FAILED;
        analysis.failureCode = GuidedSelfCheckAnalysisFailureCode.PROVIDER_UNAVAILABLE;
        await repo.save(analysis);
        await this.audit(manager, analysis, 'ANALYSIS_FAILED');
        return this.internalView(analysis);
      }
      analysis.status = GuidedSelfCheckAnalysisStatus.PROCESSING;
      analysis.startedAt = new Date();
      analysis.providerKey = this.port.providerKey;
      analysis.modelKey = this.port.modelKey;
      await repo.save(analysis);
      await this.audit(manager, analysis, 'ANALYSIS_STARTED');
      const request = await this.input(manager, analysis);
      try {
        const output = await this.port.analyze(request);
        this.validateOutput(output);
        analysis.output = output;
        analysis.status = GuidedSelfCheckAnalysisStatus.COMPLETED;
        analysis.failureCode = null;
        analysis.completedAt = new Date();
        await repo.save(analysis);
        await this.audit(manager, analysis, 'ANALYSIS_COMPLETED');
      } catch {
        analysis.status = GuidedSelfCheckAnalysisStatus.FAILED;
        analysis.failureCode = GuidedSelfCheckAnalysisFailureCode.INVALID_OUTPUT;
        await repo.save(analysis);
        await this.audit(manager, analysis, 'ANALYSIS_FAILED');
      }
      return this.internalView(analysis);
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
    const allowed = new Set(['conciseSummary', 'notableResponses', 'inconsistencies', 'informationGaps', 'suggestedOperationalPriority', 'humanReviewSuggested', 'safeReasonCodes']);
    const stringArrays = ['notableResponses', 'inconsistencies', 'informationGaps', 'safeReasonCodes'];
    const invalidArray = stringArrays.some(key => !Array.isArray(value[key]) || (value[key] as unknown[]).length > 50 || (value[key] as unknown[]).some(item => typeof item !== 'string' || item.length > 500));
    if (Object.keys(value).some(key => !allowed.has(key)) || typeof value.conciseSummary !== 'string' || value.conciseSummary.length > 1_000 || invalidArray || !Object.values(GuidedSelfCheckAnalysisPriority).includes(value.suggestedOperationalPriority as GuidedSelfCheckAnalysisPriority) || typeof value.humanReviewSuggested !== 'boolean') {
      throw new ConflictException('AI analysis output failed schema validation');
    }
  }

  private audit(manager: EntityManager, analysis: GuidedSelfCheckAnalysis, event: string) {
    return manager.getRepository(GuidedSelfCheckHistory).save({
      guidedSelfCheckId: analysis.guidedSelfCheckId,
      event,
      actorUserId: null,
      metadata: {
        analysisReference: analysis.reference,
        status: analysis.status,
        providerKey: analysis.providerKey,
        modelKey: analysis.modelKey,
        failureCode: analysis.failureCode,
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
      providerKey: analysis.providerKey,
      modelKey: analysis.modelKey,
      failureCode: analysis.failureCode,
      createdAt: analysis.createdAt,
      completedAt: analysis.completedAt,
    };
  }
}
