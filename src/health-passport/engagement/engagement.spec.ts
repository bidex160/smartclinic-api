import { BadRequestException, ConflictException } from '@nestjs/common';

import { EngagementFacts, EngagementService, POINTS, summarise } from './engagement.service';
import { HEALTH_QUIZ, questionForDate } from './health-quiz.bank';

const none: EngagementFacts = {
  dateOfBirth: false, phone: false, bloodGroup: false, genotype: false, allergiesRecorded: false, emergencyContact: false,
  routines: 0, dependants: 0, selfChecks: 0, healthChecks: 0, checkInDates: [], routineDates: [], quizAnswers: 0, quizCorrect: 0,
};

describe('health quiz bank', () => {
  it('has unique ids, a valid answer and an explanation for every question', () => {
    expect(new Set(HEALTH_QUIZ.map((q) => q.id)).size).toBe(HEALTH_QUIZ.length);
    for (const q of HEALTH_QUIZ) {
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(q.explanation.length).toBeGreaterThan(20);
      expect(q.source).toBeTruthy();
    }
  });

  it('gives everyone the same question on a day and a new one tomorrow', () => {
    expect(questionForDate('2026-10-02').id).toBe(questionForDate('2026-10-02').id);
    expect(questionForDate('2026-10-03').id).not.toBe(questionForDate('2026-10-02').id);
    const month = new Set(Array.from({ length: HEALTH_QUIZ.length }, (_, i) => questionForDate(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)).id));
    expect(month.size).toBe(HEALTH_QUIZ.length);
  });
});

describe('summarise', () => {
  it('starts a new patient at Starter with an empty passport and a clear next step', () => {
    const s = summarise(none, '2026-10-02');
    expect(s).toMatchObject({ points: 0, level: { number: 1, name: 'Starter', nextName: 'Steady', nextAt: 100 }, streak: { current: 0, best: 0 } });
    expect(s.passport).toMatchObject({ percent: 0, done: 0, total: 9, nextStep: { key: 'dateOfBirth' } });
    expect(s.badges.every((b) => !b.earned)).toBe(true);
    expect(s.badges.find((b) => b.code === 'STREAK_7')).toMatchObject({ progress: { current: 0, target: 7 } });
  });

  it('adds points for real health actions and counts each day once', () => {
    const s = summarise({ ...none, quizAnswers: 3, quizCorrect: 2, checkInDates: ['2026-10-01', '2026-10-02'], routineDates: ['2026-10-02', '2026-10-02'], selfChecks: 1, healthChecks: 1, bloodGroup: true }, '2026-10-02');
    const expected = 3 * POINTS.quizAnswered + 2 * POINTS.quizCorrect + 2 * POINTS.checkInDay + 1 * POINTS.routineDay + POINTS.selfCheck + POINTS.healthCheck + 3 * POINTS.passportItem;
    expect(s.points).toBe(expected);
    expect(s.level.name).toBe('Steady');
  });

  it('counts a streak across check-ins and routines, and keeps yesterday’s alive', () => {
    const s = summarise({ ...none, checkInDates: ['2026-09-29', '2026-09-30'], routineDates: ['2026-10-01'] }, '2026-10-02');
    expect(s.streak).toEqual({ current: 3, best: 3 });
  });

  it('awards badges and completes the passport', () => {
    const all = { ...none, dateOfBirth: true, phone: true, bloodGroup: true, genotype: true, allergiesRecorded: true, emergencyContact: true, routines: 3, selfChecks: 1, healthChecks: 1, dependants: 1, quizAnswers: 10 };
    const s = summarise(all, '2026-10-02');
    expect(s.passport).toMatchObject({ percent: 100, nextStep: null });
    const earned = s.badges.filter((b) => b.earned).map((b) => b.code);
    expect(earned).toEqual(expect.arrayContaining(['KNOW_YOUR_NUMBERS', 'FIRST_HEALTH_CHECK', 'ROUTINE_BUILDER', 'FAMILY_GUARDIAN', 'PASSPORT_COMPLETE', 'QUIZ_10']));
    expect(s.badges.find((b) => b.code === 'PASSPORT_COMPLETE')).not.toHaveProperty('progress');
  });
});

describe('EngagementService quiz', () => {
  const now = new Date('2026-10-02T09:00:00Z');
  const today = questionForDate('2026-10-02');
  let answers: any[];
  let service: EngagementService;
  const count = jest.fn(async () => 0);

  beforeEach(() => {
    answers = [];
    const repo = (extra: Record<string, unknown> = {}) => ({ count, countBy: count, find: jest.fn(async () => []), findOne: jest.fn(async () => null), ...extra });
    const qb = { select: () => qb, where: () => qb, innerJoin: () => qb, andWhere: () => qb, getRawMany: async () => [], getCount: async () => 0 } as any;
    service = new EngagementService(
      repo({ findOne: jest.fn(async () => ({ id: 'patient-1', dateOfBirth: null, phone: null })) }) as any,
      repo() as any,
      repo() as any,
      repo({ createQueryBuilder: () => qb }) as any,
      repo() as any,
      repo() as any,
      repo() as any,
      repo({ createQueryBuilder: () => qb }) as any,
      {
        exists: jest.fn(async ({ where }: any) => answers.some((a) => a.localDate === where.localDate)),
        insert: jest.fn(async (row: any) => answers.push(row)),
        findOne: jest.fn(async ({ where }: any) => answers.find((a) => a.localDate === where.localDate) ?? null),
        count: jest.fn(async ({ where }: any) => answers.filter((a) => (where.correct === undefined ? true : a.correct === where.correct)).length),
      } as any,
    );
  });

  it('scores today’s answer once, explains it and adds the points', async () => {
    const result = await service.answerQuiz({ id: 'u' } as any, { questionId: today.id, choiceIndex: today.answer, timezone: 'Africa/Lagos' }, now);
    expect(result.pointsEarned).toBe(POINTS.quizAnswered + POINTS.quizCorrect);
    expect(result.quiz.answered).toMatchObject({ correct: true, correctIndex: today.answer, explanation: today.explanation });
    expect(result.points).toBe(POINTS.quizAnswered + POINTS.quizCorrect);
    await expect(service.answerQuiz({ id: 'u' } as any, { questionId: today.id, choiceIndex: 0, timezone: 'Africa/Lagos' }, now)).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses another day’s question and out-of-range answers', async () => {
    await expect(service.answerQuiz({ id: 'u' } as any, { questionId: 'not-today', choiceIndex: 0, timezone: 'Africa/Lagos' }, now)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.answerQuiz({ id: 'u' } as any, { questionId: today.id, choiceIndex: 9, timezone: 'Africa/Lagos' }, now)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the patient’s own day, so a late-evening answer counts for that day', async () => {
    const lateInKigali = new Date('2026-10-02T21:30:00Z'); // 23:30 in Kigali, still 2 October there
    const q = questionForDate('2026-10-02');
    const r = await service.answerQuiz({ id: 'u' } as any, { questionId: q.id, choiceIndex: 0, timezone: 'Africa/Kigali' }, lateInKigali);
    expect(r.quiz.localDate).toBe('2026-10-02');
  });
});
