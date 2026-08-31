import { ForbiddenException } from '@nestjs/common';
import { GuidedSelfCheckProfessionalReviewsService } from './guided-self-check-professional-reviews.service';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckNextActionType } from './enums/guided-self-check-next-action.enum';
import { GuidedSelfCheckReviewDecision, GuidedSelfCheckReviewModel, GuidedSelfCheckReviewPriority, GuidedSelfCheckReviewStatus } from './enums/guided-self-check-review.enum';

describe('Guided Self-Check internal clinical RED review', () => {
  const user: any = { id: 'clinical-user' };
  const professional: any = { id: 'professional', reference: 'SC-ICP-ABCDEF123456', userId: user.id, displayName: 'Dr Ada', professionalType: 'DOCTOR', user };

  function harness(overrides: any = {}) {
    const review: any = {
      id: 'review', reference: 'SC-GSR-ABCDEF123456', guidedSelfCheckId: 'check', classificationId: 'classification',
      reviewModel: GuidedSelfCheckReviewModel.INTERNAL_URGENT, classificationSnapshot: GuidedSelfCheckClassification.RED,
      priority: GuidedSelfCheckReviewPriority.URGENT, status: GuidedSelfCheckReviewStatus.ACKNOWLEDGED,
      selfCheck: { reference: 'SC-GSC-ABCDEF123456', completedAt: new Date() }, classificationResult: { urgentAction: true, matchedReasonCodes: ['RED_REASON'] }, history: [], ...overrides,
    };
    const reviewRepo = { findOne: jest.fn().mockResolvedValue(review), save: jest.fn(async (value: any) => value) };
    const historyRepo = { save: jest.fn() };
    const manager: any = { getRepository: jest.fn((entity: any) => entity.name === 'GuidedSelfCheckProfessionalReview' ? reviewRepo : historyRepo), save: reviewRepo.save };
    const data: any = { transaction: jest.fn((fn: any) => fn(manager)) };
    const professionals = { eligible: jest.fn().mockResolvedValue(professional), eligibleForUser: jest.fn().mockResolvedValue(professional) };
    const nextActions = { selectForReview: jest.fn().mockResolvedValue({ type: GuidedSelfCheckNextActionType.FIND_CARE }), operational: jest.fn() };
    return { subject: new GuidedSelfCheckProfessionalReviewsService(reviewRepo as never, data, nextActions as never, professionals as never), review, reviewRepo, historyRepo, professionals, nextActions };
  }

  it('assigns an eligible exact internal professional without Provider affiliation', async () => {
    const h = harness();
    const result = await h.subject.assignInternal(h.review.reference, { professionalReference: professional.reference }, 'operations');
    expect(result).toMatchObject({ status: GuidedSelfCheckReviewStatus.ASSIGNED, assignedProfessional: { reference: professional.reference } });
    expect(h.review).toMatchObject({ assignedInternalClinicalProfessionalId: professional.id, assignedReviewerProviderId: null, assignedReviewerAuthorizationId: null });
    expect(h.historyRepo.save).toHaveBeenCalledWith(expect.objectContaining({ event: 'INTERNAL_REVIEW_ASSIGNED', actorUserId: 'operations' }));
  });

  it('only the exact assigned capable professional can start', async () => {
    const h = harness({ status: GuidedSelfCheckReviewStatus.ASSIGNED, assignedInternalClinicalProfessionalId: professional.id, assignedInternalClinicalProfessional: professional });
    await expect(h.subject.startInternal(h.review.reference, user)).resolves.toMatchObject({ status: GuidedSelfCheckReviewStatus.IN_REVIEW });
    h.professionals.eligibleForUser.mockResolvedValueOnce({ ...professional, id: 'other' });
    await expect(h.subject.startInternal(h.review.reference, { id: 'other-user' } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('completes once with constrained action, safe guidance and hidden internal note', async () => {
    const h = harness({ status: GuidedSelfCheckReviewStatus.IN_REVIEW, assignedInternalClinicalProfessionalId: professional.id, assignedInternalClinicalProfessional: professional });
    const result = await h.subject.completeInternal(h.review.reference, user, { decision: GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED, nextActionType: GuidedSelfCheckNextActionType.FIND_CARE, patientGuidance: 'Please follow the urgent guidance shown above.', internalClinicalNote: 'Internal context only.' });
    expect(result).toMatchObject({ status: GuidedSelfCheckReviewStatus.COMPLETED, decision: GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED, patientGuidance: 'Please follow the urgent guidance shown above.', internalClinicalNote: 'Internal context only.' });
    expect(h.nextActions.selectForReview).toHaveBeenCalledTimes(1);
    await h.subject.completeInternal(h.review.reference, user, { decision: GuidedSelfCheckReviewDecision.FOLLOW_UP_RECOMMENDED, nextActionType: GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK });
    expect(h.nextActions.selectForReview).toHaveBeenCalledTimes(1);
    expect(h.review.classificationSnapshot).toBe(GuidedSelfCheckClassification.RED);
  });
});
