import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { HealthCheckPackage } from '../health-checks/entities/health-check-package.entity';
import { GuidedSelfCheckAnalysis } from './entities/guided-self-check-analysis.entity';
import { GuidedSelfCheckClassificationResult } from './entities/guided-self-check-classification.entity';
import { GuidedSelfCheckHistory } from './entities/guided-self-check-history.entity';
import { GuidedSelfCheckNextAction } from './entities/guided-self-check-next-action.entity';
import { GuidedSelfCheckProfessionalReview } from './entities/guided-self-check-professional-review.entity';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckNextActionSource, GuidedSelfCheckNextActionType } from './enums/guided-self-check-next-action.enum';
import { GuidedSelfCheckReviewDecision } from './enums/guided-self-check-review.enum';

const PRESENTATION: Record<GuidedSelfCheckNextActionType, { titleKey: string; title: string; message: string; cta: Record<string, string> }> = {
  [GuidedSelfCheckNextActionType.CONTINUE_STAYING_WELL]: { titleKey: 'SELF_CHECK_CONTINUE_STAYING_WELL', title: 'Continue staying well', message: 'Keep supporting your wellbeing and seek care whenever you have concerns. This Self-Check is not a diagnosis.', cta: { type: 'NONE' } },
  [GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK]: { titleKey: 'SELF_CHECK_BOOK_ESSENTIAL_CHECK', title: 'Book an Essential Health Check', message: 'An Essential Health Check is recommended as your next SmartClinic step.', cta: { type: 'HEALTH_CHECK_PACKAGE', packageCode: 'ESSENTIAL' } },
  [GuidedSelfCheckNextActionType.FIND_CARE]: { titleKey: 'SELF_CHECK_FIND_CARE', title: 'Find appropriate care', message: 'Use SmartClinic Find Care to explore an appropriate care service. This does not guarantee immediate or emergency availability.', cta: { type: 'FIND_CARE', domain: 'CARE_REQUEST' } },
  [GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT]: { titleKey: 'SELF_CHECK_REQUEST_PROFESSIONAL_CONTACT', title: 'Professional contact recommended', message: 'A SmartClinic clinical professional should review or clarify the information you provided.', cta: { type: 'PROFESSIONAL_CONTACT' } },
  [GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT]: { titleKey: 'SELF_CHECK_SEEK_URGENT_ASSESSMENT', title: 'Seek urgent medical assessment', message: 'Please seek urgent medical assessment. SmartClinic does not guarantee immediate provider availability or emergency transport.', cta: { type: 'URGENT_ASSESSMENT', domain: 'CARE_REQUEST' } },
};

@Injectable()
export class GuidedSelfCheckNextActionsService {
  constructor(@InjectRepository(GuidedSelfCheckNextAction) private actions: Repository<GuidedSelfCheckNextAction>, private data: DataSource) {}

  classificationType(classification: GuidedSelfCheckClassification) {
    return classification === GuidedSelfCheckClassification.GREEN ? GuidedSelfCheckNextActionType.CONTINUE_STAYING_WELL : classification === GuidedSelfCheckClassification.AMBER ? GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT : GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT;
  }

  async ensureForReference(reference: string) {
    return this.data.transaction(async manager => {
      const result = await manager.getRepository(GuidedSelfCheckClassificationResult).createQueryBuilder('classification').innerJoin('classification.selfCheck', 'selfCheck').where('selfCheck.reference = :reference', { reference }).setLock('pessimistic_write').getOne();
      return result ? this.ensureClassificationAction(manager, result) : null;
    });
  }

  async ensureClassificationAction(manager: EntityManager, result: GuidedSelfCheckClassificationResult) {
    const type = this.classificationType(result.classification);
    const repo = manager.getRepository(GuidedSelfCheckNextAction);
    const current = await repo.findOne({ where: { guidedSelfCheckId: result.guidedSelfCheckId, isCurrent: true }, lock: { mode: 'pessimistic_read' } });
    if (current) return current;
    return repo.save(repo.create({ guidedSelfCheckId: result.guidedSelfCheckId, classificationId: result.id, professionalReviewId: null, analysisId: null, type, source: GuidedSelfCheckNextActionSource.CLASSIFICATION, targetMetadata: this.target(type), isCurrent: true, selectedByUserId: null, selectedAt: new Date() }));
  }

  allowed(decision: GuidedSelfCheckReviewDecision, classification?: GuidedSelfCheckClassification): GuidedSelfCheckNextActionType[] {
    if (classification === GuidedSelfCheckClassification.RED) {
      switch (decision) {
        case GuidedSelfCheckReviewDecision.NO_FURTHER_REVIEW_REQUIRED: return [GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT];
        case GuidedSelfCheckReviewDecision.FOLLOW_UP_RECOMMENDED: return [GuidedSelfCheckNextActionType.FIND_CARE, GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT];
        case GuidedSelfCheckReviewDecision.PATIENT_CONTACT_REQUIRED: return [GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT];
        case GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED: return [GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT, GuidedSelfCheckNextActionType.FIND_CARE];
      }
    }
    switch (decision) {
      case GuidedSelfCheckReviewDecision.NO_FURTHER_REVIEW_REQUIRED: return [GuidedSelfCheckNextActionType.CONTINUE_STAYING_WELL];
      case GuidedSelfCheckReviewDecision.FOLLOW_UP_RECOMMENDED: return [GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, GuidedSelfCheckNextActionType.FIND_CARE, GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT];
      case GuidedSelfCheckReviewDecision.PATIENT_CONTACT_REQUIRED: return [GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT];
      case GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED: return [GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT];
    }
  }

