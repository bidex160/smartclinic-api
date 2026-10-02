import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GuidedSelfCheck } from '../../guided-self-checks/entities/guided-self-check.entity';
import { GuidedSelfCheckWorkflowStatus } from '../../guided-self-checks/enums/guided-self-check.enum';
import { HealthCheckEncounter } from '../../health-checks/entities/health-check-encounter.entity';
import { HealthCheckEncounterStatus } from '../../health-checks/enums/health-check-encounter-status.enum';
import { PatientDailyCheckIn } from '../../patients/entities/patient-daily-check-in.entity';
import { PatientDailyRoutineCompletion } from '../../patients/entities/patient-daily-routine-completion.entity';
import { PatientDailyRoutine } from '../../patients/entities/patient-daily-routine.entity';
import { PatientHealthBasics } from '../../patients/entities/patient-health-basics.entity';
import { PatientRelationship } from '../../patients/entities/patient-relationship.entity';
import { Patient } from '../../patients/entities/patient.entity';
import { PatientRelationshipRole, PatientRelationshipStatus } from '../../patients/enums/patient-relationship.enum';
import { PatientStatus } from '../../patients/enums/patient-status.enum';
import { localDateIn, longestStreak, streakEndingAt } from '../../patients/patient-daily-routine-completions.service';
import { User } from '../../users/entities/user.entity';
import { HealthQuizAnswer } from './health-quiz-answer.entity';
import { HEALTH_QUIZ, questionForDate } from './health-quiz.bank';

/** Points are earned for things that genuinely help health; they are not money. */
export const POINTS = {
  quizAnswered: 5,
  quizCorrect: 5,
  checkInDay: 5,
  routineDay: 3,
  selfCheck: 20,
  healthCheck: 50,
  passportItem: 10,
} as const;

export const LEVELS = [
  { number: 1, name: 'Starter', min: 0 },
  { number: 2, name: 'Steady', min: 100 },
  { number: 3, name: 'Committed', min: 300 },
  { number: 4, name: 'Champion', min: 700 },
  { number: 5, name: 'Health Hero', min: 1500 },
] as const;

export interface EngagementFacts {
  dateOfBirth: boolean;
  phone: boolean;
  bloodGroup: boolean;
  genotype: boolean;
  allergiesRecorded: boolean;
  emergencyContact: boolean;
  routines: number;
  dependants: number;
  selfChecks: number;
  healthChecks: number;
  checkInDates: string[];
  routineDates: string[];
  quizAnswers: number;
  quizCorrect: number;
}

