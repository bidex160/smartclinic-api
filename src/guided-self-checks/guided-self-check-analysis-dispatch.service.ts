import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuidedSelfCheckAnalysis } from './entities/guided-self-check-analysis.entity';
import { GuidedSelfCheckClassificationResult } from './entities/guided-self-check-classification.entity';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckAnalysisService } from './guided-self-check-analysis.service';

@Injectable()
export class GuidedSelfCheckAnalysisDispatchService {
  private readonly logger = new Logger(GuidedSelfCheckAnalysisDispatchService.name);

  constructor(
    @InjectRepository(GuidedSelfCheckAnalysis) private readonly analyses: Repository<GuidedSelfCheckAnalysis>,
    private readonly processor: GuidedSelfCheckAnalysisService,
  ) {}

  async dispatchForClassification(result: GuidedSelfCheckClassificationResult): Promise<void> {
    if (result.classification !== GuidedSelfCheckClassification.AMBER) return;
    const analysis = await this.analyses.findOne({ where: { classificationId: result.id } });
    if (!analysis) {
      this.logger.error('Committed AMBER classification has no analysis to dispatch', {
        classificationId: result.id,
      });
      return;
    }
    setImmediate(() => {
      void this.processor.process(analysis.reference).catch(error => {
        this.logger.error('Automatic Guided Self-Check analysis processing failed unexpectedly', {
          analysisReference: analysis.reference,
          errorName: error instanceof Error ? error.name : typeof error,
        });
      });
    });
  }
}
