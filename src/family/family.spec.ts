import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { FamilyKidsService } from './family-kids.service';
import { ageInYears, KID_QUIZ, kidQuestionForDate, nextWellChildVisit, starLevel, STARTER_TASKS } from './kids.content';
import { chooseNudge, NudgeFacts, NUDGES, nudgeText } from './nudges.content';
import { NudgesService } from './nudges.service';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('kids content', () => {
  it('works out age, the next check-up and the star level', () => {
    expect(ageInYears('2020-10-04', '2026-10-03')).toBe(5);
    expect(ageInYears('2020-10-03', '2026-10-03')).toBe(6);
    expect(nextWellChildVisit('2026-09-01', '2026-10-03')).toMatchObject({ key: 'week6', dueDate: '2026-10-13', daysAway: 10 });
    expect(nextWellChildVisit('2026-09-01', '2026-09-10')).toMatchObject({ key: 'birth', daysAway: -9 }); // just missed: still shown
    expect(nextWellChildVisit('2015-01-01', '2026-10-03')).toBeNull();
    expect(starLevel(0)).toEqual({ level: 1, nextAt: 10 });
    expect(starLevel(35)).toEqual({ level: 3, nextAt: 60 });
  });

  it('gives a different kids question each day and covers the whole bank', () => {
    const ids = new Set(Array.from({ length: KID_QUIZ.length }, (_, i) => kidQuestionForDate(new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10)).id));
    expect(ids.size).toBe(KID_QUIZ.length);
  });
});

describe('daily nudge rules', () => {
  const base: NudgeFacts = { activeToday: false, streak: 0, quizAnsweredToday: false, passportIncomplete: false, kidsPending: [], ignoredInARow: 0, dayNumber: 20000 };

  it('says nothing to someone already active, unless a child is waiting', () => {
    expect(chooseNudge({ ...base, activeToday: true })).toBeNull();
    expect(chooseNudge({ ...base, activeToday: true, kidsPending: [{ name: 'Tobi', done: 1, total: 4, ref: 'SCP-AAAA-BBBB' }] })).toMatchObject({ kind: 'kids', route: '/me/family/kids/SCP-AAAA-BBBB' });
  });

  it('protects a streak first, then welcomes back, then the question, then the passport', () => {
    expect(chooseNudge({ ...base, streak: 5 })).toMatchObject({ kind: 'streak', params: { n: 5 } });
    expect(chooseNudge({ ...base, ignoredInARow: 4 })?.kind).toBe('welcomeBack');
    expect(chooseNudge(base)?.kind).toBe('quiz');
    expect(chooseNudge({ ...base, quizAnsweredToday: true, wordPlayedToday: true, passportIncomplete: true })?.kind).toBe('passport');
    expect(chooseNudge({ ...base, quizAnsweredToday: true, wordPlayedToday: true })).toBeNull();
  });

  it('backs off when ignored: every 3rd day after a week, weekly after three weeks', () => {
    const sentDays = (ignored: number) => Array.from({ length: 21 }, (_, i) => chooseNudge({ ...base, ignoredInARow: ignored, dayNumber: 21000 + i })).filter(Boolean).length;
    expect(sentDays(2)).toBe(21);
    expect(sentDays(7)).toBe(7);
    expect(sentDays(21)).toBe(3);
  });

  it('has every message in every language with the same placeholders', () => {
    for (const [lang, msgs] of Object.entries(NUDGES)) {
      for (const [kind, t] of Object.entries(msgs)) {
        expect(placeholders(t.title + t.body)).toEqual(placeholders(NUDGES.en[kind as keyof typeof msgs].title + NUDGES.en[kind as keyof typeof msgs].body));
        expect([lang, kind, Boolean(t.title.trim() && t.body.trim())]).toEqual([lang, kind, true]);
      }
    }
    expect(nudgeText('ha', 'streak', { n: 6 }).title).toContain('6');
    expect(nudgeText('xx', 'quiz', {}).title).toBe(NUDGES.en.quiz.title);
  });
});