/** Turns what a patient has done into points, a level, badges and passport completion. Pure, so it is easy to test. */
export function summarise(f: EngagementFacts, today: string) {
  const passportItems = [
    { key: 'dateOfBirth', label: 'Add your date of birth', done: f.dateOfBirth, route: '/me/profile' },
    { key: 'phone', label: 'Add a phone number', done: f.phone, route: '/me/profile' },
    { key: 'bloodGroup', label: 'Record your blood group', done: f.bloodGroup, route: '/me/profile' },
    { key: 'genotype', label: 'Record your genotype', done: f.genotype, route: '/me/profile' },
    { key: 'allergies', label: 'Record allergies, or say you have none', done: f.allergiesRecorded, route: '/me/profile' },
    { key: 'emergencyContact', label: 'Add an emergency contact', done: f.emergencyContact, route: '/me/profile' },
    { key: 'routine', label: 'Set up a daily routine', done: f.routines > 0, route: '/me/dashboard' },
    { key: 'selfCheck', label: 'Complete a Guided Self-Check', done: f.selfChecks > 0, route: '/me/self-checks' },
    { key: 'healthCheck', label: 'Complete a Smart Health Check', done: f.healthChecks > 0, route: '/me/book' },
  ];
  const doneItems = passportItems.filter((i) => i.done).length;
  const activeDays = new Set([...f.checkInDates, ...f.routineDates]);

  const points =
    f.quizAnswers * POINTS.quizAnswered +
    f.quizCorrect * POINTS.quizCorrect +
    new Set(f.checkInDates).size * POINTS.checkInDay +
    new Set(f.routineDates).size * POINTS.routineDay +
    f.selfChecks * POINTS.selfCheck +
    f.healthChecks * POINTS.healthCheck +
    doneItems * POINTS.passportItem;

  const level = [...LEVELS].reverse().find((l) => points >= l.min) ?? LEVELS[0];
  const next = LEVELS.find((l) => l.min > points) ?? null;
  const streak = streakEndingAt(today, activeDays);
  const bestStreak = longestStreak(activeDays);

  const badge = (code: string, name: string, description: string, earned: boolean, progress?: { current: number; target: number }) => ({
    code,
    name,
    description,
    earned,
    ...(progress && !earned ? { progress: { current: Math.min(progress.current, progress.target), target: progress.target } } : {}),
  });
  const badges = [
    badge('FIRST_CHECK_IN', 'First check-in', 'Told SmartClinic how you feel for the first time', f.checkInDates.length > 0, { current: f.checkInDates.length, target: 1 }),
    badge('STREAK_7', 'One-week streak', 'Active 7 days in a row', bestStreak >= 7, { current: bestStreak, target: 7 }),
    badge('STREAK_30', 'Thirty-day streak', 'Active 30 days in a row', bestStreak >= 30, { current: bestStreak, target: 30 }),
    badge('QUIZ_10', 'Curious mind', 'Answered 10 daily quiz questions', f.quizAnswers >= 10, { current: f.quizAnswers, target: 10 }),
    badge('QUIZ_SHARP', 'Sharp', 'Got 20 quiz answers right', f.quizCorrect >= 20, { current: f.quizCorrect, target: 20 }),
    badge('KNOW_YOUR_NUMBERS', 'Know your numbers', 'Recorded your blood group and genotype', f.bloodGroup && f.genotype, { current: Number(f.bloodGroup) + Number(f.genotype), target: 2 }),
    badge('FIRST_HEALTH_CHECK', 'Checked', 'Completed your first Smart Health Check', f.healthChecks > 0, { current: f.healthChecks, target: 1 }),
    badge('ROUTINE_BUILDER', 'Routine builder', 'Set up three daily routines', f.routines >= 3, { current: f.routines, target: 3 }),
    badge('FAMILY_GUARDIAN', 'Family guardian', 'Look after a family member on SmartClinic', f.dependants > 0, { current: f.dependants, target: 1 }),
    badge('PASSPORT_COMPLETE', 'Passport complete', 'Filled in every part of your Health Passport', doneItems === passportItems.length, { current: doneItems, target: passportItems.length }),
  ];

  return {
    points,
    level: { number: level.number, name: level.name, min: level.min, nextName: next?.name ?? null, nextAt: next?.min ?? null },
    streak: { current: streak, best: bestStreak },
    badges,
    passport: {
      percent: Math.round((doneItems / passportItems.length) * 100),
      done: doneItems,
      total: passportItems.length,
      items: passportItems,
      nextStep: passportItems.find((i) => !i.done) ?? null,
    },
  };
}

@Injectable()
export class EngagementService {
  constructor(
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(PatientHealthBasics) private readonly basics: Repository<PatientHealthBasics>,
    @InjectRepository(PatientDailyRoutine) private readonly routines: Repository<PatientDailyRoutine>,
    @InjectRepository(PatientDailyRoutineCompletion) private readonly completions: Repository<PatientDailyRoutineCompletion>,
    @InjectRepository(PatientDailyCheckIn) private readonly checkIns: Repository<PatientDailyCheckIn>,
    @InjectRepository(PatientRelationship) private readonly relationships: Repository<PatientRelationship>,
    @InjectRepository(GuidedSelfCheck) private readonly selfChecks: Repository<GuidedSelfCheck>,
    @InjectRepository(HealthCheckEncounter) private readonly encounters: Repository<HealthCheckEncounter>,
    @InjectRepository(HealthQuizAnswer) private readonly answers: Repository<HealthQuizAnswer>,
  ) {}

  async overview(user: User, timezone: string, now = new Date()) {
    const patient = await this.patient(user);
    const today = localDateIn(now, safeZone(timezone));
    const facts = await this.facts(patient, user);
    const todayAnswer = await this.answers.findOne({ where: { patientId: patient.id, localDate: today } });
    return { ...summarise(facts, today), quiz: this.quizView(today, todayAnswer), pointsRules: POINTS };
  }

