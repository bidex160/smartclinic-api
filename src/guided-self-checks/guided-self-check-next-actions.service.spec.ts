import { BadRequestException } from '@nestjs/common';
import { GuidedSelfCheckNextActionsService } from './guided-self-check-next-actions.service';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckNextActionSource, GuidedSelfCheckNextActionType } from './enums/guided-self-check-next-action.enum';
import { GuidedSelfCheckReviewDecision } from './enums/guided-self-check-review.enum';

describe('GuidedSelfCheckNextActionsService', () => {
  const service = () => new GuidedSelfCheckNextActionsService({} as never, {} as never);

  it('maps only real classifications to deterministic V1 actions', () => {
    const subject = service();
    expect(subject.classificationType(GuidedSelfCheckClassification.GREEN)).toBe(GuidedSelfCheckNextActionType.CONTINUE_STAYING_WELL);
    expect(subject.classificationType(GuidedSelfCheckClassification.AMBER)).toBe(GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT);
    expect(subject.classificationType(GuidedSelfCheckClassification.RED)).toBe(GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT);
  });

  it('uses safe semantic urgent and Find Care targets without guaranteed availability', () => {
    const subject = service();
    const red = subject.project({ type: GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT, source: GuidedSelfCheckNextActionSource.CLASSIFICATION, targetMetadata: { type: 'URGENT_ASSESSMENT', domain: 'CARE_REQUEST' }, selectedAt: new Date() } as any);
    const findCare = subject.project({ type: GuidedSelfCheckNextActionType.FIND_CARE, source: GuidedSelfCheckNextActionSource.PROFESSIONAL_REVIEW, targetMetadata: { type: 'FIND_CARE', domain: 'CARE_REQUEST' }, selectedAt: new Date() } as any);
    expect(red.message).toContain('does not guarantee');
    expect(red.cta).toMatchObject({ type: 'URGENT_ASSESSMENT', domain: 'CARE_REQUEST' });
    expect(findCare.cta).toEqual({ type: 'FIND_CARE', domain: 'CARE_REQUEST' });
    expect(JSON.stringify(findCare)).not.toMatch(/https?:\/\/|providerReference|careRequestReference/);
  });

  it('links Essential by authoritative catalogue code without price or Provider', () => {
    const projected = service().project({ type: GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, source: GuidedSelfCheckNextActionSource.PROFESSIONAL_REVIEW, targetMetadata: { type: 'HEALTH_CHECK_PACKAGE', packageCode: 'ESSENTIAL' }, selectedAt: new Date() } as any);
    expect(projected.cta).toEqual({ type: 'HEALTH_CHECK_PACKAGE', packageCode: 'ESSENTIAL' });
    expect(JSON.stringify(projected)).not.toMatch(/price|provider|8000/i);
  });

  it('enforces classification-aware constrained decision/action combinations', () => {
    const subject = service();
    expect(subject.allowed(GuidedSelfCheckReviewDecision.FOLLOW_UP_RECOMMENDED)).toEqual([GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, GuidedSelfCheckNextActionType.FIND_CARE, GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT]);
    expect(subject.allowed(GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED, GuidedSelfCheckClassification.RED)).toEqual([GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT, GuidedSelfCheckNextActionType.FIND_CARE]);
    expect(subject.allowed(GuidedSelfCheckReviewDecision.NO_FURTHER_REVIEW_REQUIRED, GuidedSelfCheckClassification.RED)).toEqual([GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT]);
  });

  it('replaces the current primary action while retaining the historical urgent row', async () => {
    const rows: any[] = [{ id: 'old', guidedSelfCheckId: 's', type: GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT, source: GuidedSelfCheckNextActionSource.CLASSIFICATION, isCurrent: true }];
    const repo = { findOne: jest.fn(async () => rows.find(row => row.isCurrent)), create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => { if (!rows.includes(value)) rows.push({ ...value, id: 'new' }); return value; }) };
    const history = { save: jest.fn() };
    const manager: any = { getRepository: jest.fn((entity: any) => entity.name === 'GuidedSelfCheckHistory' ? history : repo) };
    await service().selectForReview(manager, { id: 'review', guidedSelfCheckId: 's', classificationId: 'c', classificationSnapshot: GuidedSelfCheckClassification.RED, decision: GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED } as any, GuidedSelfCheckNextActionType.FIND_CARE, 'u');
    expect(rows[0].isCurrent).toBe(false);
    expect(rows[1]).toMatchObject({ type: GuidedSelfCheckNextActionType.FIND_CARE, isCurrent: true, source: GuidedSelfCheckNextActionSource.PROFESSIONAL_REVIEW });
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ event: 'NEXT_ACTION_RECOMMENDED' }));
  });

  it('rejects an unsafe RED decision/action combination', async () => {
    await expect(service().selectForReview({} as any, { classificationSnapshot: GuidedSelfCheckClassification.RED, decision: GuidedSelfCheckReviewDecision.URGENT_ESCALATION_CONFIRMED } as any, GuidedSelfCheckNextActionType.BOOK_ESSENTIAL_CHECK, 'u')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps an allowlisted AMBER AI suggestion through backend policy and preserves fallback on rejection', async () => {
    const rows: any[] = [{ id: 'fallback', guidedSelfCheckId: 's', source: GuidedSelfCheckNextActionSource.CLASSIFICATION, type: GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT, isCurrent: true }];
    const repo = { findOne: jest.fn(async () => rows.find(row => row.isCurrent)), create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => { if (!rows.includes(value)) rows.push({ ...value, id: `action-${rows.length}` }); return value; }) };
    const history = { save: jest.fn() };
    const manager: any = { getRepository: jest.fn((entity: any) => entity.name === 'GuidedSelfCheckHistory' ? history : repo) };
    const analysis: any = { id: 'analysis', reference: 'SC-GSA-X', guidedSelfCheckId: 's', classificationId: 'c', classification: { classification: GuidedSelfCheckClassification.AMBER } };
    const subject = service();
    await subject.acceptAmberAnalysisSuggestion(manager, analysis, GuidedSelfCheckNextActionType.FIND_CARE);
    expect(rows.find(row => row.isCurrent)).toMatchObject({ source: GuidedSelfCheckNextActionSource.AI_ANALYSIS, type: GuidedSelfCheckNextActionType.FIND_CARE, analysisId: 'analysis' });
    const count = rows.length;
    await subject.acceptAmberAnalysisSuggestion(manager, { ...analysis, id: 'analysis-2' }, GuidedSelfCheckNextActionType.SEEK_URGENT_ASSESSMENT);
    expect(rows).toHaveLength(count);
    expect(history.save).toHaveBeenCalledWith(expect.objectContaining({ event: 'AI_ACTION_REJECTED' }));
  });

  it('delegates executable contact work to backend reconciliation without creating care or Provider records', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((value: any) => value), save: jest.fn(async (value: any) => ({ id: 'action', ...value })) };
    const contacts = { reconcileCurrent: jest.fn() };
    const manager: any = { getRepository: jest.fn(() => repo) };
    const subject = new GuidedSelfCheckNextActionsService(repo as never, {} as never, contacts as never);
    await subject.ensureClassificationAction(manager, { id: 'classification', guidedSelfCheckId: 'check', classification: GuidedSelfCheckClassification.AMBER } as any);
    expect(contacts.reconcileCurrent).toHaveBeenCalledWith(manager, expect.objectContaining({ type: GuidedSelfCheckNextActionType.REQUEST_PROFESSIONAL_CONTACT }));
    expect(JSON.stringify(contacts.reconcileCurrent.mock.calls)).not.toMatch(/provider|appointment|careRequest|payment/i);
  });
});
