import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';

import { HealthQuizAnswer } from '../health-passport/engagement/health-quiz-answer.entity';
import { PatientDailyCheckIn } from '../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../patients/entities/patient-daily-routine-completion.entity';
import { PatientRelationship } from '../patients/entities/patient-relationship.entity';
import { Patient } from '../patients/entities/patient.entity';
import { PatientRelationshipRole, PatientRelationshipStatus } from '../patients/enums/patient-relationship.enum';
import { PatientStatus } from '../patients/enums/patient-status.enum';
import { localDateIn, longestStreak, streakEndingAt } from '../patients/patient-daily-routine-completions.service';
import { User } from '../users/entities/user.entity';
import { ageInYears, KID_QUIZ, KID_TASKS, KidTaskKey, kidQuestionForDate, KIDS_MAX_AGE, nextWellChildVisit, starLevel, STARTER_TASKS } from './kids.content';
import { ChildDailyTask, ChildQuizAnswer, ChildTaskCompletion } from './kids.entities';

export function safeTimezone(timezone: string | undefined): string {
  try {
    if (timezone) {
      new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
      return timezone;
    }
  } catch {
    /* fall through */
  }
  return 'Africa/Lagos';
}

/** Days to look back for the family streak. */
const STREAK_WINDOW_DAYS = 120;

/**
 * Kids corner: small daily tasks a parent sets, a picture question, stars, and reminders of
 * routine check-ups. Only the child's guardian can see or change any of it.
 */