  async answerQuiz(user: User, dto: { questionId: string; choiceIndex: number; timezone: string }, now = new Date()) {
    const patient = await this.patient(user);
    const today = localDateIn(now, safeZone(dto.timezone));
    const question = questionForDate(today);
    if (dto.questionId !== question.id) throw new BadRequestException("That isn't today's question. Refresh to see today's.");
    if (!Number.isInteger(dto.choiceIndex) || dto.choiceIndex < 0 || dto.choiceIndex >= question.options.length) throw new BadRequestException('Choose one of the answers');
    if (await this.answers.exists({ where: { patientId: patient.id, localDate: today } })) throw new ConflictException("You've answered today's question. Come back tomorrow for a new one.");
    const correct = dto.choiceIndex === question.answer;
    try {
      await this.answers.insert({ patientId: patient.id, localDate: today, questionId: question.id, choiceIndex: dto.choiceIndex, correct });
    } catch {
      throw new ConflictException("You've answered today's question. Come back tomorrow for a new one.");
    }
    const answer = await this.answers.findOne({ where: { patientId: patient.id, localDate: today } });
    return {
      quiz: this.quizView(today, answer),
      pointsEarned: POINTS.quizAnswered + (correct ? POINTS.quizCorrect : 0),
      ...summarise(await this.facts(patient, user), today),
    };
  }

  /** Wellness points earned so far. Spending is tracked separately; clearing a passport item removes its points. */
  async earnedPoints(patient: Patient, user: User): Promise<number> {
    return summarise(await this.facts(patient, user), localDateIn(new Date(), 'Africa/Lagos')).points;
  }

  private quizView(today: string, answer: HealthQuizAnswer | null) {
    const q = questionForDate(today);
    return {
      localDate: today,
      questionId: q.id,
      topic: q.topic,
      question: q.question,
      options: q.options,
      answered: answer
        ? { choiceIndex: answer.choiceIndex, correct: answer.correct, correctIndex: q.answer, explanation: q.explanation, source: q.source }
        : null,
      bankSize: HEALTH_QUIZ.length,
    };
  }

  private async patient(user: User): Promise<Patient> {
    const patient = await this.patients.findOne({ where: { userId: user.id, status: PatientStatus.ACTIVE } });
    if (!patient) throw new NotFoundException('Patient profile not found');
    return patient;
  }

  private async facts(patient: Patient, user: User): Promise<EngagementFacts> {
    const [basics, routines, checkIns, ticks, dependants, selfChecks, healthChecks, quizAnswers, quizCorrect] = await Promise.all([
      this.basics.findOne({ where: { patientId: patient.id } }),
      this.routines.count({ where: { patientId: patient.id, enabled: true } }),
      this.checkIns.find({ where: { patientId: patient.id }, select: { localDate: true } }),
      this.completions.createQueryBuilder('c').select('DISTINCT "c"."local_date"::text', 'localDate').where('c.patient_id = :id', { id: patient.id }).getRawMany<{ localDate: string }>(),
      this.relationships.count({ where: { relatedUserId: user.id, role: PatientRelationshipRole.GUARDIAN, status: PatientRelationshipStatus.ACTIVE } }),
      this.selfChecks.countBy({ patientId: patient.id, workflowStatus: GuidedSelfCheckWorkflowStatus.COMPLETED }),
      this.encounters.createQueryBuilder('e').innerJoin('e.booking', 'b').where('b.participantPatientId = :id', { id: patient.id }).andWhere('e.status = :status', { status: HealthCheckEncounterStatus.COMPLETED }).getCount(),
      this.answers.count({ where: { patientId: patient.id } }),
      this.answers.count({ where: { patientId: patient.id, correct: true } }),
    ]);
    return {
      dateOfBirth: Boolean(patient.dateOfBirth),
      phone: Boolean(patient.phone),
      bloodGroup: Boolean(basics?.bloodGroup),
      genotype: Boolean(basics?.genotype),
      allergiesRecorded: Boolean(basics?.allergies?.trim()),
      emergencyContact: Boolean(basics?.emergencyContactName && basics?.emergencyContactPhone),
      routines,
      dependants,
      selfChecks,
      healthChecks,
      checkInDates: checkIns.map((c) => String(c.localDate).slice(0, 10)),
      routineDates: ticks.map((t) => t.localDate),
      quizAnswers,
      quizCorrect,
    };
  }
}

function safeZone(timezone: string | undefined): string {
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