  async selectForReview(manager: EntityManager, review: GuidedSelfCheckProfessionalReview, type: GuidedSelfCheckNextActionType | undefined, actorUserId: string) {
    if (!type || !this.allowed(review.decision!, review.classificationSnapshot).includes(type)) throw new BadRequestException('Selected next action is not allowed for this review decision and classification');
    await this.assertTargetAvailable(manager, type);
    return this.replaceCurrent(manager, { guidedSelfCheckId: review.guidedSelfCheckId, classificationId: review.classificationId, professionalReviewId: review.id, analysisId: null, type, source: GuidedSelfCheckNextActionSource.PROFESSIONAL_REVIEW, actorUserId });
  }

  async acceptAmberAnalysisSuggestion(manager: EntityManager, analysis: GuidedSelfCheckAnalysis, type: GuidedSelfCheckNextActionType | null) {
    if (!type) return null;
    const allowed = [GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, GuidedSelfCheckNextActionType.FIND_CARE, GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT];
    if (analysis.classification.classification !== GuidedSelfCheckClassification.AMBER || !allowed.includes(type)) {
      await this.audit(manager, analysis.guidedSelfCheckId, 'AI_ACTION_REJECTED', null, { analysisReference: analysis.reference, suggestedAction: type });
      return null;
    }
    await this.assertTargetAvailable(manager, type);
    const action = await this.replaceCurrent(manager, { guidedSelfCheckId: analysis.guidedSelfCheckId, classificationId: analysis.classificationId, professionalReviewId: null, analysisId: analysis.id, type, source: GuidedSelfCheckNextActionSource.AI_ANALYSIS, actorUserId: null });
    await this.audit(manager, analysis.guidedSelfCheckId, 'AI_ACTION_ACCEPTED', null, { analysisReference: analysis.reference, actionType: type });
    return action;
  }

  async patientForReference(reference: string, userId: string) {
    const action = await this.actions.createQueryBuilder('action').innerJoin('action.selfCheck', 'selfCheck').where('selfCheck.reference=:reference', { reference }).andWhere('selfCheck.userId=:userId', { userId }).andWhere('action.isCurrent=true').getOne();
    return action ? this.project(action) : null;
  }

  async operational(guidedSelfCheckId: string) { const action = await this.actions.findOne({ where: { guidedSelfCheckId, isCurrent: true } }); return action ? this.project(action) : null; }

  project(action: GuidedSelfCheckNextAction) {
    const presentation = PRESENTATION[action.type];
    return { type: action.type, source: action.source, titleKey: presentation.titleKey, title: presentation.title, message: presentation.message, cta: { ...presentation.cta, ...action.targetMetadata }, selectedAt: action.selectedAt };
  }

  private async replaceCurrent(manager: EntityManager, value: { guidedSelfCheckId: string; classificationId: string; professionalReviewId: string | null; analysisId: string | null; type: GuidedSelfCheckNextActionType; source: GuidedSelfCheckNextActionSource; actorUserId: string | null }) {
    const repo = manager.getRepository(GuidedSelfCheckNextAction);
    const current = await repo.findOne({ where: { guidedSelfCheckId: value.guidedSelfCheckId, isCurrent: true }, lock: { mode: 'pessimistic_write' } });
    if (current?.source === value.source && current.professionalReviewId === value.professionalReviewId && current.analysisId === value.analysisId) {
      if (current.type !== value.type) throw new ConflictException('Established next action is immutable for this source');
      return current;
    }
    if (current) { current.isCurrent = false; await repo.save(current); }
    const action = await repo.save(repo.create({ guidedSelfCheckId: value.guidedSelfCheckId, classificationId: value.classificationId, professionalReviewId: value.professionalReviewId, analysisId: value.analysisId, type: value.type, source: value.source, targetMetadata: this.target(value.type), isCurrent: true, selectedByUserId: value.actorUserId, selectedAt: new Date() }));
    await this.audit(manager, value.guidedSelfCheckId, 'NEXT_ACTION_RECOMMENDED', value.actorUserId, { actionType: value.type, source: value.source });
    return action;
  }

  private async assertTargetAvailable(manager: EntityManager, type: GuidedSelfCheckNextActionType) {
    if (type === GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK && !await manager.getRepository(HealthCheckPackage).findOne({ where: { code: 'ESSENTIAL', isActive: true } })) throw new ConflictException('The Essential Health Check catalogue item is unavailable');
  }

  private target(type: GuidedSelfCheckNextActionType): Record<string, string> {
    if (type === GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK) return { type: 'HEALTH_CHECK_PACKAGE', packageCode: 'ESSENTIAL' };
    if (type === GuidedSelfCheckNextActionType.FIND_CARE) return { type: 'FIND_CARE', domain: 'CARE_REQUEST' };
    if (type === GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT) return { type: 'URGENT_ASSESSMENT', domain: 'CARE_REQUEST' };
    if (type === GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT) return { type: 'PROFESSIONAL_CONTACT' };
    return { type: 'NONE' };
  }

  private audit(manager: EntityManager, guidedSelfCheckId: string, event: string, actorUserId: string | null, metadata: Record<string, unknown>) {
    return manager.getRepository(GuidedSelfCheckHistory).save({ guidedSelfCheckId, event, actorUserId, metadata });
  }
}