@Injectable()
export class FamilyKidsService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientRelationship) private readonly relationships: Repository<PatientRelationship>,
    @InjectRepository(ChildDailyTask) private readonly tasks: Repository<ChildDailyTask>,
    @InjectRepository(ChildTaskCompletion) private readonly completions: Repository<ChildTaskCompletion>,
    @InjectRepository(ChildQuizAnswer) private readonly quizAnswers: Repository<ChildQuizAnswer>,
    @InjectRepository(PatientDailyCheckIn) private readonly checkIns: Repository<PatientDailyCheckIn>,
    @InjectRepository(PatientDailyRoutineCompletion) private readonly routineTicks: Repository<PatientDailyRoutineCompletion>,
    @InjectRepository(HealthQuizAnswer) private readonly adultQuiz: Repository<HealthQuizAnswer>,
  ) {}

  async overview(user: User, timezone?: string, now = new Date()) {
    const today = localDateIn(now, safeTimezone(timezone));
    const children = await this.children(user);
    const items = [];
    for (const child of children) items.push(await this.childView(user, child, today));
    return { today, familyStreak: await this.familyStreak(user, children, today), children: items };
  }

  async child(user: User, ref: string, timezone?: string, now = new Date()) {
    const child = await this.requireChild(user, ref);
    return this.childView(user, child, localDateIn(now, safeTimezone(timezone)));
  }

  async addTask(user: User, ref: string, taskKey: string, timezone?: string) {
    if (!(KID_TASKS as readonly string[]).includes(taskKey)) throw new BadRequestException('Choose one of the tasks shown');
    const child = await this.requireKid(user, ref, timezone);
    const existing = await this.tasks.findOne({ where: { childPatientId: child.id, taskKey } });
    if (existing) {
      if (!existing.enabled) await this.tasks.update(existing.id, { enabled: true });
    } else {
      const active = await this.tasks.count({ where: { childPatientId: child.id, enabled: true } });
      if (active >= 8) throw new ConflictException('Up to 8 tasks a day keeps it fun. Remove one first.');
      await this.tasks.insert({ childPatientId: child.id, createdByUserId: user.id, taskKey, enabled: true });
    }
    return this.child(user, ref, timezone);
  }

  /** Removing keeps the history (stars stay); the task just stops showing. */
  async removeTask(user: User, ref: string, taskId: string, timezone?: string) {
    const child = await this.requireKid(user, ref, timezone);
    const task = await this.tasks.findOne({ where: { id: taskId, childPatientId: child.id } });
    if (!task) throw new NotFoundException('Task not found');
    await this.tasks.update(task.id, { enabled: false });
    return this.child(user, ref, timezone);
  }

  async completeTask(user: User, ref: string, taskId: string, timezone?: string, now = new Date()) {
    const child = await this.requireKid(user, ref, timezone);
    const task = await this.tasks.findOne({ where: { id: taskId, childPatientId: child.id, enabled: true } });
    if (!task) throw new NotFoundException('Task not found');
    const localDate = localDateIn(now, safeTimezone(timezone));
    try {
      await this.completions.insert({ taskId: task.id, childPatientId: child.id, localDate });
    } catch {
      /* already done today: nothing to add */
    }
    return this.child(user, ref, timezone, now);
  }

  async undoTask(user: User, ref: string, taskId: string, timezone?: string, now = new Date()) {
    const child = await this.requireKid(user, ref, timezone);
    const localDate = localDateIn(now, safeTimezone(timezone));
    await this.completions.delete({ taskId, childPatientId: child.id, localDate });
    return this.child(user, ref, timezone, now);
  }

  async answerQuiz(user: User, ref: string, dto: { questionId: string; choiceIndex: number; timezone?: string }, now = new Date()) {
    const child = await this.requireKid(user, ref, dto.timezone);
    const localDate = localDateIn(now, safeTimezone(dto.timezone));
    const q = kidQuestionForDate(localDate);
    if (dto.questionId !== q.id) throw new BadRequestException('That isn’t today’s question. Refresh to see today’s.');
    if (!Number.isInteger(dto.choiceIndex) || dto.choiceIndex < 0 || dto.choiceIndex > 2) throw new BadRequestException('Choose one of the pictures');
    try {
      await this.quizAnswers.insert({ childPatientId: child.id, localDate, questionId: q.id, choiceIndex: dto.choiceIndex, correct: dto.choiceIndex === q.answer });
    } catch {
      throw new ConflictException('Already answered today. A new question comes tomorrow!');
    }
    return this.child(user, ref, dto.timezone, now);
  }

  private async childView(user: User, child: Patient, today: string) {
    const age = child.dateOfBirth ? ageInYears(String(child.dateOfBirth), today) : null;
    const isKid = age !== null && age <= KIDS_MAX_AGE;
    const base = {
      patientReference: child.patientReference,
      firstName: child.givenName,
      age,
      kidsCorner: isKid,
      nextVisit: child.dateOfBirth && age !== null && age < 6 ? nextWellChildVisit(String(child.dateOfBirth), today) : null,
    };
    if (!isKid) return { ...base, tasks: [], stars: null, quiz: null };

    await this.seedStarterTasks(user, child);
    const tasks = await this.tasks.find({ where: { childPatientId: child.id, enabled: true }, order: { createdAt: 'ASC' } });
    const doneToday = new Set(
      (await this.completions.find({ where: { childPatientId: child.id, localDate: today }, select: { taskId: true } })).map((c) => c.taskId),
    );
    const [taskStars, quizRows] = await Promise.all([
      this.completions.count({ where: { childPatientId: child.id } }),
      this.quizAnswers.find({ where: { childPatientId: child.id }, select: { localDate: true, correct: true, choiceIndex: true, questionId: true } }),
    ]);
    // 1 star for every task done, 1 for answering the question, 1 more for getting it right.
    const quizStars = quizRows.reduce((sum, a) => sum + 1 + (a.correct ? 1 : 0), 0);
    const total = taskStars + quizStars;
    const todayAnswer = quizRows.find((a) => String(a.localDate).slice(0, 10) === today) ?? null;
    const todayStars = doneToday.size + (todayAnswer ? 1 + (todayAnswer.correct ? 1 : 0) : 0);
    const q = kidQuestionForDate(today);
    return {
      ...base,
      tasks: tasks.map((t) => ({ id: t.id, key: t.taskKey, doneToday: doneToday.has(t.id) })),
      stars: { today: todayStars, total, ...starLevel(total) },
      quiz: {
        questionId: q.id,
        answered: todayAnswer ? { choiceIndex: todayAnswer.choiceIndex, correct: todayAnswer.correct, correctIndex: q.answer } : null,
        bankSize: KID_QUIZ.length,
      },
    };
  }

  /** A new child starts with four simple tasks; once a parent has changed anything, we never re-add. */
  private async seedStarterTasks(user: User, child: Patient): Promise<void> {
    if ((await this.tasks.count({ where: { childPatientId: child.id } })) > 0) return;
    for (const taskKey of STARTER_TASKS) {
      try {
        await this.tasks.insert({ childPatientId: child.id, createdByUserId: user.id, taskKey, enabled: true });
      } catch {
        /* another request seeded it */
      }
    }
  }

  /** A day counts for the family if the parent did their check-in, a routine or the question, or any child earned a star. */
  private async familyStreak(user: User, children: Patient[], today: string) {
    const since = new Date(Date.parse(`${today}T12:00:00Z`) - STREAK_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
    const self = await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } });
    const kidIds = children.map((c) => c.id);
    const days = new Set<string>();
    const add = (rows: { localDate: string | Date }[]) => rows.forEach((r) => days.add(String(r.localDate instanceof Date ? r.localDate.toISOString() : r.localDate).slice(0, 10)));
    if (self) {
      add(await this.checkIns.find({ where: { patientId: self.id, localDate: MoreThanOrEqual(since) }, select: { localDate: true } }));
      add(await this.routineTicks.find({ where: { patientId: self.id, localDate: MoreThanOrEqual(since) }, select: { localDate: true } }));
      add(await this.adultQuiz.find({ where: { patientId: self.id, localDate: MoreThanOrEqual(since) }, select: { localDate: true } }));
    }
    if (kidIds.length) {
      add(await this.completions.find({ where: { childPatientId: In(kidIds), localDate: MoreThanOrEqual(since) }, select: { localDate: true } }));
      add(await this.quizAnswers.find({ where: { childPatientId: In(kidIds), localDate: MoreThanOrEqual(since) }, select: { localDate: true } }));
    }
    return { current: streakEndingAt(today, days), best: longestStreak(days), activeToday: days.has(today) };
  }

  private async children(user: User): Promise<Patient[]> {
    const links = await this.relationships.find({
      where: { relatedUserId: user.id, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE },
      select: { patientId: true },
    });
    if (!links.length) return [];
    return this.patients.find({ where: { id: In(links.map((l) => l.patientId)), status: PatientStatus.ACTIVE }, order: { createdAt: 'ASC' } });
  }

  private async requireChild(user: User, ref: string): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { patientReference: String(ref).trim().toUpperCase(), status: PatientStatus.ACTIVE } });
    if (!patient) throw new NotFoundException('Child not found');
    const link = await this.relationships.findOne({
      where: { relatedUserId: user.id, patientId: patient.id, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE },
    });
    // Same answer as "not found" so nobody can probe for other families' children.
    if (!link) throw new NotFoundException('Child not found');
    return patient;
  }

  private async requireKid(user: User, ref: string, timezone?: string): Promise<Patient> {
    const child = await this.requireChild(user, ref);
    const today = localDateIn(new Date(), safeTimezone(timezone));
    const age = child.dateOfBirth ? ageInYears(String(child.dateOfBirth), today) : null;
    if (age === null || age > KIDS_MAX_AGE) throw new ForbiddenException('Kids corner is for children up to 12');
    return child;
  }
}

export type { KidTaskKey };
