import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../users/enums/user-role.enum';
import { GuidedSelfCheckProfessionalReviewsService } from './guided-self-check-professional-reviews.service';
import { GuidedSelfCheckClassification } from './enums/guided-self-check-classification.enum';
import { GuidedSelfCheckReviewModel, GuidedSelfCheckReviewPriority, GuidedSelfCheckReviewStatus } from './enums/guided-self-check-review.enum';

describe('Guided Self-Check internal clinical professional worklist', () => {
  const professional = { id: 'professional-a', reference: 'SC-ICP-AAAAAAAAAAAA' };
  const assignedAt = new Date('2026-08-01T09:00:00Z');
  const startedAt = new Date('2026-08-01T09:05:00Z');
  const createdAt = new Date('2026-08-01T08:00:00Z');

  function harness(rows: any[] = []) {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const qb: any = {};
    for (const method of ['innerJoinAndSelect', 'orderBy', 'addOrderBy', 'skip', 'take']) qb[method] = jest.fn().mockReturnValue(qb);
    qb.andWhere = jest.fn((sql: string, params?: Record<string, unknown>) => { calls.push([sql, params]); return qb; });
    qb.getManyAndCount = jest.fn().mockResolvedValue([rows, rows.length]);
    const reviews = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
    const professionals = { eligibleForUser: jest.fn().mockResolvedValue(professional) };
    const subject = new GuidedSelfCheckProfessionalReviewsService(reviews as never, { manager: {} } as never, {} as never, professionals as never);
    return { subject, qb, calls, professionals };
  }

  const row = (overrides: any = {}) => ({
    id: 'internal-db-review-id', reference: 'SC-GSR-ABCDEF123456', guidedSelfCheckId: 'internal-check-id',
    selfCheck: { id: 'internal-check-id', reference: 'SC-GSC-ABCDEF123456', answers: ['secret-answer'] },
    classificationSnapshot: GuidedSelfCheckClassification.RED, reviewModel: GuidedSelfCheckReviewModel.INTERNAL_URGENT,
    priority: GuidedSelfCheckReviewPriority.URGENT, status: GuidedSelfCheckReviewStatus.ASSIGNED,
    assignedAt, startedAt, createdAt, internalClinicalNote: 'secret note', operationalNote: 'secret operations',
    assignedReviewerProviderId: 'provider-id', ...overrides,
  });

  it.each([UserRole.USER, UserRole.PROVIDER, UserRole.ADMIN, UserRole.OPERATIONS])('derives identity from the authenticated %s user without role widening', async role => {
    const h = harness([row()]);
    const result = await h.subject.listMine({ id: `user-${role}`, role } as any, { page: 1, limit: 20 });
    expect(h.professionals.eligibleForUser).toHaveBeenCalledWith(`user-${role}`, 'URGENT_SELF_CHECK_REVIEW');
    expect(h.calls).toContainEqual(['review.assignedInternalClinicalProfessionalId = :professionalId', { professionalId: professional.id }]);
    expect(result.items).toEqual([{ reference: 'SC-GSR-ABCDEF123456', selfCheckReference: 'SC-GSC-ABCDEF123456', classification: 'RED', priority: 'URGENT', status: 'ASSIGNED', assignedAt, startedAt, createdAt }]);
  });

  it.each([UserRole.USER, UserRole.PROVIDER, UserRole.ADMIN, UserRole.OPERATIONS])('rejects %s when no active capable professional identity exists', async role => {
    const h = harness();
    h.professionals.eligibleForUser.mockRejectedValueOnce(new ForbiddenException());
    await expect(h.subject.listMine({ id: `user-${role}`, role } as any, { page: 1, limit: 20 })).rejects.toBeInstanceOf(ForbiddenException);
    expect(h.qb.getManyAndCount).not.toHaveBeenCalled();
  });

  it('defaults to actionable assigned/in-review internal RED work and excludes unassigned, legacy, cancelled and other assignees in SQL', async () => {
    const h = harness();
    await h.subject.listMine({ id: 'user-a' } as any, { page: 2, limit: 10 });
    expect(h.calls).toEqual(expect.arrayContaining([
      ['review.reviewModel = :reviewModel', { reviewModel: GuidedSelfCheckReviewModel.INTERNAL_URGENT }],
      ['review.assignedInternalClinicalProfessionalId = :professionalId', { professionalId: professional.id }],
      ['review.status IN (:...actionableStatuses)', { actionableStatuses: [GuidedSelfCheckReviewStatus.ASSIGNED, GuidedSelfCheckReviewStatus.IN_REVIEW] }],
    ]));
    expect(h.qb.skip).toHaveBeenCalledWith(10);
    expect(h.qb.take).toHaveBeenCalledWith(10);
  });

  it('supports an explicit completed/cancelled status and priority filter with stable indexed ordering', async () => {
    const h = harness();
    await h.subject.listMine({ id: 'user-a' } as any, { page: 1, limit: 100, status: GuidedSelfCheckReviewStatus.COMPLETED as any, priority: GuidedSelfCheckReviewPriority.URGENT });
    expect(h.calls).toEqual(expect.arrayContaining([
      ['review.status = :status', { status: GuidedSelfCheckReviewStatus.COMPLETED }],
      ['review.priority = :priority', { priority: GuidedSelfCheckReviewPriority.URGENT }],
    ]));
    expect(h.qb.orderBy).toHaveBeenCalledWith(expect.stringContaining("review.priority = 'URGENT'"), 'ASC');
    expect(h.qb.addOrderBy).toHaveBeenNthCalledWith(1, 'review.assignedAt', 'ASC', 'NULLS LAST');
    expect(h.qb.addOrderBy).toHaveBeenNthCalledWith(2, 'review.id', 'ASC');
  });

  it('returns a normal empty paginated result', async () => {
    const h = harness();
    await expect(h.subject.listMine({ id: 'user-a' } as any, { page: 1, limit: 20 })).resolves.toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });
});