describe('FamilyKidsService', () => {
  const today = new Date('2026-10-03T09:00:00Z');
  function setup(opts: { guardian?: boolean; dob?: string } = {}) {
    const child = { id: 'c1', patientReference: 'SCP-KID1-AAAA', givenName: 'Tobi', dateOfBirth: opts.dob ?? '2021-05-01', status: 'ACTIVE' };
    const tasks: any[] = [];
    const done: any[] = [];
    const answers: any[] = [];
    const repo = (rows: any[], extra: any = {}) => ({
      find: jest.fn(async ({ where }: any = {}) => rows.filter((r) => Object.entries(where ?? {}).every(([k, v]) => typeof v !== 'object' || v === null ? r[k] === v : true))),
      findOne: jest.fn(async ({ where }: any) => rows.find((r) => Object.entries(where).every(([k, v]) => r[k] === v)) ?? null),
      count: jest.fn(async ({ where }: any = {}) => rows.filter((r) => Object.entries(where ?? {}).every(([k, v]) => r[k] === v)).length),
      insert: jest.fn(async (v: any) => {
        if (extra.unique && rows.some((r) => extra.unique.every((k: string) => r[k] === v[k]))) throw new Error('duplicate');
        rows.push({ id: `id${rows.length + 1}`, createdAt: new Date(), ...v });
      }),
      update: jest.fn(async (id: string, patch: any) => Object.assign(rows.find((r) => r.id === id), patch)),
      delete: jest.fn(async (w: any) => { const i = rows.findIndex((r) => Object.entries(w).every(([k, v]) => r[k] === v)); if (i >= 0) rows.splice(i, 1); }),
    });
    const patients = { findOne: jest.fn(async ({ where }: any) => (where.patientReference === child.patientReference ? child : null)), find: jest.fn(async () => [child]) };
    const relationships = { find: jest.fn(async () => (opts.guardian === false ? [] : [{ patientId: 'c1' }])), findOne: jest.fn(async () => (opts.guardian === false ? null : { id: 'rel' })) };
    const empty = { find: jest.fn(async () => []) };
    const svc = new FamilyKidsService(patients as any, relationships as any, repo(tasks, { unique: ['childPatientId', 'taskKey'] }) as any, repo(done, { unique: ['taskId', 'localDate'] }) as any, repo(answers, { unique: ['childPatientId', 'localDate'] }) as any, empty as any, empty as any, empty as any);
    return { svc, tasks, done, answers };
  }
  const parent: any = { id: 'parent-1' };

  it('starts a child with simple tasks and counts one star per task per day', async () => {
    const { svc, tasks } = setup();
    const view: any = await svc.child(parent, 'SCP-KID1-AAAA', 'Africa/Lagos', today);
    expect(view.tasks.map((t: any) => t.key)).toEqual([...STARTER_TASKS]);
    expect(view.stars).toMatchObject({ today: 0, total: 0, level: 1 });
    const first = tasks[0].id;
    await svc.completeTask(parent, 'SCP-KID1-AAAA', first, 'Africa/Lagos', today);
    const again: any = await svc.completeTask(parent, 'SCP-KID1-AAAA', first, 'Africa/Lagos', today);
    expect(again.stars.today).toBe(1);
    expect(again.tasks[0].doneToday).toBe(true);
  });

  it('kids question: 1 star for answering, 1 more if right, once a day', async () => {
    const { svc } = setup();
    const q = kidQuestionForDate('2026-10-03');
    const view: any = await svc.answerQuiz(parent, 'SCP-KID1-AAAA', { questionId: q.id, choiceIndex: q.answer, timezone: 'Africa/Lagos' }, today);
    expect(view.quiz.answered).toMatchObject({ correct: true, correctIndex: q.answer });
    expect(view.stars.total).toBe(2);
    await expect(svc.answerQuiz(parent, 'SCP-KID1-AAAA', { questionId: q.id, choiceIndex: 0, timezone: 'Africa/Lagos' }, today)).rejects.toBeInstanceOf(ConflictException);
  });

  it('only the child’s guardian can see or change anything', async () => {
    const { svc } = setup({ guardian: false });
    await expect(svc.child(parent, 'SCP-KID1-AAAA')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.addTask(parent, 'SCP-KID1-AAAA', 'washHands')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps kids corner for children up to 12', async () => {
    const { svc } = setup({ dob: '2010-01-01' });
    const view: any = await svc.child(parent, 'SCP-KID1-AAAA', 'Africa/Lagos', today);
    expect(view.kidsCorner).toBe(false);
    await expect(svc.addTask(parent, 'SCP-KID1-AAAA', 'washHands')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('NudgesService', () => {
  function setup(opts: { activeToday?: boolean; settings?: any; streakDays?: string[] } = {}) {
    const sent: any[] = [];
    const saved: any[] = [];
    const patient: any = { id: 'p1', userId: 'u1', countryCode: 'NG', phone: '+2348000000000', givenName: 'Ada', nudge: opts.settings ?? null };
    const qb: any = {};
    for (const m of ['leftJoinAndMapOne', 'where', 'andWhere']) qb[m] = () => qb;
    qb.getMany = async () => [patient];
    const days = opts.streakDays ?? (opts.activeToday ? ['2026-10-03'] : []);
    const notifications: any = { createTransactionalNotification: jest.fn(async (_m: any, input: any) => sent.push(input)) };
    const ds: any = { transaction: (cb: any) => cb({}) };
    const svc = new NudgesService(
      ds, notifications,
      { save: jest.fn(async (v: any) => saved.push(v)), findOne: jest.fn(async () => null) } as any,
      { createQueryBuilder: () => qb, find: jest.fn(async () => []), findOne: jest.fn(async () => patient) } as any,
      { find: jest.fn(async () => []) } as any,
      { findOne: jest.fn(async () => ({ bloodGroup: 'O+', genotype: 'AA', emergencyContactPhone: '+234' })) } as any,
      { find: jest.fn(async () => days.map((localDate) => ({ localDate }))) } as any,
      { find: jest.fn(async () => []) } as any,
      { find: jest.fn(async () => []) } as any,
      { find: jest.fn(async () => []) } as any,
      { count: jest.fn(async () => 0) } as any,
      { get: (k: string) => ({ NUDGES_ENABLED: 'false' } as any)[k] } as any,
    );
    return { svc, sent, saved };
  }

  it('sends one nudge at the person’s time, in their language, then not again that day', async () => {
    const { svc, sent, saved } = setup({ settings: { userId: 'u1', enabled: true, localTime: '08:00', timezone: 'Africa/Lagos', language: 'fr', whatsapp: false, lastSentDate: null, lastNudgedDate: null, ignoredInARow: 0 } });
    await svc.dispatchDue(new Date('2026-10-03T06:30:00Z')); // 07:30 Lagos: too early
    expect(sent).toHaveLength(0);
    await svc.dispatchDue(new Date('2026-10-03T07:10:00Z')); // 08:10 Lagos
    expect(sent).toHaveLength(1);
    // 3 October is an odd day number, so the Health Word comes before the question.
    expect(sent[0]).toMatchObject({ type: 'DAILY_NUDGE', title: nudgeText('fr', 'word', {}).title, entityType: 'WELLNESS', metadata: { route: '/me/play', kind: 'word' }, idempotencyKey: 'nudge:u1:2026-10-03', email: { enabled: false } });
    expect(saved[0]).toMatchObject({ lastSentDate: '2026-10-03', lastNudgedDate: '2026-10-03', ignoredInARow: 0 });
  });

  it('stays quiet for someone already active today', async () => {
    const { svc, sent, saved } = setup({ activeToday: true });
    await svc.dispatchDue(new Date('2026-10-03T07:10:00Z'));
    expect(sent).toHaveLength(0);
    expect(saved[0]).toMatchObject({ lastSentDate: '2026-10-03', ignoredInARow: 0 });
  });

  it('counts an ignored nudge so the next ones slow down', async () => {
    const { svc, saved } = setup({ settings: { userId: 'u1', enabled: true, localTime: '08:00', timezone: 'Africa/Lagos', language: 'en', whatsapp: false, lastSentDate: '2026-10-02', lastNudgedDate: '2026-10-02', ignoredInARow: 2 } });
    await svc.dispatchDue(new Date('2026-10-03T07:10:00Z'));
    expect(saved[0].ignoredInARow).toBe(3);
  });
});
